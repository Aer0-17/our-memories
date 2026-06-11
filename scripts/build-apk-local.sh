#!/bin/bash

# 构建本地版APK（内嵌Web资源）
# 用于：首次安装、离线使用

echo "🔨 构建本地版APK..."

# 1. 构建Web
cd apps/web
npm run build
cd ../..

# 2. 同步到Capacitor
npx cap sync android

# 3. 构建APK
cd apps/mobile/android
./gradlew assembleRelease

echo "✅ 本地版APK构建完成: apps/mobile/android/app/build/outputs/apk/release/app-release.apk"
