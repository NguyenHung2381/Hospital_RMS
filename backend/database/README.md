# Cơ sở dữ liệu

```
database/
├── migrations/   # thay đổi schema/dữ liệu — chạy TỰ ĐỘNG, mỗi file 1 lần, theo thứ tự tên
├── manual/       # script chạy TAY 1 lần (dọn dữ liệu, đổi tên hàng loạt...) — không tự chạy
└── objects/      # định nghĩa stored procedure / function / trigger / view, xuất từ DB
```

Nguồn sự thật duy nhất cho schema là `migrations/`. Code ứng dụng không tự viết DDL.

## Lệnh

Chạy trong thư mục `backend`:

| Lệnh | Việc |
|------|------|
| `npm run migrate` | Chạy các file chưa chạy (deploy gọi lệnh này) |
| `npm run migrate -- --dry-run` | Chỉ liệt kê file sẽ chạy |
| `npm run migrate:status` | Trạng thái từng file: `✓` đã chạy, `·` chờ chạy, `!` đã sửa sau khi chạy |
| `npm run migrate:new -- <mô tả>` | Tạo file mới từ mẫu, tên đã đúng quy ước |
| `npm run migrate -- --baseline` | **1 lần** trên DB đã nâng cấp tay: đánh dấu mọi file hiện có là đã chạy |
| `npm run migrate -- --init` | DB trống: tạo bảng theo dõi rồi chạy hết |
| `npm run dump:db-objects` | Xuất lại `objects/` sau khi sửa SP/trigger/view trong DB |

Lúc khởi động, server tự chạy migration khi `DB_AUTO_MIGRATE=true`. Mặc định biến này bật ngoài production và tắt ở production. Ở production, `scripts/deploy.ps1` chạy `node scripts/migrate.js` bằng login có quyền ALTER/BACKUP, trước khi đổi container. Nếu có file chưa chạy, server chỉ cảnh báo. Riêng khi thiếu cột bắt buộc của phân quyền/đăng nhập (`permissions/index.js`), server **dừng**.

## Cách hoạt động (`src/database/migrator.js`)

- Bảng `dbo.schema_migrations` lưu `filename`, `applied_at`, `git_sha`, `checksum` (SHA-256 nội dung file).
- Mỗi file được tách batch theo dòng `GO`, giống sqlcmd. Mọi batch chạy trên cùng một kết nối, không timeout. `USE [RMS_HOSPITAL]` được đổi sang DB đang cấu hình.
- Khoá `sp_getapplock` đảm bảo chỉ một tiến trình chạy migration tại một thời điểm (cluster, nhiều container).
- `MIGRATION_BACKUP_DIR` là thư mục **trên máy SQL Server**. Khi có file mới, runner `BACKUP DATABASE ... COPY_ONLY` vào đó trước khi chạy.
- Đổi tên file đã chạy: thêm cặp tên cũ → tên mới vào `RENAMED` trong `migrator.js`. Runner tự đổi tên trong `schema_migrations`, không chạy lại file.
- Gộp file (xoá file cũ, chuyển nội dung sang file khác): thêm cặp file cũ → file gộp vào `MERGED`. Bản ghi file cũ không còn bị báo "không còn file" và được xoá khi file gộp đã chạy. DB chưa có file gộp vẫn chạy nó, nên file gộp phải idempotent.

## Quy ước viết migration

1. **Tên file** là `YYYY-MM-DD_mo_ta_ngan.sql`. Cùng ngày thì thêm số thứ tự: `YYYY-MM-DD_00_...`, `YYYY-MM-DD_01_...`. Dùng `npm run migrate:new` để luôn xếp cuối.
2. **Idempotent**: mỗi bước tự kiểm tra trước khi làm (`OBJECT_ID`, `COL_LENGTH`, `sys.indexes`, `MERGE` cho dữ liệu danh mục). Chạy lại phải an toàn.
3. **Không sửa file đã chạy** ở bất kỳ môi trường nào. Cần đổi gì thì viết file mới. `migrate:status` đánh dấu `!` cho file bị sửa.
4. **Tương thích ngược**, vì rollback ứng dụng không hoàn tác schema. Chỉ thêm bảng/cột/index. Xoá hoặc đổi tên thì để một bản phát hành sau, khi code cũ không còn dùng.
5. Đổi nhiều dữ liệu thì bọc trong `SET XACT_ABORT ON; BEGIN TRANSACTION ... COMMIT`.
6. Cột mới mà code cần ngay lúc khởi động (đăng nhập, phân quyền) thì thêm vào `REQUIRED_COLUMNS` trong `src/permissions/index.js`.
7. Không đưa mật khẩu, chuỗi kết nối hay dữ liệu cá nhân vào file. Mọi `*.sql` ngoài `database/` đều bị `.gitignore` loại.

Chạy tay bằng sqlcmd (khi không dùng được runner) phải có `-I`, vì `QUOTED_IDENTIFIER ON` là bắt buộc cho index lọc và cột tính toán:

```bash
sqlcmd -S <server>,<port> -d RMS_HOSPITAL -U <user> -P <pass> -C -I -b -f 65001 -i <file>.sql
```

Cách này không ghi vào `schema_migrations`. Sau đó cần chạy `npm run migrate`. File idempotent nên chạy lại không sao.

`-f 65001` là bắt buộc: thiếu nó, sqlcmd đọc file UTF-8 theo bảng mã của Windows và chữ Việt bị vỡ ngay trong DB (đã xảy ra với `sp_push_notification`, sửa ở `2026-11-03_fix_sp_push_notification_encoding.sql`). `test/database/sqlEncoding.test.js` chặn file `.sql` bị lỗi mã hoá.

## Rà soát object DB (2026-10-18)

