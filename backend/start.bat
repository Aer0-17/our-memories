@echo off
echo ===================================
echo 我们的回忆 - 后端启动脚本
echo ===================================
echo.

cd /d "%~dp0"

echo [1/3] 安装Go依赖...
echo 使用纯Go SQLite驱动（无需GCC）
go mod tidy
if errorlevel 1 (
    echo 依赖安装失败！
    pause
    exit /b 1
)

echo.
echo [2/3] 检查环境变量...
if not exist .env (
    echo .env文件不存在，使用默认配置
)

echo.
echo [3/3] 启动服务器...
echo 服务器将运行在: http://localhost:8080
echo 健康检查: http://localhost:8080/health
echo.
echo 按 Ctrl+C 停止服务器
echo.

go run main.go

pause
