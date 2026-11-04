# Chuyển dữ liệu từ SQL Server sang PostgreSQL bằng file backup `.bak` (runbook)

Hướng dẫn từng bước để chuyển dữ liệu của Hospital RMS từ **hệ thống cũ**
(SQL Server, code tới commit `dd0f62e`) sang **hệ thống mới** (PostgreSQL 18 trên
máy chủ Ubuntu, code hiện tại — chỉ còn chạy PostgreSQL).

Dữ liệu đi qua **1 file backup `.bak`**: máy Ubuntu không cần cài SQL Server, cũng
không cần kết nối mạng tới SQL Server cũ.

```
SQL Server cũ                 máy Ubuntu (Docker)
BACKUP ... COPY_ONLY ──.bak──► SQL Server TẠM ──đọc (stream)──► pg:transfer ──COPY──► PostgreSQL 18
                               (container, xoá                  (container            rms_hospital
                                sau khi xong)                    backend)             (host, cổng 5432)
```

- Máy Ubuntu đã dựng theo `infra/cai-dat-may-ao-ubuntu.md` tới bước 12.1 (đã
  build/kéo image backend), PostgreSQL cài theo `infra/cai-dat-postgresql.md`
  **mục 1–5**. **Không** chạy `migrate init`: DB phải rỗng thì mới nạp được.
- Lý do và thiết kế: `backend/database/POSTGRESQL_MIGRATION_PLAN.md`.

Một lệnh làm hết, mã thoát khác 0 nghĩa là có lỗi hoặc chênh lệch:

```bash
backend/scripts/pg-transfer/transfer-from-bak.sh <file.bak> [bước] [--keep]
```

| Bước | Làm gì | Ghi vào đâu |
|---|---|---|
| `restore` (tự chạy) | Dựng SQL Server tạm (container `rms-mssql-restore`, không mở cổng ra ngoài), restore file `.bak`, kiểm tra file là bản FULL, không mã hoá, đúng phiên bản schema | Chỉ container tạm |
| `precheck` | Tìm dữ liệu sẽ làm lần nạp thất bại hoặc đổi nghĩa | Không ghi gì |
| `load` | DB PG rỗng → bảng → nạp dữ liệu → ràng buộc, index → sequence → trigger → `VACUUM ANALYZE` | Chỉ ghi vào PG |
| `verify` | So số dòng, checksum từng bảng, sequence, ràng buộc giữa 2 DB | Không ghi gì |

- Bước `all` (mặc định) = restore → precheck → load → verify, xong thì **xoá
  container tạm** cùng bản sao file `.bak`.
- Bước `precheck` = chỉ restore + precheck (không ghi PG) — dùng ở giai đoạn A.
- `--keep`: giữ container tạm để chạy lại riêng `load` / `verify`
  (`transfer-from-bak.sh verify`, không cần file). Xoá tay khi xong:
  `docker rm -f -v rms-mssql-restore`.

## Tổng quan các giai đoạn

| Giai đoạn | Khi nào | Hệ thống cũ có phải dừng? |
|---|---|---|
| A. Chuẩn bị, `precheck`, sửa dữ liệu | Bất kỳ lúc nào, trước diễn tập 1–2 tuần | Không (chỉ lấy backup) |
| B. Diễn tập (ít nhất 2 lần) | Bất kỳ lúc nào | Không |
| C. Chuyển thật (cutover) | Khung bảo trì đã báo trước | **Có**, trong suốt khung bảo trì |
| D. Theo dõi, dọn dẹp | 1–4 tuần sau | — |

---

## A. Chuẩn bị

### A.1. Điều kiện trước khi bắt đầu

- [ ] **Hệ thống cũ chạy đúng commit `dd0f62e`** (bản cuối còn hỗ trợ SQL Server)
  và đã chạy **đủ** migration của bản đó. Kiểm tra trên máy chủ cũ:

  ```bash
  docker compose -f docker-compose.prod.yml run --rm --no-deps -T backend node scripts/migrate.js status
  ```

  Không được còn dòng `·`. Lấy backup từ bản cũ hơn thì bước `restore` dừng với
  thông báo `DB nguồn chưa chạy migration 2026-12-15_unique_nulls_not_distinct.sql`.
