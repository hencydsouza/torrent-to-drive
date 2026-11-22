#!/bin/bash

set -e

# Activate virtual environment
source venv/bin/activate

echo "Starting Torrent-to-Drive..."
echo ""
echo "Access the web interface at: http://localhost:8000"
echo ""
echo "Press Ctrl+C to stop"
echo ""

# Start the application
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
