-- Tạo role và database cho Hospital RMS trên PostgreSQL 18 cài thẳng trên server.
-- Chạy 1 lần bằng superuser postgres (xem infra/cai-dat-may-ao-ubuntu.md mục 6.5):
--   sudo -u postgres psql -v ON_ERROR_STOP=1 \
--     -v migrate_password="$MIGRATE_PW" -v app_password="$APP_PW" \
--     -f infra/postgresql/01_tao_db_va_role.sql
-- Mật khẩu truyền bằng biến, KHÔNG ghi vào file này.

-- rms_migrate: chủ DB và mọi bảng, dùng cho migration / chuyển dữ liệu (deploy).
-- rms_app: role của ứng dụng, chỉ đọc/ghi dữ liệu, không tạo/xoá bảng.
-- Chạy lại được: role / DB đã có thì bỏ qua (KHÔNG đổi mật khẩu role đã có).
-- \gexec chạy câu lệnh do SELECT sinh ra; psql thay :'biến' trước khi gửi.
SELECT format('CREATE ROLE rms_migrate LOGIN PASSWORD %L', :'migrate_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rms_migrate') \gexec
SELECT format('CREATE ROLE rms_app LOGIN PASSWORD %L CONNECTION LIMIT 150', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rms_app') \gexec

-- UTF-8 + locale builtin C.UTF-8: so sánh/sắp xếp theo byte (nhanh, LIKE 'abc%'
-- dùng được index). Cột tên tiếng Việt dùng collation ICU vi-VN, cột
-- username/email/code dùng collation rms_ci không phân biệt hoa thường
-- (01_tables.sql). Cần PostgreSQL ≥ 18.
SELECT 'CREATE DATABASE rms_hospital OWNER rms_migrate TEMPLATE template0 ENCODING ''UTF8'' '
	|| 'LOCALE_PROVIDER builtin BUILTIN_LOCALE ''C.UTF-8'''
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'rms_hospital') \gexec

-- Giờ VN: LOCALTIMESTAMP trả giờ VN như GETDATE() của SQL Server (quy ước lưu
-- giờ VN không múi giờ — backend/README.md, mục Viết SQL).
ALTER DATABASE rms_hospital SET timezone = 'Asia/Ho_Chi_Minh';
-- Câu chạy quá lâu / phiên treo giữa transaction thì tự huỷ, không giữ khoá mãi.
ALTER ROLE rms_app SET statement_timeout = '60s';
ALTER ROLE rms_app SET idle_in_transaction_session_timeout = '5min';

\connect rms_hospital

-- Schema public: chỉ rms_migrate (chủ DB) tạo object; rms_app chỉ dùng.
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO rms_app;
ALTER DEFAULT PRIVILEGES FOR ROLE rms_migrate IN SCHEMA public
	GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO rms_app;
ALTER DEFAULT PRIVILEGES FOR ROLE rms_migrate IN SCHEMA public
	GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO rms_app;

-- pg_stat_statements không phải extension "trusted" nên tạo bằng superuser.
-- Cần shared_preload_libraries trong rms.conf.
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
GRANT pg_read_all_stats TO rms_migrate;