- [ ] Máy Ubuntu: PostgreSQL 18 có role `rms_migrate`, `rms_app`, DB `rms_hospital`
  **rỗng**, SSL bật (`sudo -u postgres psql -c "SHOW ssl;"` phải là `on`; ứng dụng
  production luôn kết nối mã hoá).
- [ ] Máy Ubuntu: stack đã `up` ít nhất 1 lần để có mạng Docker
  `hospital_rms_default` (`docker compose -f docker-compose.prod.yml up -d redis`).
- [ ] Máy Ubuntu: RAM trống ≥ 2 GB cho SQL Server tạm (máy 8 GB: tạm dừng ClamAV,
  `docker compose -f docker-compose.prod.yml stop clamav`). Ổ `/data` trống ≈ **3 lần**
  kích thước file `.bak` (file gốc + bản sao trong container + DB restore tạm), cộng
  2 lần dung lượng DB cho PostgreSQL (dữ liệu, index, WAL).
- [ ] DB lớn hơn 10 GB: SQL Server tạm mặc định là bản **Express** (miễn phí, DB tối
  đa 10 GB). Chạy với `MSSQL_PID=Developer` (miễn phí, chỉ dùng ngoài production —
  ở đây chỉ để đọc dữ liệu chuyển đi).
- [ ] Phiên bản SQL Server cũ ≤ 2025 (image tạm `mssql/server:2025-latest` restore
  được backup từ 2016 trở lên). Backup **không** được mã hoá (`WITH ENCRYPTION`).
- [ ] Có mật khẩu `rms_migrate` (PostgreSQL), lấy từ nơi quản lý mật khẩu của viện.

### A.2. Lấy file backup và chép lên máy Ubuntu

Trên SQL Server cũ (SSMS hoặc `sqlcmd`). `COPY_ONLY` không làm lệch chuỗi backup
đang có; `CHECKSUM` để phát hiện file hỏng khi restore:

```sql
BACKUP DATABASE [RMS_HOSPITAL] TO DISK = N'D:\Backup\RMS_HOSPITAL_chuyen_pg.bak'
WITH COPY_ONLY, CHECKSUM, INIT;
RESTORE VERIFYONLY FROM DISK = N'D:\Backup\RMS_HOSPITAL_chuyen_pg.bak' WITH CHECKSUM;
```

Thấy `The backup set on file 1 is valid.` là được. Bản Standard/Enterprise thêm
`COMPRESSION` để file nhỏ hơn (Express không hỗ trợ).

Chép lên máy Ubuntu (từ máy có file, qua SSH), rồi chỉ cho chủ file đọc — file chứa
toàn bộ dữ liệu bệnh viện:

```bash
scp RMS_HOSPITAL_chuyen_pg.bak rms:/data/backup/db/
ssh rms chmod 600 /data/backup/db/RMS_HOSPITAL_chuyen_pg.bak
```

### A.3. Cách chạy lệnh trên máy Ubuntu

Mọi lệnh chạy trong `/data/code/Hospital_RMS`, trong 1 phiên `tmux` (DB lớn chạy
lâu). Nhập mật khẩu 1 lần, không hiện trên màn hình, không lưu vào lịch sử lệnh:

```bash
cd /data/code/Hospital_RMS
read -rsp 'Mật khẩu rms_migrate (PostgreSQL): ' PG_TARGET_PASSWORD; echo
export PG_TARGET_PASSWORD
BAK=/data/backup/db/RMS_HOSPITAL_chuyen_pg.bak
```

- Script tự sinh mật khẩu `sa` ngẫu nhiên cho SQL Server tạm, truyền vào container
  qua biến môi trường (không nằm trên dòng lệnh, `ps` không thấy).
- Số bảng nạp song song mặc định là 3. Máy mạnh thì `export PG_TRANSFER_PARALLEL=4`.
- Xong việc: `unset PG_TARGET_PASSWORD`, hoặc đóng phiên `tmux`.

