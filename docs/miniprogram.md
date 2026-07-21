# 微信小程序

项目使用 Taro + React，源码在 `apps/miniprogram`。

## 构建

小程序请求地址必须是已经备案并启用 HTTPS 的 API 根地址，且包含 `/api/v1`：

```bash
TARO_APP_API_BASE_URL=https://memory.example.com/api/v1 npm run miniprogram:build
```

开发时也可以指向本机后端：

```bash
TARO_APP_API_BASE_URL=http://localhost:8080/api/v1 npm run miniprogram:dev
```

构建完成后，用微信开发者工具导入 `apps/miniprogram/dist`，选择你的小程序 AppID 即可预览和上传体验版。

## 微信公众平台配置

在小程序后台的“开发管理”中加入以下合法域名：

- `request 合法域名`：Lucky 转发后的 HTTPS 域名
- `downloadFile 合法域名`：图片实际访问域名；如果图片走本项目本地存储，就是同一个 HTTPS 域名
- 如果使用 OSS，还需要把 OSS 的公开图片域名加入 `downloadFile 合法域名`

生产环境建议给小程序准备一个走标准 HTTPS 443 端口的独立子域名，例如 `memory-api.example.com`。如果当前 Lucky 入口使用 `:9882`，微信后台可能无法把带非标准端口的地址保存为合法域名；这种情况下只需在 Lucky 增加一个 443 子域名转发到同一个 Docker 服务，不需要修改后端。

当前版本复用项目已有的空间码、账号和密码登录，不依赖微信 AppID/Secret，也不会调用未实现的微信绑定接口。登录成功后，小程序会保存 access token 和 refresh token，并在 access token 过期时自动刷新。

当前提供：

- 回忆列表
- 新增、编辑和删除自己创建的回忆
- 从相册或相机选择图片，压缩后上传（每段回忆最多 6 张）
- 纪念日墙
- 新建私语并回复已有私语
- 时光胶囊只读查看
- 退出登录

另一身份创建的回忆只读。微信一键登录、私语语音和时光胶囊的写入能力留到后续版本。
