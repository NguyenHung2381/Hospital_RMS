# Hospital RMS — Hệ thống Quản lý Nghiên cứu Khoa học & Đào tạo Bệnh viện

Ứng dụng web quản lý hoạt động **nghiên cứu khoa học** và **đào tạo liên tục (CME)** trong bệnh viện: đăng ký đề tài, hội đồng chấm đề cương, quy trình phê duyệt nhiều bước, hội thảo/hội nghị, chương trình – kế hoạch – khoá đào tạo, thi trực tuyến, khảo sát, điểm danh QR, cấp và theo dõi tín chỉ CME, cùng hệ thống báo cáo – thống kê.

## Tài liệu

| Tài liệu | Nội dung |
|---|---|
| `README.md` (file này) | Tổng quan, cài môi trường dev, biến môi trường, Docker dev |
| [backend/README.md](backend/README.md) | Cấu trúc + quy ước backend, kiểm tra chất lượng, cơ sở dữ liệu & migration, phân quyền, bảo mật, job nền |
| [frontend/README.md](frontend/README.md) | Cấu trúc + quy ước frontend, UI kit, realtime, phân quyền trên giao diện |
| [infra/cai-dat-may-ao-ubuntu.md](infra/cai-dat-may-ao-ubuntu.md) | Triển khai production: máy ảo Ubuntu, PostgreSQL, Docker, HTTPS, sao lưu, vận hành, xử lý sự cố |
| [infra/chuyen-du-lieu-sang-postgresql.md](infra/chuyen-du-lieu-sang-postgresql.md) | Runbook chuyển dữ liệu 1 lần từ backup SQL Server cũ (`.bak`), đóng gói file upload / khoá bí mật |
| [.github/CICD.md](.github/CICD.md) | CI/CD: các bước kiểm tra, build image, deploy, rollback, quy tắc phiên bản thư viện |

## Tổng quan

Monorepo gồm [`frontend/`](frontend/) (React + TypeScript SPA, Vite) và [`backend/`](backend/) (Node.js + Express REST API trên PostgreSQL 18). Ứng dụng có ba cổng:

| Cổng | Đường dẫn | Dành cho |
|---|---|---|
| **Công khai** | `/`, `/dang-ky-de-tai`, `/de-xuat-de-tai`, `/dang-ky-khoa-hoc`, `/tra-cuu-ket-qua`, `/tra-cuu-ho-so/:maTraCuu`, `/thu-vien-de-tai` | Khách: đăng ký/đề xuất đề tài, đăng ký khoá học, tra cứu hồ sơ, thư viện đề tài |
| **Người dùng** | `/user/*` | Nhân viên: đề tài của tôi, tiến độ hội đồng, việc của tôi, khảo sát, thi trực tuyến, điểm danh, hồ sơ |
| **Quản trị** | `/admin/*` | Quản trị viên, cán bộ quản lý: toàn bộ nghiệp vụ, danh mục, phân quyền, nhật ký |

Người dùng chính: nhân viên nghiên cứu / học viên, thành viên hội đồng (chấm đề cương), quản lý khoa / cấp duyệt, quản trị viên.

**Phân hệ chức năng**

- **Nghiên cứu khoa học**: đề tài (đăng ký theo loại, cấp, đợt; kiểm tra cửa sổ thời gian của đợt; thành viên, cấp tài khoản, nộp hồ sơ theo lô, xuất Excel) · đợt nghiên cứu & lịch các mốc, tự nhắc deadline · hội đồng chấm đề cương (phân ghế tay/tự động, người ngoài viện, chấm điểm, theo dõi tiến độ) · phê duyệt nhiều bước theo workflow (`/admin/workflows`) · cổng công khai có captcha, tra cứu bằng mã hồ sơ.
- **Đào tạo & CME**: hội thảo / hội nghị (danh sách tham dự, sổ cấp CME) · học viên, giảng viên, chương trình – bài học, kế hoạch đào tạo, khoá học (đăng ký công khai) · thi trực tuyến, khảo sát, điểm danh QR · hồ sơ tín chỉ CME, theo dõi mức đáp ứng (`/admin/cme-compliance`), chứng chỉ hành nghề, chấm công.
- **Chung**: dashboard nghiên cứu và đào tạo, trang báo cáo & xuất dữ liệu, việc của tôi, thông báo realtime (SSE) + email, quản trị người dùng / khoa / danh mục / vai trò & quyền / cấu hình hệ thống / cấu hình form / gộp trùng danh tính / nhật ký hoạt động.