**Máy dev** (diễn tập với DB dev): chạy cùng script trong Git Bash / WSL với
`COMPOSE_FILE=docker-compose.yml COMPOSE_PROJECT=hospital_rms_dev`, hoặc tự dựng
SQL Server rồi gọi từng lệnh `npm run pg:transfer restore|precheck|load|verify`
với các biến `MSSQL_SOURCE_*` (xem `backend/scripts/pg-transfer/connect.js`).

### A.4. Kiểm tra dữ liệu nguồn (`precheck`)

Chỉ đọc, không ghi PostgreSQL:

```bash
backend/scripts/pg-transfer/transfer-from-bak.sh "$BAK" precheck
```

Kết quả gồm các dòng `❌` (lỗi chặn, **phải sửa** trước khi `load`), `⚠️` (cảnh
báo, đọc và quyết định), và dòng cuối `✅ Không có lỗi chặn` hoặc số lỗi.

| Thông báo | Nguyên nhân | Cách xử lý |
|---|---|---|
| ❌ `DB nguồn chưa chạy migration …` / `không có bảng dbo.schema_migrations` | Backup lấy từ bản code cũ hơn `dd0f62e` | Deploy `dd0f62e` lên hệ thống cũ, chạy hết migration, backup lại (A.1, A.2) |
| ❌ `Khoá ngoại …: n dòng … không có dòng cha` | Dòng mồ côi (FK bị tắt hoặc `NOCHECK` ở SQL Server). PG luôn kiểm tra FK | Nhóm phát triển viết script sửa (xoá dòng mồ côi, hoặc gắn lại dòng cha) |
| ❌ `…: n giá trị chứa ký tự NUL` | Ký tự `CHAR(0)`, thường từ file Excel cũ. PG không lưu được | Bỏ ký tự này trên SQL Server |
| ❌ `…: n giá trị không phải JSON hợp lệ (cột jsonb)` | Cột sẽ thành `jsonb` mà dữ liệu không phải JSON | Sửa dữ liệu trên SQL Server |
| ❌ `…: n địa chỉ IP không hợp lệ (cột inet)` | Cột sẽ thành `inet` | Sửa hoặc xoá giá trị đó |
| ❌ `Bảng … chưa có trong baseline PG` / `Baseline PG có bảng … nhưng DB nguồn không có` | DB nguồn khác phiên bản code | Kiểm tra lại A.1; vẫn lệch thì báo nhóm phát triển |
| ⚠️ `CHECK …: n dòng cũ vi phạm` | Ràng buộc SQL Server không áp cho dữ liệu cũ | Không cần làm gì: PG giữ đúng như vậy (`NOT VALID`) |
| ⚠️ `…: n giá trị có khoảng trắng cuối` | SQL Server coi `"a "` = `"a"`, PG thì không: đăng nhập hoặc tìm theo mã có thể không khớp | Nên cắt khoảng trắng trên SQL Server, nhất là `username`, `email`, mã danh mục |
| ⚠️ `DB nguồn dùng collation … (không phân biệt dấu)` | PG so sánh có phân biệt dấu | Ghi nhận; báo nhóm phát triển nếu cần |
| ⚠️ `… có trong DB nhưng không thuộc hệ thống — không được chuyển` | View, procedure… tạo tay ngoài repo | Hỏi người tạo: còn dùng không? Còn thì báo nhóm phát triển viết lại trên PG |

Dữ liệu sửa **trên SQL Server cũ** (hệ thống mới không đọc được SQL Server), qua
script đã duyệt và có backup trước. Sửa xong, lấy backup mới (A.2) và chạy lại
`precheck` cho tới khi hết `❌`.

---

## B. Diễn tập

Làm **ít nhất 2 lần**, lần cuối trước ngày chuyển thật 1 ngày, với file backup mới
nhất. Mục đích: chắc chắn `load` và `verify` qua, và đo thời gian để định khung
bảo trì. Hệ thống cũ vẫn chạy bình thường — diễn tập chỉ cần 1 file backup.

