# syntax=docker/dockerfile:1
FROM node:22-alpine AS dev
WORKDIR /app
COPY package*.json ./
# Cache mount giữ ~/.npm giữa các lần build → build lỗi/retry không phải tải lại
# từ đầu; timeout/retry nới rộng cho mạng chập chờn (EIDLETIMEOUT).
# .deps-hash: dấu để x-ensure-deps (docker-compose.yml) biết node_modules đã khớp
# package-lock.json — volume mới tạo từ image không phải npm ci lại.
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund --fetch-timeout=600000 --fetch-retries=5 --fetch-retry-maxtimeout=120000 \
    && cat package.json package-lock.json | md5sum | cut -d' ' -f1 > node_modules/.deps-hash
COPY . .
EXPOSE 5173
CMD ["node", "node_modules/vite/bin/vite.js"]

FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund --fetch-timeout=600000 --fetch-retries=5 --fetch-retry-maxtimeout=120000
COPY . .
RUN npm run build

FROM nginx:alpine AS prod
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Sinh danh sách proxy tin cậy từ TRUSTED_PROXIES lúc khởi động (entrypoint của
# image nginx tự chạy mọi file /docker-entrypoint.d/*.sh). tr bỏ CR phòng khi
# file bị checkout CRLF trên Windows.
COPY docker/40-trusted-proxies.sh /tmp/40-trusted-proxies.sh
RUN tr -d '\r' < /tmp/40-trusted-proxies.sh > /docker-entrypoint.d/40-trusted-proxies.sh \
    && chmod +x /docker-entrypoint.d/40-trusted-proxies.sh \
    && rm /tmp/40-trusted-proxies.sh
EXPOSE 80
