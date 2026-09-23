# syntax=docker/dockerfile:1
FROM node:22-alpine AS dev
WORKDIR /app
COPY package*.json ./
# Cache mount giữ ~/.npm giữa các lần build → build lỗi/retry không phải tải lại
# từ đầu; timeout/retry nới rộng cho mạng chập chờn (EIDLETIMEOUT).
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund --fetch-timeout=600000 --fetch-retries=5 --fetch-retry-maxtimeout=120000
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

FROM node:22-alpine AS prod
WORKDIR /app
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --no-audit --no-fund --fetch-timeout=600000 --fetch-retries=5 --fetch-retry-maxtimeout=120000
COPY . .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "run", "start:prod"]
