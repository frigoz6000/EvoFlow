@echo off
echo ==========================================
echo  EvoFlow - Restart API + React Dev Server
echo ==========================================

echo.
echo [1/4] Stopping processes on port 5019 (API)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5019 " ^| findstr "LISTENING"') do (
    echo Killing PID %%a
    taskkill /PID %%a /F >nul 2>&1
)

echo [2/4] Stopping processes on port 3000 (React)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    echo Killing PID %%a
    taskkill /PID %%a /F >nul 2>&1
)

timeout /t 2 /nobreak >nul

echo [3/4] Starting API (http://localhost:5019)...
start "EvoFlow API" cmd /k "cd /d "%~dp0EvoFlow.Api" && dotnet run --launch-profile http"

echo [4/4] Starting React dev server (http://localhost:3000)...
start "EvoFlow React" cmd /k "cd /d "%~dp0EvoFlow.React" && npm run dev"

echo.
echo Done! Both services are starting in separate windows.
echo  - API:   http://localhost:5019
echo  - React: http://localhost:3000
echo.
