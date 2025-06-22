@echo off
REM Semantic Maps Assistant - Development Startup Script (Windows)
REM This script starts both the backend and frontend servers

echo 🚀 Starting Semantic Maps Assistant...

REM Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Python is not installed. Please install Python 3.9+ and try again.
    pause
    exit /b 1
)

REM Check if Node.js is available
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js is not installed. Please install Node.js 14+ and try again.
    pause
    exit /b 1
)

REM Start backend server
echo 🐍 Starting Python FastAPI backend...
cd server

if not exist "venv" (
    echo Creating Python virtual environment...
    python -m venv venv
)

call venv\Scripts\activate
pip install -r requirements.txt

if not exist ".env" (
    echo ⚠️  No .env file found in server directory. Please copy env.example to .env and add your API key.
    pause
    exit /b 1
)

echo ✅ Starting backend on http://localhost:8000
start /B uvicorn main:app --reload --port 8000

REM Start frontend server
echo ⚛️  Starting React frontend...
cd ..\semantic-maps-app

if not exist "node_modules" (
    echo Installing Node.js dependencies...
    call npm install
)

if not exist ".env" (
    echo ⚠️  No .env file found in semantic-maps-app directory. Please copy env.example to .env and add your API key.
    pause
    exit /b 1
)

echo ✅ Starting frontend on http://localhost:3000
start /B npm start

echo.
echo 🎉 Both servers are starting!
echo 📱 Frontend: http://localhost:3000
echo 🔧 Backend API: http://localhost:8000
echo 📚 API Docs: http://localhost:8000/docs
echo.
echo Press any key to stop both servers...
pause >nul

REM Kill processes (basic cleanup)
taskkill /F /IM "uvicorn.exe" >nul 2>&1
taskkill /F /IM "node.exe" >nul 2>&1
echo ✅ Servers stopped 