# RMS Hospital API

Backend REST API cho hệ thống quản lý đề tài nghiên cứu bệnh viện (RMS_HOSPITAL).

## Cài đặt

```bash
npm install
cp .env.example .env
# Chỉnh sửa .env với thông tin kết nối DB của bạn
npm run dev
```

## Cấu trúc dự án

```
database/                     # Migration + định nghĩa SP/trigger/view — xem database/README.md
├── migrations/               # *.sql chạy tự động theo thứ tự tên (npm run migrate)
├── manual/                   # script chạy tay 1 lần
└── objects/                  # xuất từ DB (npm run dump:db-objects)
scripts/                      # CLI: migrate, sync-permissions, import, gen-jwt...
src/
├── server.js / cluster.js    # Khởi động (dev: 1 tiến trình; production: cluster)
├── app.js                    # Express app: middleware, gắn routes
├── config/                   # db.js (pool + withTransaction), redis, env, swagger, log
├── database/                 # migrator.js (bộ chạy migration), index.js (initDatabase lúc khởi động)
├── permissions/              # catalog quyền, phạm vi, kiểm tra CSDL + đồng bộ — xem README.md ở đó
├── middlewares/              # auth, errorHandler, upload*, cache quyền / trạng thái tài khoản
├── routes/                   # khai báo route + validate + quyền
├── controllers/              # nhận request → gọi service → trả response
├── services/                 # nghiệp vụ + truy vấn SQL
├── jobs/                     # cron job nền
└── utils/                    # hàm dùng chung: httpError, paging, sqlFilters, cache, excel*, vnDate...
```

Quy ước dùng chung:

- **Lỗi nghiệp vụ**: `throw httpError(404, 'Không tìm thấy...')`, `badRequest(...)` (`utils/httpError.js`). `errorHandler` trả đúng mã và thông điệp. Không ném object thường (`throw { statusCode }`), vì sẽ mất stack trace.
- **Transaction**: `await withTransaction(async (tx) => { ... }, pool)` (`config/db.js`). Helper tự commit, tự rollback và không để lỗi rollback che lỗi gốc.
- **Schema**: chỉ đổi qua file trong `database/migrations/` (`npm run migrate:new -- <mô tả>`). Code không tự chạy DDL.

## Kiểm tra chất lượng

| Lệnh | Việc | CI |
|------|------|----|
| `npm run lint` | ESLint. Lỗi chặn merge; cảnh báo `max-lines` (file > 500 dòng) chỉ để theo dõi | ✓ |
| `npm run format -- <file>` / `npm run format:check -- <file>` | Prettier (`.prettierrc.json`). Chỉ format file đang sửa, không format cả thư mục | — |
| `npm test` | Unit test, không cần DB (`test/**`) | ✓ |
| `npm run test:contract` | So danh sách route + quyền với `test/contract/routes.snapshot.txt`. Đổi route có chủ đích thì chạy `UPDATE_SNAPSHOTS=1 npm run test:contract` rồi commit file snapshot | ✓ |
| `npm run test:smoke` | Gọi thật mọi API GET vào DB đang cấu hình (chỉ đọc). So mã HTTP và tập trường JSON với baseline của máy này (`test-integration/.baseline/`, không commit) | — |

Khi refactor: ghi baseline trước (`UPDATE_SNAPSHOTS=1`), sau mỗi bước chạy lại để so. Backend chạy trong Docker thì gọi qua container:

```bash
docker exec hospital_rms_dev-backend-1 npm run test:smoke
```

## API Endpoints

### Auth
| Method | Endpoint                        | Mô tả               |
|--------|---------------------------------|---------------------|
| POST   | /api/v1/auth/login              | Đăng nhập           |
| POST   | /api/v1/auth/refresh            | Làm mới access token|
| POST   | /api/v1/auth/logout             | Đăng xuất           |
| POST   | /api/v1/auth/change-password    | Đổi mật khẩu        |

### Users
| Method | Endpoint                        | Mô tả               |
|--------|---------------------------------|---------------------|
| GET    | /api/v1/users/me                | Thông tin bản thân  |
| GET    | /api/v1/users                   | Danh sách users     |
| GET    | /api/v1/users/:id               | Chi tiết user       |
| POST   | /api/v1/users                   | Tạo user mới        |
| PUT    | /api/v1/users/:id               | Cập nhật user       |
| DELETE | /api/v1/users/:id               | Xóa/vô hiệu hóa    |
| POST   | /api/v1/users/:id/reset-password| Reset mật khẩu      |

### Topics (Đề tài)
| Method | Endpoint                              | Mô tả                    |
|--------|---------------------------------------|--------------------------|
| GET    | /api/v1/topics                        | Danh sách đề tài         |
| GET    | /api/v1/topics/:id                    | Chi tiết đề tài          |
| POST   | /api/v1/topics                        | Tạo đề tài mới           |
| PUT    | /api/v1/topics/:id                    | Cập nhật đề tài          |
| DELETE | /api/v1/topics/:id                    | Xóa đề tài               |
| GET    | /api/v1/topics/:id/members            | Danh sách thành viên     |
| POST   | /api/v1/topics/:id/members            | Thêm thành viên          |
| POST   | /api/v1/topics/:id/members/grant-accounts | Cấp tài khoản       |
| GET    | /api/v1/topics/:id/approvals          | Lịch sử phê duyệt        |
| POST   | /api/v1/topics/:id/approve            | Phê duyệt / từ chối      |
| GET    | /api/v1/topics/:topic_id/files        | Files của đề tài         |
| GET    | /api/v1/topics/:topic_id/files/batches| Batch upload             |
| POST   | /api/v1/topics/:topic_id/files        | Upload files             |

### Files
| Method | Endpoint                    | Mô tả        |
|--------|-----------------------------|--------------|
| DELETE | /api/v1/files/:file_id      | Xóa file     |

### Lookups (Danh mục)
| Resource          | Base Path                      |
|-------------------|--------------------------------|
| Phòng ban         | /api/v1/departments            |
| Danh mục          | /api/v1/categories             |
| Cấp đề tài        | /api/v1/levels                 |
| Vai trò           | /api/v1/roles                  |
| Đợt nghiên cứu    | /api/v1/research-rounds        |

Tất cả lookup đều hỗ trợ GET (list), GET/:id, POST, PUT/:id, DELETE/:id.

## Query params chung

- `page` (default: 1), `limit` (default: 20)
- `search`: tìm kiếm theo tên/title
- Bộ lọc riêng: `department_id`, `round_id`, `status`, `category_id`, `level_id`, ...

## Response format

```json
{
  "success": true,
  "message": "Thành công",
  "data": { ... }
}
```

## Authentication

Tất cả endpoint (trừ `/auth/login`) yêu cầu header:
```
Authorization: Bearer <access_token>
```

## Stored Procedures được sử dụng

- `sp_set_actor` — Set session context user_id trước mỗi thao tác write
- `sp_gen_topic_id` — Sinh ID đề tài
- `sp_gen_user_id` — Sinh ID người dùng
- `sp_gen_member_id` — Sinh ID thành viên
- `sp_gen_batch_id` — Sinh ID batch upload
- `sp_gen_file_id` — Sinh ID file
- `sp_grant_member_accounts` — Cấp tài khoản cho thành viên
- `sp_approve_topic` — Phê duyệt đề tài
- `sp_upload_files` — Upload nhiều file trong một batch
