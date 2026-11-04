# Cài PostgreSQL 18 cho Hospital RMS (cài thẳng trên server Ubuntu, ngoài Docker)

Giống SQL Server hiện nay: PostgreSQL chạy **trực tiếp trên máy Ubuntu**, còn
các container (backend, frontend, Redis, ClamAV) gọi ra máy host qua
`host.docker.internal`. Hướng dẫn này nối tiếp `infra/cai-dat-may-ao-ubuntu.md`
(đã có ổ `/data`, Docker). Kế hoạch chuyển DB: `backend/database/POSTGRESQL_MIGRATION_PLAN.md`.

```
container backend ──host.docker.internal:5432──► PostgreSQL 18 (systemd, dữ liệu /data/pgsql)
```

Các file dùng ở đây đã được chạy thử trên PostgreSQL 18.6 (03/11/2026).

| File | Dùng cho |
|---|---|
| `infra/postgresql/rms.conf` | Cấu hình bộ nhớ, WAL, múi giờ, theo dõi truy vấn |
| `infra/postgresql/pg_hba.rms.conf` | Ai được kết nối, từ đâu |
| `infra/postgresql/01_tao_db_va_role.sql` | Tạo role `rms_migrate`, `rms_app` và DB `rms_hospital` |
| `backend/database/pg/baseline/00–04_*.sql` | Schema của ứng dụng (bảng, ràng buộc, index, trigger) |

## 1. Cài gói từ kho PGDG

Kho chính thức của PostgreSQL, có bản cho Ubuntu 24.04 và 26.04. Bản trong kho
Ubuntu thường cũ hơn.

```bash
sudo apt install -y postgresql-common
sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
# Chưa tạo cluster mặc định trên ổ hệ điều hành — tạo ở /data (bước 2)
echo 'create_main_cluster = false' | sudo tee /etc/postgresql-common/createcluster.d/no-main.conf
sudo apt install -y postgresql-18
```

## 2. Tạo cluster trên ổ dữ liệu `/data`

```bash
sudo mkdir -p /data/pgsql
sudo chown postgres:postgres /data/pgsql
sudo chmod 700 /data/pgsql
sudo pg_createcluster 18 main -d /data/pgsql/18/main \
  --locale-provider=builtin --locale=C.UTF-8 -e UTF8 -- --data-checksums
```

`--data-checksums` giúp phát hiện hỏng dữ liệu do ổ đĩa. Locale `C.UTF-8` là
mặc định cho cả cluster. DB ứng dụng cũng tạo lại với locale này ở bước 5.

## 3. Cấu hình

```bash
sudo cp infra/postgresql/rms.conf /etc/postgresql/18/main/conf.d/rms.conf
```

Mở `/etc/postgresql/18/main/pg_hba.conf`, chép nội dung `infra/postgresql/pg_hba.rms.conf`
lên **đầu** phần quy tắc (dòng khớp đầu tiên được dùng).

Máy 8 GB RAM: giảm `shared_buffers = 2GB`, `effective_cache_size = 5GB` trong `rms.conf`.

```bash
sudo systemctl enable --now postgresql@18-main
sudo systemctl restart postgresql@18-main
sudo -u postgres psql -c "SHOW shared_buffers; SHOW timezone; SHOW shared_preload_libraries;"
```

Phải thấy `3GB`, `Asia/Ho_Chi_Minh`, `pg_stat_statements,auto_explain`.

Backend production luôn kết nối mã hoá (`DB_ENCRYPT: "true"` trong
`docker-compose.prod.yml`), nên PostgreSQL phải bật SSL:

```bash
sudo -u postgres psql -c "SHOW ssl;"     # phải là on
```

Ubuntu thường tự bật SSL với chứng chỉ tự ký khi tạo cluster. Nếu ra `off`, đặt
`ssl = on`, `ssl_cert_file`, `ssl_key_file` trong `rms.conf` rồi khởi động lại.

## 4. Mở cổng cho container, chặn bên ngoài

`rms.conf` cho PostgreSQL nghe mọi địa chỉ, vì cổng `docker0` có thể chưa có lúc
PostgreSQL khởi động. Việc chặn do `pg_hba.conf` và firewall đảm nhiệm:

```bash
# Chỉ mạng Docker (172.16.0.0/12) được vào 5432; máy khác trong LAN thì không
sudo ufw allow from 172.16.0.0/12 to any port 5432 proto tcp
sudo ufw deny 5432/tcp
sudo ufw status numbered
```

Kiểm tra từ trong container backend (khi đã chạy):

```bash
docker compose -f docker-compose.prod.yml exec backend \
  node -e "require('net').connect(5432,'host.docker.internal').on('connect',()=>{console.log('OK');process.exit()}).on('error',e=>{console.log(e.message);process.exit(1)})"
```

## 5. Tạo role và DB

Sinh 2 mật khẩu mạnh, lưu vào nơi quản lý mật khẩu của viện, **không** ghi vào file:

```bash
read -rs MIGRATE_PW && read -rs APP_PW
sudo -u postgres psql -v ON_ERROR_STOP=1 \
  -v migrate_password="$MIGRATE_PW" -v app_password="$APP_PW" \
  -f infra/postgresql/01_tao_db_va_role.sql
unset MIGRATE_PW APP_PW
```

