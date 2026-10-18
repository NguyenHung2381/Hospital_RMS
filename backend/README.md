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
├── app.js                    # Express app: middleware, gắn route của từng module (thứ tự có ý nghĩa)
├── config/                   # env.js (kiểm tra biến môi trường), logger.js (log ứng dụng), db.js (pool + withTransaction), redis, swagger, auditLogger
├── database/                 # migrator.js (bộ chạy migration), index.js (initDatabase lúc khởi động)
├── permissions/              # catalog quyền, phạm vi, authz.js (hasPermission/scopeOf), cache quyền + trạng thái tài khoản, đồng bộ — xem README.md ở đó
├── middlewares/              # tầng HTTP: auth, errorHandler, validateRequest (zod), upload*, activityLogger
├── modules/                  # mã nghiệp vụ, mỗi thư mục một module (xem bảng dưới)
│   └── <module>/
│       ├── <tên>.routes.js   # khai báo route + validate + quyền (Swagger quét modules/**/*.routes.js)
│       ├── <tên>Controller.js# nhận request → gọi service → trả response
│       └── <tên>Service.js   # nghiệp vụ + truy vấn SQL
├── shared/                   # crudService, crudController — factory CRUD dùng chung
├── jobs/                     # cron job nền (gọi service của các module)
├── assets/                   # font, logo dùng khi xuất file / gửi mail
└── utils/                    # hàm dùng chung: asyncHandler, httpError, paging, sqlFilters, cache, excel*, vnDate...
```

Các module trong `src/modules/`:

| Module | Route gắn trong app.js | Nội dung |
|---|---|---|
| `auth` | `/auth` | đăng nhập, refresh token, 2FA, thiết bị tin cậy, quên mật khẩu, `sessionVersion` |
| `users` | `/users` | tài khoản người dùng |
| `access` | gốc `/api`: `/roles`, `/permissions` | vai trò, ma trận quyền, `privilegeGuard`, `roleCodes` |
| `persons` | `/persons` | hồ sơ người (gộp trùng, liên kết tài khoản) |
| `catalog` | gốc `/api` (gắn cuối cùng, cùng `access`, `rounds`) | danh mục: khoa, phản biện ngoài, lĩnh vực, cấp, loại đợt, danh mục đào tạo/CME, địa điểm, chức danh. Mỗi danh mục 1 file `<tên>.routes.js`, `catalog.routes.js` gom lại |
| `rounds` | gốc `/api`: `/research-rounds` | đợt nghiên cứu, mốc deadline |
| `topics` | `/topics`, `/files`, `/workflows` | đề tài, thành viên, tác giả, file nộp, workflow duyệt, nhập/xuất Excel |
| `councils` | `/councils` | hội đồng, phân công, tiến độ đánh giá |
| `seminars` | `/seminars` | hội nghị/hội thảo, người tham dự, xuất Excel |
| `cme` | `/cme-records` | hồ sơ CME, yêu cầu tín chỉ, báo cáo |
| `training/` | `/courses`, `/training-programs`, `/training-plans`, `/trainees`, `/exams`, `/lecturers` | thư mục con `courses`, `programs`, `plans`, `trainees`, `exams`, `lecturers`, `reports`; `trainingFileService` dùng chung |
| `attendance` | `/staff-attendance` | chấm công, ca làm |
| `staffLicenses` | `/staff-licenses` | chứng chỉ hành nghề |
| `surveys` | `/surveys` | khảo sát |
| `notifications` | `/notifications` | thông báo trong hệ thống, `mailService` |
| `events` | `/events` | SSE realtime (`eventService.broadcast`) |
| `settings` | `/system-settings` | cấu hình hệ thống |
| `audit` | `/activity-logs`, `/security-events` | nhật ký thao tác, sự kiện/cảnh báo bảo mật |
| `dashboard` | `/dashboard` | số liệu tổng hợp, báo cáo đào tạo |
| `portal` | `/me`, `/my-tasks` | dữ liệu "của tôi" (đọc chéo nhiều module) |
| `public` | `/public` | cổng công khai không cần đăng nhập |
| `system` | `/health`, `/csp-report`, `/excel`, `/modules` | route hạ tầng |

Quy ước module:

- Tên file controller/service giữ dạng `xxxService.js` / `xxxController.js` để grep theo tên vẫn ra; file route đặt `<tên>.routes.js`.
- Module được phép `require` service của module khác. Hướng phụ thuộc nên đi từ module tổng hợp (`portal`, `public`, `dashboard`) xuống module nghiệp vụ, rồi xuống lõi (`events`, `access`, `notifications`, `settings`, `persons`). Không tạo `require` vòng giữa các file.
- Thêm module mới: tạo `src/modules/<tên>/`, gắn router trong `app.js` (kèm `requireModule(...)` nếu thuộc module có thể bật/tắt), khai báo quyền trong `permissions/` rồi chạy `npm run check:routes`.
- `npm run check:requires` nạp mọi file trong `src/` và báo đường dẫn `require` sai, kể cả `require` nằm trong thân hàm.

Quy ước dùng chung:

- **Lỗi nghiệp vụ**: `throw httpError(404, 'Không tìm thấy...')`, `badRequest(...)` (`utils/httpError.js`). `errorHandler` trả đúng mã và thông điệp. Không ném object thường (`throw { statusCode }`), vì sẽ mất stack trace.
- **Transaction**: `await withTransaction(async (tx) => { ... }, pool)` (`config/db.js`). Helper tự commit, tự rollback và không để lỗi rollback che lỗi gốc.
- **Schema**: chỉ đổi qua file trong `database/migrations/` (`npm run migrate:new -- <mô tả>`). Code không tự chạy DDL.
- **Handler async**: bọc bằng `asyncHandler(async (req, res) => { ... })` (`utils/asyncHandler.js`), không viết `try { } catch (err) { next(err); }`. Lỗi ném ra tự tới `errorHandler`.
- **Validate input (code mới)**: `validateRequest({ body, query, params })` với zod schema (`middlewares/validateRequest.js`). Lỗi trả cùng dạng express-validator nên frontend không đổi. Route cũ dùng express-validator chuyển dần khi sửa tới.
- **Hỏi quyền trong service**: `hasPermission`, `scopeOf`, `isDeadlineBound` từ `permissions/authz.js`. Service, utils không được `require` `middlewares/` (ESLint chặn).
- **Log**: `const logger = require('.../config/logger')` rồi `logger.info/warn/error(...)` (cùng cách gọi như console). Không dùng `console.*` trong `src/`. Mức log: `LOG_LEVEL`.
- **Biến môi trường**: biến hạ tầng (DB, JWT, CORS, Redis...) khai báo kiểu và mặc định trong `config/env.js` và đọc qua `config`. Thiếu hoặc sai thì server báo lỗi lúc khởi động. Biến mới cũng khai báo ở đây và trong `.env.example`.

## Kiểm tra chất lượng

| Lệnh | Việc | CI |
|------|------|----|
| `npm run lint` | ESLint. Lỗi chặn merge; cảnh báo `max-lines` (file > 500 dòng) chỉ để theo dõi | ✓ |
| `npm run format` / `npm run format:check` | Prettier (`.prettierrc.json`) cho mọi file `.js`. Commit format hàng loạt nằm trong `.git-blame-ignore-revs` ở gốc repo (chạy 1 lần: `git config blame.ignoreRevsFile .git-blame-ignore-revs`) | ✓ |
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
