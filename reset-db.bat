@echo off

echo ==========================================
echo   Poker Chip Manager - Database Reset
echo ==========================================
echo.

if not exist data\poker.db (
    echo No old database found. Nothing to clean.
    goto done
)

echo Found database files:
dir /b data\poker.db* 2>nul
echo.
set /p confirm=Delete all database files? Data will be lost. (y/n): 

if /i "%confirm%"=="y" (
    echo.
    echo Deleting database files...
    del /f /q data\poker.db 2>nul
    del /f /q data\poker.db-shm 2>nul
    del /f /q data\poker.db-wal 2>nul
    echo.
    echo Database reset. New tables will be created on next start.
) else (
    echo.
    echo Cancelled. No files deleted.
)

:done
echo.
pause
