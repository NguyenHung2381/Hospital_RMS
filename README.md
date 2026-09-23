# Hospital RMS — Hệ thống Quản lý Nghiên cứu Khoa học Bệnh viện

Ứng dụng web quản lý toàn bộ vòng đời hoạt động nghiên cứu khoa học trong bệnh viện: đăng ký đề tài, phân công thành viên, hội đồng chấm đề cương, quy trình phê duyệt, theo dõi tiến độ, quản lý hội thảo/hội nghị và cấp CME, cùng hệ thống báo cáo — thống kê.

Monorepo gồm hai phần chạy độc lập: **`frontend/`** (React SPA) và **`backend/`** (REST API).

---

## Mục lục

- [Tổng quan](#tổng-quan)
- [Công nghệ sử dụng](#công-nghệ-sử-dụng)
- [Yêu cầu hệ thống](#yêu-cầu-hệ-thống)
- [Cài đặt](#cài-đặt)
- [Cấu hình môi trường](#cấu-hình-môi-trường)
- [Khởi chạy](#khởi-chạy)
- [Chạy bằng Docker](#chạy-bằng-docker)
- [Cấu trúc dự án](#cấu-trúc-dự-án)
- [Tính năng chính](#tính-năng-chính)
- [Kiến trúc & quy ước](#kiến-trúc--quy-ước)
- [API Documentation](#api-documentation)
- [Phân quyền](#phân-quyền)
- [Database](#database)
- [Nhật ký hoạt động & logging](#nhật-ký-hoạt-động--logging)

---

## Tổng quan

Hospital RMS (Research Management System) phục vụ các nhóm người dùng:

- **Nhân viên nghiên cứu** — đăng ký đề tài, bổ sung thành viên, tải hồ sơ, theo dõi trạng thái phê duyệt và tiến độ.
- **Thành viên hội đồng** — chấm đề cương, nhập điểm/nhận xét, theo dõi tiến độ các đề tài mình phụ trách.
- **Quản lý khoa / cấp duyệt** — phê duyệt hoặc trả lại đề tài kèm ghi chú, quản lý tài khoản trong khoa.
- **Quản trị viên** — quản lý người dùng, phân quyền, danh mục, đợt nghiên cứu, hội đồng, hội thảo/CME, xem toàn bộ dữ liệu và nhật ký hệ thống.

Ứng dụng chia thành hai cổng: **cổng quản trị** (`/admin/*`) và **cổng người dùng** (`/user/*`), dùng chung một API.

---

## Công nghệ sử dụng

### Frontend (`frontend/`)

| Thành phần | Công nghệ |
|---|---|
| Framework | React 19 + TypeScript |
| Build tool | Vite 8 (`@vitejs/plugin-react`, `vite-plugin-svgr`) |
| Routing | React Router DOM 7 (route lazy + prefetch, guard theo quyền) |
| Biểu đồ | Recharts |
| Xử lý HTML an toàn | DOMPurify |
| Xem / xuất tài liệu | `docx-preview`, xuất Excel phía client |
| Data fetching | `fetch` bọc trong `apiClient`, tự refresh token khi 401 |
| Realtime | SSE — một `EventSource` dùng chung cho mỗi tab |

### Backend (`backend/`)

| Thành phần | Công nghệ |
|---|---|
| Runtime | Node.js + Express 4 |
| Database | Microsoft SQL Server (`mssql`, connection pool) |
| Authentication | JWT access token + refresh token, mật khẩu băm bằng `bcryptjs` |
| Phân quyền | Permission-based (bảng quyền + cache theo vai trò) |
| Upload file | Multer (file hồ sơ + ảnh) |
| Xuất Excel | ExcelJS |
| Validation | express-validator |
| Rate limiting | express-rate-limit |
| Logging | Pino + `pino-roll` (file JSON xoay theo ngày) |
| API Docs | Swagger / OpenAPI (`swagger-jsdoc` + `swagger-ui-express`), bảo vệ bằng Basic Auth |

---

## Yêu cầu hệ thống

- **Node.js** ≥ 20 LTS, **npm** ≥ 9 (React 19 / Vite 8 / TypeScript 6).
- **Microsoft SQL Server** (Express hoặc Full) với database `RMS_HOSPITAL`.
  - Bật **TCP/IP** trong SQL Server Configuration Manager, mở firewall port `1433` nếu server API và SQL Server không cùng máy (bắt buộc khi chạy Docker).
- Cổng mặc định: `3000` (backend), `5173` (frontend). Backend tự nhảy sang port trống kế tiếp nếu `3000` bị chiếm và đồng bộ port đó sang `frontend/.env`.

---

## Cài đặt

```bash
# Clone repository
git clone <repo-url>
cd Hospital_RMS

# Cài dependencies cho cả 3 package
npm install                 # root — chỉ chứa 'concurrently' để chạy song song
npm install --prefix backend
npm install --prefix frontend
```

Khởi tạo database: chạy `script.sql` (dump đầy đủ) hoặc `scripts/upgrade_db_script_to_hospital_rms.sql` (nâng cấp schema) trên SQL Server, tạo database tên `RMS_HOSPITAL`.

---

## Cấu hình môi trường

### Backend — `backend/.env`

Sao chép từ mẫu và điền thông tin thật:

```bash
cp backend/.env.example backend/.env
```

```env
PORT=3000

# SQL Server
DB_SERVER=localhost\SQLEXPRESS      # hoặc host.docker.internal khi chạy Docker
DB_PORT=1433
DB_DATABASE=RMS_HOSPITAL
DB_USER=sa
DB_PASSWORD=your_password
DB_ENCRYPT=false
DB_TRUST_SERVER_CERT=true

# Bắt buộc — server THOÁT ngay khi khởi động nếu thiếu bất kỳ biến nào dưới đây.
# Dùng chuỗi ngẫu nhiên đủ dài (vd: openssl rand -hex 32), KHÔNG dùng giá trị mẫu.
JWT_SECRET=change-me-to-a-long-random-string
JWT_REFRESH_SECRET=change-me-to-a-different-long-random-string
SWAGGER_USER=admin
SWAGGER_PASS=change-me

# Tuỳ chọn
# CORS_ORIGIN=https://rms.example.com,https://admin.rms.example.com   # bỏ trống = mọi origin
# UPLOADS_DIR=uploads
# LOG_DIR=logs                       # mặc định <backend>/logs
# LOG_RETENTION_FILES=90             # số file log tối đa được giữ (≈ số ngày)
# LOG_STDOUT=1                       # ghi ra stdout thay vì file
# AUDIT_LOG_METHODS=POST,PUT,PATCH,DELETE   # bỏ trống = ghi mọi method (kể cả GET)
```

> Biến bắt buộc: `DB_USER`, `DB_PASSWORD`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `SWAGGER_USER`, `SWAGGER_PASS`.

### Frontend — `frontend/.env` (tuỳ chọn khi dev)

Khi chạy dev, client gọi đường dẫn tương đối và đi qua proxy của Vite — thường **không cần** file này. Backend tự ghi `VITE_API_PORT` vào `frontend/.env` mỗi lần khởi động.

```env
VITE_API_PORT=3000          # cổng backend để Vite proxy /api và /uploads
# VITE_API_BASE_URL=        # chỉ set khi build deploy client tách domain
```

---

## Khởi chạy

```bash
# Development — chạy backend + frontend cùng lúc
npm run dev
#   SERVER  → nodemon src/server.js        (http://localhost:3000)
#   CLIENT  → vite  (chờ server sẵn sàng)  (http://localhost:5173)

# Chạy riêng
npm run server      # chỉ backend
npm run client      # chỉ frontend
```

### Production

```bash
# Build frontend (ra frontend/dist)
npm run build --prefix frontend

# Chạy backend ở chế độ production
npm run start:prod --prefix backend
```

---

## Chạy bằng Docker

SQL Server **không** được container hoá — vẫn chạy trên máy host. Container kết nối vào qua `host.docker.internal`.

```bash
# Dev — hot reload, mount code từ máy vào container, kèm log stack (Loki + Promtail)
docker compose up --build
#   client → http://localhost:5173   server → http://localhost:3000
#   Loki   → http://localhost:3100

# Prod-style — build tĩnh, client phục vụ qua Nginx
cp backend/.env.example backend/.env    # điền config DB thật trước khi chạy
docker compose -f docker-compose.prod.yml up --build -d
#   client → http://localhost   server → http://localhost:3000
```

---

## Cấu trúc dự án

```
Hospital_RMS/
├── frontend/                        # React + TypeScript SPA (Vite)
│   └── src/
│       ├── app/
│       │   ├── App.tsx
│       │   └── router/              # publicRoutes, privateRoutes, guards, lazy + prefetch
│       ├── features/                # mỗi feature: api / components / hooks / pages / types / utils
│       │   ├── auth/                # đăng nhập
│       │   ├── dashboard/           # tổng quan thống kê
│       │   ├── topics/              # quản lý & đăng ký đề tài
│       │   ├── approval/            # phê duyệt đề tài
│       │   ├── council/             # hội đồng chấm đề cương + người ngoài viện
│       │   ├── round/               # đợt nghiên cứu, deadline
│       │   ├── schedule/            # lịch trình nghiên cứu
│       │   ├── seminar/             # hội thảo / hội nghị + sổ cấp CME
│       │   ├── reports/             # báo cáo & xuất dữ liệu
│       │   ├── catalog/             # danh mục: phân loại, cấp độ, loại đợt
│       │   ├── department/          # khoa / phòng ban
│       │   ├── user/                # quản lý người dùng
│       │   ├── roles/               # phân quyền theo vai trò
│       │   ├── notifications/       # thông báo (admin + người dùng)
│       │   ├── activity-log/        # nhật ký hoạt động
│       │   └── portal/              # cổng người dùng: trang chủ, đề tài của tôi, tiến độ hội đồng, hồ sơ
│       ├── layouts/                 # AdminLayout, UserLayout, AuthLayout, EmptyLayout + hooks (useRealtime)
│       ├── shared/                  # dùng chung mọi feature
│       │   ├── components/          # Badge, Button, Card, EmptyState, Input/*, Loading, Modal, Table, FileViewerModal…
│       │   ├── hooks/              # useRowSelection…
│       │   ├── utils/              # cx, formatDate, storage, runBulk…
│       │   └── api/                # apiClient (fetch), interceptors (refresh token), endpoints
│       └── styles/
│
├── backend/                         # Node.js + Express REST API
│   └── src/
│       ├── server.js               # bootstrap: auto-port, đồng bộ port sang client, network IP
│       ├── app.js                  # nạp .env, kiểm tra biến bắt buộc, middleware, mount routes
│       ├── config/                 # db.js (mssql pool), swagger.js, auditLogger.js
│       ├── routes/                 # auth, users, topics, councils, files, dashboard,
│       │                           # notifications, events (SSE), activityLogs, seminars, lookups, health
│       ├── controllers/            # xử lý request/response + các controller export Excel
│       ├── services/               # business logic (topic, council, seminar, deadline, permission…)
│       ├── middlewares/            # auth, permissionCache, activityLogger, upload, swaggerAuth, errorHandler
│       └── utils/                  # response, paging, sqlFilters, excelStyle, vietnameseText
│
├── infra/                           # loki-config.yaml, promtail-config.yaml
├── scripts/                         # upgrade_db_script_to_hospital_rms.sql, drop-activity-logs.sql, wait-server.js
├── docs/                            # tài liệu nghiệp vụ (kế hoạch, mẫu Excel CME…)
├── script.sql                       # dump database đầy đủ
├── docker-compose.yml               # dev: server + client + loki + promtail
└── docker-compose.prod.yml          # prod: server + client (Nginx)
```

---

## Tính năng chính

### Đề tài nghiên cứu
- Đăng ký đề tài với loại, cấp độ, đợt nghiên cứu; kiểm tra cấp độ hợp lệ theo cấu hình đợt.
- Kiểm soát cửa sổ đăng ký (registration window) theo deadline của đợt.
- Thêm/xoá thành viên, cấp tài khoản đăng nhập cho thành viên.
- Tải file đính kèm theo lô (batch upload).
- Xuất danh sách / hồ sơ đầy đủ đề tài ra Excel.

### Hội đồng chấm đề cương
- Tạo hội đồng, phân ghế thành viên (thủ công hoặc tự động), nhập người ngoài viện.
- Import danh sách hội đồng từ file.
- Chấm điểm / nhận xét đề cương; theo dõi tiến độ chấm.
- Người dùng có ghế hội đồng xem được số đề tài mình phụ trách và tiến độ.

### Quy trình phê duyệt
- Nộp đề tài để xét duyệt, phê duyệt / trả lại kèm ghi chú.
- Lịch sử phê duyệt đầy đủ; trạng thái hiển thị luôn lấy theo `topics.status` (bảng đề tài) — xem ghi chú ở phần Database.

### Đợt nghiên cứu & lịch trình
- Tạo đợt nghiên cứu với nhiều loại deadline (đăng ký đề tài, nộp bổ sung…).
- Cửa sổ nộp bổ sung, nhắc deadline tự động.
- Trang lịch trình tổng hợp các mốc thời gian.

### Hội thảo / Hội nghị & CME
- Quản lý hội thảo, hội nghị theo năm (tách riêng khỏi đề tài NCKH).
- Danh sách tham dự, import từ Excel.
- Sổ cấp CME (nội viện / ngoại viện) theo từng hội nghị.

### Dashboard & Báo cáo
- Tổng quan số liệu theo đợt, khoa, trạng thái; biểu đồ tiến độ.
- Trang Báo cáo & Xuất dữ liệu tập trung cho các bản kết xuất Excel.

### Thông báo & Realtime
- Thông báo real-time qua SSE cho các sự kiện (phê duyệt, deadline, phân công hội đồng…).
- Đánh dấu đã đọc / chưa đọc, bộ đếm chưa đọc.
- Quản trị viên soạn và gửi thông báo thủ công.

### Quản trị hệ thống
- Quản lý người dùng, khoa/phòng ban, danh mục (phân loại, cấp độ, loại đợt), vai trò & quyền.
- Nhật ký hoạt động đọc trực tiếp từ file log.

---

## Kiến trúc & quy ước

### Realtime — một kết nối SSE cho mỗi tab
`useRealtimeUpdate(entities, callback)` (`frontend/src/layouts/hooks/useRealtime.ts`) đăng ký vào **một** `EventSource` dùng chung ở cấp module, kết nối tới `GET /api/v1/events?token=<jwt>`. Nếu mỗi hook tự mở kết nối riêng, một trang nhiều panel sẽ vượt giới hạn 6 kết nối HTTP/1.1 mỗi origin của trình duyệt và làm treo toàn bộ request còn lại — **luôn dùng hook này**, không tự tạo `EventSource`.

### Danh tính hợp nhất (`persons`) — dual-write
Một con người từng bị lưu ở 6 bảng riêng (`users`, `trainees`, `lecturers`, `external_reviewers`, `topic_members`, `seminar_participants`). Nay mỗi bảng có cột `person_id` trỏ về **một** bản ghi `persons`.

- **Bảng nguồn vẫn là nguồn sự thật.** Sau mỗi lệnh ghi thành công, `personService.syncPerson(source, id, { actorId })` gắn/cập nhật person. Hàm này **không bao giờ ném lỗi** (chỉ log) nên không chặn thao tác của người dùng. Viết đường ghi mới vào 6 bảng trên → nhớ gọi nó (hoặc `syncPersons` cho import hàng loạt).
- **Quy tắc gắn người** (giống migration): có `user_id` → person của user · trùng CCCD · `staff_number` + tên · email + tên · SĐT chuẩn hoá + tên · tên + ngày sinh. Mỗi quy tắc chỉ dùng khi khớp đúng 1 person; trùng **tên đơn thuần không bao giờ tự gộp** (đưa vào hàng đợi duyệt `person_merge_candidates`). Một người chỉ có một tài khoản.
- **Nguồn phụ chỉ điền chỗ trống**, không ghi đè person do nguồn khác tạo. Email giả `<id>@member.local` (luồng cấp tài khoản) không vào `persons`.
- **Job đêm 03:00** (`jobs/personLinkJob`) gắn nốt bản ghi còn `person_id IS NULL` (script import một lần, SQL tay, lỗi tạm thời…).
- **Cờ tắt khẩn cấp:** `PERSON_DUAL_WRITE=false` trong `backend/.env`. Trước khi chạy migration, dual-write tự bỏ qua (kiểm tra lại mỗi 60s).
- **Duyệt gộp:** màn hình *Hệ thống → Duyệt trùng danh tính* (`/admin/person-merge`, quyền `persons:read` / `persons:merge`, mặc định chỉ admin). Gộp chuyển toàn bộ `person_id` sang hồ sơ gốc, đánh dấu hồ sơ kia `MERGED` và ghi `person_merge_log` (ảnh chụp + danh sách bản ghi đã chuyển, đủ để khôi phục thủ công). Không thể gộp hai hồ sơ đều có tài khoản.

### UI kit dùng chung (`frontend/src/shared`)
Các mảnh giao diện lặp lại được gom về một nguồn duy nhất — sửa một nơi, đổi cả app. Import qua barrel: `import { Badge, EmptyState, Pagination } from '@/shared/components'`.

| Thành phần | Dùng cho | Ghi chú |
|---|---|---|
| `<Badge tone dot>` | Nhãn trạng thái (chip chấm màu) | `tone`: `green\|blue\|amber\|gray\|red\|pink\|purple\|teal`. Config trạng thái của feature khai báo `tone: BadgeTone` thay cho tên class. |
| `<EmptyState icon title desc action>` / `<TableEmpty colSpan …>` | Khối "chưa có dữ liệu" | `TableEmpty` bọc sẵn `<tr><td colSpan>`. |
| `<Card>` + `<Card.Header icon title sub actions>` + `<Card.Body>` | Khung card có viền + header icon | |
| `<Pagination …>` | Thanh phân trang | `hideSizeSelect` khi không có ô chọn số dòng; `infoText` để ghi đè câu chữ. |
| `Table.module.css` | Nguồn chân lý style bảng danh sách | feature dùng `composes: … from '@/shared/components/Table/Table.module.css'`, **không** tự định nghĩa lại `.tableWrap/.th/.td/.tr/.emptyState`. |
| `<Modal>`, `<Button>`, `Input/*` (DatePicker, MultiSelect, SearchableSelect), `Loading`/`Skeleton`, `FileViewerModal` | (đã có sẵn) | |

Quy ước: không tự viết lại `Badge` / pagination / empty-state trong feature; cần biến thể thì truyền `className`/`style` vào component dùng chung. `docx-preview` / `RichTextEditor` nặng — import trực tiếp theo đường dẫn, **không** qua barrel.

> Lưu ý: nhiều CSS Module không dùng được `animation: spin` (keyframe bị scope hoá) — dùng component `Loading` / `InlineLoading` sẵn có thay vì tự viết spinner.

---

## API Documentation

Swagger UI có sẵn sau khi khởi chạy backend:

```
http://localhost:3000/api-docs
```

Đăng nhập Basic Auth bằng `SWAGGER_USER` / `SWAGGER_PASS`.

**Base URL:** `/api/v1`  ·  **Health check:** `GET /health`

**Định dạng response:**
```json
{ "success": true, "message": "...", "data": {} }
```

**Authentication:** mọi endpoint (trừ `/auth/login`) yêu cầu header `Authorization: Bearer <access_token>`.

**Query params chung:** `page` (mặc định 1), `limit` (mặc định 20), `search`, cùng các bộ lọc riêng (`department_id`, `round_id`, `status`, `category_id`, `level_id`…).

### Các nhóm endpoint chính

| Nhóm | Base path | Mô tả |
|---|---|---|
| Auth | `/auth` | Đăng nhập, refresh token, đăng xuất, đổi mật khẩu |
| Users | `/users` | CRUD người dùng, `/me`, tìm kiếm, reset mật khẩu |
| Topics | `/topics` | CRUD đề tài, thành viên, cấp tài khoản, file/batch, phê duyệt |
| Councils | `/councils` | Hội đồng, phân ghế, chấm điểm, import, tiến độ, export |
| Seminars | `/seminars` | Hội thảo/hội nghị, người tham dự, cấp CME, import |
| Files | `/files` | Xoá file (upload nằm dưới `/topics/:id/files`) |
| Dashboard | `/dashboard` | Thống kê tổng quan + export |
| Notifications | `/notifications` | Thông báo người dùng, đánh dấu đã đọc, gửi thủ công |
| Events | `/events` | SSE stream cập nhật real-time (`?token=`) |
| Activity Logs | `/activity-logs` | Đọc nhật ký hoạt động từ file log |
| Persons | `/persons/merge-candidates` | Hàng đợi trùng danh tính: danh sách, chi tiết, `/:id/merge`, `/:id/reject`, `/:id/reopen`, `/stats` |
| Lookups | `/departments`, `/categories`, `/levels`, `/roles`, `/research-rounds`, `/round-types` | Danh mục — hỗ trợ GET (list), GET/:id, POST, PUT/:id, DELETE/:id |

---

## Phân quyền

Xác thực bằng JWT (access token ngắn hạn + refresh token dài hạn). Cấp quyền theo **permission** gắn với vai trò, được cache trong middleware `permissionCache` và kiểm tra bằng `authorizePermission` ở backend / `<RequirePermission perm="...">` ở frontend (ví dụ quyền `topics:create`).

| Vai trò | Quyền hạn tiêu biểu |
|---|---|
| **Admin** | Toàn quyền: người dùng, vai trò/quyền, danh mục, đợt nghiên cứu, hội đồng, hội thảo/CME, xem tất cả đề tài và nhật ký |
| **Manager / cấp duyệt** | Phê duyệt đề tài, xem đề tài trong khoa, quản lý thành viên & tài khoản trong khoa |
| **Thành viên hội đồng** | Chấm đề cương, xem tiến độ các đề tài được phân công |
| **Member** | Đăng ký đề tài, tải file, xem và theo dõi đề tài của bản thân |

Vai trò và tập quyền cụ thể được quản lý trong trang **Phân quyền** (`/admin/roles`).

---

## Database

**Engine:** Microsoft SQL Server  ·  **Database:** `RMS_HOSPITAL`  ·  **Connection pool:** min 2 — max 10.

### Stored procedures được sử dụng

| Procedure | Mục đích |
|---|---|
| `sp_set_actor` | Set session context `user_id` trước mỗi thao tác ghi (phục vụ audit) |
| `sp_gen_topic_id` / `sp_gen_user_id` / `sp_gen_member_id` | Sinh ID đề tài / người dùng / thành viên |
| `sp_gen_batch_id` / `sp_gen_file_id` | Sinh ID batch upload / file |
| `sp_grant_member_accounts` | Cấp tài khoản đăng nhập cho thành viên đề tài |
| `sp_approve_topic` | Quy trình phê duyệt đề tài |
| `sp_upload_files` | Ghi nhiều file trong một batch |

### Ghi chú nghiệp vụ

- **Trạng thái phê duyệt vs. trạng thái đề tài:** `approvals.status` có thể lệch với `topics.status`. UI hiển thị theo `topics.status`. Với bản ghi `approvals`: `created_*` = thời điểm nộp, `updated_*` = thời điểm duyệt.

### Migrations & scripts

> `backend/migrations/` được ignore có chủ đích (không nằm trong git); chạy tay theo thứ tự tên file. Dùng `sqlcmd -I` (bảng có index lọc / cột tính toán cần `QUOTED_IDENTIFIER ON`).

- `2026-09-25_persons_foundation.sql` — bảng `persons`, `person_merge_candidates`, cột `person_id` trên 6 bảng nguồn, backfill (idempotent, có rollback ở cuối file).
- `2026-09-26_person_merge_review.sql` — `person_merge_log` và quyền `persons:read` / `persons:merge`.
- `scripts/profiling/gd0_profiling.sql` — thống kê hiện trạng dữ liệu (chỉ đọc), chạy trên **bản sao** trước khi migrate.

- `script.sql` — dump database đầy đủ để khởi tạo mới.
- `scripts/upgrade_db_script_to_hospital_rms.sql` — script nâng cấp schema.
- `scripts/drop-activity-logs.sql` — gỡ bảng activity log cũ (nhật ký nay ghi ra file, không còn dùng SQL).

---

## Nhật ký hoạt động & logging

- Server ghi log bằng **Pino**; `pino-roll` xoay file JSON theo ngày tại `LOG_DIR/audit-*.log` (mặc định `backend/logs/`).
- Middleware `activityLogger` ghi lại các request ghi dữ liệu (mặc định mọi method; giới hạn qua `AUDIT_LOG_METHODS`).
- Trang **Nhật ký hoạt động** (`/admin/activity-logs`) đọc **trực tiếp** từ các file log — không truy vấn SQL.
- `LOG_RETENTION_FILES` giới hạn số file được giữ (tự xoá file cũ hơn). Đặt `LOG_STDOUT=1` để ghi ra stdout khi có trình thu gom log riêng.
- Docker (dev) kèm **Loki + Promtail**: Promtail đọc `backend/logs` và đẩy vào Loki (`http://localhost:3100`) để tra cứu/giám sát.
