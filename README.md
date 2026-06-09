# 我们的回忆

“我们的回忆”是一个在线优先的私密情侣记忆产品。它以地图、时间线、照片、纪念日墙和旅行攻略串起两个人的共同生活轨迹，并预留受控开通能力，后续可通过一次性开通码把独立空间交付给其它情侣使用。

## Structure

- `apps/web`: Next/React/Tailwind Web 前端。
- `apps/server`: Fastify + Prisma API 服务，负责认证、Postgres、对象存储、备份、AI 代理、开通码和纪念日墙。
- `apps/miniprogram`: Taro React 微信小程序，一期提供开通、登录、回忆浏览、纪念日墙和设置。
- `apps/desktop`: Electron 桌面壳。
- `apps/mobile`: Capacitor 移动端壳。
- `packages/shared`: 共享 DTO、schema、类型和日期计算工具。

## Local Development

```bash
cp .env.example .env
docker compose up -d postgres minio minio-init
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev:server
npm run dev:web
```

Default seeded users:

```text
me / 1234
her / 1234
```

The web app defaults to `http://localhost:4002` for the API. Override it with `NEXT_PUBLIC_API_BASE_URL`.

## Mini Program

```bash
npm run miniprogram:build
```

Set `TARO_APP_API_BASE_URL` when building the mini program for a deployed backend. WeChat quick binding requires `WECHAT_MINI_APP_ID` and `WECHAT_MINI_APP_SECRET` on the server.

## Activation Codes

The first commercial phase does not require integrated payment. An owner account can generate a one-time activation code through the API, then a paid user can claim it and create:

- one private couple space;
- two account names;
- two four-digit entry passwords.

Future WeChat Pay integration can attach paid orders to activation codes without changing the couple-space data model.

## AI

Set `ASTRBOT_BASE_URL` and `ASTRBOT_API_KEY` on the server. The server calls AstrBot OpenAPI and saves AI output as drafts first; user confirmation is required before content is accepted into memories or trip guides.

## Builds

```bash
npm run build:web
npm run build:server
npm run miniprogram:build
npm run desktop
npm run dist:win
npm run mobile:sync
npm run mobile:android:build
```

Desktop, mobile, and mini program clients connect to the deployed backend.
