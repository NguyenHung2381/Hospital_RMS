# Hospital RMS — Hệ thống Quản lý Nghiên cứu Khoa học & Đào tạo Bệnh viện

Ứng dụng web quản lý hoạt động **nghiên cứu khoa học** và **đào tạo liên tục (CME)** trong bệnh viện: đăng ký đề tài, hội đồng chấm đề cương, quy trình phê duyệt nhiều bước, hội thảo/hội nghị, chương trình – kế hoạch – khoá đào tạo, thi trực tuyến, khảo sát, điểm danh QR, cấp và theo dõi tín chỉ CME, cùng hệ thống báo cáo – thống kê.

Monorepo gồm hai ứng dụng chạy độc lập, dùng chung một REST API:

| Thư mục | Vai trò |
|---|---|
| [`frontend/`](frontend/) | React + TypeScript SPA (Vite) |
| [`backend/`](backend/) | Node.js + Express REST API trên Microsoft SQL Server |

---

## Mục lục

- [Tổng quan](#tổng-quan)
- [Công nghệ](#công-nghệ)
- [Bắt đầu nhanh](#bắt-đầu-nhanh)
- [Cấu hình môi trường](#cấu-hình-môi-trường)
- [Chạy bằng Docker](#chạy-bằng-docker)
  - [Develop](#develop-docker-composeyml)
  - [Production](#production-docker-composeprodyml)
  - [JWT secret](#jwt-secret)
  - [Xử lý sự cố](#xử-lý-sự-cố-docker)
- [Cấu trúc dự án](#cấu-trúc-dự-án)
- [Phân hệ chức năng](#phân-hệ-chức-năng)
- [API](#api)
- [Xác thực & phân quyền](#xác-thực--phân-quyền)
- [Database](#database)
- [Tác vụ nền, cache & logging](#tác-vụ-nền-cache--logging)
- [Quy ước phát triển](#quy-ước-phát-triển)

---

## Tổng quan

Ứng dụng có ba cổng truy cập:

| Cổng | Đường dẫn | Dành cho |
|---|---|---|
| **Cổng công khai** | `/`, `/dang-ky-de-tai`, `/de-xuat-de-tai`, `/dang-ky-khoa-hoc`, `/tra-cuu-ket-qua`, `/tra-cuu-ho-so/:maTraCuu`, `/thu-vien-de-tai` | Khách chưa đăng nhập: đăng ký/đề xuất đề tài, đăng ký khoá học, tra cứu hồ sơ bằng mã, thư viện đề tài |
| **Cổng người dùng** | `/user/*` | Nhân viên: đề tài của tôi, tiến độ hội đồng, việc của tôi, khảo sát, thi trực tuyến, điểm danh, hồ sơ cá nhân |
| **Cổng quản trị** | `/admin/*` | Quản trị viên và cán bộ quản lý: toàn bộ nghiệp vụ, danh mục, phân quyền, nhật ký |

Nhóm người dùng chính:

- **Nhân viên nghiên cứu / học viên**: đăng ký đề tài, nộp hồ sơ, tham gia khoá học, làm bài thi, khảo sát, theo dõi tiến độ.
- **Thành viên hội đồng**: chấm đề cương, nhập điểm/nhận xét, theo dõi các đề tài được phân công.
- **Quản lý khoa / cấp duyệt**: duyệt hoặc trả lại đề tài, quản lý tài khoản trong khoa.
- **Quản trị viên**: người dùng, vai trò/quyền, danh mục, đợt nghiên cứu, hội đồng, đào tạo, CME, quy trình duyệt, cài đặt hệ thống, nhật ký.

---

## Công nghệ

### Frontend

| Thành phần | Công nghệ |
|---|---|
| Framework | React 19, TypeScript 6 |
| Build | Vite 8 (`@vitejs/plugin-react`, `vite-plugin-svgr`) |
| Routing | React Router 7: lazy route + prefetch, guard theo quyền |
| UI | Ant Design 5 + UI kit nội bộ (`shared/components`) |
| Server state | TanStack Query 5 |
| Client state | Zustand |
| Form & validation | React Hook Form + Zod |
| Khác | Recharts (biểu đồ), dnd-kit (kéo thả), html5-qrcode (quét QR), DOMPurify, docx-preview |
| Realtime | SSE, dùng một `EventSource` chung cho mỗi tab |

### Backend

| Thành phần | Công nghệ |
|---|---|
| Runtime | Node.js, Express 4 (JS, đang chuyển dần một phần sang TS: `tsx`, `npm run typecheck`) |
| Database | Microsoft SQL Server (`mssql`, connection pool) |
| Cache | Redis (`ioredis`), cache-aside, fail-open |
| Xác thực | JWT access + refresh token, `bcryptjs`, 2FA TOTP (`otplib`), captcha, khoá tài khoản khi sai mật khẩu nhiều lần |
| Bảo mật | `helmet`, `express-rate-limit`, `sanitize-html`, link `/uploads` ký HMAC có hạn |
| Validation | `express-validator`, Zod |
| Upload / Excel | Multer (kèm allowlist loại file), ExcelJS |
| Email | Nodemailer (mặc định tắt) |
| Tác vụ nền | `node-cron` |
| Logging | Pino + `pino-roll`, tuỳ chọn Loki + Promtail |
| API docs | Swagger / OpenAPI (`swagger-jsdoc`, `swagger-ui-express`), bảo vệ bằng Basic Auth |

---

## Bắt đầu nhanh

### Yêu cầu

- **Node.js** ≥ 20 LTS, **npm** ≥ 9
- **Microsoft SQL Server** (Express hoặc bản đầy đủ) có database `RMS_HOSPITAL`
  - Bật **TCP/IP** trong SQL Server Configuration Manager. Mở port `1433` trên firewall nếu API và SQL Server không cùng máy (bắt buộc khi chạy Docker).
- **Redis** (tuỳ chọn): không có Redis thì server vẫn chạy, chỉ bỏ qua cache.

### Cài đặt và chạy

```bash
git clone <repo-url>
cd Hospital_RMS

npm install                      # root: chỉ có 'concurrently'
npm install --prefix backend
npm install --prefix frontend

cp backend/.env.example backend/.env   # rồi điền thông tin DB và secret thật

npm run dev
#   SERVER → nodemon src/server.js           http://localhost:3000
#   CLIENT → vite (đợi server sẵn sàng)      http://localhost:5173
```

Chạy riêng từng phần: `npm run server` (backend) hoặc `npm run client` (frontend).

Nếu port `3000` đang bận, backend tự chuyển sang port trống kế tiếp và ghi `VITE_API_PORT` vào `frontend/.env` để Vite proxy đúng port.

### Build production (không Docker)

```bash
npm run build --prefix frontend        # ra frontend/dist (bundle JS được làm rối bằng javascript-obfuscator)
npm run start:prod --prefix backend    # NODE_ENV=production
```

Ở production, server **không khởi động** nếu thiếu `CORS_ORIGIN`. Cách triển khai khuyến nghị là dùng Docker, xem [Docker: Production](#production-docker-composeprodyml).

---

## Cấu hình môi trường

### `backend/.env`

Xem đầy đủ các biến và chú thích trong [`backend/.env.example`](backend/.env.example). Tóm tắt:

| Nhóm | Biến | Ghi chú |
|---|---|---|
| **Bắt buộc** | `DB_USER`, `DB_PASSWORD`, `JWT_SECRET`, `JWT_REFRESH_SECRET` (+ `SWAGGER_USER`, `SWAGGER_PASS` khi Swagger bật) | Server thoát ngay khi khởi động nếu thiếu biến nào. Swagger tắt ở production, trừ khi đặt `SWAGGER_ENABLED=true`. Secret nên là chuỗi ngẫu nhiên dài (`openssl rand -hex 32`). |
| SQL Server | `DB_SERVER`, `DB_PORT`, `DB_DATABASE`, `DB_ENCRYPT`, `DB_TRUST_SERVER_CERT` | Production: không dùng `sa`, nên tạo login riêng chỉ có quyền trên `RMS_HOSPITAL` và bật `DB_ENCRYPT=true`. |
| HTTP | `PORT`, `CORS_ORIGIN`, `TRUST_PROXY` | `CORS_ORIGIN` bắt buộc ở production. `TRUST_PROXY` = số proxy đứng ngay trước backend (thường là `1`). Không dùng `uniquelocal`: người dùng có IP nội bộ sẽ tự khai được IP giả để vượt rate-limit đăng nhập. |
| Upload | `UPLOAD_URL_SECRET`, `UPLOAD_URL_TTL_SEC`, `TOPIC_UPLOAD_MAX_MB`, `TRAINING_UPLOAD_MAX_MB`, `TRAINING_MEDIA_MAX_MB`, `UPLOAD_DAILY_QUOTA_MB`, `CLAMAV_HOST` | Link tải file được ký HMAC. Đổi secret thì mọi link cũ mất hiệu lực. Xem [Bảo mật upload](#bảo-mật-upload). |
| Log | `LOG_DIR`, `LOG_RETENTION_FILES`, `LOG_STDOUT`, `AUDIT_LOG_METHODS` | Xem phần [logging](#tác-vụ-nền-cache--logging). |
| Email | `MAIL_ENABLED`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Mặc định tắt, email chỉ in ra console. |
| Redis | `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` | Mặc định `localhost:6379`, không mật khẩu. Docker prod tự sinh mật khẩu (volume `redis_secret`). |
| Cron | `JOBS_ENABLED`, `CRON_TZ` | `JOBS_ENABLED=false` để tắt job nền (môi trường test, hoặc các instance phụ). |
| Danh tính | `PERSON_DUAL_WRITE` | Đặt `false` để tắt khẩn cấp đồng bộ `persons`. |

### `frontend/.env` (tuỳ chọn)

Khi dev, client gọi đường dẫn tương đối qua proxy của Vite nên thường không cần tự tạo file này.

```env
VITE_API_PORT=3000        # backend tự ghi mỗi lần khởi động
# VITE_API_BASE_URL=      # chỉ đặt khi deploy client ở domain khác với API
```

---

## Chạy bằng Docker

Dự án có hai file compose:

| | Develop | Production |
|---|---|---|
| File | `docker-compose.yml` | `docker-compose.prod.yml` |
| Project Compose | `hospital_rms_dev` | `hospital_rms` |
| Build target | `dev` (Node, mount source code) | `prod` (backend `npm ci --omit=dev`, frontend build tĩnh + Nginx) |
| Service | `server`, `client`, `redis` (+ `loki`, `promtail`) | `backend`, `frontend`, `redis` |
| Truy cập web | `http://localhost:5173` (Vite) | `http://<host>:8084` (Nginx) |
| API | `http://localhost:3000` | `127.0.0.1:3001` (chỉ loopback trên máy server) |
| Hot reload | Có (nodemon + Vite, polling) | Không |
| Biến môi trường | `backend/.env` được mount vào container | `backend/.env` + `backend/.env.production` qua `env_file` |
| Upload | `backend/uploads/` trên máy host | Volume `server_uploads` |

Mỗi file đặt tên project riêng (khoá `name:` ở đầu file) nên hai môi trường chạy song song được trên cùng một máy: container, network và volume tách biệt, không dùng chung JWT secret. Trước đây cả hai cùng lấy tên thư mục làm tên project, chạy môi trường này sẽ dừng container của môi trường kia.

### Yêu cầu chung

- **Docker Desktop** (Windows/macOS) hoặc **Docker Engine** (Linux) có **Compose v2.24 trở lên**. Bản prod dùng cú pháp `env_file` với `path`/`required`, bản cũ hơn sẽ báo lỗi.
- BuildKit bật sẵn (mặc định từ Docker 23). Dockerfile dùng `RUN --mount=type=cache` để giữ cache npm giữa các lần build.
- **SQL Server không chạy trong container** mà chạy trên máy host hoặc một máy chủ riêng:
  - Bật **TCP/IP** trong SQL Server Configuration Manager, dùng port cố định (mặc định `1433`).
  - Mở port `1433` trên firewall cho dải IP của Docker. Container coi SQL Server trên host là máy khác trong mạng, không phải `localhost`.
  - Bật **SQL Server Authentication** (mixed mode). Container không dùng được Windows Authentication.

---

### Develop (`docker-compose.yml`)

Source code được bind mount vào container. Sửa code trên máy là container tự nạp lại: nodemon cho backend, Vite HMR cho frontend.

#### Service

| Service | Port | Ghi chú |
|---|---|---|
| `server` | `3000` | Express + nodemon (`-L`, polling). `mem_limit: 640m`, heap V8 384 MB |
| `client` | `5173` | Vite dev server, proxy `/api` và `/uploads` sang `server:3000`. `mem_limit: 768m` |
| `redis` | `6379` | Redis 7, `maxmemory 128mb`, `allkeys-lru`, tắt RDB/AOF (chỉ làm cache) |
| `loki` | `3100` | Profile `logs`, **không chạy mặc định** |
| `promtail` | – | Profile `logs`, đọc `backend/logs` rồi đẩy vào Loki |

#### Cấu hình

1. Tạo `backend/.env` từ file mẫu:

   ```bash
   cp backend/.env.example backend/.env
   ```

   Điền `DB_USER`, `DB_PASSWORD`, `DB_DATABASE`. Để trống hoặc giữ nguyên giá trị mẫu của `JWT_SECRET` / `JWT_REFRESH_SECRET` cũng được, container sẽ tự sinh và ghi vào file này (xem [JWT secret](#jwt-secret)).

2. Các biến compose tự đặt, **không cần** khai báo trong `.env`:

   | Biến | Giá trị | Lý do |
   |---|---|---|
   | `NODE_ENV` | `development` | |
   | `DB_SERVER` | `host.docker.internal` | Trỏ về SQL Server trên máy host (`extra_hosts: host-gateway` để chạy được cả trên Linux) |
   | `REDIS_HOST` / `REDIS_PORT` | `redis` / `6379` | Tên service trong mạng Docker |
   | `TRUST_PROXY` | `1` | Tin đúng 1 proxy liền trước (Vite), để `req.ip` là IP thật của máy khách chứ không phải IP container `frontend` |
   | `LOG_RETENTION_FILES` | `100` | Giữ ít nhất khoảng 3 tháng log |
   | `VITE_API_HOST` / `VITE_API_PORT` | `server` / `3000` | Đích proxy của Vite |
   | `CHOKIDAR_USEPOLLING` | `true` | Bind mount qua Docker Desktop không phát fs-events, phải polling (chu kỳ 1 giây) |

   Biến môi trường do compose đặt được ưu tiên hơn giá trị trong `backend/.env`.

#### Chạy

```bash
docker compose up --build            # lần đầu, hoặc sau khi sửa Dockerfile
docker compose up -d                 # chạy nền
docker compose logs -f backend       # xem log backend
docker compose --profile logs up -d  # bật thêm Loki + Promtail
docker compose down                  # dừng và xoá container (giữ volume)
```

| Địa chỉ | Nội dung |
|---|---|
| `http://localhost:5173` | Giao diện web |
| `http://localhost:3000/api-docs` | Swagger UI (Basic Auth `SWAGGER_USER` / `SWAGGER_PASS`) |
| `http://localhost:3000/health` | Health check |
| `http://localhost:3100` | Loki (khi bật profile `logs`) |

#### Thêm hoặc cập nhật package

`node_modules` nằm trong anonymous volume (`/app/node_modules`) để không bị bind mount ghi đè. Vì vậy sau khi sửa `package.json`, phải build lại image **và** tạo lại volume đó, nếu không container vẫn dùng `node_modules` cũ:

```bash
docker compose up -d --build --renew-anon-volumes backend  # hoặc frontend
```

---

### Production (`docker-compose.prod.yml`)

```
Trình duyệt ──https──► Reverse proxy HTTPS (IIS / nginx host…, giữ chứng chỉ)
                              │ http + X-Forwarded-For / X-Forwarded-Proto
                              ▼
                        :8084 frontend (Nginx, file tĩnh + header bảo mật)
                              │  /api/, /uploads/, /api/v1/events (SSE)
                              ▼
                          backend:3001 ──► redis:6379 (có mật khẩu)
                              │
                              ▼
                          SQL Server (DB_SERVER, ngoài Docker)
```

#### Service

| Service | Port trên máy host | Ghi chú |
|---|---|---|
| `frontend` | `${FRONTEND_BIND:-8084}` → `80` | Nginx phục vụ `frontend/dist` và reverse proxy tới `backend:3001`. `mem_limit: 64m` |
| `backend` | `127.0.0.1:3001` | Chỉ mở trên loopback để IIS / reverse proxy cùng máy gọi được. Không lộ ra mạng. Chạy bằng user `node` (không phải root). `mem_limit: 512m` |
| `redis` | – | Không publish port, chỉ dùng trong mạng Docker. Bắt buộc mật khẩu, tự sinh lần đầu vào volume `redis_secret` |

Mọi service đều có `restart: unless-stopped`, tự khởi động lại cùng Docker.

#### Bước 1: Chuẩn bị SQL Server

- Tạo login riêng cho ứng dụng, chỉ có quyền trên database `RMS_HOSPITAL`, bằng `scripts/create-app-login.sql`. File `*.sql` không có trong repo, lấy từ nhóm phát triển.
- **Không dùng `sa` ở production.** Server sẽ in cảnh báo khi khởi động nếu `DB_USER=sa`.

#### Bước 2: Tạo file môi trường

Compose nạp hai file theo thứ tự. File sau ghi đè file trước, và cả hai đều không bắt buộc phải có:

| File | Nội dung nên đặt |
|---|---|
| `backend/.env` | Cấu hình chung: `DB_SERVER`, `DB_PORT`, `DB_DATABASE`, `SWAGGER_*`, `SMTP_*`, `JOBS_ENABLED`… |
| `backend/.env.production` | Thông tin chỉ dùng cho prod: `DB_USER` / `DB_PASSWORD` của login riêng, `DB_TRUST_SERVER_CERT`, `UPLOAD_URL_SECRET` |

```bash
cp backend/.env.example backend/.env
# sửa DB_SERVER thành địa chỉ SQL Server thật
#   (dùng host.docker.internal nếu SQL Server nằm trên chính máy chạy Docker)

cat > backend/.env.production <<'EOF'
DB_USER=rms_app
DB_PASSWORD=<mật khẩu mạnh>
DB_TRUST_SERVER_CERT=true
SWAGGER_PASS=<mật khẩu mạnh>
EOF
```

Cả hai file đều bị `.gitignore` và `.dockerignore` loại ra nên không bị commit hay đóng gói vào image.

#### Bước 3: Kiểm tra các biến compose ghi đè

Các biến sau được đặt cứng trong `docker-compose.prod.yml` và **luôn thắng** giá trị trong file `.env`:

| Biến | Giá trị | Ghi chú |
|---|---|---|
| `DB_ENCRYPT` | `true` | Luôn mã hoá kết nối tới SQL Server. SQL Server chưa cài chứng chỉ thì dùng chứng chỉ tự ký, cần `DB_TRUST_SERVER_CERT=true`. Có chứng chỉ CA thật thì đặt `false` |
| `PORT` | `3001` | Phải khớp `proxy_pass http://backend:3001` trong `frontend/nginx.conf` |
| `REDIS_HOST` / `REDIS_PORT` | `redis` / `6379` | |
| `TRUST_PROXY` | `1` | Tin đúng 1 proxy liền trước backend (nginx container). Nginx đã tự lọc IP thật và **ghi đè** `X-Forwarded-For`, nên rate-limit đăng nhập tính theo IP thật |
| `CORS_ORIGIN` | `${CORS_ORIGIN:-https://nckh.bvnghean.vn}` | Bắt buộc ở production |
| `REDIS_PASSWORD_FILE` | `/run/redis-secret/pass` | Entrypoint đọc mật khẩu Redis do container `redis` tự sinh |
| `NODE_OPTIONS` | `--max-old-space-size=384` | Heap nhỏ hơn `mem_limit` để còn chỗ cho buffer upload và xuất Excel |

**Đổi domain** thì sửa đồng bộ: `CORS_ORIGIN` (origin chính xác trình duyệt dùng, gồm scheme và port nếu có) và `server_name` trong `frontend/nginx.conf`.

#### Bước 3b: Nối với reverse proxy HTTPS

HTTPS kết thúc ở reverse proxy đứng trước cổng `8084` (IIS ARR, nginx trên host…). Container chỉ nhận HTTP từ proxy đó. Các biến dưới đây đặt trong file `.env` **cạnh `docker-compose.prod.yml`** (file biến của Compose, khác `backend/.env`):

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `TRUSTED_PROXIES` | mọi IP nội bộ (`127.0.0.1/32 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16`) | IP/CIDR của reverse proxy. Chỉ request đến từ các địa chỉ này mới được tin `X-Forwarded-For` (IP thật) và `X-Forwarded-Proto` (https) |
| `FRONTEND_BIND` | `8084` | Địa chỉ publish cổng frontend |
| `CORS_ORIGIN` | `https://nckh.bvnghean.vn` | |

Mặc định chạy được với proxy ở bất kỳ đâu trong mạng nội bộ, nhưng **máy khác trong LAN gọi thẳng `http://<server>:8084` vẫn tự khai được IP giả**. Nên thu hẹp lại:

- Proxy **cùng máy** với Docker: đặt `FRONTEND_BIND=127.0.0.1:8084` (chỉ proxy trên máy đó gọi được). Muốn chặt hơn nữa thì đặt `TRUSTED_PROXIES` bằng IP gateway của mạng Docker (xem bằng `docker network inspect hospital_rms_default`, thường là `172.x.0.1`).
- Proxy **ở máy khác**: đặt `TRUSTED_PROXIES=<IP proxy>` và dùng firewall chỉ cho IP proxy vào cổng `8084`.

Reverse proxy phải gửi `X-Forwarded-Proto: https`. IIS ARR mặc định **không** gửi header này: thêm server variable `HTTP_X_FORWARDED_PROTO` = `https` trong rule URL Rewrite. Nếu thiếu, backend in cảnh báo `Request ... tới qua http, không phải https` trong log, và trình duyệt không nhận HSTS.

Kiểm tra sau khi cấu hình (trên máy có proxy):

```bash
curl -sI https://nckh.bvnghean.vn/ | grep -i strict-transport   # phải có HSTS
docker compose -f docker-compose.prod.yml logs frontend | tail  # cột đầu = IP thật người dùng, không phải IP proxy
```

#### Bước 4: Build và chạy

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f backend
```

Kiểm tra trên máy server:

```bash
curl http://127.0.0.1:3001/health     # backend
curl -I http://localhost:8084         # frontend
```

Swagger UI **tắt ở production**. Cần tạm thời thì đặt `SWAGGER_ENABLED=true` (kèm `SWAGGER_USER` / `SWAGGER_PASS`) trong `backend/.env.production`, rồi truy cập từ chính máy server: `http://127.0.0.1:3001/api-docs`. Xong việc nhớ tắt lại.

#### Cập nhật phiên bản

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
docker image prune -f                 # dọn image cũ
```

Người dùng không bị đăng xuất khi redeploy vì JWT secret được giữ trong volume `server_secrets`.

#### Dữ liệu và sao lưu

| Volume | Nội dung |
|---|---|
| `server_uploads` | Toàn bộ file người dùng upload (hồ sơ đề tài, tài liệu, video khoá học…) |
| `server_secrets` | JWT secret tự sinh (`/app/secrets/jwt.env`) và **khoá mã hoá secret 2FA** (`/app/secrets/totp.key`). **Bắt buộc sao lưu cùng DB**: mất `totp.key` thì mọi người dùng đã bật 2FA phải tắt và thiết lập lại (không giải mã được secret) |
| `server_logs` | Log hoạt động `audit-*.log` (`/app/logs`), nguồn dữ liệu của trang Nhật ký hoạt động |
| `redis_secret` | Mật khẩu Redis tự sinh. Xoá volume này thì lần chạy sau sinh mật khẩu mới, không mất dữ liệu (Redis chỉ là cache) |

Backend chạy bằng user `node`. Lần đầu nâng cấp từ bản chạy root, entrypoint tự chuyển quyền các volume `server_uploads` / `server_logs` / `server_secrets` cho `node` (có thể mất vài phút nếu nhiều file upload).

> ⚠️ **Không chạy `docker compose -f docker-compose.prod.yml down -v`.** Cờ `-v` xoá các volume trên: mất toàn bộ file upload, nhật ký hoạt động, và mọi người dùng bị đăng xuất.

Tên volume thật có tiền tố là tên project (`hospital_rms`, đặt cố định trong `docker-compose.prod.yml`), ví dụ `hospital_rms_server_uploads`. Xem bằng `docker volume ls`. Nếu máy chủ trước đây chạy từ thư mục có tên khác, volume cũ mang tiền tố của thư mục đó: chạy với `-p <tên cũ>` (hoặc `COMPOSE_PROJECT_NAME=<tên cũ>`) để giữ dữ liệu. Sao lưu:

```bash
docker run --rm -v hospital_rms_server_uploads:/data -v "$PWD":/backup alpine \
  tar czf /backup/uploads-$(date +%F).tar.gz -C /data .
```

Sao lưu log hoạt động cũng làm tương tự với volume `hospital_rms_server_logs`. **Volume `hospital_rms_server_secrets` (chứa khoá 2FA) phải sao lưu cùng lịch với DB** và cất ở nơi an toàn như mật khẩu — ai có cả bản sao DB lẫn khoá này sinh được mã 2FA của người dùng.

#### Nginx

`frontend/nginx.conf`:

- `client_max_body_size 300m`, khớp giới hạn `TRAINING_MEDIA_MAX_MB`.
- `/api/v1/events` (SSE) tách riêng: tắt buffering và gzip, `proxy_read_timeout 1h`.
- `/api/` và `/uploads/` proxy tới backend. `X-Forwarded-For` bị **ghi đè** bằng IP thật (module `real_ip`, chỉ tin proxy trong `TRUSTED_PROXIES`, sinh lúc khởi động bởi `frontend/docker/40-trusted-proxies.sh`). `X-Forwarded-Proto` chỉ lấy từ proxy tin cậy.
- Các đường dẫn còn lại trả `index.html` cho SPA, kèm header bảo mật: HSTS (chỉ khi người dùng vào bằng HTTPS), `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, CSP.
- `server_tokens off` (không lộ phiên bản nginx).

**CSP đang ở chế độ chỉ báo cáo** (`Content-Security-Policy-Report-Only`): không chặn gì, trình duyệt gửi vi phạm về `/api/v1/csp-report` và backend ghi log dòng `[CSP] vi phạm …`. Theo dõi khoảng 1 tuần bằng `docker compose -f docker-compose.prod.yml logs backend | grep CSP`. Vi phạm hợp lệ (tài nguyên hệ thống cần) thì bổ sung vào CSP. Khi không còn vi phạm hợp lệ, đổi tên header thành `Content-Security-Policy` trong `frontend/nginx.conf` để chặn thật.

Nginx trong container chỉ nghe HTTP. HTTPS do reverse proxy phía trước lo, xem [Bước 3b](#bước-3b-nối-với-reverse-proxy-https).

---

### JWT secret

Container server tự sinh `JWT_SECRET` / `JWT_REFRESH_SECRET` khi khởi động nếu còn trống hoặc là giá trị mẫu `change-me…` (`backend/docker-entrypoint.sh`):

- **Dev** (có `backend/.env` được mount vào `/app/.env`): ghi thẳng vào `backend/.env`.
- **Prod** (biến lấy qua `env_file`): lưu trong volume `server_secrets`, giữ nguyên qua restart/redeploy. Secret đã đặt thật trong `.env` / `.env.production` thì được giữ nguyên, không bị thay.

Sinh tay (không Docker): `npm run gen:jwt` (thêm `-- --dry-run` để xem trước, `-- --force` để thay secret đang dùng).

Đổi secret định kỳ (Windows Task Scheduler). **Mỗi lần đổi, mọi người dùng bị đăng xuất**:

```powershell
.\scripts\rotate-jwt-secrets.ps1 -Register                  # 4 tuần/lần, 02:30 Chủ nhật, compose prod
.\scripts\rotate-jwt-secrets.ps1 -Register -ComposeFile docker-compose.yml -EveryWeeks 2
.\scripts\rotate-jwt-secrets.ps1                            # đổi ngay
.\scripts\rotate-jwt-secrets.ps1 -Unregister                # gỡ lịch
```

Script dùng service API `backend` (cả dev lẫn prod), nhận prod theo tên file compose, và ghi secret mới vào đúng nơi đang giữ secret. Thứ tự tìm: `backend/.env.production` (chỉ ở prod), rồi `backend/.env`, cuối cùng là volume `server_secrets`. File bị ghi đè được backup thành `<tên file>.bak`.

Log ghi tại `logs/jwt-rotate.log`.

### Xử lý sự cố Docker

| Hiện tượng | Nguyên nhân / cách xử lý |
|---|---|
| Backend báo `Failed to connect to host.docker.internal:1433` | SQL Server chưa bật TCP/IP, chưa mở firewall port `1433`, hoặc instance có tên (`SQLEXPRESS`) đang dùng port động. Đặt port cố định `1433` trong SQL Server Configuration Manager rồi khởi động lại dịch vụ SQL Server. |
| Backend thoát ngay, log báo thiếu biến | Thiếu `DB_USER`, `DB_PASSWORD` (hoặc `SWAGGER_USER` / `SWAGGER_PASS` khi bật Swagger) trong `backend/.env` / `.env.production`. |
| Log backend: `tới qua http, không phải https` | Reverse proxy không gửi `X-Forwarded-Proto: https`, hoặc IP proxy không nằm trong `TRUSTED_PROXIES`. Xem [Bước 3b](#bước-3b-nối-với-reverse-proxy-https). |
| Mọi người dùng bị khoá đăng nhập theo IP cùng lúc | Nginx đang thấy mọi request đến từ IP proxy: proxy không gửi `X-Forwarded-For`, hoặc không nằm trong `TRUSTED_PROXIES`. |
| Log backend: `không đọc được /run/redis-secret/pass` | Container `redis` chưa sinh kịp mật khẩu. Chạy lại `up -d`. App vẫn hoạt động, chỉ tạm không có cache. |
| Backend báo `EACCES` khi ghi upload / log | Quyền volume chưa chuyển cho user `node`: xem log dòng `docker-entrypoint: chuyển quyền …`, hoặc chạy `docker compose -f docker-compose.prod.yml up -d --force-recreate backend`. |
| Prod báo lỗi CORS trên trình duyệt | Origin trình duyệt đang dùng (scheme + domain + port) chưa có trong `CORS_ORIGIN` của `docker-compose.prod.yml`. |
| Compose báo lỗi ở `env_file` | Docker Compose cũ hơn v2.24. Cập nhật Docker Desktop / plugin compose. |
| Dev: sửa code không thấy cập nhật | Kiểm tra `docker compose logs frontend`. Polling có độ trễ khoảng 1 giây. Nếu vừa thêm package thì chạy lại với `--renew-anon-volumes`. |
| Dev: lỗi `Cannot find module` sau khi `git pull` | `package.json` đã đổi nhưng `node_modules` trong volume còn cũ. Chạy `docker compose up -d --build --renew-anon-volumes`. |
| `npm ci` lỗi `EIDLETIMEOUT` khi build | Mạng chập chờn. Chạy lại lệnh build, cache npm được giữ nên không phải tải lại từ đầu. |
| Upload file lớn bị lỗi `413` ở prod | Vượt `client_max_body_size 300m` trong `frontend/nginx.conf` hoặc giới hạn `TRAINING_*_MAX_MB` của backend. |
| Upload bị từ chối "nội dung không đúng định dạng" | File bị đổi đuôi (vd ảnh chụp lưu thành `.pdf`) hoặc hỏng. Mở file bằng phần mềm tương ứng rồi lưu lại đúng định dạng. |
| Upload bị từ chối `429` "vượt hạn mức" | Tài khoản đã upload quá `UPLOAD_DAILY_QUOTA_MB` (mặc định 2048MB) trong ngày. Tăng hạn mức hoặc chờ sang ngày. |
| Upload bị từ chối `503` "quét virus" | Đã bật ClamAV (`CLAMAV_HOST`) nhưng container `clamav` chưa sẵn sàng (lần đầu tải CSDL virus mất vài phút) hoặc đã dừng. Xem `docker compose -f docker-compose.prod.yml logs clamav`. |
| Docker Desktop ngốn RAM | Mỗi service đã có `mem_limit`. Tắt profile `logs` nếu không dùng Loki. |

---

## Cấu trúc dự án

```
Hospital_RMS/
├── frontend/src/
│   ├── app/
│   │   ├── providers/          # AntdProvider, QueryProvider
│   │   └── router/             # publicRoutes, privateRoutes, guards, LazyRoute, routePrefetch
│   ├── features/               # mỗi feature: api / components / hooks / pages / types / utils
│   │   ├── auth, dashboard, notifications, activity-log, my-tasks
│   │   ├── topics, approval, council, round, schedule, reports, workflow, person-merge
│   │   ├── seminar, venue
│   │   ├── trainee, lecturer, course, training-program, training-plan, training-catalog
│   │   ├── exam, survey, attendance-checkin
│   │   ├── catalog, department, user, roles
│   │   ├── portal/             # cổng người dùng (/user/*)
│   │   └── public/             # cổng công khai
│   ├── layouts/                # AdminLayout, UserLayout, AuthLayout… + hooks (useRealtime)
│   ├── shared/                 # components (UI kit), hooks, utils, api (apiClient, interceptors)
│   └── styles/
│
├── backend/src/
│   ├── server.js               # bootstrap: tự chọn port, đồng bộ port sang frontend/.env
│   ├── app.js                  # nạp & kiểm tra .env, middleware, mount routes
│   ├── config/                 # db, redis, swagger, auditLogger, loadEnv
│   ├── routes/                 # định nghĩa endpoint + validation
│   ├── controllers/            # request/response, các controller export Excel
│   ├── services/               # business logic
│   ├── middlewares/            # auth, permissionCache, activityLogger, upload*, fileTypeAllowlist…
│   ├── jobs/                   # cron: bảo trì tài khoản, nhắc deadline, gắn persons
│   └── utils/                  # response, paging, sqlFilters, cache, captcha, signedUpload…
│
├── scripts/                    # wait-server.js, script import dữ liệu từ hệ thống cũ
├── infra/                      # cấu hình Loki, Promtail
├── docker-compose.yml          # dev: backend, frontend, redis (+ loki, promtail qua profile "logs")
└── docker-compose.prod.yml     # prod: backend, frontend (Nginx), redis
```

---

## Phân hệ chức năng

### Nghiên cứu khoa học
- **Đề tài**: đăng ký với loại, cấp độ, đợt nghiên cứu. Hệ thống kiểm tra cấp độ hợp lệ theo loại đợt và chỉ cho đăng ký trong cửa sổ thời gian của đợt. Quản lý thành viên, cấp tài khoản cho thành viên, upload hồ sơ theo lô, xuất Excel danh sách và hồ sơ đầy đủ.
- **Đợt nghiên cứu & lịch trình**: nhiều loại deadline (đăng ký, nộp bổ sung…), tự động nhắc deadline, trang lịch tổng hợp các mốc.
- **Hội đồng chấm đề cương**: tạo hội đồng, phân ghế thủ công hoặc tự động, thêm người ngoài viện, import từ file, chấm điểm/nhận xét, theo dõi tiến độ chấm, xuất Excel.
- **Phê duyệt**: nộp, duyệt hoặc trả lại kèm ghi chú, lưu lịch sử duyệt. **Workflow engine** cho phép định nghĩa quy trình duyệt nhiều bước (`/admin/workflows`). Khi không có định nghĩa nào đang bật, hệ thống dùng luồng duyệt một bước (`sp_approve_topic`).
- **Cổng công khai**: đăng ký/đề xuất đề tài không cần tài khoản (có captcha), tra cứu trạng thái bằng mã hồ sơ, thư viện đề tài tiêu biểu.

### Đào tạo & CME
- **Hội thảo / hội nghị**: quản lý theo năm, địa điểm, danh sách tham dự (import Excel), sổ cấp CME nội viện/ngoại viện.
- **Đào tạo**: học viên, giảng viên, chương trình và bài học, kế hoạch đào tạo, khoá học (đăng ký công khai), danh mục đào tạo (loại học viên, hình thức, loại hình, môn học, nhóm tín chỉ CME).
- **Thi trực tuyến**, **khảo sát** (có link chia sẻ), **điểm danh bằng QR**.
- **CME**: sổ đăng ký, hồ sơ tín chỉ, theo dõi mức độ đáp ứng yêu cầu CME (`/admin/cme-compliance`), chứng chỉ hành nghề của nhân viên.

### Chung
- **Dashboard** riêng cho nghiên cứu và đào tạo, trang **Báo cáo & xuất dữ liệu** tập trung.
- **Việc của tôi**: gom các việc đang chờ người dùng xử lý.
- **Thông báo realtime** qua SSE, đánh dấu đã đọc/chưa đọc, admin gửi thông báo thủ công. Email thông báo duyệt/từ chối và nhắc deadline (khi bật SMTP).
- **Quản trị**: người dùng, khoa/phòng, danh mục, vai trò & quyền, cài đặt hệ thống, duyệt trùng danh tính, nhật ký hoạt động.

---

## API

- **Swagger UI:** `http://localhost:3000/api-docs` (Basic Auth: `SWAGGER_USER` / `SWAGGER_PASS`). Tắt ở production trừ khi đặt `SWAGGER_ENABLED=true`.
- **Base URL:** `/api/v1` · **Health check:** `GET /health`
- **Response:** `{ "success": true, "message": "...", "data": {} }`
- **Xác thực:** header `Authorization: Bearer <access_token>`, trừ `/auth/login`, `/auth/refresh` và `/public/*`.
- **Query chung:** `page` (mặc định 1), `limit` (mặc định 20), `search`, cùng các bộ lọc riêng (`department_id`, `round_id`, `status`, `category_id`, `level_id`…).

| Nhóm | Base path |
|---|---|
| Xác thực | `/auth`: login, refresh, logout, logout-all, sessions, change-password, `2fa/*` |
| Người dùng | `/users` |
| Nghiên cứu | `/topics`, `/councils`, `/files`, `/workflows` |
| Hội thảo & CME | `/seminars`, `/cme-records`, `/staff-licenses` |
| Đào tạo | `/trainees`, `/lecturers`, `/courses`, `/training-programs`, `/training-plans`, `/exams`, `/surveys` |
| Tổng hợp | `/dashboard`, `/my-tasks`, `/notifications`, `/events` (SSE, vé dùng 1 lần `?ticket=` lấy từ `POST /events/ticket`) |
| Hệ thống | `/activity-logs`, `/security-events`, `/system-settings`, `/persons/merge-candidates` |
| Công khai | `/public`: captcha, khoá học mở, đăng ký, tra cứu trạng thái đề tài, đề tài tiêu biểu |
| Danh mục | `/departments`, `/categories`, `/levels`, `/roles`, `/research-rounds`, `/round-types`… (CRUD chuẩn) |

---

## Xác thực & phân quyền

- **JWT**: access token 15 phút (`JWT_EXPIRES_IN`) + refresh token 7 ngày (30 ngày nếu "Ghi nhớ đăng nhập"). Refresh token nằm trong **cookie HttpOnly** `rms_rt` (`SameSite=Strict`, `Path=/api/v1/auth`, `Secure` ở production — `utils/authCookie.js`), JavaScript không đọc được; access token do frontend giữ. Frontend tự làm mới khi gặp `401`. Người dùng có thể xem các phiên đăng nhập và đăng xuất khỏi mọi thiết bị.
  - **Xoay refresh token có phát hiện dùng lại**: mỗi lần làm mới, token cũ bị đánh dấu `revoked_at` và token mới cùng `family_id`. Token đã thu hồi bị dùng lại sau 30 giây (không phải 2 tab làm mới cùng lúc) ⇒ coi như bị đánh cắp: xoá cả họ token, tăng `token_version`, ghi sự kiện `refresh_token_reuse`.
  - **Khoá riêng theo mục đích** (`utils/keys.js`): access token, pre-auth 2FA, vé SSE, captcha, QR điểm danh, link `/uploads` ký bằng các khoá dẫn xuất (HKDF) khác nhau từ `JWT_SECRET`, kèm `iss`/`aud` — token loại này không dùng thay loại kia được.
- **2FA** TOTP (tuỳ chọn cho từng người dùng):
  - Secret TOTP lưu **mã hoá AES-256-GCM** (`utils/secretBox.js`), khoá nằm ngoài DB: biến `TOTP_ENC_KEY` hoặc file `secrets/totp.key` tự sinh. Khoá này **không** đổi khi xoay JWT secret.
  - Chống dùng lại mã: lưu bước thời gian của mã dùng gần nhất (`users.totp_last_step`), mã đã dùng bị từ chối.
  - 10 **mã khôi phục** dùng 1 lần (bảng `user_backup_codes`, lưu HMAC) khi mất điện thoại; hiển thị 1 lần lúc bật 2FA, tạo lại ở Hồ sơ (cần mật khẩu).
  - Pre-auth token (giữa bước mật khẩu và bước mã) chỉ đổi được 1 phiên đăng nhập.
  - **Bắt buộc với tài khoản quản trị** (`permissions/twoFactorPolicy.js`): superuser hoặc vai trò có quyền `critical`. Lần đầu thuộc diện có 14 ngày (`TWOFA_GRACE_DAYS`) — banner nhắc trên giao diện; quá hạn thì API khác trả `403 TWO_FACTOR_REQUIRED` và giao diện chuyển tới `/bat-2fa`. Tắt bằng `REQUIRE_2FA_FOR_ADMINS=false`.
- **Cổng công khai**: tra cứu kết quả học tập cần **CCCD + ngày sinh**, giới hạn theo IP và theo từng số CCCD (5 lần/giờ). Đăng ký khoá học với CCCD đã có hồ sơ phải khớp ngày sinh. Chống bot: proof-of-work tự giải ngầm trên trình duyệt (mặc định, `CAPTCHA_POW_BITS`, kèm thời gian điền form tối thiểu) hoặc **Cloudflare Turnstile** khi đặt `TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY`; mỗi mã dùng 1 lần.
- **Chống dò mật khẩu**: rate-limit đăng nhập (đếm trên Redis để dùng chung giữa các instance và không mất khi khởi động lại; Redis lỗi thì tự đếm trong bộ nhớ — `utils/rateLimit.js`), tạm khoá tài khoản sau nhiều lần sai, ghi lại sự kiện bảo mật (API `/security-events`).
- **Bảo trì tài khoản**: job hằng đêm vô hiệu hoá tài khoản hết hạn và cảnh báo mật khẩu cũ.
- **Phân quyền theo permission** gắn với vai trò, dạng `resource:action` (vd `topics:create`, `persons:merge`):
  - **Danh mục quyền nằm trong code**: `backend/src/permissions/catalog.js` là nguồn duy nhất (module → resource → quyền, kèm tên/mô tả tiếng Việt). Server đồng bộ danh mục vào bảng `permissions` mỗi lần khởi động: thêm quyền mới, cập nhật tên/nhóm, không xoá quyền nào. Quyền tách ra từ quyền cũ khai báo `seedFrom` để vai trò đang có quyền cũ được cấp sẵn quyền mới.
  - **Có đúng quyền mới được làm**: `manage` không còn là wildcard bao các action khác, nó chỉ là tên một quyền cụ thể (vd `roles:manage` = phân quyền vai trò). Riêng `system:manage` là superuser.
  - **Phạm vi dữ liệu** là thuộc tính của lượt cấp quyền (cột `role_permissions.scope`), không phải action riêng: đề tài `own` / `department` / `all`, người dùng `department` / `all`, khoá học `assigned` / `all` (`backend/src/permissions/scopes.js`). Backend đọc bằng `scopeOf(user, resource)`; màn hình phân quyền có cột "Phạm vi dữ liệu" cho các resource này.
  - Migration SQL tương ứng nằm ở `backend/migrations/` (chạy theo thứ tự tên file, `sqlcmd -C -I -b -f 65001`). Server cũng tự chạy các bước này lúc khởi động nếu login có quyền `ALTER TABLE`.
  - Nâng cấp từ mô hình cũ (`topics:read_all`, `users:read_department`, `courses:read_assigned`, `X:manage` dạng wildcard) chạy tự động lúc khởi động, một lần, giữ nguyên quyền hiệu lực của mọi vai trò. Xem trước: `npm run migrate:permissions -- --dry-run`. Nếu login của ứng dụng không có quyền `ALTER TABLE`, chạy `npm run migrate:permissions` bằng tài khoản có quyền; trong lúc chưa nâng cấp, hệ thống vẫn tính đúng quyền từ dữ liệu cũ nhưng không cho sửa phân quyền.
  - Backend dùng `authorizePermission([...])`, quyền được cache trong `permissionCache`. Dùng quyền không có trong catalog sẽ bị cảnh báo lúc khởi động.
  - Hướng dẫn cho lập trình viên (thêm quyền, thêm route, lọc theo phạm vi, nâng cấp CSDL): `backend/src/permissions/README.md`.
  - `npm test` (trong `backend`) chạy bộ test phân quyền: danh mục quyền, quy tắc quyền/phạm vi, chống leo thang, ma trận vai trò mẫu × route. Không cần DB.
  - `npm run check:routes` (trong `backend`) quét mọi route: route không gắn quyền phải được khai báo kèm lý do trong `src/permissions/routePolicy.js`, nếu không script báo lỗi.
  - **Superuser** là cờ `roles.is_superuser`, không phải quyền trong ma trận, nên không cấp được qua giao diện. **Vai trò hệ thống** (`roles.is_system`, 8 vai trò gốc) không xoá được. Code nghiệp vụ tham chiếu vai trò qua mã `roles.code` (`admin`, `member`, `trainee`, `dept_head`…, xem `services/roleCodes.js`), không dùng id `VT0x`.
  - **Thu hồi phiên ngay lập tức**: access token mang `tv` = `users.token_version`. Reset mật khẩu, đăng xuất mọi thiết bị, tự đổi mật khẩu sẽ tăng version, nên mọi access token cũ bị từ chối ngay (tự đổi mật khẩu thì phiên hiện tại được cấp token mới).
  - Cache quyền / trạng thái tài khoản nằm trong RAM từng instance; lệnh xoá cache được phát qua Redis pub/sub (`utils/cacheBus.js`) để mọi instance cùng xoá. Redis không sẵn sàng thì mỗi instance tự hết hạn theo TTL.
  - Frontend làm mới quyền từ `GET /users/me` khi mở ứng dụng và khi vai trò/tài khoản thay đổi (SSE), nên đổi quyền có hiệu lực trên giao diện mà không cần đăng nhập lại.
  - Frontend dùng `<RequirePermission perm="...">`, `<Can>`, `usePermission()`, `scopeOf()` với kiểu `PermissionKey` sinh từ catalog (`npm run gen:perm-types` trong `backend` → `frontend/src/shared/types/permissions.generated.ts`); gõ sai tên quyền là lỗi biên dịch.
  - Chống leo thang quyền (`services/privilegeGuard.js`): chỉ cấp/gán được quyền và vai trò không vượt quá quyền của chính mình.
  - Vai trò và tập quyền được quản lý tại `/admin/roles`; ma trận quyền dựng từ `GET /permissions/catalog`.

---

## Database

**Engine:** Microsoft SQL Server · **Database:** `RMS_HOSPITAL` · **Pool:** min 2, max 10.

> **Trong git:** migration schema (`backend/migrations/*.sql`) và định nghĩa stored procedure / function / trigger / view (`backend/db/`). Mọi file `*.sql` khác vẫn bị `.gitignore` loại (script tạo login có mật khẩu, dump dữ liệu, script khởi tạo schema gốc) — lấy từ nhóm phát triển. Chạy migration bằng `sqlcmd -I` theo thứ tự tên file, vì các bảng có index lọc hoặc cột tính toán cần `QUOTED_IDENTIFIER ON`.
>
> **Sửa stored procedure / trigger trong DB** thì chạy `npm run dump:db-objects` (thư mục `backend`) rồi commit thay đổi trong `backend/db/`. Script chỉ đọc DB, bỏ qua object sơ đồ của SSMS và **từ chối xuất** object có vẻ chứa mật khẩu / hash / chuỗi kết nối. `-- --check` chỉ báo khác biệt.

### Stored procedures chính

| Procedure | Mục đích |
|---|---|
| `sp_set_actor` | Đặt `user_id` vào session context trước mỗi lệnh ghi (phục vụ audit) |
| `sp_gen_topic_id`, `sp_gen_user_id`, `sp_gen_member_id`, `sp_gen_batch_id`, `sp_gen_file_id` | Sinh mã đề tài / người dùng / thành viên / batch / file |
| `sp_grant_member_accounts` | **Không còn dùng** — ứng dụng cấp tài khoản qua `topicMemberService` (mật khẩu tạm ngẫu nhiên). Nên xoá khỏi DB |
| `sp_approve_topic` | Luồng duyệt đề tài một bước |
| `sp_upload_files` | Ghi nhiều file trong một batch |

### Ghi chú nghiệp vụ

- **Trạng thái đề tài:** `approvals.status` có thể lệch với `topics.status`. Giao diện luôn hiển thị theo `topics.status`. Trong bảng `approvals`, `created_*` là thời điểm nộp và `updated_*` là thời điểm duyệt.
- **Danh tính hợp nhất (`persons`):** trước đây một người có thể nằm ở 6 bảng (`users`, `trainees`, `lecturers`, `external_reviewers`, `topic_members`, `seminar_participants`). Nay mỗi bảng có cột `person_id` trỏ về một bản ghi `persons`.
  - Bảng nguồn vẫn là nguồn dữ liệu gốc. Sau mỗi lệnh ghi thành công, gọi `personService.syncPerson(source, id, { actorId })` (hoặc `syncPersons` khi import hàng loạt). Hàm này không bao giờ ném lỗi nên không chặn thao tác của người dùng. **Khi viết đường ghi mới vào 6 bảng trên, phải gọi hàm này.**
  - Thứ tự quy tắc ghép: `user_id` → CCCD → `staff_number` + tên → email + tên → SĐT chuẩn hoá + tên → tên + ngày sinh. Mỗi quy tắc chỉ áp dụng khi khớp đúng một person. Trùng **tên** đơn thuần không bao giờ tự gộp mà được đưa vào hàng đợi `person_merge_candidates`, duyệt tại `/admin/person-merge`.
  - Gộp hồ sơ ghi `person_merge_log` đủ để khôi phục thủ công. Không thể gộp hai hồ sơ đều đã có tài khoản.
  - Job 03:00 hằng đêm gắn nốt các bản ghi còn `person_id IS NULL`.

---

## Tác vụ nền, cache & logging

**Cron job** (`backend/src/jobs`, múi giờ `CRON_TZ`, mặc định `Asia/Ho_Chi_Minh`):

| Giờ | Job |
|---|---|
| 01:00 | Bảo trì tài khoản: vô hiệu hoá tài khoản hết hạn, cảnh báo mật khẩu cũ |
| 02:00 | Nhắc deadline sắp tới hoặc đã quá hạn (thông báo + email) |
| 03:00 | Gắn `person_id` cho các bản ghi còn thiếu |

**Redis cache**: cache-aside cho số liệu dashboard và danh mục (khoa, vai trò, loại, cấp độ…). Nếu mất kết nối Redis, server đọc thẳng từ SQL Server.

**Logging**:
- Pino ghi file JSON xoay theo ngày tại `LOG_DIR/audit-*.log` (mặc định `backend/logs/`), giữ tối đa `LOG_RETENTION_FILES` file.
- Middleware `activityLogger` ghi lại request, lọc theo `AUDIT_LOG_METHODS`. Trang **Nhật ký hoạt động** (`/admin/activity-logs`) đọc trực tiếp từ file log, không dùng SQL.
- `LOG_STDOUT=1` để ghi ra stdout khi đã có hệ thống thu gom log riêng.
- Bản Docker dev có sẵn Promtail đọc `backend/logs` và đẩy vào Loki (`http://localhost:3100`), bật bằng `docker compose --profile logs up -d`.

---

## Quy ước phát triển

### CI (GitHub Actions)
`.github/workflows/ci.yml` chạy ở mỗi push / pull request vào `main` và mỗi thứ Hai (bắt lỗ hổng thư viện mới công bố). Không cần SQL Server / Redis — test dùng CSDL giả.

| Job | Kiểm tra |
|---|---|
| Backend | `npm test`, `check:routes` (route mới phải khai báo quyền), `typecheck`, `npm audit --audit-level=high` |
| Frontend | `tsc -b`, `lint`, `build`, `npm audit --audit-level=high` |
| Không commit bí mật | Không có file `.env`, `secrets/`, khoá, file danh sách mật khẩu tạm; không có hash bcrypt thật / khoá riêng / chuỗi kết nối có mật khẩu trong mã |

Nên bật **branch protection** cho `main` (Settings → Branches) và bắt buộc 3 job trên xanh trước khi merge.

### Kiểm tra quyền theo bản ghi (chống IDOR)
`authorizePermission` ở route chỉ biết người gọi **có** quyền `resource:action`, không biết bản ghi cụ thể có thuộc phạm vi của họ không. API nhận mã đối tượng (`:id`, danh sách mã trong body) phải kiểm tra thêm theo phạm vi (`scopeOf`):
- Đề tài: `topicService.assertTopicInScope` / `idsInScope` — `routes/topics.js` gắn sẵn qua `router.param('id' | 'topic_id')`, nên route mới trong router này tự được kiểm tra.
- Khoá học: `courseService.assertCourseInScope` / `assertCourseChildInScope` — `routes/courses.js` gắn qua `router.param` cho `:id` và mọi mã bản ghi con (`sessionId`, `enrollmentId`, `docId`, `gradeId`, `certId`, `linkId`, `assignmentId`). **Route mới dùng tham số mã con khác phải thêm vào `CHILD_COURSE_SQL`** (có test tự phát hiện).
- Người dùng: `privilegeGuard.assertCanManageUser`; phạm vi khoa không chuyển được tài khoản sang khoa khác.
- Cổng hội đồng: kiểm tra ghế **trước** khi multer ghi file. Tiến trình duyệt (`/workflows/status`): đề tài phải trong phạm vi.
- Danh sách mã trong body (xuất dữ liệu, duyệt hàng loạt) không đi qua `router.param` — phải tự lọc / kiểm tra từng mã.
- Tài nguyên không có phạm vi (học viên, hội thảo, hội đồng, giảng viên, CME, chương trình đào tạo): quyền là toàn viện theo thiết kế — muốn giới hạn theo khoa thì thêm vào `permissions/scopes.js` rồi áp dụng như trên.
- Test mẫu: `backend/test/permissions/topicObjectAccess.test.js`, `courseObjectAccess.test.js`.

### Cảnh báo bảo mật qua email
`securityEventService.log` tự gọi `securityAlertService.notify`. Gửi ngay khi: refresh token bị dùng lại, chặn file mã độc, đổi / sao chép phân quyền vai trò, tắt 2FA, thu hồi thiết bị quen, quản trị đặt lại mật khẩu. Gửi khi dồn dập: ≥5 tài khoản bị khoá hoặc ≥10 lần sai mã 2FA trong 15 phút. Mỗi loại tối đa 1 email / 30 phút. Người nhận: `ALERT_EMAILS`, không đặt thì mọi superuser có email. Cần bật kênh email (`MAIL_ENABLED`).

### Realtime: một kết nối SSE cho mỗi tab
Luôn dùng `useRealtimeUpdate(entities, callback)` ([`frontend/src/layouts/hooks/useRealtime.ts`](frontend/src/layouts/hooks/useRealtime.ts)). Hook này đăng ký vào **một** `EventSource` dùng chung tới `GET /api/v1/events?ticket=<vé>` (vé sống 60 giây, dùng 1 lần, xin qua `POST /api/v1/events/ticket` — không đưa access token lên URL vì URL bị ghi vào access log). Không tự tạo `EventSource`: mỗi panel mở một kết nối riêng sẽ vượt giới hạn 6 kết nối HTTP/1.1 mỗi origin của trình duyệt và làm treo các request khác.

### UI kit dùng chung (`frontend/src/shared/components`)
Import qua barrel: `import { Badge, EmptyState, Pagination } from '@/shared/components'`.

| Thành phần | Dùng cho |
|---|---|
| `<Badge tone dot>` | Nhãn trạng thái. `tone`: `green \| blue \| amber \| gray \| red \| pink \| purple \| teal`. Config trạng thái của feature khai báo `tone: BadgeTone` thay vì tên class. |
| `<EmptyState>` / `<TableEmpty colSpan>` | Khối "chưa có dữ liệu" (`TableEmpty` đã bọc sẵn `<tr><td>`) |
| `<Card>` + `Card.Header` / `Card.Body` | Khung card có header icon |
| `<Pagination>` | Phân trang (`hideSizeSelect`, `infoText`) |
| `Table.module.css` | Style gốc cho bảng. Feature dùng `composes: … from '@/shared/components/Table/Table.module.css'`, không tự định nghĩa lại `.tableWrap/.th/.td/.tr/.emptyState` |
| `Modal`, `Button`, `Input/*`, `Loading` / `Skeleton`, `FileViewerModal`, `QrScanner` | Có sẵn |

- Không tự viết lại Badge, phân trang hay empty-state trong feature. Nếu cần biến thể, truyền `className`/`style` vào component dùng chung.
- `docx-preview` và `RichTextEditor` nặng nên import trực tiếp theo đường dẫn, không import qua barrel.
- `animation: spin` không dùng được trong CSS Module (keyframe bị scope hoá). Dùng `Loading` / `InlineLoading` có sẵn.

### Bảo mật upload
Mọi route upload dùng middleware trong `backend/src/middlewares/` (`upload`, `uploadImage`, `uploadTraining`, `uploadExcel`), đều bọc bởi `secureUpload`. **Route upload mới phải dùng các middleware này, không tự khai `multer`.** Mỗi file qua các lớp:

1. **Đuôi file** trong danh sách cho phép (`fileTypeAllowlist.js`; ảnh nhận xét chỉ PNG/JPEG/GIF/WEBP; import chỉ `.xlsx`).
2. **Dung lượng**: hồ sơ đề tài `TOPIC_UPLOAD_MAX_MB` (50), hồ sơ đào tạo `TRAINING_UPLOAD_MAX_MB` (20), video bài giảng `TRAINING_MEDIA_MAX_MB` (300), Excel 10MB.
3. **Nội dung khớp đuôi** (magic bytes, `utils/fileSignature.js`) — file đổi đuôi (exe → pdf, HTML → png) bị từ chối và xoá ngay.
4. **Quét virus** bằng ClamAV nếu bật `CLAMAV_HOST` (`utils/clamav.js`, service `clamav`, profile `av`). File nhiễm bị xoá và ghi sự kiện bảo mật `upload_malware_blocked`. ClamAV lỗi thì từ chối upload, trừ khi đặt `CLAMAV_FAIL_OPEN=true`. File lớn hơn `CLAMAV_MAX_MB` (25) không quét.
5. **Hạn mức/ngày** mỗi tài khoản `UPLOAD_DAILY_QUOTA_MB` (2048; `0` = không giới hạn).

Khi tải về (`/uploads`): chỉ ảnh, PDF, video, audio được mở trên trình duyệt; còn lại luôn tải xuống (`Content-Disposition: attachment`). Mọi file trừ PDF kèm `Content-Security-Policy: sandbox`, nên không file nào chạy được như trang web.

### Dữ liệu nhạy cảm
Các script trong `scripts/` dùng để import dữ liệu từ hệ thống cũ. Báo cáo chúng sinh ra (`*_CHUA_MAT_KHAU.csv`, `staff_license_import_unmatched.csv`) chứa thông tin cá nhân thật hoặc mật khẩu tạm và đã được `.gitignore`. **Không bao giờ commit các file này.**
