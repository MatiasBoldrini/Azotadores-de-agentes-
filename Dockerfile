FROM node:22-bookworm-slim AS frontend
WORKDIR /app
COPY frontend/package*.json ./frontend/
RUN npm ci --prefix frontend
COPY frontend ./frontend
COPY public ./public
RUN npm run build --prefix frontend

FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8000
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY siteforge ./siteforge
COPY scripts ./scripts
COPY data ./data
COPY public/data/snapshot.json ./public/data/snapshot.json
COPY --from=frontend /app/dist ./dist
EXPOSE 8000
CMD ["sh", "-c", "exec python -m uvicorn siteforge.api:app --host 0.0.0.0 --port ${PORT:-8000}"]
