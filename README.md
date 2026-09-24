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

### Build production

```bash
npm run build --prefix frontend        # ra frontend/dist
npm run start:prod --prefix backend    # NODE_ENV=production
```

Ở production, server **không khởi động** nếu thiếu `CORS_ORIGIN`.

---

## Cấu hình môi trường

### `backend/.env`

Xem đầy đủ các biến và chú thích trong [`backend/.env.example`](backend/.env.example). Tóm tắt:

| Nhóm | Biến | Ghi chú |
|---|---|---|
| **Bắt buộc** | `DB_USER`, `DB_PASSWORD`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `SWAGGER_USER`, `SWAGGER_PASS` | Server thoát ngay khi khởi động nếu thiếu biến nào. Secret nên là chuỗi ngẫu nhiên dài (`openssl rand -hex 32`). |
| SQL Server | `DB_SERVER`, `DB_PORT`, `DB_DATABASE`, `DB_ENCRYPT`, `DB_TRUST_SERVER_CERT` | Production: không dùng `sa`, nên tạo login riêng chỉ có quyền trên `RMS_HOSPITAL` và bật `DB_ENCRYPT=true`. |
| HTTP | `PORT`, `CORS_ORIGIN`, `TRUST_PROXY` | `CORS_ORIGIN` bắt buộc ở production. `TRUST_PROXY` phải đặt đúng khi chạy sau reverse proxy, nếu không rate-limit đăng nhập sẽ không hoạt động đúng. |
| Upload | `UPLOAD_URL_SECRET`, `UPLOAD_URL_TTL_SEC`, `TRAINING_UPLOAD_MAX_MB`, `TRAINING_MEDIA_MAX_MB` | Link tải file được ký HMAC. Đổi secret thì mọi link cũ mất hiệu lực. |
| Log | `LOG_DIR`, `LOG_RETENTION_FILES`, `LOG_STDOUT`, `AUDIT_LOG_METHODS` | Xem phần [logging](#tác-vụ-nền-cache--logging). |
| Email | `MAIL_ENABLED`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Mặc định tắt, email chỉ in ra console. |
| Redis | `REDIS_HOST`, `REDIS_PORT` | Mặc định `localhost:6379`. |
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

SQL Server **không** chạy trong container mà vẫn chạy trên máy host. Container kết nối tới SQL Server qua `host.docker.internal`.

```bash
# Dev: hot reload (mount code), kèm Redis + Loki + Promtail
docker compose up --build
#   client → http://localhost:5173
#   server → http://localhost:3000
#   redis  → localhost:6379      loki → http://localhost:3100

# Prod-style: client build tĩnh phục vụ qua Nginx
cp backend/.env.example backend/.env    # bắt buộc, điền DB_SERVER và DB_*
docker compose -f docker-compose.prod.yml up --build -d
#   client → http://localhost        server → http://localhost:3000
```

File upload ở bản prod được lưu trong volume `server_uploads`.

### JWT secret

Container server tự sinh `JWT_SECRET` / `JWT_REFRESH_SECRET` khi khởi động nếu còn trống hoặc là giá trị mẫu `change-me…` (`backend/docker-entrypoint.sh`):

- Có `backend/.env` và chạy bản dev: điền thẳng vào `backend/.env`.
- Không có: lưu trong volume `server_secrets`, giữ nguyên qua restart/redeploy.

Sinh tay (không Docker): `npm run gen:jwt` (thêm `-- --dry-run` để xem trước, `-- --force` để thay secret đang dùng).

Đổi secret định kỳ (Windows Task Scheduler). **Mỗi lần đổi, mọi người dùng bị đăng xuất**:

```powershell
.\scripts\rotate-jwt-secrets.ps1 -Register                  # 4 tuần/lần, 02:30 Chủ nhật, compose prod
.\scripts\rotate-jwt-secrets.ps1 -Register -ComposeFile docker-compose.yml -EveryWeeks 2
.\scripts\rotate-jwt-secrets.ps1                            # đổi ngay
.\scripts\rotate-jwt-secrets.ps1 -Unregister                # gỡ lịch
```

Log ghi tại `logs/jwt-rotate.log`.

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
│   ├── config/                 # db, redis, swagger, auditLogger, env
│   ├── core/                   # db (gọi stored procedure), errors (AppError)
│   ├── routes/                 # định nghĩa endpoint + validation
│   ├── controllers/            # request/response, các controller export Excel
│   ├── services/               # business logic
│   ├── middlewares/            # auth, permissionCache, activityLogger, upload*, fileTypeAllowlist…
│   ├── jobs/                   # cron: bảo trì tài khoản, nhắc deadline, gắn persons
│   └── utils/                  # response, paging, sqlFilters, cache, captcha, signedUpload…
│
├── scripts/                    # wait-server.js, script import dữ liệu từ hệ thống cũ
├── infra/                      # cấu hình Loki, Promtail
├── docker-compose.yml          # dev: server, client, redis, loki, promtail
└── docker-compose.prod.yml     # prod: server, client (Nginx), redis
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

- **Swagger UI:** `http://localhost:3000/api-docs` (Basic Auth: `SWAGGER_USER` / `SWAGGER_PASS`)
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
| Tổng hợp | `/dashboard`, `/my-tasks`, `/notifications`, `/events` (SSE, `?token=`) |
| Hệ thống | `/activity-logs`, `/security-events`, `/system-settings`, `/persons/merge-candidates` |
| Công khai | `/public`: captcha, khoá học mở, đăng ký, tra cứu trạng thái đề tài, đề tài tiêu biểu |
| Danh mục | `/departments`, `/categories`, `/levels`, `/roles`, `/research-rounds`, `/round-types`… (CRUD chuẩn) |

---

## Xác thực & phân quyền

- **JWT**: access token ngắn hạn + refresh token dài hạn. Frontend tự refresh khi gặp `401`. Người dùng có thể xem các phiên đăng nhập và đăng xuất khỏi mọi thiết bị.
- **2FA** TOTP (tuỳ chọn cho từng người dùng).
- **Chống dò mật khẩu**: rate-limit đăng nhập, tạm khoá tài khoản sau nhiều lần sai, ghi lại sự kiện bảo mật (API `/security-events`).
- **Bảo trì tài khoản**: job hằng đêm vô hiệu hoá tài khoản hết hạn và cảnh báo mật khẩu cũ.
- **Phân quyền theo permission** gắn với vai trò, dạng `resource:action` (vd `topics:create`, `persons:merge`):
  - Backend dùng `authorizePermission([...])`, quyền được cache trong `permissionCache`.
  - Frontend dùng `<RequirePermission perm="...">` và guard ở router.
  - Vai trò và tập quyền được quản lý tại `/admin/roles`.

---

## Database

**Engine:** Microsoft SQL Server · **Database:** `RMS_HOSPITAL` · **Pool:** min 2, max 10.

> Mọi file `*.sql` đều bị `.gitignore` loại khỏi repo, gồm dump schema, migration và script bảo trì. Hãy lấy bộ script khởi tạo và migration từ nhóm phát triển. Chạy migration bằng `sqlcmd -I` theo thứ tự tên file, vì các bảng có index lọc hoặc cột tính toán cần `QUOTED_IDENTIFIER ON`.

### Stored procedures chính

| Procedure | Mục đích |
|---|---|
| `sp_set_actor` | Đặt `user_id` vào session context trước mỗi lệnh ghi (phục vụ audit) |
| `sp_gen_topic_id`, `sp_gen_user_id`, `sp_gen_member_id`, `sp_gen_batch_id`, `sp_gen_file_id` | Sinh mã đề tài / người dùng / thành viên / batch / file |
| `sp_grant_member_accounts` | Cấp tài khoản đăng nhập cho thành viên đề tài |
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
- Bản Docker dev có sẵn Promtail đọc `backend/logs` và đẩy vào Loki (`http://localhost:3100`).

---

## Quy ước phát triển

### Realtime: một kết nối SSE cho mỗi tab
Luôn dùng `useRealtimeUpdate(entities, callback)` ([`frontend/src/layouts/hooks/useRealtime.ts`](frontend/src/layouts/hooks/useRealtime.ts)). Hook này đăng ký vào **một** `EventSource` dùng chung tới `GET /api/v1/events?token=<jwt>`. Không tự tạo `EventSource`: mỗi panel mở một kết nối riêng sẽ vượt giới hạn 6 kết nối HTTP/1.1 mỗi origin của trình duyệt và làm treo các request khác.

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

### Dữ liệu nhạy cảm
Các script trong `scripts/` dùng để import dữ liệu từ hệ thống cũ. Báo cáo chúng sinh ra (`*_CHUA_MAT_KHAU.csv`, `staff_license_import_unmatched.csv`) chứa thông tin cá nhân thật hoặc mật khẩu tạm và đã được `.gitignore`. **Không bao giờ commit các file này.**
