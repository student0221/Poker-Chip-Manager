@echo off
chcp 65001 >nul

echo ==========================================
echo   Poker Chip Manager
echo ==========================================
echo.

node -v >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found.
    echo Please install from https://nodejs.org
    echo.
    pause
    exit /b 1
)

echo [OK] Node.js version:
node -v
echo.

if not exist "server\index.js" (
    echo [ERROR] server\index.js not found.
    echo Please run this bat in the project folder.
    pause
    exit /b 1
)

echo [1/4] Installing server dependencies...
call npm install
if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
)
echo [OK] Server dependencies installed.
echo.

echo [2/4] Building frontend...
cd client
call npm install
if errorlevel 1 (
    echo [WARN] Client dependencies install failed. Retrying...
    call npm install --legacy-peer-deps
)
call npm run build
if errorlevel 1 (
    echo [ERROR] Frontend build failed.
    pause
    exit /b 1
)
cd ..
echo [OK] Frontend built.
echo.

echo [3/4] Checking data directory...
if not exist "data" mkdir data
echo [OK] Data directory ready.
echo.

echo [4/4] Starting server...
echo.
echo ==========================================
echo  Server running at http://localhost:3000
echo  Admin:   http://localhost:3000/#/admin
echo  Player:  http://localhost:3000/
echo ==========================================
echo  Press Ctrl+C to stop
echo.

call npm start

pause
