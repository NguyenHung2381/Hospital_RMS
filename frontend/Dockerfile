# syntax=docker/dockerfile:1
# Stage cài deps dùng chung cho dev và build (cả 2 cần đủ devDependencies):
# trước đây mỗi stage tự `npm ci` → build cả 2 target là cài 2 lần và giữ 2
# layer node_modules (~vài trăm MB) trong build cache.
FROM node:24-alpine AS deps
WORKDIR /app
COPY package*.json ./
# Cache mount giữ ~/.npm giữa các lần build → build lỗi/retry không phải tải lại
# từ đầu; timeout/retry nới rộng cho mạng chập chờn (EIDLETIMEOUT).
# .deps-hash: dấu để x-ensure-deps (docker-compose.yml) biết node_modules đã khớp
# package-lock.json — volume mới tạo từ image không phải npm ci lại.
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund --fetch-timeout=600000 --fetch-retries=5 --fetch-retry-maxtimeout=120000 \
    && cat package.json package-lock.json | md5sum | cut -d' ' -f1 > node_modules/.deps-hash

FROM deps AS dev
COPY . .
EXPOSE 5173
CMD ["node", "node_modules/vite/bin/vite.js"]

FROM deps AS build
# Bỏ file chỉ dùng ở stage prod (cấu hình nginx) — sửa chúng không làm mất cache
# của bước build (tsc + vite + obfuscator, chậm nhất trong cả quá trình).
COPY --exclude=nginx.conf --exclude=docker . .
# Nén gzip sẵn lúc build (nginx.conf: gzip_static on) → nginx gửi thẳng file .gz
# mức 9 thay vì nén lại bundle JS (antd + obfuscator, vài MB) cho MỖI request.
# File < 1KB không đáng nén; ảnh/font đã nén sẵn nên không nén thêm.
RUN npm run build \
    && find dist -type f -size +1k \( -name '*.js' -o -name '*.mjs' -o -name '*.css' -o -name '*.html' \
        -o -name '*.svg' -o -name '*.json' -o -name '*.txt' \) -exec gzip -9 -k {} +

FROM nginx:alpine AS prod
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Script chạy lúc khởi động (entrypoint của image nginx tự chạy mọi file
# /docker-entrypoint.d/*.sh): 40 sinh danh sách proxy tin cậy từ TRUSTED_PROXIES,
# 41 chọn header CSP (chặn / chỉ báo cáo) theo CSP_REPORT_ONLY. tr bỏ CR phòng
# khi file bị checkout CRLF trên Windows.
COPY docker/40-trusted-proxies.sh docker/41-csp.sh /tmp/
# apk upgrade: lấy bản vá gói hệ thống mới hơn image nginx:alpine gốc (giống
# backend) — Trivy ở CI chặn lỗ hổng CRITICAL đã có bản vá.
RUN apk upgrade --no-cache \
    && for f in 40-trusted-proxies.sh 41-csp.sh; do \
         tr -d '\r' < /tmp/$f > /docker-entrypoint.d/$f \
         && chmod +x /docker-entrypoint.d/$f \
         && rm /tmp/$f; \
       done
EXPOSE 80
