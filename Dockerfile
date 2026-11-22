# syntax=docker/dockerfile:1

# ---- frontend: build static files, only dist/ goes into the final image ----
FROM --platform=$BUILDPLATFORM node:20-alpine AS frontend
WORKDIR /src
COPY frontend/package.json frontend/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---- python deps: installed into a venv that is copied as one layer ----
FROM python:3.11-slim AS deps
ENV PIP_DISABLE_PIP_VERSION_CHECK=1
RUN python -m venv /venv
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip /venv/bin/pip install -r requirements.txt

# ---- runtime ----
FROM python:3.11-slim
# libtorrent's wheel bundles OpenSSL/boost; nothing else from apt is needed
ENV PATH=/venv/bin:$PATH PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
RUN useradd --uid 1000 --create-home app
WORKDIR /app
COPY --from=deps /venv /venv
COPY backend/ ./backend/
COPY --from=frontend /src/dist ./frontend/dist
# config/ (OAuth client, token, settings) and data/ (downloads) are volumes, never baked in
RUN mkdir -p config data/torrents && chown -R app:app config data
USER app
VOLUME ["/app/config", "/app/data"]
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health', timeout=5)"
# Trust X-Forwarded-Proto/Host from a reverse proxy so sign-in redirects use the public https origin
ENV FORWARDED_ALLOW_IPS="*"
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
