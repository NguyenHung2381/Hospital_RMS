# Migration (PostgreSQL)

`npm run migrate` chạy các file mới trong thư mục này, theo thứ tự tên file. Hướng dẫn đầy đủ: [../README.md](../README.md).

- **Schema ban đầu** nằm ở `../baseline/` (00 → 04), không nằm ở đây. Trên DB trống, `npm run migrate init` dựng schema từ baseline rồi chạy các file trong thư mục này. Chuyển dữ liệu từ SQL Server thì dùng `scripts/pg-transfer/` (cũng dựng từ baseline).
- **Transaction:** mỗi file chạy trong 1 transaction, cùng với bản ghi `schema_migrations`. File hỏng giữa chừng không để lại gì. File có lệnh không chạy được trong transaction (`CREATE INDEX CONCURRENTLY`) thì thêm dòng `-- @no-transaction`.
- **Tạo file:** `npm run migrate -- new <mô tả>` (tên đúng dạng `YYYY-MM-DD_mo_ta.sql`, có sẵn mẫu).
- **Chạy lại được:** dùng `IF NOT EXISTS`, `CREATE OR REPLACE`, `ADD COLUMN IF NOT EXISTS`, `DROP ... IF EXISTS`.
- **Tương thích ngược:** deploy lỗi thì `scripts/deploy.sh` quay lại image cũ nhưng **không** hoàn tác schema. Chỉ thêm bảng/cột/index; xoá hay đổi tên để bản phát hành sau, khi code cũ không còn dùng.
- **Không sửa file đã chạy** (checksum lệch → cảnh báo). Muốn thay đổi thì viết file mới.
- **Không dùng stored procedure / trigger mới cho logic nghiệp vụ** — viết bằng JS trong backend.
