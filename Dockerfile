FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libtorrent-rasterbar-dev \
    python3-libtorrent \
    build-essential \
    git \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js for frontend build
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Build frontend
COPY frontend/ ./frontend/
RUN cd frontend && npm install && npm run build

# Copy application
COPY backend/ ./backend/
COPY config/ ./config/
COPY setup.sh start.sh ./

# Make scripts executable
RUN chmod +x setup.sh start.sh

# Create data directories with size limit (optional: 20GB limit via docker run)
RUN mkdir -p data/torrents data/uploads

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

# Environment variables (can be overridden at runtime)
ENV PYTHONUNBUFFERED=1
ENV TORRENT_MAX_SIZE_GB=50

# Run application
CMD ["python", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]