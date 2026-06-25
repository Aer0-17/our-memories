#!/bin/bash

# 一键本地构建脚本：构建用户端、管理端并复制到 Go 后端静态目录。

set -euo pipefail

echo "Our Memories 本地构建"
echo ""

if [ ! -f "backend/.env" ]; then
    echo "未找到 backend/.env 文件"
    echo "请先执行：cp backend/.env.example backend/.env"
    echo "然后修改 JWT_SECRET、ADMIN_PASSWORD 等生产敏感配置。"
    exit 1
fi

echo "安装依赖..."
npm install

echo "构建共享包..."
npm run build:shared

echo "构建用户前端..."
npm run build -w @map-of-us/web

echo "构建管理后台..."
npm run build -w @map-of-us/admin

echo "复制静态文件到后端..."
sync_static_export() {
    local source_dir="$1"
    local target_dir="$2"

    mkdir -p "$target_dir"
    find "$target_dir" -mindepth 1 -maxdepth 1 ! -name "_next" -exec rm -rf {} +
    cp -R "$source_dir"/. "$target_dir"/
}

sync_static_export apps/web/out backend/public/web
sync_static_export apps/admin/out backend/public/admin

echo "构建 Go 后端..."
mkdir -p dist
(cd backend && go build -o ../dist/our-memories-api ./main.go)

echo ""
echo "构建完成"
echo ""
echo "本地启动："
echo "  cd backend && go run main.go"
echo ""
echo "访问地址："
echo "  用户端: http://localhost:8080/"
echo "  管理端: http://localhost:8080/admin/"
echo "  API:    http://localhost:8080/api/v1"
