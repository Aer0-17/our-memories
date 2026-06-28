# 用 ngrok 把本地服务映射到公网

> 把本机运行的服务通过 ngrok 暴露到公网，获得一个可外网访问的 HTTPS 域名。适合临时演示、远程调试、Webhook 测试、给手机 App 指向本地后端等场景。

## 核心概念

- ngrok 会建立一个从 `公网域名 → 本机端口` 的隧道，外部访问公网域名时，请求被转发到本机对应端口。
- 免费版：每次启动分配一个**随机域名**（`https://xxxx.ngrok-free.app`），重启就变。
- 付费版：可保留固定子域名；企业版可绑定自己的域名（CNAME 到 ngrok）。
- 浏览器访问免费域名会先弹一个 ngrok 警告页，点击 "Visit Site" 才进入；用 curl / App 请求不受影响。

## 安装 ngrok（免 sudo）

适合没有 root 权限的 Linux 环境。ngrok 官方只给了 apt/snap 安装方式，但可以从其 apt 源直接下载 `.deb` 再解压提取二进制。

```bash
# 1. 查询最新版本号（从 apt 源的 Packages 索引）
curl -sSL "https://ngrok-agent.s3.amazonaws.com/dists/bookworm/main/binary-amd64/Packages" \
  | grep -iE "^Version:" | head -1

# 2. 下载对应 .deb（替换成查到的版本号）
curl -sSL "https://ngrok-agent.s3.amazonaws.com/pool/main/n/ngrok/ngrok_3.39.8-0_amd64.deb" \
  -o /tmp/ngrok.deb

# 3. 解压并提取二进制到项目 .tools 目录
dpkg-deb -x /tmp/ngrok.deb /tmp/ngrok-extract
cp /tmp/ngrok-extract/usr/local/bin/ngrok .tools/ngrok
chmod +x .tools/ngrok
.tools/ngrok version   # 验证：ngrok version 3.39.8
```

> 注意：下载大文件容易超时，可加 `-C -` 断点续传：
> ```bash
> curl -sSL -C - "https://.../ngrok_3.39.8-0_amd64.deb" -o /tmp/ngrok.deb
> ```

## 配置 authtoken

注册 ngrok 账号后，在 https://dashboard.ngrok.com/get-started/your-authtoken 获取 authtoken，然后：

```bash
.tools/ngrok config add-authtoken <YOUR_AUTHTOKEN>
.tools/ngrok config check   # 验证配置文件有效
```

配置会写入 `~/.config/ngrok/ngrok.yml`。

## 启动隧道

```bash
# 后台运行，映射本机 18080 端口
nohup .tools/ngrok http 18080 --log=stdout --log-format=logfmt > /tmp/ngrok.log 2>&1 &

# 查询分配到的公网 URL
curl -s http://127.0.0.1:4040/api/tunnels | jq -r '.tunnels[0].public_url'
```

- `4040` 是 ngrok 的本地管理面板，可在浏览器打开实时查看请求流量。
- 停止隧道：`kill <ngrok_pid>` 或 `pkill -f ngrok`。

## 关键经验：同端口部署 vs 多端口映射

如果一个项目有「前端 + 后端 API + 管理后台」多个服务，有两种映射策略：

### 方案 A：同端口单隧道（强烈推荐）

把所有服务跑在同一个端口（前端静态文件由后端托管，API 走同域路径），ngrok 只映射一个端口。

**优点**：
- 只开一个隧道，最简单
- 前端用**相对路径**访问 API（如 `/api/v1/xxx`），走 ngrok 后天然同源
- **零 CORS 配置**，重启 ngrok 只需换域名，前端啥都不用改
- 免费版域名变了也无所谓，前端不需要知道绝对 API 地址

**前提**：项目支持同端口部署（后端能托管前端静态文件 + API）。

### 方案 B：分别映射多端口（坑多）

每个服务各开一个 ngrok 隧道（例如后端 8080、前端 3002、管理后台 3003）。

**缺点**：
- 3 个隧道 = 3 个随机域名，每次重启全变
- 前端必须显式指定后端的绝对公网地址（`NEXT_PUBLIC_API_BASE_URL` 之类），因为跨域了
- 后端必须把前端/后台的 ngrok 域名加进 `ALLOWED_ORIGINS`，否则 CORS 拦截
- 每次重启 ngrok 要同步改 3 处配置再重启 3 个服务 —— 非常痛

