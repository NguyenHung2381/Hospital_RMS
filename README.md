# Hospital RMS — Hệ thống Quản lý Nghiên cứu Khoa học Bệnh viện

Ứng dụng web quản lý toàn bộ vòng đời đề tài nghiên cứu khoa học trong bệnh viện: đăng ký đề tài, phân công thành viên, theo dõi tiến độ, quy trình phê duyệt và báo cáo thống kê.

---

## Mục lục

- [Tổng quan](#tổng-quan)
- [Công nghệ sử dụng](#công-nghệ-sử-dụng)
- [Yêu cầu hệ thống](#yêu-cầu-hệ-thống)
- [Cài đặt](#cài-đặt)
- [Cấu hình môi trường](#cấu-hình-môi-trường)
- [Khởi chạy](#khởi-chạy)
- [Cấu trúc dự án](#cấu-trúc-dự-án)
- [Tính năng chính](#tính-năng-chính)
- [API Documentation](#api-documentation)
- [Phân quyền](#phân-quyền)
- [Database](#database)

---

## Tổng quan

Hospital RMS (Research Management System) là hệ thống quản lý nghiên cứu khoa học dành cho môi trường bệnh viện. Hệ thống hỗ trợ:

- Nhân viên nghiên cứu đăng ký và theo dõi đề tài
- Trưởng khoa/bộ phận phê duyệt đề tài
- Quản trị viên quản lý người dùng, vòng nghiên cứu và dữ liệu danh mục
- Thống kê tổng quan trên dashboard

---

## Công nghệ sử dụng

### Frontend
| Thành phần | Công nghệ |
|---|---|
| Framework | React 19 + TypeScript |
| Build tool | Vite 8 |
| Routing | React Router DOM 7 |
| Biểu đồ | Recharts |
| Xuất file | XLSX, docx-preview |

### Backend
| Thành phần | Công nghệ |
|---|---|
| Runtime | Node.js + Express 4 |
| Database | Microsoft SQL Server (mssql) |
| Authentication | JWT (access token 8h + refresh token 7d) |
| Upload file | Multer |
| Xuất Excel | ExcelJS |
| API Docs | Swagger / OpenAPI |
| Validation | express-validator |

---

## Yêu cầu hệ thống

- **Node.js** >= 14
- **npm** >= 8
- **Microsoft SQL Server** (SQL Express hoặc Full) với database `RMS_HOSPITAL`
- Cổng mặc định: `3000` (backend), `5173` (frontend)

---

## Cài đặt

```bash
# Clone repository
git clone <repo-url>
cd Hospital_RMS

# Cài đặt dependencies cho cả hai package
npm install
cd server && npm install
cd ../client && npm install
cd ..
```

---

## Cấu hình môi trường

Tạo file `.env` tại `server/src/.env` dựa trên mẫu sau:

```env
# Server
PORT=3000
NODE_ENV=development

# SQL Server
DB_SERVER=localhost\SQLEXPRESS
DB_PORT=1433
DB_DATABASE=RMS_HOSPITAL
DB_USER=sa
DB_PASSWORD=your_password
DB_ENCRYPT=false
DB_TRUST_SERVER_CERT=true

# JWT
JWT_SECRET=your_super_secret_key_change_in_production
JWT_EXPIRES_IN=8h
JWT_REFRESH_SECRET=your_refresh_secret_key
JWT_REFRESH_EXPIRES_IN=7d

# Swagger UI (Basic Auth)
SWAGGER_USER=admin
SWAGGER_PASS=admin

# Upload directory
UPLOADS_DIR=uploads
```

> **Lưu ý:** Backend tự động phát hiện IP mạng cục bộ và đồng bộ cổng sang frontend — không cần cấu hình thêm cho client.

---

## Khởi chạy

```bash
# Chạy cả backend và frontend cùng lúc (development)
npm run dev

# Hoặc chạy riêng từng phần
npm run server    # Chỉ backend (nodemon)
npm run client    # Chỉ frontend (Vite)
```

### Production

```bash
# Build frontend
cd client && npm run build

# Chạy backend production
cd server && npm run start:prod
```

### Chạy bằng Docker

SQL Server vẫn chạy trên máy host (không container hóa), cần bật **TCP/IP** trong SQL Server Configuration Manager và mở firewall port 1433 để container kết nối vào được.

```bash
# Dev (hot reload, mount code từ máy vào container)
docker compose up --build
# client: http://localhost:5173, server: http://localhost:3000

# Prod-style (build tĩnh, gần giống lúc deploy)
# copy server/.env.example -> server/.env và điền config DB thật trước khi chạy
docker compose -f docker-compose.prod.yml up --build -d
# client: http://localhost, server: http://localhost:3000
```

---

## Cấu trúc dự án

```
Hospital_RMS/
├── client/                         # React + TypeScript SPA
│   └── src/
│       ├── features/
│       │   ├── auth/               # Đăng nhập
│       │   ├── dashboard/          # Tổng quan thống kê
│       │   ├── topics/             # Quản lý đề tài
│       │   ├── approval/           # Phê duyệt đề tài
│       │   ├── user/               # Quản lý người dùng
│       │   ├── department/         # Quản lý khoa/bộ phận
│       │   ├── round/              # Vòng nghiên cứu
│       │   ├── catalog/            # Danh mục (cấp độ, loại đề tài)
│       │   ├── roles/              # Vai trò người dùng
│       │   └── notifications/      # Thông báo
│       ├── layouts/                # AdminLayout, UserLayout, AuthLayout
│       ├── lib/
│       │   ├── apiClient.ts        # HTTP client với tự động refresh token
│       │   └── authStorage.ts      # Lưu trữ token
│       └── routers/                # Route guards và cấu hình trang
│
└── server/                         # Node.js + Express API
    └── src/
        ├── app.js                  # Entry point, middleware, routes
        ├── config/
│       │   └── db.js               # Kết nối SQL Server (connection pool)
        ├── routes/                 # Định nghĩa API endpoints
        ├── controllers/            # Xử lý request/response
        ├── services/               # Business logic
        ├── middlewares/            # Auth, validation, error handling
        ├── migrations/             # SQL migration scripts
        └── uploads/                # Thư mục lưu file tải lên
```

---

## Tính năng chính

### Quản lý đề tài nghiên cứu
- Đăng ký đề tài mới với thông tin chi tiết (loại, cấp độ, vòng nghiên cứu)
- Thêm/xóa thành viên đề tài, cấp tài khoản cho thành viên
- Tải lên file đính kèm theo lô (batch upload)
- Xuất danh sách đề tài ra file Excel
- Theo dõi trạng thái và lịch sử phê duyệt

### Quy trình phê duyệt
- Nộp đề tài để xét duyệt
- Phê duyệt / từ chối với ghi chú
- Xem lịch sử phê duyệt đầy đủ

### Quản lý vòng nghiên cứu
- Tạo và quản lý các vòng nghiên cứu với deadline
- Cửa sổ nộp bổ sung (supplement window)
- Nhắc nhở deadline tự động

### Dashboard & Thống kê
- Tổng quan số liệu theo vòng, khoa, trạng thái
- Biểu đồ tiến độ nghiên cứu

### Thông báo
- Thông báo real-time cho các sự kiện (phê duyệt, deadline)
- Đánh dấu đã đọc / chưa đọc
- Bộ đếm thông báo chưa đọc

---

## API Documentation

Swagger UI có sẵn sau khi khởi chạy backend:

```
http://localhost:3000/api-docs
```

Đăng nhập bằng: `admin` / `admin` (hoặc theo cấu hình `SWAGGER_USER`/`SWAGGER_PASS`)

**Base URL:** `/api/v1`

**Định dạng response:**
```json
{
  "success": true,
  "message": "...",
  "data": {}
}
```

### Các nhóm endpoint chính

| Nhóm | Endpoint | Mô tả |
|---|---|---|
| Auth | `/auth` | Đăng nhập, refresh token, đổi mật khẩu |
| Users | `/users` | CRUD người dùng, tìm kiếm, đặt lại mật khẩu |
| Topics | `/topics` | CRUD đề tài, thành viên, file, phê duyệt |
| Files | `/files` | Upload, xóa, danh sách file |
| Dashboard | `/dashboard` | Thống kê tổng quan |
| Notifications | `/notifications` | Thông báo người dùng |
| Departments | `/departments` | Quản lý khoa/bộ phận |
| Rounds | `/research-rounds` | Vòng nghiên cứu |
| Catalog | `/categories`, `/levels` | Danh mục đề tài |
| Roles | `/roles` | Vai trò hệ thống |

---

## Phân quyền

Hệ thống có 3 cấp độ vai trò:

| Vai trò | Quyền hạn |
|---|---|
| **Admin** | Toàn quyền: quản lý người dùng, danh mục, vòng nghiên cứu, xem tất cả đề tài |
| **Manager** | Phê duyệt đề tài, xem đề tài trong khoa, quản lý thành viên |
| **Member** | Đăng ký đề tài, tải file, xem đề tài của bản thân |

---

## Database

**Engine:** Microsoft SQL Server  
**Database:** `RMS_HOSPITAL`  
**Connection Pool:** min 2 — max 10 kết nối

### Stored Procedures

| Procedure | Mục đích |
|---|---|
| `sp_gen_topic_id` | Sinh ID đề tài tự động |
| `sp_gen_user_id` | Sinh ID người dùng |
| `sp_grant_member_accounts` | Cấp tài khoản cho thành viên |
| `sp_approve_topic` | Quy trình phê duyệt đề tài |
| `sp_upload_files` | Upload file theo lô |

### Migrations

Các script SQL migration nằm tại `server/src/migrations/`. Chạy tuần tự theo thứ tự thời gian khi cần cập nhật schema.
