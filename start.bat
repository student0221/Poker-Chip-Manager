@echo off
chcp 65001 >nul
title 德州扑克筹码管理系统

echo ==========================================
echo   德州扑克筹码管理系统 - 启动脚本
echo ==========================================
echo.

:: 检查 Node.js
node -v >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 Node.js
    echo.
    echo 请先安装 Node.js：
    echo https://nodejs.org/dist/v20.12.2/node-v20.12.2-x64.msi
    echo.
    echo 安装时全部选默认选项即可。
    pause
    exit /b 1
)

echo [✓] Node.js 已安装
node -v
echo.

:: 检查是否在正确目录
if not exist "server\index.js" (
    echo [错误] 未找到 server/index.js，请确保在 Poker-Chip-Manager 目录下运行此脚本
    pause
    exit /b 1
)

:: 安装依赖（首次）或确保依赖完整
echo [1/3] 正在安装依赖（首次需要几分钟，请耐心等待）...
call npm install
if errorlevel 1 (
    echo [错误] 依赖安装失败
    pause
    exit /b 1
)

echo [✓] 依赖安装完成
echo.

:: 创建数据目录（兼容旧版本）
echo [2/3] 检查数据目录...
if not exist "data" mkdir data
echo [✓] 数据目录就绪
echo.

:: 启动服务器
echo [3/3] 正在启动服务器...
echo.
echo ==========================================
echo  服务已启动！
echo  管理后台：http://localhost:3000/#/admin
echo  参与者： http://localhost:3000/
echo ==========================================
echo.
echo 按 Ctrl+C 停止服务器
echo.

call npm start

pause
