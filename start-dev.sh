#!/bin/bash

# Semantic Maps Assistant - Development Startup Script
# This script starts both the backend and frontend servers

echo "🚀 Starting Semantic Maps Assistant..."

# Check if Python is available
if ! command -v python &> /dev/null; then
    echo "❌ Python is not installed. Please install Python 3.9+ and try again."
    exit 1
fi

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 14+ and try again."
    exit 1
fi

# Start backend server
echo "🐍 Starting Python FastAPI backend..."
cd server
if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python -m venv venv
fi

source venv/bin/activate
pip install -r requirements.txt

if [ ! -f ".env" ]; then
    echo "⚠️  No .env file found in server directory. Please copy env.example to .env and add your API key."
    exit 1
fi

uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!
echo "✅ Backend started on http://localhost:8000 (PID: $BACKEND_PID)"

# Start frontend server
echo "⚛️  Starting React frontend..."
cd ../semantic-maps-app

if [ ! -d "node_modules" ]; then
    echo "Installing Node.js dependencies..."
    npm install
fi

if [ ! -f ".env" ]; then
    echo "⚠️  No .env file found in semantic-maps-app directory. Please copy env.example to .env and add your API key."
    kill $BACKEND_PID
    exit 1
fi

npm start &
FRONTEND_PID=$!
echo "✅ Frontend started on http://localhost:3000 (PID: $FRONTEND_PID)"

echo ""
echo "🎉 Both servers are running!"
echo "📱 Frontend: http://localhost:3000"
echo "🔧 Backend API: http://localhost:8000"
echo "📚 API Docs: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop both servers"

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Stopping servers..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    echo "✅ Servers stopped"
    exit 0
}

# Set trap to cleanup on script exit
trap cleanup SIGINT SIGTERM

# Wait for both processes
wait $BACKEND_PID $FRONTEND_PID 