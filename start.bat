@echo off
chcp 65001 >nul
cd /d "%~dp0"

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
set LOCAL_HOST=127.0.0.1
set LAN_IP=localhost
for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "$ips=Get-NetIPAddress -AddressFamily IPv4; foreach ($item in $ips) { if (-not $item.IPAddress.StartsWith('127.') -and $item.PrefixOrigin -ne 'WellKnown') { $item.IPAddress; exit } }; 'localhost'"`) do set LAN_IP=%%I

echo ==========================================
echo  Server:  http://%LOCAL_HOST%:3000
echo  Lobby:   http://%LOCAL_HOST%:3000/#/rooms
echo  Admin:   http://%LOCAL_HOST%:3000/#/admin
echo  Player:  http://%LOCAL_HOST%:3000/
echo.
echo  LAN Lobby for phones on the same WiFi:
echo  http://%LAN_IP%:3000/#/rooms
echo ==========================================
echo.

start "Poker Server" cmd /k "cd /d ""%~dp0"" && npm start"

echo Waiting for server to start...
timeout /t 4 /nobreak >nul

echo Opening room lobby in browser...
start http://%LOCAL_HOST%:3000/#/rooms

echo.
echo Server is running in the background.
echo Press any key to close this window (server will keep running).
pause >nul
