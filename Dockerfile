# ── Stage 1: build the frontend ──────────────────────────────────────────────
FROM node:20-alpine AS frontend
WORKDIR /app
COPY src/frontend/package.json src/frontend/package-lock.json ./
RUN npm ci
COPY src/frontend/ ./
RUN npm run build

# ── Stage 2: python runtime that serves both /api and the static frontend ─────
FROM python:3.12-slim AS runtime
WORKDIR /app
COPY src/backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY src/backend/ ./
COPY --from=frontend /app/dist ./static
ENV STATIC_DIR=/app/static
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
