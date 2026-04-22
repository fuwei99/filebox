@echo off
cd /d %~dp0
echo ============================
echo    FileBox Startup
echo ============================
echo.

REM Check .env
if not exist config.json if not exist .env (
    echo Creating .env from .env.example...
    copy .env.example .env
    echo.
)

REM Check backend deps
if not exist backend\node_modules (
    echo Installing backend dependencies...
    cd backend
    call npm install
    cd ..
    echo.
)

REM Check frontend deps
if not exist frontend\node_modules (
    echo Installing frontend dependencies...
    cd frontend
    call npm install
    cd ..
    echo.
)

echo Building frontend static files...
cd frontend
call npm run build
cd ..
echo.

echo Starting backend (single port mode)...
start "FileBox" cmd /k "cd /d %~dp0backend && npx tsx src/index.ts"

echo.
echo ============================
echo Services started!
echo App URL:  http://localhost:7860
echo ============================
pause
