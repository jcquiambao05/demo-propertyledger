@echo off
setlocal enableextensions
cd /d "%~dp0"

title Eagle Property Ledger - Launcher

echo ==================================================
echo   Eagle Property Ledger - Starting System
echo ==================================================
echo.

:: 1. Ensure Docker Desktop daemon is running
docker info >nul 2>&1
if errorlevel 1 (
    echo [1/4] Docker daemon is not running. Launching Docker Desktop...
    if exist "C:\Program Files\Docker\Docker\Docker Desktop.exe" (
        start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    ) else (
        echo [ERROR] Docker Desktop not found at "C:\Program Files\Docker\Docker\Docker Desktop.exe".
        echo Please start Docker Desktop manually and re-run this script.
        pause
        exit /b 1
    )

    echo Waiting for Docker daemon to become ready...
    :wait_docker
    timeout /t 3 /nobreak >nul
    docker info >nul 2>&1
    if errorlevel 1 goto wait_docker
)
echo [1/4] Docker daemon is ready.

:: 2. Start only PostgreSQL (PostGIS) and Redis containers
echo [2/4] Starting database and Redis containers...
docker compose up -d db redis
if errorlevel 1 (
    echo [ERROR] Failed to start Docker Compose services.
    pause
    exit /b 1
)
echo [2/4] Database and Redis containers started.

:: 3. Start Express API Server in a dedicated window
echo [3/4] Starting Express API server (http://localhost:4000)...
start "Eagle Property Ledger - API" cmd /k "cd /d "%~dp0" && npm run dev -w api"

:: 4. Start Next.js Web App in a dedicated window
echo [4/4] Starting Next.js Web App (http://localhost:3000)...
start "Eagle Property Ledger - Web" cmd /k "cd /d "%~dp0" && npm run dev -w web"

echo.
echo ==================================================
echo   System launched!
echo   - Web App : http://localhost:3000
echo   - API     : http://localhost:4000
echo ==================================================
echo.
echo Opening http://localhost:3000 in your browser in 5 seconds...
timeout /t 5 /nobreak >nul
start "" "http://localhost:3000"

endlocal
