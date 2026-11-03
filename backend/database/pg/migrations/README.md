# Migration PostgreSQL

Thư mục này chứa migration cho PostgreSQL. `npm run migrate` chạy các file ở đây khi `DB_CLIENT=pg`. Khi chạy với SQL Server, lệnh này dùng `database/migrations/`.

- **Schema ban đầu** nằm ở `../baseline/` (00 → 04), không nằm ở đây. Trên DB PG trống, `npm run migrate init` tạo schema từ baseline trước, rồi mới chạy các file trong thư mục này. Khi chuyển dữ liệu thật thì dùng `npm run pg:transfer load`.
- **Từ chặng 2 tới khi cutover:** mỗi migration mới trong `database/migrations/` phải có bản PG ở đây, **cùng tên file**. Test `test/database/pgMigrations.test.js` kiểm tra điều này cho các file có ngày sau baseline.
- **Transaction:** mỗi file chạy trong 1 transaction, cùng với bản ghi `schema_migrations`. File hỏng giữa chừng không để lại gì. File có lệnh không chạy được trong transaction (`CREATE INDEX CONCURRENTLY`) thì thêm dòng `-- @no-transaction`.
- **Quy ước:** giống bản SQL Server.
  - Tên file là `YYYY-MM-DD_mo_ta.sql`.
  - Chạy lại được: dùng `IF NOT EXISTS`, `CREATE OR REPLACE`, `ADD COLUMN IF NOT EXISTS`.
  - Chỉ thêm bảng/cột/index. Việc xoá hay đổi tên để bản phát hành sau.
- **Không sửa file đã chạy.** Muốn thay đổi thì viết file mới.
