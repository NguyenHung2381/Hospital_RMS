# syntax=docker/dockerfile:1
FROM node:22-alpine AS dev
WORKDIR /app
COPY package*.json ./
# Cache mount giữ ~/.npm giữa các lần build → build lỗi/retry không phải tải lại
# từ đầu; timeout/retry nới rộng cho mạng chập chờn (EIDLETIMEOUT).
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund --fetch-timeout=600000 --fetch-retries=5 --fetch-retry-maxtimeout=120000
COPY . .
# Entrypoint tự sinh JWT secret nếu thiếu (xem docker-entrypoint.sh). Đặt ngoài
# /app để bind mount ./backend:/app ở bản dev không che mất; tr bỏ CR (CRLF) phòng
# khi file bị checkout trên Windows.
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN tr -d '\r' < /usr/local/bin/docker-entrypoint.sh > /tmp/entrypoint \
    && mv /tmp/entrypoint /usr/local/bin/docker-entrypoint.sh \
    && chmod +x /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["docker-entrypoint.sh"]
EXPOSE 3000
CMD ["npm", "run", "dev"]

FROM node:22-alpine AS prod
WORKDIR /app
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --no-audit --no-fund --fetch-timeout=600000 --fetch-retries=5 --fetch-retry-maxtimeout=120000
COPY . .
ENV NODE_ENV=production
# Entrypoint tự sinh JWT secret nếu thiếu (xem docker-entrypoint.sh). Đặt ngoài
# /app để bind mount ./backend:/app ở bản dev không che mất; tr bỏ CR (CRLF) phòng
# khi file bị checkout trên Windows.
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN tr -d '\r' < /usr/local/bin/docker-entrypoint.sh > /tmp/entrypoint \
    && mv /tmp/entrypoint /usr/local/bin/docker-entrypoint.sh \
    && chmod +x /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["docker-entrypoint.sh"]
EXPOSE 3001
# Gọi thẳng node (NODE_ENV đã set ở trên): `npm run` giữ thêm 1 tiến trình npm
# ~60-75MB RSS suốt đời container, và nuốt SIGTERM khiến tắt container chậm.
CMD ["node", "src/server.js"]
