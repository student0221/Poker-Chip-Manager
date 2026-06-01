@echo off
chcp 65001 >nul
echo ==========================================
echo   Poker Chip Manager - 数据库重置工具
echo ==========================================
echo.

if not exist data\poker.db (
    echo 未找到旧数据库文件，无需清理。
    goto :done
)

echo 检测到以下数据库文件：
dir /b data\poker.db* 2>nul
echo.
set /p confirm="确定要删除以上数据库文件吗？数据库将被重置，历史数据会丢失。(y/n): "

if /i "%confirm%"=="y" (
    echo.
    echo 正在删除数据库文件...
    del /f /q data\poker.db 2>nul
    del /f /q data\poker.db-shm 2>nul
    del /f /q data\poker.db-wal 2>nul
    echo.
    echo ✅ 数据库已重置，下次启动会自动创建新表。
) else (
    echo.
    echo ❌ 已取消，未删除任何文件。
)

:done
echo.
pause
