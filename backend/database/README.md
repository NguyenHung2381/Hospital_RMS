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
