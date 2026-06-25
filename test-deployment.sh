#!/bin/bash

# 快速测试同端口部署

set -e

BASE_URL="${BASE_URL:-http://localhost:8080}"

echo "🧪 测试同端口部署"
echo ""

# 检查后端是否运行
if ! curl -s "$BASE_URL/health" > /dev/null 2>&1; then
    echo "❌ 后端未运行"
    echo "请先启动后端: cd backend && go run main.go"
    exit 1
fi

echo "✅ 后端运行正常"
echo ""

# 检查用户端和管理后台静态文件
if [ ! -f "backend/public/web/index.html" ]; then
    echo "❌ 用户端未部署"
    echo "运行部署脚本: ./deploy.sh"
    exit 1
fi

if [ ! -f "backend/public/admin/index.html" ]; then
    echo "❌ 管理后台未部署"
    echo "运行部署脚本: ./deploy.sh"
    exit 1
fi

echo "✅ 用户端和管理后台文件存在"
echo ""

# 测试 API
echo "测试 API 端点..."
API_HEALTH=$(curl -s "$BASE_URL/health" | grep -c "ok" || true)
if [ "$API_HEALTH" -gt 0 ]; then
    echo "✅ API 健康检查通过"
else
    echo "❌ API 响应异常"
    exit 1
fi

# 测试用户端
echo ""
echo "测试用户端..."
WEB_HTML=$(curl -s "$BASE_URL/" | grep -c "我们的回忆" || true)
if [ "$WEB_HTML" -gt 0 ]; then
    echo "✅ 用户端页面正常"
else
    echo "❌ 用户端页面异常"
    exit 1
fi

# 测试管理后台
echo ""
echo "测试管理后台..."
ADMIN_HTML=$(curl -s "$BASE_URL/admin/login/" | grep -c "Our Memories Admin" || true)
if [ "$ADMIN_HTML" -gt 0 ]; then
    echo "✅ 管理后台页面正常"
else
    echo "❌ 管理后台页面异常"
    exit 1
fi

echo ""
echo "🎉 测试完成！"
echo ""
echo "访问地址："
echo "  用户端: $BASE_URL/"
echo "  API: $BASE_URL/api/v1"
echo "  管理后台: $BASE_URL/admin/"
echo ""