### B.1. Tạo lại DB PG rỗng

`load` chỉ chạy trên DB rỗng. Từ lần thứ hai trở đi, xoá DB cũ rồi tạo lại (backend
trên máy Ubuntu phải đang dừng — `docker compose -f docker-compose.prod.yml stop backend`):

```bash
sudo -u postgres psql -c "DROP DATABASE IF EXISTS rms_hospital WITH (FORCE);"
read -rs MIGRATE_PW && read -rs APP_PW      # gõ lại ĐÚNG mật khẩu đang dùng
sudo -u postgres psql -v ON_ERROR_STOP=1 \
  -v migrate_password="$MIGRATE_PW" -v app_password="$APP_PW" \
  -f infra/postgresql/01_tao_db_va_role.sql
unset MIGRATE_PW APP_PW
```

Role đã có thì script bỏ qua, không đổi mật khẩu. Vẫn phải truyền 2 biến vì
script luôn đọc chúng.

### B.2. Nạp và kiểm tra

```bash
time backend/scripts/pg-transfer/transfer-from-bak.sh "$BAK"    # phải kết thúc bằng "✅ Khớp hoàn toàn"
```

Rồi chạy các migration PG (`load` tạo bảng `schema_migrations` rỗng; các file
trong `backend/database/migrations/` chạy lại được, chạy trên DB vừa nạp là an toàn):

```bash
export DB_PASSWORD="$PG_TARGET_PASSWORD"
for cmd in up status; do
  docker compose -f docker-compose.prod.yml run --rm --no-deps -T \
    -e DB_USER=rms_migrate -e DB_PASSWORD backend node scripts/migrate.js $cmd
done                                  # status: mọi dòng ✓ (không còn ·)
unset DB_PASSWORD
```

### B.3. Ghi nhật ký diễn tập

| Lần | Ngày | Kích thước `.bak` | restore | precheck | load | verify | migrate | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | |
| 2 | | | | | | | | |

Script in thời gian từng bước. Khung bảo trì = backup + chép file + tổng thời gian
đo được × 2, cộng 30 phút cho kiểm tra tay. (Tham khảo: DB dev 144 MB nạp xong
trong vài phút.)

Diễn tập xong thì để nguyên DB PG cũng được: bước C.4 sẽ xoá và tạo lại.

### B.4. Kiểm tra ứng dụng trên bản diễn tập

Khởi động backend trên máy Ubuntu với dữ liệu vừa nạp
(`docker compose -f docker-compose.prod.yml up -d`), truy cập bằng
`http://<IP-VM>:8084` (chưa trỏ domain), thử tay các luồng quan trọng: đăng nhập
(cả username viết **hoa**), 2FA, nộp và duyệt đề tài, hội đồng, điểm danh QR,
đăng ký hội thảo, cấp CME, import Excel, xuất Word/Excel.

**Lưu ý:** file upload (minh chứng, tài liệu khoá học) nằm ở volume
`server_uploads` của hệ thống cũ, **không** nằm trong file `.bak`. Chép sang máy
mới theo C.6, nếu không thì mở file cũ sẽ báo không tìm thấy.

Dừng backend trước khi diễn tập lần sau: `docker compose -f docker-compose.prod.yml stop backend`.
Job định kỳ (nhắc deadline, email) chạy trong backend — tắt email khi diễn tập với
dữ liệu thật (`MAIL_ENABLED=false` trong `backend/.env`) để người dùng không nhận
thông báo trùng.

---

## C. Chuyển thật (cutover)

Chuẩn bị: thông báo lịch bảo trì trước **7 ngày**, từ đó không deploy thay đổi
schema lên hệ thống cũ. Có người của nhóm phát triển trực trong khung bảo trì. In
bảng dưới ra để đánh dấu từng bước, ghi giờ bắt đầu và kết thúc.

