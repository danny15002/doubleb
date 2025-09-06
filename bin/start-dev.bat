@echo off
REM Beep Boop Chat - Development Startup Script for Windows

echo ==========================================
echo 🚀 Beep Boop Chat - Development Startup
echo ==========================================
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed. Please install Node.js (v16 or higher)
    pause
    exit /b 1
)

REM Check if .env exists
if not exist ".env" (
    echo [WARNING] .env file not found. Creating from template...
    if exist "env.example" (
        copy env.example .env >nul
        echo [SUCCESS] .env file created from template
        echo [WARNING] Please edit .env file with your database credentials
        pause
    ) else (
        echo [ERROR] env.example file not found. Please create .env file manually
        pause
        exit /b 1
    )
)

REM Kill existing processes
echo [INFO] Cleaning up existing processes...
taskkill /f /im node.exe >nul 2>&1
taskkill /f /im npm.exe >nul 2>&1

REM Install dependencies if needed
if not exist "node_modules" (
    echo [INFO] Installing root dependencies...
    npm install
)

if not exist "server\node_modules" (
    echo [INFO] Installing server dependencies...
    cd server
    npm install
    cd ..
)

if not exist "client\node_modules" (
    echo [INFO] Installing client dependencies...
    cd client
    npm install
    cd ..
)

echo [SUCCESS] All dependencies installed

REM Start the development servers
echo [INFO] Starting development servers...
echo [INFO] Server will be available at: http://localhost:5000
echo [INFO] Client will be available at: http://localhost:3000
echo [INFO] Press Ctrl+C to stop all servers
echo.

npm run dev

pause