**结论**：能用同端口就别用多端口。只有项目架构不允许同端口时才用方案 B。

## 判断前端 API 地址策略

启动前先看前端怎么解析 API 地址，决定要不要配置：

```ts
// 典型逻辑（见 apps/web/lib/apiClient.ts）
const apiBaseUrl = () => {
  const envValue = process.env.NEXT_PUBLIC_API_BASE_URL;  // 1. 环境变量优先
  if (envValue) return envValue;
  // 2. localhost 下走本地后端
  if (window.location.hostname 是 localhost) return "http://localhost:8080";
  // 3. 否则返回空串 → 用相对路径（同域）
  return "";
};
```

- 走 ngrok 后 `window.location` 是公网域名（非 localhost），会落到分支 3 → **用相对路径**。
- 只要后端 API 和前端同域（同端口部署），就**不用配 `NEXT_PUBLIC_API_BASE_URL`**，开箱即用。
- 如果前后端分域（方案 B），必须设 `NEXT_PUBLIC_API_BASE_URL` 指向后端 ngrok 域名。

## 实战：our-memories 项目映射过程

### 背景
- 项目支持同端口部署：`dist/our-memories-api` 托管 `backend/public/{web,admin}` 静态文件 + `/api/v1`。
- 已有后端进程跑在 `18080` 端口（非默认 8080，因为之前已占用）。

### 步骤
```bash
# 1. 确认后端在 18080 正常
curl -s http://localhost:18080/health        # → {"ok":true}
curl -s -o /dev/null -w "%{http_code}" http://localhost:18080/          # → 200 (用户端)
curl -s -o /dev/null -w "%{http_code}" http://localhost:18080/admin/    # → 200 (管理后台)

# 2. 启动 ngrok 隧道映射 18080
nohup .tools/ngrok http 18080 --log=stdout --log-format=logfmt > /tmp/ngrok.log 2>&1 &

# 3. 取公网 URL
curl -s http://127.0.0.1:4040/api/tunnels | jq -r '.tunnels[0].public_url'
# → https://unpaid-baggy-safely.ngrok-free.dev

# 4. 验证公网访问
curl -s -o /dev/null -w "%{http_code}" https://unpaid-baggy-safely.ngrok-free.dev/health   # → 200
curl -s -o /dev/null -w "%{http_code}" https://unpaid-baggy-safely.ngrok-free.dev/         # → 200
curl -s -o /dev/null -w "%{http_code}" https://unpaid-baggy-safely.ngrok-free.dev/admin/   # → 200
```

### 最终映射
| 服务 | 公网地址 |
|------|----------|
| 用户端 | `https://<随机>.ngrok-free.dev/` |
| 管理后台 | `https://<随机>.ngrok-free.dev/admin/` |
| API | `https://<随机>.ngrok-free.dev/api/v1` |
| 健康检查 | `https://<随机>.ngrok-free.dev/health` |

### 进程管理
- ngrok 进程后台运行，日志在 `/tmp/ngrok.log`
- 管理面板：`http://127.0.0.1:4040`
- 停止：`pkill -f ngrok`
- 重启后域名会变，重新 `curl 4040/api/tunnels` 取新地址即可（同端口方案无需改任何配置）。

## 常见坑

1. **端口被占用 / 进程在非预期端口**：先用 `ss -tlnp | grep <port>` 确认实际监听端口，别假设。本次实战中后端实际在 18080 而非 8080。
2. **CORS 报错**：几乎都是因为前后端分域却没把前端域名加进后端 `ALLOWED_ORIGINS`。同端口部署可根治。
3. **免费域名浏览器警告页**：正常现象，不是错误。App/curl 不受影响。
4. **下载 ngrok 超时**：ngrok 二进制 ~8MB，网络差时用 `curl -C -` 断点续传。
5. **混合内容（HTTP/HTTPS）**：ngrok 给的是 HTTPS，如果前端硬编码 `http://` 后端地址会被浏览器拦。同端口用相对路径可避免。

## 相关命令速查

```bash
.tools/ngrok version                          # 查版本
.tools/ngrok config add-authtoken <TOKEN>     # 配置 token
.tools/ngrok http 18080                       # 前台启动（Ctrl+C 停止）
.tools/ngrok http 18080 --url <固定域名>       # 付费版绑定固定域名
curl -s http://127.0.0.1:4040/api/tunnels     # 查当前隧道公网 URL
pkill -f ngrok                                # 停止所有 ngrok 进程
```
