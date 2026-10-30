FROM node:22-alpine AS frontend-build
WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
COPY backend ./backend
COPY --from=frontend-build /build/dist ./frontend/dist
ENV SIGNALDESK_HOST=0.0.0.0
ENV PORT=8000
EXPOSE 8000
CMD ["python", "-m", "backend.app"]