| # | Bước | Xong lúc |
|---|---|---|
| C.1 | Dừng backend hệ thống cũ | |
| C.2 | Đặt SQL Server cũ chỉ đọc | |
| C.3 | Backup, kiểm tra, chép file `.bak` sang máy Ubuntu | |
| C.4 | Tạo lại DB PG rỗng | |
| C.5 | `transfer-from-bak.sh` (restore → precheck → load → verify) + migration | |
| C.6 | Chép file upload, khoá 2FA | |
| C.7 | Khởi động hệ thống mới | |
| C.8 | Kiểm tra tay | |
| C.9 | **Go / no-go**, trỏ domain / reverse proxy sang máy mới | |

### C.1. Dừng backend hệ thống cũ

Trên máy chủ cũ:

```bash
docker compose -f docker-compose.prod.yml stop backend
docker compose -f docker-compose.prod.yml ps        # backend: exited
```

Dừng backend là dừng luôn các job định kỳ. Người dùng sẽ thấy lỗi kết nối cho tới
bước C.9.

### C.2. Đặt SQL Server cũ chỉ đọc

Bảo đảm không còn ai ghi vào DB cũ (job ngoài, công cụ quản trị):

```sql
ALTER DATABASE [RMS_HOSPITAL] SET READ_ONLY WITH ROLLBACK IMMEDIATE;
SELECT is_read_only FROM sys.databases WHERE name = 'RMS_HOSPITAL';   -- 1
```

### C.3. Backup và chép file

Làm như **A.2** (đặt tên file mới, vd `RMS_HOSPITAL_truoc_PG.bak`). Chép thêm 1 bản
ra **NAS** và giữ lâu dài.

### C.4. Tạo lại DB PG rỗng

Trên máy Ubuntu, làm như **B.1** (dừng backend, xoá bản diễn tập, tạo DB mới rỗng).

### C.5. Chuyển dữ liệu

Nhập mật khẩu như A.3 nếu đang ở phiên mới, rồi:

```bash
BAK=/data/backup/db/RMS_HOSPITAL_truoc_PG.bak
backend/scripts/pg-transfer/transfer-from-bak.sh "$BAK"     # ✅ Khớp hoàn toàn
```

Rồi chạy migration như cuối **B.2** (`status`: mọi dòng ✓).

**Bất kỳ bước nào báo lỗi hoặc `verify` có chênh lệch: DỪNG, làm mục D.1 (quay
lại hệ thống cũ).** Không sửa dữ liệu hay chạy lại tuỳ tiện trong khung bảo trì.

### C.6. Chép file upload và khoá bí mật

Trên máy chủ cũ, đóng gói 2 volume (tên có tiền tố project, xem `docker volume ls`):

```bash
docker run --rm -v hospital_rms_server_uploads:/data:ro -v "$PWD":/backup alpine \
  tar czf /backup/uploads.tar.gz -C /data .
docker run --rm -v hospital_rms_server_secrets:/data:ro -v "$PWD":/backup alpine \
  tar czf /backup/secrets.tar.gz -C /data .
```

Chép 2 file sang máy Ubuntu (`/data/backup/files/`), rồi giải nén vào volume mới
(tạo sẵn khi stack chạy lần đầu):

```bash
cd /data/backup/files
docker run --rm -v hospital_rms_server_uploads:/data -v "$PWD":/backup alpine \
  sh -c 'tar xzf /backup/uploads.tar.gz -C /data && chown -R 1000:1000 /data'
docker run --rm -v hospital_rms_server_secrets:/data -v "$PWD":/backup alpine \
  sh -c 'tar xzf /backup/secrets.tar.gz -C /data && chown -R 1000:1000 /data'
```

- `secrets` chứa **khoá giải mã 2FA** (`totp.key`): thiếu thì mọi người dùng đã bật
  2FA phải thiết lập lại. Cũng chứa JWT secret: giữ thì người dùng không bị đăng xuất
  ngoài khung bảo trì.
- Khoá 2FA đặt bằng `TOTP_ENC_KEY` trong `backend/.env` cũ (thay vì file) thì chép
  đúng giá trị đó sang `backend/.env.production` mới.
- Xoá 2 file `.tar.gz` sau khi đã cất bản sao ở NAS (`secrets.tar.gz` là bí mật).

