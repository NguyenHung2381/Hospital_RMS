# Cơ sở dữ liệu (PostgreSQL 18)

```
database/
├── baseline/     # schema ban đầu 00 → 04 (extension, bảng, ràng buộc + index, tối ưu, trigger)
└── migrations/   # thay đổi schema/dữ liệu sau baseline — chạy TỰ ĐỘNG, mỗi file 1 lần, theo thứ tự tên
```

Schema = `baseline/` + `migrations/`. Code ứng dụng không tự viết DDL. Cài PostgreSQL: `infra/cai-dat-postgresql.md`.

Hệ thống chạy SQL Server tới commit `dd0f62e`. Lịch sử chuyển DB: `POSTGRESQL_MIGRATION_PLAN.md`; chuyển dữ liệu từ file backup SQL Server: `infra/chuyen-du-lieu-sang-postgresql.md`.

## Lệnh

Chạy trong thư mục `backend`. Chỉ có một lệnh `npm run migrate`, việc cần làm chọn bằng lệnh con (`npm run migrate help` in danh sách):

| Lệnh | Việc |
|------|------|
| `npm run migrate` | Chạy các file chưa chạy (deploy gọi lệnh này) |
| `npm run migrate status` | Trạng thái từng file: `✓` đã chạy, `·` chờ chạy, `!` đã sửa sau khi chạy. Không ghi gì vào DB |
| `npm run migrate new <mô tả>` | Tạo file mới từ mẫu, tên đã đúng quy ước |
| `npm run migrate baseline` | **1 lần** trên DB đã nâng cấp tay: đánh dấu mọi file hiện có là đã chạy |
| `npm run migrate init` | DB trống: chạy baseline `00–04`, tạo bảng theo dõi rồi chạy hết `migrations/` |
| `npm run pg:transfer restore\|precheck\|load\|verify` | Chuyển dữ liệu 1 lần từ SQL Server (thường dựng từ file `.bak` bằng `scripts/pg-transfer/transfer-from-bak.sh`) sang DB PG rỗng. Xem `infra/chuyen-du-lieu-sang-postgresql.md` |
| `npm run test:pg` | Test tích hợp với PostgreSQL thật (`test-integration-pg/`, biến `PG_TEST_*`); CI chạy ở job `backend-postgres` |

Cờ cũ vẫn dùng được: `--dry-run` (= `status`), `--baseline`, `--init`.

Lúc khởi động, server tự chạy migration khi `DB_AUTO_MIGRATE=true`. Mặc định biến này bật ngoài production và tắt ở production. Ở production, `scripts/deploy.sh` backup DB (`pg_dump`) rồi chạy `node scripts/migrate.js` bằng role `rms_migrate`, trước khi đổi container. Nếu có file chưa chạy, server chỉ cảnh báo. Riêng khi thiếu cột bắt buộc của phân quyền/đăng nhập (`permissions/index.js`), server **dừng**.

## Cách hoạt động (`src/database/migrator.js`, `migrator.pg.js`)

- Bảng `schema_migrations` lưu `filename`, `applied_at`, `git_sha`, `checksum` (SHA-256 nội dung file).
- Mỗi file chạy trong 1 transaction cùng bản ghi của nó. File có lệnh không chạy được trong transaction (`CREATE INDEX CONCURRENTLY`) thì thêm dòng `-- @no-transaction`.
- Khoá `pg_advisory_lock` đảm bảo chỉ một tiến trình chạy migration tại một thời điểm (cluster, nhiều container).
- `MIGRATION_BACKUP_DIR`: khi có file mới, `pg_dump -Fc` DB vào thư mục này (ở máy chạy lệnh, cần `pg_dump`) trước khi chạy. Image Docker không có `pg_dump`, nên khi deploy `scripts/deploy.sh` tự backup trên máy host.
- **File gộp**: nhiều migration cũ nối nguyên văn, mỗi phần mở đầu bằng dòng `-- @migration <tên file cũ>.sql`. DB chạy một phần thì chỉ chạy các phần còn thiếu, đúng thứ tự; `status` hiện `x/y phần đã chạy`.

