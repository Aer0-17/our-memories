# 私人部署安全加固

本项目按“两人、单空间、通过 Lucky 暴露 HTTPS”部署时，安全目标是减少公网入口、阻止暴力尝试、保护会话令牌，并保证 SQLite 和图片可以恢复。

## 必须配置

```env
JWT_SECRET=<openssl rand -base64 48 生成的独立随机值>
ALLOWED_ORIGINS=https://aidd.aer0.top:9882
TRUSTED_PROXIES=<Lucky 连接到容器时使用的精确源 IP 或受限 CIDR>
LOGIN_PASSCODE_LENGTH=8
AUTO_SEED=false
EXPOSE_LOGIN_PERSONALIZATION=false
```

- `TRUSTED_PROXIES` 不得填写 `0.0.0.0/0` 或 `::/0`。如果 Lucky 和应用不经过反向代理头传递真实客户端 IP，保持为空更安全。
- 未登录的 `/public/config` 默认只返回通用登录标签，不返回真实空间名、成员姓名或纪念日；除非明确设置 `EXPOSE_LOGIN_PERSONALIZATION=true`。
- `.env` 包含 JWT、管理员密码和对象存储密钥，权限应设为 `600`，不要提交到 Git。
- `JWT_SECRET` 轮换后所有现有会话都会失效，需要重新登录。
- 当前数据库如果仍使用四位密码，先登录并把空间密码改成至少 8 位，再把 `LOGIN_PASSCODE_LENGTH` 改为实际长度。只改该变量不会修改数据库密码。

## 网络边界

- 路由器只对公网开放 Lucky 的 HTTPS 入口 `9882`。
- 不要把容器的 `8080` 端口直接映射到公网；NAS 防火墙仅允许 Lucky 所在主机或 Docker 网络访问它。
- Lucky 上游应使用容器内网地址或 NAS 本机地址，保留 `Host`、`X-Forwarded-Proto` 和真实客户端 IP。
- TLS 证书必须自动续期，关闭明文 HTTP 上游的公网入口。
- 微信小程序后台只登记 `https://aidd.aer0.top:9882` 为 `request`/`downloadFile` 合法域名。

应用会对 API 设置 `no-store`、HSTS、禁止 iframe 和 MIME 嗅探；登录接口有短窗口和小时窗口限流。WebSocket 仅接受同源或 `ALLOWED_ORIGINS` 中的来源，访问令牌通过 WebSocket 子协议传输，不再出现在 URL 日志中。

## 数据文件

容器以非 root 用户运行，根文件系统只读，移除全部 Linux capabilities，并将数据库目录和文件权限收紧为 `0700/0600`。这些措施不能替代 NAS 的磁盘加密：SQLite 和本地图片本身不是应用层加密数据。

建议启用：

- NAS 加密卷或整盘加密
- NAS 账户双因素认证
- 数据目录定期快照
- 一份不在同一块磁盘上的加密离线备份

在线备份 SQLite 时不要直接复制单个 `.db` 文件，WAL 模式下可能漏掉尚未合并的数据。当前使用 bind mount `./data:/app/data` 时，可以执行：

```bash
mkdir -p backups
docker run --rm \
  -v "$PWD/data:/data:ro" \
  -v "$PWD/backups:/backup" \
  keinos/sqlite3 \
  sqlite3 /data/ourMemories.db ".backup '/backup/ourMemories-$(date +%Y%m%d-%H%M%S).db'"
```

同时备份 `data/images`。至少每季度在另一个临时目录做一次恢复验证；没有验证过的备份不能视为可恢复。

## 更新后的会话行为

访问令牌、刷新令牌和管理员令牌现在具有不同类型，不能互相替代。升级新镜像后，旧令牌没有类型字段，会被拒绝；这是预期行为，网页和小程序重新登录即可。
