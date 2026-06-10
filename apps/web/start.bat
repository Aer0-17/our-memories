@echo off
echo ===================================
echo 我们的回忆 - 前端启动脚本
echo ===================================
echo.

set "WEB_DIR=%~dp0"
set "REPO_ROOT=%~dp0..\.."

cd /d "%REPO_ROOT%"

echo [1/4] 检查依赖...
if not exist node_modules (
    echo 正在安装依赖，这可能需要几分钟...
    call npm install
    if errorlevel 1 (
        echo 依赖安装失败！
        pause
        exit /b 1
    )
)

echo.
echo [2/4] 检查环境变量...
if not exist "%WEB_DIR%.env.local" (
    echo 创建 .env.local 文件...
    echo NEXT_PUBLIC_API_BASE_URL=http://localhost:8080 > "%WEB_DIR%.env.local"
)

echo.
echo [3/4] 构建共享包...
call npm run build:shared
if errorlevel 1 (
    echo 共享包构建失败！
    pause
    exit /b 1
)

echo.
echo [4/4] 启动开发服务器...
echo 前端将运行在: http://localhost:3002
echo 后端API地址: http://localhost:8080
echo.
echo 按 Ctrl+C 停止服务器
echo.

call npm run dev:web

pause
