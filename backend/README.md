# Backend — RMS Hospital API

Node.js + Express REST API trên PostgreSQL 18. Tài liệu cho lập trình viên backend: cấu trúc, quy ước, cơ sở dữ liệu, phân quyền, bảo mật. Cài đặt và chạy: [README gốc](../README.md); triển khai production: [infra/cai-dat-may-ao-ubuntu.md](../infra/cai-dat-may-ao-ubuntu.md).

## Mục lục

- [Cấu trúc](#cấu-trúc)
- [Khuôn module](#khuôn-module)
- [Quy ước chung](#quy-ước-chung)
- [Kiểm tra chất lượng](#kiểm-tra-chất-lượng)
- [Cơ sở dữ liệu](#cơ-sở-dữ-liệu)
- [Phân quyền](#phân-quyền)
- [Xác thực & bảo mật](#xác-thực--bảo-mật)
- [Tác vụ nền, cache, log](#tác-vụ-nền-cache-log)

---

## Cấu trúc

```
database/
├── baseline/                 # schema ban đầu 00–04 (extension, bảng, ràng buộc + index, tối ưu, trigger)
├── migrations/               # thay đổi sau baseline — chạy tự động, mỗi file 1 lần, theo thứ tự tên
└── seed/                     # system-roles.json (quyền mặc định 9 vai trò hệ thống), catalogs.json (danh mục cơ bản)
scripts/                      # CLI: migrate, init-system, seed-catalogs, sync-permissions, pg-transfer, gen-jwt...
src/
├── server.js / cluster.js    # khởi động (dev: 1 tiến trình; production: cluster), tự chọn port trống
├── app.js                    # Express app: middleware, gắn route của từng module (thứ tự có ý nghĩa)
├── config/                   # env.js (kiểm tra biến môi trường), logger.js, db.js + db.pg.js (pool, transaction, helper SQL), redis, swagger, auditLogger
├── database/                 # migrator.js (bộ chạy migration), index.js (initDatabase lúc khởi động)
├── permissions/              # catalog quyền, phạm vi, authz.js, cache quyền + trạng thái tài khoản, đồng bộ — xem mục Phân quyền
├── middlewares/              # tầng HTTP: auth, errorHandler, validateRequest (zod), upload*, activityLogger
├── modules/<module>/         # mã nghiệp vụ (bảng dưới)
├── shared/                   # crudService, crudController — factory CRUD dùng chung
├── jobs/                     # cron job nền (gọi service của các module)
├── assets/                   # font, logo dùng khi xuất file / gửi mail
└── utils/                    # asyncHandler, httpError, paging, sqlFilters, cache, excel*, vnDate, idGenerator, dbErrors...
```

| Module | Route (`/api/v1/...`) | Nội dung |
|---|---|---|
| `auth` | `/auth` | đăng nhập, refresh token, 2FA, thiết bị tin cậy, quên mật khẩu, `sessionVersion` |
| `users` | `/users` | tài khoản người dùng |
| `access` | `/roles`, `/permissions` | vai trò, ma trận quyền, `privilegeGuard`, `roleCodes` |
| `persons` | `/persons` | hồ sơ người (gộp trùng, liên kết tài khoản) |
| `catalog` | gốc (gắn cuối cùng, cùng `access`, `rounds`) | danh mục: khoa, phản biện ngoài, lĩnh vực, cấp, loại đợt, danh mục đào tạo/CME, địa điểm, chức danh. Mỗi danh mục 1 file `<tên>.routes.js`, `catalog.routes.js` gom lại |
| `rounds` | `/research-rounds` | đợt nghiên cứu, mốc deadline |
| `topics` | `/topics`, `/files`, `/workflows` | đề tài, thành viên, tác giả, file nộp, workflow duyệt, nhập/xuất Excel |
| `councils` | `/councils` | hội đồng, phân công, tiến độ đánh giá |
| `seminars` | `/seminars` | hội nghị/hội thảo, người tham dự, xuất Excel |
| `cme` | `/cme-records` | hồ sơ CME, yêu cầu tín chỉ, báo cáo |
| `training/` | `/courses`, `/training-programs`, `/trainees`, `/exams`, `/lecturers` | thư mục con `courses` (mẫu khuôn module), `programs`, `trainees`, `exams`, `lecturers`, `reports`; `trainingFileService` dùng chung |
| `attendance` | `/staff-attendance` | chấm công, ca làm |
| `staffLicenses` | `/staff-licenses` | chứng chỉ hành nghề |
| `surveys` | `/surveys` | khảo sát |
| `forms` | `/form-configs` | cấu hình form động |
| `notifications` | `/notifications` | thông báo trong hệ thống, `mailService` |
| `events` | `/events` | SSE realtime (`eventService.broadcast`) |
| `settings` | `/system-settings` | cấu hình hệ thống |
| `audit` | `/activity-logs`, `/security-events` | nhật ký thao tác, sự kiện/cảnh báo bảo mật |
| `dashboard` | `/dashboard` | số liệu tổng hợp, báo cáo đào tạo |
| `portal` | `/me`, `/my-tasks` | dữ liệu "của tôi" (đọc chéo nhiều module) |
| `public` | `/public` | cổng công khai không cần đăng nhập |
| `system` | `/health`, `/csp-report`, `/excel`, `/modules` | route hạ tầng |

Danh sách endpoint đầy đủ: Swagger UI `http://localhost:3001/api-docs` (Basic Auth `SWAGGER_USER` / `SWAGGER_PASS`, tắt ở production trừ khi `SWAGGER_ENABLED=true`).

**Quan hệ giữa module**

- Tên file giữ dạng `xxxService.js` / `xxxController.js` để grep theo tên vẫn ra; file route đặt `<tên>.routes.js`.
- Module được `require` service của module khác. Hướng phụ thuộc: module tổng hợp (`portal`, `public`, `dashboard`) → module nghiệp vụ → lõi (`events`, `access`, `notifications`, `settings`, `persons`, `audit`). Không `require` vòng (`npm run check:deps`).
- Thêm module: tạo `src/modules/<tên>/`, gắn router trong `app.js` (kèm `requireModule(...)` nếu module bật/tắt được), khai báo quyền trong `permissions/` rồi chạy `npm run check:routes`.

## Khuôn module

Mẫu tham chiếu: `modules/training/courses/`. Module khác chuyển dần sang khuôn này khi có sửa đổi.

| File | Việc | Không được |
|---|---|---|
| `<tên>.routes.js` | đường dẫn, `authenticate` / `authorizePermission`, validate, gọi controller | logic, SQL, khối `@swagger` |
| `<tên>.docs.js` | tài liệu OpenAPI (`/** @swagger ... */`) cho route cùng tên — Swagger quét `modules/**/*.docs.js` | code |
| `<tên>Controller.js` | đọc `req`, gọi service, trả `success` / `created` / `sendWorkbook` | SQL, dựng ExcelJS (đưa vào `exports/` hoặc service xuất file) |
| `<mảng>Service.js` | quy tắc nghiệp vụ, transaction, `httpError`, `broadcast`, gọi service khác | đọc `req`/`res`, `require` `middlewares/` |
| `<tên>Policy.js` | kiểm tra phạm vi theo bản ghi (chống IDOR), dùng qua `router.param` | quy tắc nghiệp vụ khác |
| `<mảng>Repository.js` | SQL, trả dữ liệu thuần (mảng, object, số, `null`) | `httpError`, `broadcast`, quy tắc nghiệp vụ |

- **Một service cho mỗi mảng nghiệp vụ**, không dồn cả module vào một file (`courses/` có `courseService`, `courseEnrollmentService`, `classSessionService`, `gradeService`, `certificateService`...). Đặt tiền tố khi dễ trùng tên với module khác.
- **Repository**: mẫu là `certificateRepository.js`. Service gọi `repo.xxx(...)` (không destructure) để test thay được từng hàm — xem `test/training/certificateService.test.js` (test nghiệp vụ không cần DB).
- **Khi tách/chuyển code**: `npm run test:contract` (route và quyền không đổi), `npm run check:requires`, `npm run test:smoke` (so với baseline ghi trước khi sửa).

## Quy ước chung

- **Lỗi nghiệp vụ**: `throw httpError(404, 'Không tìm thấy...')`, `badRequest(...)` (`utils/httpError.js`). Không ném object thường (`throw { statusCode }`) — mất stack trace.
- **Handler async**: bọc `asyncHandler(async (req, res) => { ... })`, không viết `try { } catch (err) { next(err) }`.
- **Validate input (code mới)**: `validateRequest({ body, query, params })` với zod schema. Lỗi trả cùng dạng express-validator nên frontend không đổi. Route cũ dùng express-validator chuyển dần khi sửa tới.
- **Response**: `{ "success": true, "message": "...", "data": {} }`. Query danh sách chung: `page` (mặc định 1), `limit` (20), `search` cùng bộ lọc riêng (`department_id`, `round_id`, `status`...).
- **Hỏi quyền trong service**: `hasPermission`, `scopeOf`, `isDeadlineBound` từ `permissions/authz.js`. Service, utils không `require` `middlewares/` (ESLint chặn).
- **Log**: `const logger = require('.../config/logger')`, gọi `logger.info/warn/error(...)`. Không dùng `console.*` trong `src/`. Mức log: `LOG_LEVEL`.
- **Biến môi trường**: biến hạ tầng (DB, JWT, CORS, Redis...) khai báo kiểu + mặc định trong `config/env.js`, đọc qua `config`; thiếu/sai thì server báo lỗi lúc khởi động. Biến mới khai báo ở đây và trong `.env.example`.
- **Upload**: route upload mới dùng middleware có sẵn (`upload`, `uploadImage`, `uploadTraining`, `uploadExcel`), không tự khai `multer` — xem [Bảo mật upload](#bảo-mật-upload).
- **Danh tính (`persons`)**: đường ghi mới vào 6 bảng `users`, `trainees`, `lecturers`, `external_reviewers`, `topic_members`, `seminar_participants` phải gọi `personService.syncPerson(source, id, { actorId })` sau khi ghi thành công (`syncPersons` khi import hàng loạt) — xem [Ghi chú nghiệp vụ](#ghi-chú-nghiệp-vụ).

## Kiểm tra chất lượng

| Lệnh | Việc | CI |
|------|------|----|
| `npm run lint` | ESLint. Lỗi chặn merge; cảnh báo `max-lines` (file > 500 dòng) chỉ để theo dõi | ✓ |
| `npm run format` / `format:check` | Prettier (`.prettierrc.json`). Commit format hàng loạt nằm trong `.git-blame-ignore-revs` (chạy 1 lần: `git config blame.ignoreRevsFile .git-blame-ignore-revs`) | ✓ |
| `npm test` | Unit test, không cần DB (`test/**`) | ✓ |
| `npm run test:contract` | So route + quyền với `test/contract/routes.snapshot.txt`. Đổi có chủ đích: `UPDATE_SNAPSHOTS=1 npm run test:contract` rồi commit snapshot | ✓ |
| `npm run test:pg` | Test tích hợp với PostgreSQL thật (`test-integration-pg/`, mặc định `rms_app@127.0.0.1/rms_hospital`, đổi bằng `PG_TEST_*`). Tự rollback | ✓ |
| `npm run test:smoke` | Gọi thật mọi API GET vào DB đang cấu hình (chỉ đọc), so mã HTTP + tập trường JSON với baseline của máy này (`test-integration/.baseline/`, không commit) | — |
| `npm run typecheck` | `tsc` kiểm tra mọi file JS trong `src/` (`checkJs`, không strict). Không dùng `// @ts-nocheck` (test ratchet chặn); kiểu khó suy thì chú thích JSDoc. Kiểu `req.user`/`req.valid`: `src/types/express.d.ts` | ✓ |
| `npm run check:routes` | Mọi route khai báo quyền hoặc có lý do trong `permissions/routePolicy.js` (`-- --list`: bảng route + quyền) | ✓ |
| `npm run check:requires` | Nạp mọi file `src/`, báo `require` sai đường dẫn (kể cả trong thân hàm) | ✓ |
| `npm run check:deps` | Hướng phụ thuộc (`scripts/check-deps.js`): không vòng `require`; lõi không phụ thuộc module nghiệp vụ; chỉ module tổng hợp dùng module tổng hợp; hạ tầng (`config`, `utils`, `middlewares`, `permissions`, `shared`, `database`) chỉ dùng lõi; 2 module không phụ thuộc 2 chiều ở tầng service | ✓ |

Checklist khi mở PR: `.github/pull_request_template.md`. Khi refactor: ghi baseline smoke trước (`UPDATE_SNAPSHOTS=1`), sau mỗi bước chạy lại để so. Backend chạy trong Docker thì gọi qua container: `docker exec hospital_rms_dev-backend-1 npm run test:smoke`.

---

## Cơ sở dữ liệu

PostgreSQL 18, DB `rms_hospital`, pool tối đa `DB_POOL_MAX` (10) kết nối mỗi worker. Schema = `database/baseline/` + `database/migrations/`; code ứng dụng không tự chạy DDL. Hệ thống chạy SQL Server tới commit `dd0f62e`; dữ liệu cũ chuyển 1 lần theo [infra/chuyen-du-lieu-sang-postgresql.md](../infra/chuyen-du-lieu-sang-postgresql.md).

Hai role: `rms_migrate` (chủ DB, chạy migration / backup) và `rms_app` (ứng dụng, chỉ đọc/ghi dữ liệu, `statement_timeout 60s`). Không dùng `postgres` cho ứng dụng — server cảnh báo khi khởi động.

### Lệnh migration

Chạy trong thư mục `backend` (dev chạy Docker: gõ `npm run migrate -- <lệnh con>` ở thư mục gốc, lệnh chạy trong container `backend` đang chạy). `npm run migrate help` in danh sách.

| Lệnh | Việc |
|------|------|
| `npm run migrate` | Chạy các file chưa chạy (deploy gọi lệnh này) |
| `npm run migrate status` | `✓` đã chạy, `·` chờ chạy, `!` đã sửa sau khi chạy. Không ghi gì vào DB |
| `npm run migrate new <mô tả>` | Tạo file mới từ mẫu, tên đúng quy ước, luôn xếp cuối |
| `npm run migrate init` | DB trống: chạy baseline `00–04`, tạo bảng theo dõi rồi chạy hết `migrations/` |
| `npm run migrate baseline` | **1 lần** trên DB đã nâng cấp tay: đánh dấu mọi file hiện có là đã chạy |
| `npm run init:system` | Tạo 9 vai trò hệ thống (`database/seed/system-roles.json`) + tài khoản `superadmin` / `admin`, in mật khẩu tạm 1 lần. `--reset-admin` cấp lại mật khẩu tạm. Chạy lại an toàn |
| `npm run seed:catalogs` | Nạp danh mục cơ bản (`database/seed/catalogs.json`) vào bảng còn trống |
| `npm run pg:transfer restore\|precheck\|load\|verify` | Chuyển dữ liệu 1 lần từ SQL Server sang DB PG rỗng |

Cờ cũ vẫn dùng được: `--dry-run` (= `status`), `--baseline`, `--init`.

Lúc khởi động, server tự chạy migration khi `DB_AUTO_MIGRATE=true` (mặc định bật ngoài production, tắt ở production). Ở production, `scripts/deploy.sh` backup DB (`pg_dump`) rồi chạy migration bằng `rms_migrate` trước khi đổi container. Còn file chưa chạy thì server chỉ cảnh báo; riêng khi thiếu cột bắt buộc của phân quyền/đăng nhập thì server **dừng** (xem [Kiểm tra lúc khởi động](#kiểm-tra-lúc-khởi-động)).

**Cách hoạt động** (`src/database/migrator.js`, `migrator.pg.js`):

- Bảng `schema_migrations` lưu `filename`, `applied_at`, `git_sha`, `checksum` (SHA-256 nội dung file).
- Mỗi file chạy trong 1 transaction cùng bản ghi của nó — hỏng giữa chừng không để lại gì. Lệnh không chạy được trong transaction (`CREATE INDEX CONCURRENTLY`): thêm dòng `-- @no-transaction`.
- `pg_advisory_lock` đảm bảo chỉ 1 tiến trình chạy migration tại một thời điểm (cluster, nhiều container).
- `MIGRATION_BACKUP_DIR`: có file mới thì `pg_dump -Fc` vào thư mục này trước khi chạy (cần `pg_dump` trên máy chạy lệnh; image Docker không có nên `deploy.sh` tự backup trên host).
- **File gộp**: nhiều migration cũ nối nguyên văn, mỗi phần mở đầu bằng `-- @migration <tên file cũ>.sql`. DB đã chạy một phần thì chỉ chạy phần còn thiếu; `status` hiện `x/y phần đã chạy`.

### Quy ước viết migration

1. **Tên file** `YYYY-MM-DD_mo_ta_ngan.sql` — dùng `npm run migrate new <mô tả>`.
2. **Idempotent**: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP ... IF EXISTS`, `INSERT ... ON CONFLICT DO NOTHING` cho danh mục.
3. **Không sửa file đã chạy** ở bất kỳ môi trường nào — viết file mới (`status` đánh dấu `!` file bị sửa).
4. **Tương thích ngược**: deploy lỗi thì `deploy.sh` quay lại image cũ nhưng **không** hoàn tác schema. Chỉ thêm bảng/cột/index; xoá hoặc đổi tên để bản phát hành sau, khi code cũ không còn dùng.
5. Cột mới mà code cần ngay lúc khởi động (đăng nhập, phân quyền): thêm vào `REQUIRED_COLUMNS` trong `src/permissions/index.js`.
6. **Bảng mới** có đủ cột audit: `created_at`, `created_by`, `updated_at timestamp NULL`, `updated_by varchar(20) NULL`. `UPDATE` trong code ghi `updated_at = ${nowSql}, updated_by = @actor_id`. Bảng mới nhiều dòng (chi tiết bài thi, nhật ký...) dùng khoá `bigint GENERATED ... AS IDENTITY` thay mã chuỗi.
7. **Không viết stored procedure** cho logic nghiệp vụ — viết bằng JS. Trigger chỉ cho audit / ràng buộc dữ liệu (`baseline/04_trigger.sql`).
8. Không đưa mật khẩu, chuỗi kết nối, dữ liệu cá nhân vào file. Mọi `*.sql` ngoài `database/` và `infra/postgresql/` bị `.gitignore` loại.

Chạy tay khi không dùng được runner: `psql -h 127.0.0.1 -U rms_migrate -d rms_hospital -v ON_ERROR_STOP=1 -1 -f <file>.sql`, rồi chạy `npm run migrate` để ghi `schema_migrations` (file idempotent nên chạy lại không sao).

### Viết SQL

Truy vấn đi qua adapter `config/db.js` (`db.pg.js`); tham số đặt tên `@ten`. Các quy ước giữ từ thời SQL Server, dễ sai nhất:

- **Giờ**: DB lưu **giờ VN** trong cột `timestamp` (không múi giờ); JS nhận `Date` như thể giờ đó là UTC (`pgParams.js`). Dùng `${nowSql}` / `${vnTodaySql}` / `${utcNowSql}`, **không** `CURRENT_TIMESTAMP` / `now()` (PG trả `timestamptz`, đọc lệch 7 giờ). Ngày giờ hiển thị: `utils/vnDate.js`.
- **Không phân biệt hoa/thường**: cột định danh người dùng gõ vào (`username`, `email`, `staff_number`, mã danh mục) dùng collation `rms_ci` — `=`, `UNIQUE`, `IN` tự không phân biệt hoa/thường. Không dùng `citext`. Tìm kiếm: `${ilike('u.full_name', '@search')}`, cột `rms_ci`: `${likeCi('u.username', '@search')}`. Cột tên tiếng Việt có `COLLATE "vi-VN-x-icu"` để `ORDER BY` đúng thứ tự.
- **Helper thay cú pháp riêng**: `insertReturning` / `updateReturning` / `deleteReturning`, `upsert({ table, key, values, update })` (khoá xung đột phải có `UNIQUE`; cột được NULL dùng `NULLS NOT DISTINCT`), `jsonArray(...)`, `stringAgg`, `dateAdd`, `dateDiff`, `formatDate`, `datePart`, `strLen`, `crossApply`.
- **Lỗi trong transaction**: sau 1 lỗi bất kỳ transaction PG bị huỷ, mọi câu sau đều lỗi. Không bắt lỗi trùng khoá rồi chạy tiếp trong cùng transaction — dùng `INSERT ... ON CONFLICT` / `WHERE NOT EXISTS` + `rowsAffected`, hoặc `SAVEPOINT`.
- **Mã lỗi DB**: `utils/dbErrors.js` (`isUniqueViolation`, `isForeignKeyViolation`, `constraintName`...), không so `err.code` tại chỗ.
- **Sinh mã** (đề tài, người dùng, khoá học...): `utils/idGenerator.js` (khoá dải mã bằng `lockResource`). Khoá theo tên khác: `lockResource(tx, 'x', timeoutMs)`.
- `jsonb` được trả về dạng **chuỗi** nguyên văn (code tự `JSON.parse`). Ghi hàng loạt (nộp bài thi, import): 1 câu `INSERT ... SELECT * FROM unnest(...)` hoặc `COPY`, không chèn từng dòng.
- **Transaction**: `await withTransaction(async (tx) => { ... }, pool)` — tự commit, tự rollback, không để lỗi rollback che lỗi gốc.
- **Audit người sửa**: trigger audit đọc `app.current_user_id`. Đặt qua `withActor(tx, actorId)` / `withActorTransaction` / `actorRequest`, không tự viết `set_config` trong SQL.

### Ghi chú nghiệp vụ

- **Trạng thái đề tài**: `approvals.status` có thể lệch `topics.status`; giao diện luôn theo `topics.status`. Trong `approvals`, `created_*` là lúc nộp, `updated_*` là lúc duyệt. Không có workflow nào bật thì dùng luồng duyệt 1 bước `topicApprovalService.approve`.
- **Danh tính hợp nhất (`persons`)**: mỗi bảng trong 6 bảng người có cột `person_id`. Bảng nguồn vẫn là dữ liệu gốc; `syncPerson` không bao giờ ném lỗi nên không chặn thao tác. Thứ tự ghép: `user_id` → CCCD → `staff_number` + tên → email + tên → SĐT chuẩn hoá + tên → tên + ngày sinh, mỗi quy tắc chỉ áp dụng khi khớp đúng 1 person. Trùng **tên** đơn thuần không tự gộp mà vào hàng đợi `person_merge_candidates` (duyệt ở `/admin/person-merge`). Gộp ghi `person_merge_log` đủ để khôi phục tay; không gộp được 2 hồ sơ đều có tài khoản. `PERSON_DUAL_WRITE=false` để tắt khẩn cấp.

### Tăng trưởng dữ liệu

Quy mô ~1.900 tài khoản: sau 5–10 năm bảng lớn nhất cỡ vài triệu dòng, 1 máy PostgreSQL xử lý tốt nếu index đúng và dọn dữ liệu cũ đúng hạn. Đã có: index cho khoá ngoại quan trọng, GIN `pg_trgm` cho cột tìm kiếm, partial index (`baseline/03_toi_uu.sql`), `security_events` partition theo tháng, các job dọn dữ liệu (bảng dưới). Bảng không xoá: `staff_attendance`, `exam_answers`, `survey_answers`, `attendance`, lịch sử/kiểm toán. Activity log ghi ra **file**, không vào DB.

Việc còn lại, làm khi số liệu thật cho thấy cần:

- [ ] Tách `notifications` thành `notification_messages` (1 dòng/lượt gửi) + `notification_recipients` (1 dòng nhỏ/người nhận, partial index `WHERE NOT is_read`). Hiện mỗi người nhận 1 dòng chép nguyên tiêu đề + nội dung — gửi cả viện ≈ 1.900 dòng.
- [ ] Phân trang keyset (`WHERE (created_at, id) < ($1, $2) ORDER BY created_at DESC, id DESC`) cho danh sách dài chỉ ghi thêm (thông báo, lịch sử chấm công); bỏ `COUNT(*)` toàn bảng ở trang thông báo.
- [ ] `BRIN (work_date)` cho `staff_attendance` nếu báo cáo theo năm chậm; partition theo năm khi vượt ~10 triệu dòng.
- [ ] Báo cáo nhiều năm chậm: bảng tổng hợp / materialized view làm mới bằng job đêm.
- [ ] Hằng tháng rà `pg_stat_statements` (truy vấn chậm nhất) và `pg_stat_user_indexes` (`idx_scan = 0` sau 1 tháng là ứng viên bỏ). Tìm không dấu ("nguyen" khớp "Nguyễn") cần `unaccent` — chưa bật.

---

## Phân quyền

Mỗi tài khoản có **một vai trò**; vai trò có tập **lượt cấp quyền** `resource:action`, mỗi lượt cấp có thể kèm **phạm vi dữ liệu**. Code nằm ở `src/permissions/`.

| Khái niệm | Ở đâu | Ghi chú |
|---|---|---|
| Danh mục quyền | `catalog.js` (gom `catalogBusiness.js`, `catalogAdmin.js`) | Nguồn duy nhất. Server đồng bộ vào bảng `permissions` lúc khởi động (`sync.js`): thêm quyền mới, cập nhật tên/nhóm, không xoá. Dùng quyền không có trong catalog bị cảnh báo |
| Phạm vi dữ liệu | `scopes.js`, cột `role_permissions.scope` | `topics`: own / department / all · `users`: department / all · `courses`: assigned / all · `staff_attendance`: department / all. Resource khác: `NULL` |
| Superuser | cột `roles.is_superuser` | Không phải quyền trong danh mục, không cấp được qua giao diện. Trong code hiện là key `system:manage` |
| Vai trò hệ thống | `roles.is_system`, `roles.code` | 9 vai trò gốc, không xoá được. Code tham chiếu qua mã (`modules/access/roleCodes.js`: `superadmin`, `admin`, `member`, `trainee`, `dept_head`...), không dùng id `VT0x` |
| Chống leo thang | `modules/access/privilegeGuard.js` | Chỉ cấp / gán / sửa được thứ không vượt quyền (và phạm vi) của chính mình |
| Phiên đăng nhập | `users.token_version`, `modules/auth/sessionVersion.js` | Tăng version ⇒ mọi access token cũ bị từ chối ngay (reset mật khẩu, đăng xuất mọi thiết bị, tự đổi mật khẩu) |
| Cache | `permissionCache` | Quyền + trạng thái tài khoản cache trong RAM từng instance; lệnh xoá phát qua Redis pub/sub (`utils/cacheBus.js`). Redis lỗi thì hết hạn theo TTL |

Quy tắc: **có đúng quyền mới được** (`manage` không phải wildcard, chỉ là tên một quyền cụ thể, vd `roles:manage`), superuser được hết. Frontend dùng cùng quy tắc (`frontend/src/shared/utils/permissions.ts`) nhưng chỉ để ẩn/hiện; backend luôn tự kiểm tra.

**Hai vai trò quản trị**: `superadmin` (VT01) là superuser — toàn quyền. `admin` (VT09) **không** phải superuser — toàn bộ quyền NCKH, hội thảo / CME, đào tạo, quản lý người dùng và các quyền chỉ xem cần cho việc đó; không phân quyền, không sửa cấu hình hệ thống, không xem nhật ký, quy trình duyệt, cấu hình form, khảo sát. `privilegeGuard` chặn Admin gán vai trò vượt quyền mình; `test/permissions/routeMatrix.test.js` giữ ranh giới này.

Quyền mặc định của 9 vai trò hệ thống: `database/seed/system-roles.json` — `init:system` dùng để tạo vai trò trên DB mới, test ma trận vai trò × route đọc nó (không đọc DB). Đổi quyền vai trò hệ thống có chủ đích: sửa file này và bảng `EXPECT` trong cùng commit. DB đang chạy không tự đổi theo: sửa ở màn Phân quyền (`/admin/roles`).

### Việc thường gặp

**Thêm quyền mới**

1. Thêm `p('PERM-XXX-ACTION', 'action', 'Tên hiển thị', 'Mô tả')` vào đúng resource trong `catalogBusiness.js` (nghiệp vụ) hoặc `catalogAdmin.js` (quản trị). Id cố định, tên không trùng (cột `name` UNIQUE).
2. Tách từ quyền cũ ⇒ thêm `seedFrom: ['resource:action']` để vai trò đang có quyền cũ được cấp sẵn quyền mới (chỉ ở lần tạo).
3. `npm run gen:perm-types` sinh lại kiểu `PermissionKey` cho frontend (`frontend/src/shared/types/permissions.generated.ts`).
4. Dùng ở route: `authorizePermission(['resource', 'action'])`.
5. `npm test`, rồi cập nhật `EXPECT` trong `test/permissions/routeMatrix.test.js` nếu quyền đó đổi ai được làm gì.

**Thêm route**: gắn `authorizePermission(...)`. Route cố ý chỉ cần đăng nhập hoặc công khai thì khai báo kèm lý do trong `routePolicy.js`. Thiếu thì `check:routes` và `npm test` báo lỗi.

**Lọc theo phạm vi**: `scopeOf(req.user, 'topics')` trả `'own' | 'department' | 'all'` (null = không có quyền). Ví dụ `topicService.getAll`, `userController.isDeptScoped`, `courseService` (`'assigned'`). Kiểm tra GHI và chốt chặn leo thang dùng `permissions/actionScope.js`: `effectiveScope(user, resource, action)` = hẹp hơn giữa phạm vi lượt cấp `resource:action` và phạm vi xem; `departmentLimit(user, resource, action)` trả `null` (mọi khoa) | `department_id` | `false` (bị giới hạn theo khoa mà chưa có khoa ⇒ fail-closed).

**Tham chiếu vai trò trong code**: `roleIdOf(ROLE.TRAINEE)` / `inputRoleId(request, 'trainee_role', ROLE.TRAINEE)` rồi dùng `@trainee_role` trong SQL. **Thu hồi phiên** một tài khoản: `bumpTokenVersion(userId)`.

```bash
npm test                                  # danh mục, quy tắc quyền/phạm vi, chống leo thang, ma trận vai trò × route
npm run check:routes -- --list            # bảng mọi route và quyền của nó
npm run sync:permissions -- --dry-run     # xem trước đồng bộ catalog → bảng permissions
```

### Kiểm tra theo bản ghi (chống IDOR)

`authorizePermission` chỉ biết người gọi **có** quyền `resource:action`, không biết bản ghi cụ thể có thuộc phạm vi của họ không. API nhận mã đối tượng (`:id`, danh sách mã trong body) phải kiểm tra thêm:

- Đề tài: `topicService.assertTopicInScope` / `idsInScope` — `topics.routes.js` gắn qua `router.param('id' | 'topic_id')`, route mới trong router này tự được kiểm tra.
- Khoá học: `courseService.assertCourseInScope` / `assertCourseChildInScope` — gắn qua `router.param` cho `:id` và mã con (`sessionId`, `enrollmentId`, `docId`, `gradeId`, `certId`, `linkId`, `assignmentId`). **Route mới dùng tham số mã con khác phải thêm vào `CHILD_COURSE_SQL`** (có test tự phát hiện).
- Người dùng: `privilegeGuard.assertCanManageUser`; phạm vi khoa không chuyển được tài khoản sang khoa khác.
- Cổng hội đồng: kiểm tra ghế **trước** khi multer ghi file. Tiến trình duyệt (`/workflows/status`): đề tài phải trong phạm vi.
- Danh sách mã trong body (xuất dữ liệu, duyệt hàng loạt) không đi qua `router.param` — tự lọc / kiểm tra từng mã.
- Tài nguyên không có phạm vi (học viên, hội thảo, hội đồng, giảng viên, CME, chương trình đào tạo) là toàn viện theo thiết kế; muốn giới hạn theo khoa thì thêm vào `scopes.js` rồi áp dụng như trên.
- Test mẫu: `test/permissions/topicObjectAccess.test.js`, `courseObjectAccess.test.js`.

### Kiểm tra lúc khởi động

`database/index.js` chạy migration (nếu `DB_AUTO_MIGRATE`), rồi `permissions/index.js`:

1. Kiểm tra đủ cột (`REQUIRED_COLUMNS`: `role_permissions.scope`, `users.token_version`, `roles.code` / `is_system` / `is_superuser`, cột 2FA / refresh token...) và không còn quyền kiểu cũ (`read_all`, `read_department`, `read_assigned`, `system:manage`), trong 1 truy vấn. **Thiếu thì server dừng** (exit 1) và liệt kê từng mục kèm file SQL cần chạy (`2026-09-28_00_permission_scopes.sql`, `2026-09-28_01_token_version_role_codes.sql`...).
2. Đồng bộ `catalog.js` vào bảng `permissions`.
3. Không kết nối được CSDL thì chỉ cảnh báo, server vẫn chạy.

---

## Xác thực & bảo mật

- **JWT**: access token 15 phút (`JWT_EXPIRES_IN`, frontend giữ) + refresh token 7 ngày (30 ngày nếu "Ghi nhớ đăng nhập") trong **cookie HttpOnly** `rms_rt` (`SameSite=Strict`, `Path=/api/v1/auth`, `Secure` ở production — `utils/authCookie.js`). Frontend tự làm mới khi gặp `401`.
  - **Xoay refresh token có phát hiện dùng lại**: mỗi lần làm mới, token cũ bị `revoked_at`, token mới cùng `family_id`. Token đã thu hồi bị dùng lại sau 30 giây ⇒ coi như bị đánh cắp: xoá cả họ token, tăng `token_version`, ghi sự kiện `refresh_token_reuse`.
  - **Khoá riêng theo mục đích** (`utils/keys.js`): access token, pre-auth 2FA, vé SSE, captcha, QR điểm danh, link `/uploads` ký bằng khoá dẫn xuất (HKDF) khác nhau từ `JWT_SECRET`, kèm `iss`/`aud` — loại này không dùng thay loại kia được.
- **2FA TOTP** (tuỳ chọn từng người):
  - Secret lưu **mã hoá AES-256-GCM** (`utils/secretBox.js`), khoá ngoài DB: `TOTP_ENC_KEY` hoặc file `secrets/totp.key` tự sinh, **không** đổi khi xoay JWT secret.
  - Chống dùng lại mã (`users.totp_last_step`); 10 **mã khôi phục** dùng 1 lần (`user_backup_codes`, lưu HMAC); pre-auth token chỉ đổi được 1 phiên.
  - **Bắt buộc với tài khoản quản trị** (`permissions/twoFactorPolicy.js`: superuser hoặc vai trò có quyền `critical`). Thuộc diện lần đầu có 14 ngày (`TWOFA_GRACE_DAYS`); quá hạn thì API trả `403 TWO_FACTOR_REQUIRED`, giao diện chuyển `/bat-2fa`. Tắt: `REQUIRE_2FA_FOR_ADMINS=false`.
- **Chống dò mật khẩu**: rate-limit đăng nhập đếm trên Redis (Redis lỗi thì đếm trong bộ nhớ — `utils/rateLimit.js`), tạm khoá tài khoản sau nhiều lần sai, ghi sự kiện bảo mật (`/security-events`).
- **Cổng công khai**: tra cứu kết quả học tập cần **CCCD + ngày sinh**, giới hạn theo IP và theo từng số CCCD (5 lần/giờ). Đăng ký khoá học với CCCD đã có hồ sơ phải khớp ngày sinh. Chống bot: proof-of-work tự giải ngầm (mặc định, `CAPTCHA_POW_BITS` + thời gian điền form tối thiểu), hoặc **Cloudflare Turnstile** (`TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY`, được ưu tiên), hoặc **reCAPTCHA v2** (`RECAPTCHA_SITE_KEY` + `RECAPTCHA_SECRET_KEY`); mỗi mã dùng 1 lần.
- **SSE**: `GET /events?ticket=<vé>` — vé 60 giây, dùng 1 lần, xin qua `POST /events/ticket` (không đưa access token lên URL vì URL bị ghi vào access log).
- **Cảnh báo bảo mật qua email**: `securityEventService.log` tự gọi `securityAlertService.notify`. Gửi ngay khi: refresh token bị dùng lại, chặn file mã độc, đổi / sao chép phân quyền vai trò, tắt 2FA, thu hồi thiết bị quen, quản trị đặt lại mật khẩu. Gửi khi dồn dập: ≥5 tài khoản bị khoá hoặc ≥10 lần sai mã 2FA trong 15 phút. Mỗi loại tối đa 1 email / 30 phút. Người nhận: `ALERT_EMAILS`, không đặt thì mọi superuser có email. Cần `MAIL_ENABLED`.

### Bảo mật upload

Mọi route upload dùng middleware trong `src/middlewares/` (`upload`, `uploadImage`, `uploadTraining`, `uploadExcel`), đều bọc bởi `secureUpload`. Mỗi file qua các lớp:

1. **Đuôi file** do admin chọn ở *Cấu hình hệ thống → Tải lên* (`UPLOAD_ALLOWED_EXTENSIONS`, mặc định PDF/Word/Excel/PowerPoint/RAR/ZIP), chỉ trong tập an toàn `fileTypeAllowlist.js` (`utils/uploadPolicy.js`); ảnh nhận xét chỉ PNG/JPEG/GIF/WEBP; import chỉ `.xlsx`.
2. **Dung lượng**: `UPLOAD_MAX_MB` (mặc định 50) cho mọi tài liệu kể cả cổng công khai; video bài giảng `TRAINING_MEDIA_MAX_MB` (300); Excel 10 MB.
3. **Nội dung khớp đuôi** (magic bytes, `utils/fileSignature.js`) — file đổi đuôi bị từ chối và xoá ngay.
4. **Quét virus** bằng ClamAV khi đặt `CLAMAV_HOST` (`utils/clamav.js`). File nhiễm bị xoá, ghi sự kiện `upload_malware_blocked`. ClamAV lỗi thì từ chối upload, trừ khi `CLAMAV_FAIL_OPEN=true`. File lớn hơn `CLAMAV_MAX_MB` (25) không quét.
5. **Hạn mức/ngày** mỗi tài khoản `UPLOAD_DAILY_QUOTA_MB` (2048; `0` = không giới hạn).

Tải về (`/uploads`, link ký HMAC có hạn — `UPLOAD_URL_SECRET`, `UPLOAD_URL_TTL_SEC`; đổi secret thì link cũ mất hiệu lực): chỉ ảnh, PDF, video, audio mở trên trình duyệt, còn lại luôn tải xuống; mọi file trừ PDF kèm `Content-Security-Policy: sandbox`.

**Dữ liệu nhạy cảm**: báo cáo do script import sinh ra (`*_CHUA_MAT_KHAU.csv`, `staff_license_import_unmatched.csv`) chứa thông tin cá nhân hoặc mật khẩu tạm, đã `.gitignore`. **Không bao giờ commit các file này.**

---

## Tác vụ nền, cache, log

**Job nền** (`src/jobs/index.js`, múi giờ `CRON_TZ`, mặc định `Asia/Ho_Chi_Minh`). Mỗi worker đều lên lịch nhưng nhờ `markOnce` mỗi việc chỉ chạy 1 lần. `JOBS_ENABLED=false` để tắt (test, instance phụ). Không dùng job trong DB.

| Giờ | Job | Việc |
|---|---|---|
| 00:15 | `supplementDeadlineJob` | Đề tài "Yêu cầu bổ sung" quá **mốc bổ sung muộn nhất** của đợt ⇒ **tự từ chối** qua đúng luồng duyệt (`topicApprovalService.approve`), ghi theo người đã yêu cầu bổ sung. Bỏ qua (ghi log, xử lý tay) đề tài được yêu cầu bổ sung sau khi mốc đã qua hoặc không rõ người yêu cầu |
| 01:00 | `accountMaintenanceJob` | Khoá tài khoản hết hạn, dọn refresh token và mã OTP quên mật khẩu hết hạn, nhắc đổi mật khẩu cũ |
| 02:00 | `deadlineReminderJob` | Nhắc deadline sắp tới / quá hạn (thông báo + email) |
| 03:00 | `personLinkJob` | Gắn `person_id` còn thiếu |
| 04:00 | `notificationCleanupJob` | Xoá thông báo **đã đọc > 90 ngày**, **chưa đọc > 180 ngày**, theo lô 2000 dòng |
| 04:30 | `dataRetentionJob` | Tạo trước partition tháng của `security_events`, bỏ partition cũ hơn `SECURITY_EVENTS_RETENTION_MONTHS` (mặc định 24, tối thiểu 12, `0` = không xoá); xoá dòng `job_execution_log` > 180 ngày của job khoá theo ngày. Không xoá khoá "đã làm việc X cho bản ghi Y" (nhắc mật khẩu, nhắc deadline, tự từ chối bổ sung) để job không gửi lại |

**Redis**: cache-aside cho số liệu dashboard và danh mục, fail-open (mất Redis thì đọc thẳng DB); dùng chung cho rate-limit và pub/sub xoá cache quyền.

**Log**:

- Pino ghi file JSON xoay theo ngày `LOG_DIR/audit-*.log` (mặc định `backend/logs/`), giữ `LOG_RETENTION_FILES` file. `LOG_STDOUT=1` để ghi ra stdout.
- `activityLogger` ghi request, lọc theo `AUDIT_LOG_METHODS`. Trang **Nhật ký hoạt động** (`/admin/activity-logs`) đọc thẳng từ file log.
- Docker dev có Promtail đọc `backend/logs` đẩy vào Loki (`http://localhost:3100`): `docker compose --profile logs up -d`.