### C.7. Khởi động hệ thống mới

```bash
cd /data/code/Hospital_RMS
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml logs -f backend   # Ctrl+C để thoát
```

Trong log phải thấy `✅ Connected to PostgreSQL` và không có lỗi lặp lại. Sau
khoảng 1 phút `docker compose -f docker-compose.prod.yml ps`: backend `healthy`.

### C.8. Kiểm tra tay (15–20 phút, chỉ xem, không sửa dữ liệu)

Truy cập thẳng máy mới (`http://<IP-VM>:8084` hoặc qua `/etc/hosts`), dùng tài
khoản thật của nhóm vận hành:

- [ ] Đăng nhập, gõ username **viết hoa**; 2FA (nếu tài khoản có bật).
- [ ] Danh sách và chi tiết: đề tài, hội đồng, hội thảo, khoá học, học viên, CME.
- [ ] Tìm kiếm có dấu và không dấu (tên người, tên đề tài).
- [ ] Mở 2–3 file upload cũ (minh chứng, tài liệu khoá học).
- [ ] Dashboard, báo cáo; xuất 1 file Excel.
- [ ] Ngày giờ hiển thị đúng giờ Việt Nam (so 1 bản ghi với dữ liệu cũ).

### C.9. Go / no-go

- **Go**: trỏ domain / reverse proxy HTTPS sang máy mới, báo người dùng hệ thống đã
  hoạt động lại. **Từ thời điểm này**, dữ liệu mới chỉ nằm ở PostgreSQL.
- **No-go** (lỗi ở C.5–C.8): làm mục D.1, đặt lịch chuyển lại sau khi tìm ra nguyên nhân.

---

## D. Sau khi chuyển

### D.1. Quay lại hệ thống cũ (chỉ trước mốc go)

Trước C.9, SQL Server cũ vẫn còn nguyên dữ liệu, quay lại **không mất gì**:

```bash
# máy Ubuntu
docker compose -f docker-compose.prod.yml stop backend
```

```sql
-- SQL Server cũ
ALTER DATABASE [RMS_HOSPITAL] SET READ_WRITE;
```

```bash
# máy chủ cũ
docker compose -f docker-compose.prod.yml up -d backend
```

**Sau mốc go**: người dùng đã ghi dữ liệu mới vào PG. Quay lại SQL Server sẽ mất
phần dữ liệu đó. **Không có** công cụ chuyển ngược PG → SQL Server; phải bàn với
nhóm phát triển trước khi quyết định.

### D.2. Việc cần làm ngay sau khi go

- [ ] Bật sao lưu PostgreSQL: `infra/cai-dat-may-ao-ubuntu.md` mục 14.2 (`pg_dump`
  hằng đêm) hoặc pgBackRest (`infra/cai-dat-postgresql.md` mục 7). Chạy bản đầu
  tiên ngay trong ngày.
- [ ] Bật CI/CD cho máy mới (`infra/cai-dat-may-ao-ubuntu.md` mục 15):
  `MIGRATION_DB_USER=rms_migrate`, `MIGRATION_DB_PASSWORD` là mật khẩu `rms_migrate`
  **của PostgreSQL**. Gỡ runner của máy chủ cũ khỏi GitHub.
- [ ] Bật lại ClamAV nếu đã dừng: `docker compose -f docker-compose.prod.yml up -d clamav`.
- [ ] Giữ hệ thống cũ (SQL Server chỉ đọc, backend dừng), **không xoá**, ít nhất
  1 tháng. Giữ file `RMS_HOSPITAL_truoc_PG.bak` ở NAS lâu dài.

### D.3. Theo dõi 1–2 tuần

- Log backend: lỗi 5xx, lỗi DB (`docker compose -f docker-compose.prod.yml logs backend`).
- Truy vấn chậm và bảng lớn: `infra/cai-dat-postgresql.md` mục 8.
- Số kết nối: không vượt `WEB_CONCURRENCY × DB_POOL_MAX` + dự phòng
  (`SELECT count(*) FROM pg_stat_activity WHERE datname = 'rms_hospital';`).

