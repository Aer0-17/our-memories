#!/bin/bash

# 构建远程版APK（连接Web服务器）
# 用于：前端热更新，无需重新打包APK

SERVER_URL=${1:-"https://your-domain.com"}

echo "🔨 构建远程版APK..."
echo "📡 服务器地址: $SERVER_URL"

# 设置环境变量
export CAPACITOR_SERVER_URL=$SERVER_URL

# 同步配置到Capacitor
npx cap sync android

# 构建APK
cd apps/mobile/android
./gradlew assembleRelease

echo "✅ 远程版APK构建完成: apps/mobile/android/app/build/outputs/apk/release/app-release.apk"
echo "💡 前端更新只需部署Web，无需重新打包APK"
