# syntax=docker/dockerfile:1
FROM node:24-alpine AS base
WORKDIR /app
# Entrypoint tự sinh JWT secret nếu thiếu (xem docker-entrypoint.sh). Đặt ngoài
# /app để bind mount ./backend:/app ở bản dev không che mất; tr bỏ CR (CRLF) phòng
# khi file bị checkout trên Windows. Nằm ở stage chung, trước bước cài deps/copy
# code → sửa code không phải chạy lại bước này.
COPY docker-entrypoint.sh /tmp/docker-entrypoint.sh
RUN tr -d '\r' < /tmp/docker-entrypoint.sh > /usr/local/bin/docker-entrypoint.sh \
    && chmod +x /usr/local/bin/docker-entrypoint.sh \
    && rm /tmp/docker-entrypoint.sh
ENTRYPOINT ["docker-entrypoint.sh"]

FROM base AS dev
COPY package*.json ./
# Cache mount giữ ~/.npm giữa các lần build → build lỗi/retry không phải tải lại
# từ đầu; timeout/retry nới rộng cho mạng chập chờn (EIDLETIMEOUT).
# .deps-hash: dấu để x-ensure-deps (docker-compose.yml) biết node_modules đã khớp
# package-lock.json — volume mới tạo từ image không phải npm ci lại.
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund --fetch-timeout=600000 --fetch-retries=5 --fetch-retry-maxtimeout=120000 \
    && cat package.json package-lock.json | md5sum | cut -d' ' -f1 > node_modules/.deps-hash
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# Cài deps production ở stage riêng: stage prod bên dưới không cần npm, chỉ lấy
# node_modules đã cài xong.
FROM base AS prod-deps
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --no-audit --no-fund --fetch-timeout=600000 --fetch-retries=5 --fetch-retry-maxtimeout=120000

FROM base AS prod
# su-exec: entrypoint hạ quyền từ root xuống user `node` trước khi chạy app
# (xem docker-entrypoint.sh) — nhỏ hơn gosu/sudo, exec thẳng không để tiến trình cha.
# Gỡ npm/corepack/yarn: app chạy bằng `node` trực tiếp (kể cả migrate trong
# scripts/deploy.ps1), không cần trình quản lý gói lúc chạy. Bỏ đi để Trivy (CI
# chặn CRITICAL) không báo lỗ hổng của các thư viện npm tự đóng gói kèm, và kẻ
# chiếm được container không có sẵn npm để kéo thêm mã độc.
RUN apk upgrade --no-cache && apk add --no-cache su-exec \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
        /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
# Thư mục dữ liệu tạo sẵn cho node (volume mới được khởi tạo theo quyền này).
RUN mkdir -p /app/uploads /app/logs /app/secrets \
    && chown node:node /app/uploads /app/logs /app/secrets
ENV NODE_ENV=production
# Mã nguồn thuộc root, chỉ đọc với user node — app không tự sửa được code của
# chính nó. node_modules chỉ đổi khi package*.json đổi → layer này dùng lại
# cache qua các lần sửa code.
COPY --from=prod-deps /app/node_modules ./node_modules
COPY . .
# Commit SHA do CI truyền vào (--build-arg) — hiện ở /health, ghi vào schema_migrations
ARG GIT_SHA
ENV GIT_SHA=$GIT_SHA
EXPOSE 3001
# Gọi thẳng node (NODE_ENV đã set ở trên): `npm run` giữ thêm 1 tiến trình npm
# ~60-75MB RSS suốt đời container, và nuốt SIGTERM khiến tắt container chậm.
# src/cluster.js: chạy WEB_CONCURRENCY worker để dùng hết các core CPU.
CMD ["node", "src/cluster.js"]