### D.4. Dọn dẹp (sau khoảng 1 tháng ổn định)

- Tắt hẳn máy chủ cũ / SQL Server khi đã chắc không cần quay lại.
- Xoá file `.bak` và `*.tar.gz` trên máy Ubuntu (đã có bản ở NAS).
- Xoá image SQL Server tạm: `docker image rm mcr.microsoft.com/mssql/server:2025-latest`.
- Nhóm phát triển gỡ `backend/scripts/pg-transfer/` và gói `mssql` khỏi backend.

---

## Xử lý sự cố

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| `Chưa có mạng Docker hospital_rms_default` | Stack chưa chạy lần nào | `docker compose -f docker-compose.prod.yml up -d redis` |
| `Đã có container rms-mssql-restore` | Lần trước chạy với `--keep` hoặc bị ngắt giữa chừng | `docker rm -f -v rms-mssql-restore` |
| `restore`: chờ mãi `chờ SQL Server nhận kết nối`, rồi lỗi | Thiếu RAM (SQL Server cần ≥ 2 GB) | `docker logs rms-mssql-restore`; dừng ClamAV, chạy lại |
| `restore`: `Cannot open backup device …` | File không đọc được trong container | Kiểm tra đường dẫn file, quyền đọc của user chạy script |
| `restore`: `Backup tạo từ SQL Server n.x, mới hơn server tạm` | SQL Server cũ mới hơn image tạm | Đặt `MSSQL_IMAGE` sang bản mới hơn |
| `restore`: `Backup có mã hoá` | Backup tạo `WITH ENCRYPTION` | Lấy lại backup không mã hoá (A.2) |
| `restore`: `File không có bản backup FULL` | File chỉ có bản differential / log | Lấy bản `BACKUP DATABASE … COPY_ONLY` đầy đủ (A.2) |
| `restore` lỗi `… exceeds the maximum allowed (10240 MB)` / hết chỗ | DB > 10 GB trên bản Express, hoặc ổ đầy | `MSSQL_PID=Developer`; dọn ổ (A.1) |
| `load`: `DB đích đã có bảng — load chỉ chạy trên DB rỗng` | Còn dữ liệu của lần chạy trước | Làm B.1 |
| `load`: `Cấu trúc 2 phía lệch` | Backup lấy từ bản code khác `dd0f62e` | Kiểm tra A.1; báo nhóm phát triển |
| `load` dừng giữa chừng ở `02_constraints_indexes` | Dữ liệu vi phạm UNIQUE / FK mà `precheck` không bắt được | Ghi lại thông báo lỗi, gửi nhóm phát triển; DB PG bỏ, làm lại từ B.1 |
| `verify`: `n chênh lệch` | Lỗi chuyển kiểu | Lúc cutover: D.1. Lúc diễn tập: gửi log cho nhóm phát triển |
| `password authentication failed for user "rms_migrate"` | Sai mật khẩu PG | Gõ lại (A.3); mật khẩu đúng là mật khẩu lúc tạo role |
| `no pg_hba.conf entry for host "172.x.x.x"` | Chưa thêm dòng cho mạng Docker vào `pg_hba.conf` | `infra/cai-dat-postgresql.md` mục 3, rồi `sudo systemctl reload postgresql@18-main` |
| `connect ECONNREFUSED …:5432` hoặc treo khi kết nối | PostgreSQL chưa chạy, hoặc firewall chặn mạng Docker | `systemctl status postgresql@18-main`; `infra/cai-dat-postgresql.md` mục 4 (ufw) |
| Backend: `The server does not support SSL connections` | PostgreSQL tắt SSL | Bật SSL (A.1) rồi khởi động lại PostgreSQL |
| Migration lỗi ở `2026-12-15_unique_nulls_not_distinct` | Có dòng trùng theo khoá UNIQUE (NULL được coi là trùng nhau) | File tự rollback. Gửi log cho nhóm phát triển xử lý dòng trùng |
| Mở file upload cũ báo không tìm thấy | Chưa chép volume `server_uploads` | Làm C.6 |
