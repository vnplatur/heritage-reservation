#!/bin/bash
# Quick Setup Script for Heritage Reservation System

echo "🚀 Starting Heritage Reservation System Setup..."
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 16+"
    exit 1
fi

echo "✅ Node.js version: $(node -v)"
echo ""

# Setup Backend
echo "📦 Setting up Backend..."
cd backend
if [ -f ".env" ]; then
    echo "⚠️  .env already exists, skipping"
else
    cp .env.example .env
    echo "✅ Created .env from example"
fi

echo "📥 Installing backend dependencies..."
npm install

if [ $? -eq 0 ]; then
    echo "✅ Backend setup complete"
else
    echo "❌ Backend setup failed"
    exit 1
fi

cd ..
echo ""

# Setup Frontend
echo "📦 Setting up Frontend..."
cd frontend
echo "📥 Installing frontend dependencies..."
npm install

if [ $? -eq 0 ]; then
    echo "✅ Frontend setup complete"
else
    echo "❌ Frontend setup failed"
    exit 1
fi

cd ..
echo ""

# Show next steps
echo "════════════════════════════════════════════════════"
echo "✨ Setup Complete!"
echo "════════════════════════════════════════════════════"
echo ""
echo "📝 IMPORTANT: Before running the app, ensure MongoDB is running:"
echo "   brew services start mongodb-community  (Mac)"
echo "   or"
echo "   docker run -d -p 27017:27017 --name mongo mongo:5.0  (Docker)"
echo ""
echo "🚀 To start the application:"
echo ""
echo "Terminal 1 (Backend):"
echo "  cd backend"
echo "  npm run dev"
echo ""
echo "Terminal 2 (Frontend):"
echo "  cd frontend"
echo "  npm start"
echo ""
echo "📍 Access the app at: http://localhost:3000"
echo "🔧 Backend API: http://localhost:5000"
echo ""
echo "📚 Read DEVELOPER_GUIDE.md for detailed understanding"
echo "════════════════════════════════════════════════════"