## Công nghệ

| | Frontend | Backend |
|---|---|---|
| Nền tảng | React 19, TypeScript 6, Vite 8 | Node.js, Express 5 (JS, kiểm kiểu bằng `tsc` checkJs) |
| Dữ liệu | TanStack Query 5, React Router 7 | PostgreSQL 18 (`pg`), Redis (`ioredis`, cache fail-open) |
| UI / thư viện | Ant Design 6 + UI kit nội bộ, Recharts, dnd-kit, html5-qrcode, Leaflet, DOMPurify, docx-preview | ExcelJS, docxtemplater, Multer, Nodemailer, `node-cron`, Pino (+ Loki/Promtail tuỳ chọn) |
| Bảo mật | CSP chặn thật (Nginx) | JWT access + refresh (cookie HttpOnly), 2FA TOTP, `helmet`, rate-limit, `sanitize-html`, ClamAV, link `/uploads` ký HMAC |
| Validation / API docs | | zod, `express-validator`; Swagger (Basic Auth) |

---

## Bắt đầu nhanh (dev)

**Yêu cầu**: Node.js ≥ 20 LTS; **PostgreSQL 18** cài trên máy (xem [dưới](#postgresql-trên-máy-dev-windows)); Docker Desktop (khi chạy bằng Docker); Redis tuỳ chọn (không có thì server bỏ qua cache).

### Setup tự động (khuyến nghị)

```bash
npm run setup:dev              # backend + frontend trong Docker
npm run setup:dev -- --native  # không Docker (sau đó chạy npm run dev)
npm run setup:dev -- --db      # nhập lại tài khoản PostgreSQL
npm run setup:dev -- --help    # mọi tuỳ chọn
```

[scripts/setup-dev.js](scripts/setup-dev.js) làm lần lượt:

1. Tạo `backend/.env`, hỏi **tài khoản PostgreSQL** (Enter giữ giá trị gợi ý), tự sinh JWT secret / `SWAGGER_PASS`. PostgreSQL ở máy khác thì ghi `DEV_DB_SERVER` vào `.env` cạnh `docker-compose.yml`.
2. Build image (hoặc `npm install` với `--native`).
3. Kiểm tra kết nối; chưa có DB / role thì tạo bằng `psql` theo `infra/postgresql/01_tao_db_va_role.sql` (hỏi mật khẩu `postgres`).
4. **DB còn trống** thì hỏi nguồn dữ liệu (Enter = DB mới trống):
   - file backup SQL Server cũ `.bak` (`--bak=`): dựng SQL Server tạm trong Docker, chạy `pg:transfer` restore → precheck → load → verify rồi xoá container. File phải lấy từ bản code cuối còn SQL Server (commit `dd0f62e`, đã chạy hết migration).
   - bản backup PostgreSQL `.dump` / `.sql` / `.gz` (`--dump=`): khôi phục bằng superuser `postgres`.
   - kèm file của hệ thống cũ `--uploads=uploads.tar.gz --secrets=secrets.tar.gz` (đóng gói theo mục C.6 runbook chuyển dữ liệu).
5. `migrate init` → `init:system` (9 vai trò hệ thống + 2 tài khoản `superadmin` toàn quyền và `admin` quyền nghiệp vụ, in mật khẩu tạm 1 lần) → `seed:catalogs` (danh mục cơ bản).
6. `docker compose up -d` và chờ app lên.

Chạy lại an toàn (không ghi đè `.env`, không đổi mật khẩu role, vai trò đã có giữ nguyên quyền, danh mục chỉ nạp bảng trống). Cập nhật dữ liệu dev sau này từ bản backup mới: chép file vào `import/` rồi `npm run setup:dev -- --import`.

### PostgreSQL trên máy dev Windows

- Cài PostgreSQL 18 bằng bộ cài EDB (đã có ICU, collation `vi-VN-x-icu`). Không cần `rms.conf`; thiếu `shared_preload_libraries` thì view `pg_stat_statements` báo lỗi khi đọc, không ảnh hưởng ứng dụng.
- `setup:dev` tự tạo DB + role. Làm tay: chạy `infra/postgresql/01_tao_db_va_role.sql` bằng `psql.exe -h 127.0.0.1 -U postgres` (trong thư mục `bin` của bản cài), rồi `npm run migrate init` trong `backend`.
- Mật khẩu lưu ở `%APPDATA%\postgresql\pgpass.conf`, dòng `127.0.0.1:5432:*:rms_migrate:<mật khẩu>` — adapter, migrator, `pg:transfer`, `test:pg` tự đọc khi không đặt `DB_PASSWORD` / `PG_TARGET_PASSWORD` / `PG_TEST_PASSWORD`.
- Backend dev chạy trong Docker: thêm dòng cho mạng Docker `172.16.0.0/12` vào `pg_hba.conf` (như `infra/postgresql/pg_hba.rms.conf`) và mở firewall Windows cổng 5432 cho dải đó. Container coi PostgreSQL trên host là máy khác (`host.docker.internal`), không phải `localhost`.

### Chạy thủ công (không Docker)

```bash
npm install && npm install --prefix backend && npm install --prefix frontend
cp backend/.env.example backend/.env   # điền DB và secret thật
npm run dev
#   SERVER → nodemon src/server.js       http://localhost:3001
#   CLIENT → vite (đợi server sẵn sàng)  http://localhost:5173
```

Chạy riêng: `npm run server` / `npm run client`. Port `3001` bận thì backend tự chọn port trống kế tiếp và ghi `VITE_API_PORT` vào `frontend/.env`. Sinh JWT secret tay: `npm run gen:jwt` (`-- --dry-run` xem trước, `-- --force` thay secret đang dùng).

---

## Cấu hình môi trường (`backend/.env`)

Đầy đủ và có chú thích: [`backend/.env.example`](backend/.env.example).

| Nhóm | Biến | Ghi chú |
|---|---|---|
| **Bắt buộc** | `DB_USER`, `DB_PASSWORD`, `JWT_SECRET`, `JWT_REFRESH_SECRET` (+ `SWAGGER_USER`, `SWAGGER_PASS` khi Swagger bật) | Thiếu thì server thoát ngay lúc khởi động. Secret là chuỗi ngẫu nhiên dài (`openssl rand -hex 32`) |
| PostgreSQL | `DB_SERVER`, `DB_PORT` (5432), `DB_DATABASE` (`rms_hospital`), `DB_ENCRYPT`, `DB_TRUST_SERVER_CERT`, `DB_CA_CERT_FILE`, `DB_POOL_MAX`, `DB_AUTO_MIGRATE` | `DB_PASSWORD` trống = đọc `PGPASSWORD` / pgpass. Production dùng role `rms_app` và SSL |
| HTTP | `PORT`, `CORS_ORIGIN`, `TRUST_PROXY`, `APP_URL`, `COOKIE_SECURE` | `CORS_ORIGIN` bắt buộc ở production. `TRUST_PROXY` = số proxy ngay trước backend (thường `1`); không dùng `uniquelocal` (người dùng IP nội bộ tự khai được IP giả để vượt rate-limit) |
| Upload | `UPLOAD_URL_SECRET`, `UPLOAD_URL_TTL_SEC`, `UPLOAD_MAX_MB`, `UPLOAD_ALLOWED_EXTENSIONS`, `TRAINING_MEDIA_MAX_MB`, `UPLOAD_DAILY_QUOTA_MB`, `CLAMAV_HOST` | Xem [Bảo mật upload](backend/README.md#bảo-mật-upload) |
| Bảo mật | `TOTP_ENC_KEY`, `REQUIRE_2FA_FOR_ADMINS`, `TWOFA_GRACE_DAYS`, `ALERT_EMAILS`, `TURNSTILE_*` / `RECAPTCHA_*` | Xem [Xác thực & bảo mật](backend/README.md#xác-thực--bảo-mật) |
| Log | `LOG_DIR`, `LOG_LEVEL`, `LOG_RETENTION_FILES`, `LOG_STDOUT`, `AUDIT_LOG_METHODS` | |
| Email | `MAIL_ENABLED`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Mặc định tắt, email chỉ in ra console |
| Redis | `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` | Mặc định `localhost:6379` |
| Job | `JOBS_ENABLED`, `CRON_TZ` | `JOBS_ENABLED=false` để tắt job nền |
| Swagger | `SWAGGER_ENABLED` | Swagger tắt ở production trừ khi đặt `true` |

`frontend/.env` (tuỳ chọn): xem [frontend/README.md](frontend/README.md).

---

## Chạy bằng Docker

| | Develop | Production |
|---|---|---|
| File / project | `docker-compose.yml` / `hospital_rms_dev` | `docker-compose.prod.yml` / `hospital_rms` |
| Build target | `dev` (Node, mount source code, hot reload) | `prod` (backend `npm ci --omit=dev`, frontend build tĩnh + Nginx) |
| Service | `backend`, `frontend`, `redis`, `clamav` (+ `loki`, `promtail` profile `logs`) | `backend`, `frontend`, `redis`, `clamav` |
| Web / API | `http://localhost:5173` / `http://localhost:3001` | `http://<host>:8081` / `127.0.0.1:3001` (chỉ loopback) |
| Biến môi trường | `backend/.env` mount vào container | `backend/.env` + `backend/.env.production` qua `env_file` |
| Upload | `backend/uploads/` trên host | volume `server_uploads` |

Hai file đặt tên project riêng nên chạy song song được trên cùng máy (container, network, volume, JWT secret tách biệt). Yêu cầu Docker Compose ≥ v2.24 (cú pháp `env_file` với `path`/`required`) và BuildKit. **PostgreSQL không chạy trong container**: chạy trên host hoặc máy riêng, `pg_hba.conf` + firewall phải cho dải Docker `172.16.0.0/12`.

**Production**: dựng từ đầu trên máy ảo Ubuntu (1 lệnh `scripts/setup-server.sh`), cấu hình, HTTPS, sao lưu, cập nhật phiên bản — xem [infra/cai-dat-may-ao-ubuntu.md](infra/cai-dat-may-ao-ubuntu.md). Bình thường CI/CD tự triển khai (`scripts/deploy.sh`: backup DB, migration, smoke test, tự rollback — [.github/CICD.md](.github/CICD.md)). ⚠️ Không bao giờ chạy `docker compose -f docker-compose.prod.yml down -v` (xoá volume: mất file upload, nhật ký, khoá 2FA).

### Develop (`docker-compose.yml`)

Source code bind mount vào container: nodemon (`-L`, polling) cho backend, Vite HMR cho frontend.

| Service | Port | Ghi chú |
|---|---|---|
| `backend` | `3001` | Express + nodemon. `mem_limit: 640m`, heap V8 384 MB |
| `frontend` | `5173` | Vite dev server, proxy `/api` và `/uploads` sang `backend:3001` |
| `redis` | `6379` | Redis 7, `maxmemory 128mb`, `allkeys-lru`, chỉ làm cache |
| `clamav` | – | Quét virus file upload |
| `loki` / `promtail` | `3100` / – | Profile `logs`, **không chạy mặc định**; Promtail đọc `backend/logs` đẩy vào Loki |

Compose tự đặt (ưu tiên hơn `backend/.env`): `NODE_ENV=development`, `DB_SERVER=host.docker.internal` (`extra_hosts: host-gateway` để chạy cả trên Linux), `REDIS_HOST=redis`, `TRUST_PROXY=1` (tin đúng Vite), `LOG_RETENTION_FILES=100`, `VITE_API_HOST=backend`, `CHOKIDAR_USEPOLLING=true` (bind mount qua Docker Desktop không phát fs-events). `JWT_SECRET` / `JWT_REFRESH_SECRET` để trống hoặc giá trị mẫu `change-me…` thì container tự sinh và ghi vào `backend/.env`.

```bash
docker compose up --build            # lần đầu, hoặc sau khi sửa Dockerfile
docker compose up -d                 # chạy nền
docker compose logs -f backend
docker compose --profile logs up -d  # bật thêm Loki + Promtail
docker compose down                  # dừng, giữ volume
npm run migrate -- status            # (ở thư mục gốc) chạy lệnh migrate trong container backend
```

| Địa chỉ | Nội dung |
|---|---|
| `http://localhost:5173` | Giao diện web |
| `http://localhost:3001/api-docs` | Swagger UI (Basic Auth `SWAGGER_USER` / `SWAGGER_PASS`) |
| `http://localhost:3001/health` | Health check |

`node_modules` nằm trong anonymous volume để không bị bind mount ghi đè. Lúc khởi động container so hash `package.json` + `package-lock.json`, khác thì tự `npm ci` — sau `git pull` hay thêm package chỉ cần `docker compose restart backend frontend`.

### Xử lý sự cố (dev)

| Hiện tượng | Nguyên nhân / cách xử lý |
|---|---|
| `connect ECONNREFUSED` / timeout tới `host.docker.internal:5432` | PostgreSQL chưa nghe trên mạng (`listen_addresses`) hoặc firewall chưa mở `5432` cho `172.16.0.0/12` |
| `no pg_hba.conf entry for host "172…"` | Chưa thêm dòng cho mạng Docker vào `pg_hba.conf`, hoặc chưa reload PostgreSQL |
| Backend thoát ngay, log báo thiếu biến | Thiếu `DB_USER`, `DB_PASSWORD` (hoặc `SWAGGER_USER` / `SWAGGER_PASS`) trong `backend/.env` |
| Sửa code không thấy cập nhật | `docker compose logs frontend`; polling trễ ~1 giây. Vừa thêm package thì `docker compose restart frontend` |
| `Cannot find module` sau `git pull` | `docker compose restart backend frontend`; vẫn lỗi thì `docker compose up -d --build --renew-anon-volumes` |
| `npm ci` lỗi `EIDLETIMEOUT` khi build | Mạng chập chờn — chạy lại, cache npm được giữ |
| Upload bị từ chối `503` "quét virus" | Container `clamav` chưa nạp xong CSDL virus (~1 phút) hoặc đã dừng: `docker compose logs clamav` |
| Docker Desktop ngốn RAM | Mỗi service đã có `mem_limit`; tắt profile `logs` nếu không dùng Loki |

Sự cố production (proxy, HTTPS, CSP, quyền volume, upload 413/429): [infra/cai-dat-may-ao-ubuntu.md mục 16](infra/cai-dat-may-ao-ubuntu.md#16-xử-lý-sự-cố).

---

## API

Base URL `/api/v1`, health check `GET /health`, response `{ "success": true, "message": "...", "data": {} }`. Xác thực bằng `Authorization: Bearer <access_token>`, trừ `/auth/login`, `/auth/refresh` và `/public/*`. Danh sách endpoint đầy đủ: Swagger UI (`/api-docs`); bảng module ↔ route: [backend/README.md](backend/README.md#cấu-trúc).

| Nhóm | Base path |
|---|---|
| Xác thực | `/auth`: login, refresh, logout, logout-all, sessions, change-password, `2fa/*` |
| Nghiên cứu | `/topics`, `/councils`, `/files`, `/workflows`, `/research-rounds` |
| Hội thảo & CME | `/seminars`, `/cme-records`, `/staff-licenses` |
| Đào tạo | `/trainees`, `/lecturers`, `/courses`, `/training-programs`, `/exams`, `/surveys`, `/staff-attendance` |
| Tổng hợp | `/dashboard`, `/me`, `/my-tasks`, `/notifications`, `/events` (SSE) |
| Hệ thống | `/users`, `/roles`, `/permissions`, `/activity-logs`, `/security-events`, `/system-settings`, `/form-configs`, `/persons` |
| Công khai | `/public`: captcha, khoá học mở, đăng ký, tra cứu, đề tài tiêu biểu |
| Danh mục | `/departments`, `/categories`, `/levels`, `/round-types`… (CRUD chuẩn) |