## Quy ước viết migration

1. **Tên file** là `YYYY-MM-DD_mo_ta_ngan.sql`. Dùng `npm run migrate new <mô tả>` để luôn xếp cuối.
2. **Idempotent**: chạy lại phải an toàn — `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP ... IF EXISTS`, `INSERT ... ON CONFLICT DO NOTHING` cho dữ liệu danh mục.
3. **Không sửa file đã chạy** ở bất kỳ môi trường nào. Cần đổi gì thì viết file mới. `npm run migrate status` đánh dấu `!` cho file bị sửa.
4. **Tương thích ngược**, vì rollback ứng dụng không hoàn tác schema. Chỉ thêm bảng/cột/index. Xoá hoặc đổi tên thì để một bản phát hành sau, khi code cũ không còn dùng.
5. Cột mới mà code cần ngay lúc khởi động (đăng nhập, phân quyền) thì thêm vào `REQUIRED_COLUMNS` trong `src/permissions/index.js`.
6. **Bảng mới** phải có đủ cột audit: `created_at`, `created_by`, `updated_at timestamp NULL`, `updated_by varchar(20) NULL`. Câu `UPDATE` trong code ghi `updated_at = ${nowSql}, updated_by = @actor_id` (helper trong `src/config/db.js`).
7. **Không viết stored procedure** cho logic nghiệp vụ — viết bằng JS. Trigger chỉ dùng cho audit / ràng buộc dữ liệu, như trong `baseline/04_trigger.sql`.
8. Không đưa mật khẩu, chuỗi kết nối hay dữ liệu cá nhân vào file. Mọi `*.sql` ngoài `database/` (và `infra/postgresql/`) đều bị `.gitignore` loại.

Chạy tay bằng psql (khi không dùng được runner):

```bash
psql -h 127.0.0.1 -U rms_migrate -d rms_hospital -v ON_ERROR_STOP=1 -1 -f <file>.sql
```

Cách này không ghi vào `schema_migrations`. Sau đó cần chạy `npm run migrate`. File idempotent nên chạy lại không sao.

## Việc định kỳ

Mọi việc định kỳ chạy bằng job Node (`src/jobs/index.js`, giờ VN), không dùng job trong DB. Mỗi worker đều lên lịch, nhưng nhờ `markOnce` mỗi việc chỉ chạy 1 lần.

| Giờ | Job | Việc |
|---|---|---|
| 00:15 | `supplementDeadlineJob` | Đề tài "Yêu cầu bổ sung" quá **mốc bổ sung muộn nhất** của đợt ⇒ **tự từ chối** qua đúng luồng duyệt (`topicApprovalService.approve`: approvals, lịch sử, thông báo), ghi theo người đã yêu cầu bổ sung. Bỏ qua (ghi log, xử lý tay) đề tài được yêu cầu bổ sung **sau** khi mốc đã qua, hoặc không rõ người yêu cầu. |
| 01:00 | `accountMaintenanceJob` | Khoá tài khoản hết hạn, dọn refresh token và mã OTP quên mật khẩu hết hạn, nhắc đổi mật khẩu cũ |
| 02:00 | `deadlineReminderJob` | Nhắc deadline sắp tới / quá hạn |
| 03:00 | `personLinkJob` | Gắn `person_id` còn thiếu |
| 04:00 | `notificationCleanupJob` | Xoá thông báo **đã đọc > 90 ngày**, **chưa đọc > 180 ngày**, theo lô 2000 dòng |
| 04:30 | `dataRetentionJob` | Tạo trước partition tháng của `security_events`, bỏ partition cũ hơn `SECURITY_EVENTS_RETENTION_MONTHS` tháng (mặc định 24, tối thiểu 12, `0` = không xoá), xoá dòng `job_execution_log` > 180 ngày của các job có khoá theo ngày. Không xoá khoá "đã làm việc X cho bản ghi Y" (nhắc mật khẩu, nhắc deadline, tự từ chối bổ sung) để job không gửi lại. Xem `DB_SCALING_PLAN.md`. |