- `rms_migrate`: chủ DB và các bảng. Dùng cho migration, chuyển dữ liệu (thay
  `MIGRATION_DB_USER` của SQL Server).
- `rms_app`: role của ứng dụng. Chỉ đọc/ghi dữ liệu, có `statement_timeout = 60s`.

## 6. Tạo schema

Chạy bằng `rms_migrate`, trong thư mục `backend/`. Có 2 trường hợp:

**DB mới, chưa có dữ liệu** (staging trống, CI): migrator chạy baseline
`00–04` rồi các migration ở `database/pg/migrations/`.

```bash
DB_CLIENT=pg DB_SERVER=127.0.0.1 DB_USER=rms_migrate npm run migrate init
```

**Chuyển dữ liệu từ SQL Server**: **không** chạy `migrate init`, để DB rỗng và làm
theo `infra/chuyen-du-lieu-sang-postgresql.md`. Tài liệu đó hướng dẫn kiểm tra
dữ liệu, diễn tập, ngày chuyển thật, cách quay lại và xử lý sự cố. Tóm tắt các lệnh
(`backend/scripts/pg-transfer/`):

```bash
npm run pg:transfer precheck   # chỉ đọc SQL Server: dữ liệu nào sẽ làm lỗi/đổi nghĩa
npm run pg:transfer load       # DB PG rỗng → 00, 01, COPY, 02, 03, setval, 04
npm run pg:transfer verify     # so số dòng + checksum từng bảng, identity, ràng buộc
```

Trên server, image production không có `npm`: gọi `node scripts/pg-transfer/index.js …`
trong container backend (cách chạy ở mục A.2 của runbook). `load` chỉ chạy trên DB
rỗng. Mã thoát khác 0 = có lỗi chặn / chênh lệch.

`00_extensions.sql` tự dừng nếu DB sai encoding, PostgreSQL < 18 hoặc thiếu ICU
(collation tiếng Việt và `rms_ci`).

## 7. Sao lưu

Đề xuất pgBackRest: bản đầy đủ hằng tuần, bản chênh lệch hằng đêm, lưu WAL liên
tục để khôi phục tới thời điểm bất kỳ. Kho sao lưu đặt **ngoài máy** (NAS).

```bash
sudo apt install -y pgbackrest
```

Cấu hình `/etc/pgbackrest/pgbackrest.conf` (stanza `rms`, `repo1-path` trỏ tới
NAS, `repo1-retention-full=4`), rồi bật 2 dòng `archive_mode` / `archive_command`
trong `rms.conf` và khởi động lại PostgreSQL. Chạy `pgbackrest --stanza=rms stanza-create`
và `pgbackrest --stanza=rms check`. Lịch chạy đặt bằng systemd timer hoặc cron.

Diễn tập khôi phục ít nhất mỗi quý, ra một máy hoặc thư mục khác.

## Máy dev Windows

Dùng PostgreSQL 18 cài bằng bộ cài EDB (đã có ICU, có `vi-VN-x-icu`), chạy 2
bước 5 và 6 bằng `psql.exe` trong thư mục `bin` của bản cài, thêm `-h 127.0.0.1`.
Mật khẩu lưu ở `%APPDATA%\postgresql\pgpass.conf`, dòng dạng
`127.0.0.1:5432:*:rms_migrate:<mật khẩu>`, để không phải gõ hay truyền qua
dòng lệnh (adapter, migrator, `pg:transfer` và `test:pg` đều tự đọc file này khi
không đặt `DB_PASSWORD` / `PG_TARGET_PASSWORD` / `PG_TEST_PASSWORD`).

- Test tích hợp với PG: `npm run test:pg` (mặc định `rms_app@127.0.0.1/rms_hospital`,
  đổi bằng `PG_TEST_HOST` / `PG_TEST_PORT` / `PG_TEST_DATABASE` / `PG_TEST_USER`).
  Test tự rollback, không để lại dữ liệu.

- Không cần `rms.conf`. Thiếu `shared_preload_libraries` thì extension
  `pg_stat_statements` vẫn tạo được nhưng view của nó báo lỗi khi đọc, không ảnh
  hưởng ứng dụng.
- Backend dev chạy trong Docker: khi có adapter PG, thêm dòng cho mạng Docker
  vào `pg_hba.conf` của bản cài (như `pg_hba.rms.conf`) và mở firewall Windows
  cổng 5432 cho mạng đó.

## 8. Theo dõi

```sql
-- 20 câu tốn thời gian nhất (cần quyền pg_read_all_stats)
SELECT round(total_exec_time) AS ms, calls, left(query, 120) FROM pg_stat_statements
ORDER BY total_exec_time DESC LIMIT 20;
-- Bảng lớn nhất
SELECT relname, pg_size_pretty(pg_total_relation_size(oid)) FROM pg_class
WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r', 'p')
ORDER BY pg_total_relation_size(oid) DESC LIMIT 20;
-- Partition DEFAULT của security_events phải luôn rỗng (job tạo trước 2 tháng)
SELECT count(*) FROM security_events_default;
```

Log truy vấn chậm (> 500 ms) nằm ở `/var/log/postgresql/postgresql-18-main.log`.