`objects/` khớp hoàn toàn với DB dev: 44 procedure, 16 trigger, 2 view, 1 function. "Gọi từ" bên dưới chỉ tính lời gọi thật trong `src/`, `scripts/` và các object khác, không tính comment. Lời gọi từ ngoài repo (SQL Agent job, Task Scheduler, công cụ báo cáo) không thấy được từ đây.

| Nhóm | Object | Gọi từ | Đề xuất |
|---|---|---|---|
| Audit | 13 trigger `trg_*_audit` | DB tự chạy (ghi `updated_at`/`updated_by` theo `sp_set_actor`) | Giữ ở DB. Code JS đang dựa vào chúng (`approvals.updated_*`, dashboard). |
| Sinh mã | 23 `sp_gen_*` đang dùng (gồm `sp_gen_cme_no`, `sp_gen_certificate_no`) | JS, `sp_upload_files`, `sp_create_refresh_token`… | Giữ. Phần lớn giống hệt nhau (tiền tố + `yyyyMMdd` + STT, khoá `sp_getapplock`), chỉ khác tiền tố/bảng/mã lỗi. **Không** gộp thành 1 proc dùng SQL động (mất kiểm tra tên bảng, khó cấp quyền EXECUTE). Mã mới sinh ở JS như `levelService.createWithSeqId` cũng được. |
| Sinh mã, không ai gọi | `sp_gen_approval_id`, `sp_gen_category_id`, `sp_gen_level_id`, `sp_gen_permission_id`, `sp_gen_pgroup_id`, `sp_gen_progress_id`, `sp_gen_role_id` | — | Đã có cách khác thay (crudService, `createWithSeqId`, `trg_topic_auto_approval` tự sinh). Xoá bằng migration sau khi xác nhận production không còn gì gọi. |
| Nghiệp vụ trong DB | `trg_topic_auto_approval` (đề tài → `submitted` thì tạo dòng `approvals`), `sp_approve_topic` (+ `sp_grant_member_accounts`: duyệt, cấp tài khoản thành viên, thông báo), `sp_upload_files`, `trg_file_batch_count`, `trg_dept_gen_id`, `sp_push_notification` (+ `sp_resolve_recipients`), `sp_create_refresh_token`, `sp_deactivate_expired_accounts` | JS / DB | Giữ cho tới khi sửa nghiệp vụ liên quan thì chuyển về JS (service có test). Nên làm trước: `trg_topic_auto_approval` (logic ẩn, đọc code JS không thấy) và `sp_approve_topic` (gộp 3 việc + thông báo trong 1 proc 150 dòng). |
| Việc định kỳ (đã chuyển sang `src/jobs/`) | `sp_process_daily_deadlines`, `sp_remind_deadlines`: thành **no-op** từ `2026-11-04_retire_scheduled_deadline_procs.sql` (giữ tên + tham số để Agent job nếu còn vẫn chạy được). `sp_close_supplement_window` (đóng tay theo đợt, **duyệt** đề tài đang bổ sung) | Không ai gọi | Việc định kỳ chạy bằng job Node, xem mục dưới. `sp_close_supplement_window` ngược với quyết định tự **từ chối**, nên xoá ở bản phát hành sau. |
| Không ai gọi | `sp_use_refresh_token` (xoay refresh token đã làm ở `authService`), `vw_approvals_audit`, `vw_topics_audit` | — | Hai view có thể đang được dùng để xem/báo cáo trực tiếp trên DB. Hỏi người vận hành rồi mới xoá. |

### Việc định kỳ (quyết định 18/10/2026)

Mọi việc định kỳ chạy bằng job Node (`src/jobs/index.js`, giờ VN). Mỗi worker đều lên lịch, nhưng nhờ `markOnce` mỗi việc chỉ chạy 1 lần.

| Giờ | Job | Việc |
|---|---|---|
| 00:15 | `supplementDeadlineJob` | Đề tài "Yêu cầu bổ sung" quá **mốc bổ sung muộn nhất** của đợt ⇒ **tự từ chối** qua đúng luồng duyệt (`sp_approve_topic`: approvals, lịch sử, thông báo), ghi theo người đã yêu cầu bổ sung. Bỏ qua (ghi log, xử lý tay) đề tài được yêu cầu bổ sung **sau** khi mốc đã qua, hoặc không rõ người yêu cầu. Proc cũ làm ngược lại (tự **duyệt**), và đóng ngay khi một mốc bất kỳ qua. |
| 01:00 | `accountMaintenanceJob` | Khoá tài khoản hết hạn, dọn refresh token hết hạn, nhắc đổi mật khẩu cũ |
| 02:00 | `deadlineReminderJob` | Nhắc deadline sắp tới / quá hạn |
| 03:00 | `personLinkJob` | Gắn `person_id` còn thiếu |
| 04:00 | `notificationCleanupJob` | Xoá thông báo **đã đọc > 90 ngày**, **chưa đọc > 180 ngày**, theo lô 2000 dòng. Proc cũ chỉ xoá loại đã đọc, và `sp_process_daily_deadlines` gọi sai tên tham số nên bước này luôn lỗi. |

Trên production, nếu SQL Agent còn job gọi các proc cũ thì nay job đó vô hại (no-op), nhưng nên tắt cho gọn. Kiểm tra:

```sql
SELECT j.name AS job, j.enabled, s.step_name, s.command
FROM msdb.dbo.sysjobs j
JOIN msdb.dbo.sysjobsteps s ON s.job_id = j.job_id
WHERE s.command LIKE '%sp_process_daily_deadlines%'
   OR s.command LIKE '%sp_remind_deadlines%'
   OR s.command LIKE '%sp_close_supplement_window%'
   OR s.command LIKE '%sp_cleanup_%';
```
