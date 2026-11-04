# Chuyển dữ liệu từ SQL Server sang PostgreSQL (runbook)

Hướng dẫn từng bước để chuyển dữ liệu của Hospital RMS từ **hệ thống cũ**
(SQL Server) sang **hệ thống mới** (PostgreSQL 18), cùng chạy trên máy chủ Ubuntu,
và đổi ứng dụng sang dùng PostgreSQL.

- Cài PostgreSQL: `infra/cai-dat-postgresql.md`, làm **mục 1–5**. **Không** làm
  mục 6 "DB mới" (`migrate init`): DB phải rỗng thì công cụ chuyển dữ liệu mới
  nạp được.
- Lý do và thiết kế: `backend/database/POSTGRESQL_MIGRATION_PLAN.md` (mục 6.5 và
  chặng 4).

```
                 đọc (stream)                      COPY
SQL Server  ─────────────────►  pg:transfer  ─────────────────►  PostgreSQL 18
RMS_HOSPITAL                    (chạy trong                      rms_hospital
(host, cổng 1433)               container backend)              (host, cổng 5432)
```

Công cụ chuyển dữ liệu có 3 lệnh. Mã thoát khác 0 nghĩa là có lỗi hoặc chênh lệch.

| Lệnh | Làm gì | Ghi vào đâu |
|---|---|---|
| `precheck` | Tìm dữ liệu sẽ làm lần nạp thất bại hoặc đổi nghĩa | Không ghi gì |
| `load` | DB PG rỗng → bảng → nạp dữ liệu → ràng buộc, index → sequence → trigger → `VACUUM ANALYZE` | Chỉ ghi vào PG |
| `verify` | So số dòng, checksum từng bảng, sequence, ràng buộc giữa 2 DB | Không ghi gì |

## Tổng quan các giai đoạn

| Giai đoạn | Khi nào | Ứng dụng có phải dừng? |
|---|---|---|
| A. Chuẩn bị, `precheck`, sửa dữ liệu | Bất kỳ lúc nào, trước diễn tập 1–2 tuần | Không |
| B. Diễn tập (ít nhất 2 lần) | Ngoài giờ cao điểm | Không (chỉ đọc SQL Server) |
| C. Chuyển thật (cutover) | Khung bảo trì đã báo trước | **Có**, trong suốt khung bảo trì |
| D. Theo dõi, dọn dẹp | 1–4 tuần sau | Không |

---

## A. Chuẩn bị

### A.1. Điều kiện trước khi bắt đầu

- [ ] PostgreSQL 18 đã cài theo `infra/cai-dat-postgresql.md` mục 1–5: có role
  `rms_migrate`, `rms_app` và DB `rms_hospital` **rỗng**.
- [ ] PostgreSQL bật SSL. Ứng dụng ở production luôn kết nối mã hoá
  (`DB_ENCRYPT: "true"` trong `docker-compose.prod.yml`):

  ```bash
  sudo -u postgres psql -c "SHOW ssl;"     # phải là on
  ```

  Ubuntu thường tự bật SSL với chứng chỉ tự ký khi tạo cluster. Nếu ra `off`, đặt
  `ssl = on` cùng `ssl_cert_file` / `ssl_key_file` trong `rms.conf` rồi khởi động lại.
- [ ] SQL Server đã chạy **đủ** migration của bản code đang deploy. `load` so cấu
  trúc 2 phía và dừng nếu lệch:

  ```bash
  docker compose -f docker-compose.prod.yml run --rm --no-deps -T \
    -e DB_USER=rms_migrate -e DB_PASSWORD='<MAT_KHAU_MIGRATE_SQLSERVER>' \
    backend node scripts/migrate.js status
  ```

  Không được còn dòng `·` (file chưa chạy). Dòng `!` (file bị sửa sau khi đã chạy)
  thì hỏi nhóm phát triển trước khi làm tiếp.

- [ ] Bản code đang deploy là bản đã chạy được với PostgreSQL (nhóm phát triển xác
  nhận: `npm run test:pg` và smoke test trên PG đều qua).
- [ ] Ổ `/data` còn trống ít nhất **2 lần** dung lượng DB SQL Server hiện tại (dữ
  liệu PG, index, WAL, file backup trước khi chuyển).
- [ ] Có đủ 3 mật khẩu, lấy từ nơi quản lý mật khẩu của viện:
  `rms_migrate` (SQL Server), `rms_migrate` (PostgreSQL), `rms_app` (PostgreSQL).

### A.2. Cách chạy lệnh trên máy chủ

Image backend production **không có `npm`**, nên gọi thẳng bằng `node`, trong
container backend (cùng mạng, cùng cấu hình với ứng dụng). Mọi lệnh chạy trong
`/data/code/Hospital_RMS`.

Mở 1 phiên `tmux`, nhập mật khẩu 1 lần (không hiện trên màn hình, không lưu vào
lịch sử lệnh), rồi tạo 2 hàm tiện dùng:

```bash
cd /data/code/Hospital_RMS
read -rsp 'Mật khẩu rms_migrate (SQL Server): ' MSSQL_PW; echo
read -rsp 'Mật khẩu rms_migrate (PostgreSQL): ' PG_PW; echo

# Chuyển dữ liệu: nguồn = SQL Server theo backend/.env, đích = PostgreSQL trên host
transfer() {
  DB_PASSWORD="$MSSQL_PW" PG_TARGET_PASSWORD="$PG_PW" \
  docker compose -f docker-compose.prod.yml run --rm --no-deps -T \
    -e DB_CLIENT=mssql -e DB_USER=rms_migrate -e DB_PASSWORD \
    -e PG_TARGET_HOST=host.docker.internal -e PG_TARGET_USER=rms_migrate -e PG_TARGET_PASSWORD \
    backend node scripts/pg-transfer/index.js "$@"
}

# Migration trên PostgreSQL (database/pg/migrations/)
migrate_pg() {
  DB_PASSWORD="$PG_PW" \
  docker compose -f docker-compose.prod.yml run --rm --no-deps -T \
    -e DB_CLIENT=pg -e DB_SERVER=host.docker.internal -e DB_PORT=5432 \
    -e DB_DATABASE=rms_hospital -e DB_USER=rms_migrate -e DB_PASSWORD \
    backend node scripts/migrate.js "$@"
}
```

- `-e TÊN` không kèm giá trị: Docker lấy giá trị từ biến cùng tên của shell, nên
  mật khẩu không nằm trên dòng lệnh (`ps` không thấy).
- `DB_CLIENT=mssql` cho phía nguồn: luôn đọc SQL Server, kể cả sau khi
  `backend/.env` đã đổi sang PG.
- Số bảng nạp song song mặc định là 3. Máy mạnh thì thêm `-e PG_TRANSFER_PARALLEL=4`
  vào hàm `transfer`.
- Xong việc: `unset MSSQL_PW PG_PW`, hoặc đóng phiên `tmux`.

**Máy dev Windows** (diễn tập với DB dev): trong thư mục `backend/`, `.env` trỏ
tới SQL Server dev, mật khẩu PG lấy từ `%APPDATA%\postgresql\pgpass.conf`:

```bash
npm run pg:transfer precheck
npm run pg:transfer load
npm run pg:transfer verify
```

### A.3. Kiểm tra dữ liệu nguồn (`precheck`)

Chỉ đọc SQL Server, chạy được lúc ứng dụng đang hoạt động:

```bash
transfer precheck
```

Kết quả gồm các dòng `❌` (lỗi chặn, **phải sửa** trước khi `load`), `⚠️` (cảnh
báo, đọc và quyết định), và dòng cuối `✅ Không có lỗi chặn` hoặc số lỗi.

| Thông báo | Nguyên nhân | Cách xử lý |
|---|---|---|
| ❌ `Khoá ngoại …: n dòng … không có dòng cha` | Dòng mồ côi (FK bị tắt hoặc `NOCHECK` ở SQL Server). PG luôn kiểm tra FK | Nhóm phát triển viết script sửa (xoá dòng mồ côi, hoặc gắn lại dòng cha) |
| ❌ `…: n giá trị chứa ký tự NUL` | Ký tự `CHAR(0)`, thường từ file Excel cũ. PG không lưu được | Bỏ ký tự này trên SQL Server |
| ❌ `…: n giá trị không phải JSON hợp lệ (cột jsonb)` | Cột sẽ thành `jsonb` mà dữ liệu không phải JSON | Sửa dữ liệu trên SQL Server |
| ❌ `…: n địa chỉ IP không hợp lệ (cột inet)` | Cột sẽ thành `inet` | Sửa hoặc xoá giá trị đó |
| ❌ `Bảng … chưa có trong baseline PG` / `Baseline PG có bảng … nhưng DB nguồn không có` | Code đang deploy và DB lệch phiên bản | Kiểm tra lại A.1 (migration SQL Server); nếu vẫn lệch, báo nhóm phát triển (`npm run pg:baseline`) |
| ⚠️ `CHECK …: n dòng cũ vi phạm` | Ràng buộc SQL Server không áp cho dữ liệu cũ | Không cần làm gì: PG giữ đúng như vậy (`NOT VALID`) |
| ⚠️ `…: n giá trị có khoảng trắng cuối` | SQL Server coi `"a "` = `"a"`, PG thì không: đăng nhập hoặc tìm theo mã có thể không khớp | Nên cắt khoảng trắng trên SQL Server, nhất là `username`, `email`, mã danh mục |
| ⚠️ `DB nguồn dùng collation … (không phân biệt dấu)` | PG so sánh có phân biệt dấu | Ghi nhận; báo nhóm phát triển nếu cần |
| ⚠️ `… có trong DB nhưng không có trong database/objects/` | View, procedure… tạo tay ngoài repo, sẽ **không** được chuyển | Hỏi người tạo: còn dùng không? Còn thì đưa vào repo trước |

Mọi sửa đổi dữ liệu trên SQL Server production phải qua script đã duyệt
(migration hoặc `backend/database/manual/`) và có backup trước. Sửa xong, chạy lại
`transfer precheck` cho tới khi hết `❌`.

---

## B. Diễn tập

Làm **ít nhất 2 lần**, lần cuối trước ngày chuyển thật 1 ngày, với dữ liệu mới
nhất. Mục đích: chắc chắn `load` và `verify` qua, và đo thời gian để định khung
bảo trì. Ứng dụng vẫn chạy trên SQL Server; diễn tập chỉ đọc SQL Server, nên chạy
ngoài giờ cao điểm (đọc toàn bộ dữ liệu làm DB chậm đi).

### B.1. Tạo lại DB PG rỗng

`load` chỉ chạy trên DB rỗng. Từ lần thứ hai trở đi, xoá DB cũ rồi tạo lại:

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
time transfer precheck
time transfer load       # in từng bước kèm thời gian, cuối cùng "Xong sau …s"
time transfer verify     # phải kết thúc bằng "✅ Khớp hoàn toàn"
migrate_pg status        # các migration PG chưa chạy hiện "·"
migrate_pg               # chạy các file trong database/pg/migrations/
migrate_pg status        # mọi dòng phải là ✓ (không còn ·)
```

`load` tạo bảng `schema_migrations` rỗng. `migrate_pg` chạy các migration riêng
của PG. Các file này chạy lại được, chạy trên DB vừa nạp là an toàn.

### B.3. Ghi nhật ký diễn tập

| Lần | Ngày | Dung lượng DB SQL Server | `precheck` | `load` | `verify` | `migrate_pg` | Ghi chú |
|---|---|---|---|---|---|---|---|
| 1 | | | | | | | |
| 2 | | | | | | | |

Khung bảo trì = tổng thời gian đo được × 2, cộng 30 phút cho backup, đổi cấu hình
và kiểm tra tay. (Tham khảo: DB dev 144 MB nạp xong trong vài phút.)

Diễn tập xong thì để nguyên DB PG cũng được: bước C.4 sẽ xoá và tạo lại.

### B.4. Kiểm tra ứng dụng trên bản diễn tập (nhóm phát triển)

Trên máy dev hoặc staging có bản sao dữ liệu đã nạp vào PG:

- `npm run test:pg` và smoke test (`test-integration/smoke.test.js` với
  `DB_CLIENT=pg`) đều qua, JSON trả về giống bản SQL Server.
- Thử tay các luồng ghi quan trọng: đăng nhập (cả username viết **hoa**), 2FA,
  nộp và duyệt đề tài, hội đồng, điểm danh QR, đăng ký hội thảo, cấp CME, import
  Excel, xuất Word/Excel, mở file upload cũ.

---

## C. Chuyển thật (cutover)

Chuẩn bị: thông báo lịch bảo trì trước **7 ngày**, từ đó không deploy thay đổi
schema. Có người của nhóm phát triển trực trong khung bảo trì. In bảng dưới ra
để đánh dấu từng bước, ghi giờ bắt đầu và kết thúc.

| # | Bước | Xong lúc |
|---|---|---|
| C.1 | Dừng backend | |
| C.2 | Backup SQL Server, kiểm tra file backup | |
| C.3 | Đặt SQL Server chỉ đọc | |
| C.4 | Tạo lại DB PG rỗng | |
| C.5 | `precheck` → `load` → `verify` | |
| C.6 | Migration PG | |
| C.7 | Đổi cấu hình backend sang PG | |
| C.8 | Khởi động backend | |
| C.9 | Kiểm tra tay | |
| C.10 | **Go / no-go**, mở cho người dùng | |

### C.1. Dừng backend

```bash
cd /data/code/Hospital_RMS
docker compose -f docker-compose.prod.yml stop backend
docker compose -f docker-compose.prod.yml ps        # backend: exited
```

Dừng backend là dừng luôn các job định kỳ (chạy trong backend). Người dùng sẽ
thấy lỗi kết nối cho tới bước C.10.

### C.2. Backup SQL Server

```bash
sqlcmd -S localhost -U sa -C -Q "BACKUP DATABASE RMS_HOSPITAL
  TO DISK = N'/data/mssql/backup/RMS_HOSPITAL_truoc_PG.bak' WITH CHECKSUM, INIT"
sqlcmd -S localhost -U sa -C -Q "RESTORE VERIFYONLY
  FROM DISK = N'/data/mssql/backup/RMS_HOSPITAL_truoc_PG.bak' WITH CHECKSUM"
```

Thấy `The backup set on file 1 is valid.` là được. Chép file `.bak` ra **ngoài
máy** (NAS) trước khi làm tiếp.

### C.3. Đặt SQL Server chỉ đọc

Bảo đảm không còn ai ghi vào DB cũ trong lúc chuyển (job ngoài, công cụ quản trị):

```bash
sqlcmd -S localhost -U sa -C -Q "ALTER DATABASE RMS_HOSPITAL SET READ_ONLY WITH ROLLBACK IMMEDIATE"
sqlcmd -S localhost -U sa -C -Q "SELECT is_read_only FROM sys.databases WHERE name = 'RMS_HOSPITAL'"   # 1
```

### C.4. Tạo lại DB PG rỗng

Làm như **B.1** (xoá bản diễn tập, tạo DB mới rỗng).

### C.5. Chuyển dữ liệu

Tạo lại 2 hàm `transfer` / `migrate_pg` (A.2) nếu đang ở phiên mới, rồi:

```bash
transfer precheck    # ✅ Không có lỗi chặn
transfer load        # Xong sau …s
transfer verify      # ✅ Khớp hoàn toàn
```

**Bất kỳ lệnh nào báo lỗi hoặc `verify` có chênh lệch: DỪNG, làm mục D.1 (quay
lại SQL Server).** Không sửa dữ liệu hay chạy lại tuỳ tiện trong khung bảo trì.

### C.6. Migration PG

```bash
migrate_pg
migrate_pg status    # mọi dòng ✓ (không còn ·)
```

### C.7. Đổi cấu hình backend sang PG

Giữ lại bản cấu hình cũ để quay lại khi cần:

```bash
cp -p backend/.env backend/.env.mssql
cp -p backend/.env.production backend/.env.production.mssql
nano backend/.env
```

Trong `backend/.env`, sửa (hoặc thêm) các dòng:

```env
DB_CLIENT=pg
DB_SERVER=host.docker.internal
DB_PORT=5432
DB_DATABASE=rms_hospital
DB_TRUST_SERVER_CERT=true
```

Trong `backend/.env.production`, đổi `DB_PASSWORD` thành mật khẩu `rms_app` **của
PostgreSQL** (`DB_USER=rms_app` giữ nguyên):

```bash
nano backend/.env.production
chmod 600 backend/.env backend/.env.production backend/.env.mssql backend/.env.production.mssql
```

`DB_TRUST_SERVER_CERT=true`: mã hoá kết nối nhưng chấp nhận chứng chỉ tự ký. Khi
PostgreSQL có chứng chỉ do CA cấp, đặt `DB_CA_CERT_FILE` (xem `backend/src/config/env.js`).

### C.8. Khởi động backend

```bash
docker compose -f docker-compose.prod.yml up -d backend
docker compose -f docker-compose.prod.yml logs -f backend   # Ctrl+C để thoát
```

Trong log phải thấy `✅ Connected to PostgreSQL` và không có lỗi lặp lại. Sau
khoảng 1 phút:

```bash
docker compose -f docker-compose.prod.yml ps                 # backend: healthy
```

### C.9. Kiểm tra tay (15–20 phút, chỉ xem, không sửa dữ liệu)

Dùng tài khoản thật của nhóm vận hành:

- [ ] Đăng nhập, gõ username **viết hoa**; 2FA (nếu tài khoản có bật).
- [ ] Danh sách và chi tiết: đề tài, hội đồng, hội thảo, khoá học, học viên, CME.
- [ ] Tìm kiếm có dấu và không dấu (tên người, tên đề tài).
- [ ] Mở 2–3 file upload cũ (minh chứng, tài liệu khoá học).
- [ ] Dashboard, báo cáo; xuất 1 file Excel.
- [ ] Ngày giờ hiển thị đúng giờ Việt Nam (so 1 bản ghi với dữ liệu cũ).

### C.10. Go / no-go

- **Go**: báo người dùng hệ thống đã hoạt động lại. **Từ thời điểm này**, dữ liệu
  mới chỉ nằm ở PostgreSQL.
- **No-go** (lỗi ở C.8–C.9): làm mục D.1, đặt lịch chuyển lại sau khi tìm ra nguyên nhân.

---

## D. Sau khi chuyển

### D.1. Quay lại SQL Server (chỉ trước mốc go)

Trước C.10, SQL Server vẫn còn nguyên dữ liệu, quay lại **không mất gì**:

```bash
docker compose -f docker-compose.prod.yml stop backend
cp -p backend/.env.mssql backend/.env
cp -p backend/.env.production.mssql backend/.env.production
sqlcmd -S localhost -U sa -C -Q "ALTER DATABASE RMS_HOSPITAL SET READ_WRITE"
docker compose -f docker-compose.prod.yml up -d backend
```

**Sau mốc go**: người dùng đã ghi dữ liệu mới vào PG. Quay lại SQL Server sẽ mất
phần dữ liệu đó. Hiện **chưa có** công cụ chuyển ngược PG → SQL Server; phải bàn
với nhóm phát triển trước khi quyết định.

### D.2. Việc cần làm ngay sau khi go

- [ ] Bật sao lưu PostgreSQL (pgBackRest): `infra/cai-dat-postgresql.md` mục 7.
  Chạy bản đầy đủ đầu tiên ngay trong ngày.
- [ ] Deploy về sau: `MIGRATION_DB_USER=rms_migrate`, `MIGRATION_DB_PASSWORD` là
  mật khẩu `rms_migrate` **của PostgreSQL** (`scripts/deploy.ps1`).
- [ ] Giữ SQL Server ở chế độ chỉ đọc, **không xoá**, ít nhất 1 tháng. Giữ file
  `RMS_HOSPITAL_truoc_PG.bak` ở NAS lâu dài.

### D.3. Theo dõi 1–2 tuần

- Log backend: lỗi 5xx, lỗi DB (`docker compose -f docker-compose.prod.yml logs backend`).
- Truy vấn chậm và bảng lớn: `infra/cai-dat-postgresql.md` mục 8.
- Số kết nối: không vượt `WEB_CONCURRENCY × DB_POOL_MAX` + dự phòng
  (`SELECT count(*) FROM pg_stat_activity WHERE datname = 'rms_hospital';`).

### D.4. Dọn dẹp (sau khoảng 1 tháng ổn định)

- Dừng hẳn SQL Server (`sudo systemctl disable --now mssql-server`) khi đã chắc
  không cần quay lại.
- Xoá `backend/.env.mssql`, `backend/.env.production.mssql`.
- Nhóm phát triển gỡ nhánh code SQL Server (`POSTGRESQL_MIGRATION_PLAN.md` chặng 4, bước 12).

---

## Xử lý sự cố

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| `load`: `DB đích đã có bảng — load chỉ chạy trên DB rỗng` | Còn dữ liệu của lần chạy trước | Làm B.1 |
| `load`: `Cấu trúc 2 phía lệch` | SQL Server thiếu migration, hoặc code deploy chưa khớp DB | Kiểm tra A.1; báo nhóm phát triển |
| `load` dừng giữa chừng ở `02_constraints_indexes` | Dữ liệu vi phạm UNIQUE / FK mà `precheck` không bắt được | Ghi lại thông báo lỗi, gửi nhóm phát triển; DB PG bỏ, làm lại từ B.1 |
| `verify`: `n chênh lệch` | Dữ liệu SQL Server bị ghi trong lúc nạp, hoặc lỗi chuyển kiểu | Lúc cutover: D.1. Lúc diễn tập: gửi log cho nhóm phát triển |
| `password authentication failed for user "rms_migrate"` | Sai mật khẩu PG | Gõ lại `read -rsp … PG_PW`; mật khẩu đúng là mật khẩu lúc tạo role |
| `no pg_hba.conf entry for host "172.x.x.x"` | Chưa thêm dòng cho mạng Docker vào `pg_hba.conf` | `infra/cai-dat-postgresql.md` mục 3, rồi `sudo systemctl reload postgresql@18-main` |
| `connect ECONNREFUSED …:5432` hoặc treo khi kết nối | PostgreSQL chưa chạy, hoặc firewall chặn mạng Docker | `systemctl status postgresql@18-main`; mục 4 (ufw) |
| Backend: `The server does not support SSL connections` | PostgreSQL tắt SSL | Bật SSL (A.1) rồi khởi động lại PostgreSQL |
| `migrate_pg` lỗi ở `2026-12-15_unique_nulls_not_distinct` | Có dòng trùng theo khoá UNIQUE (NULL được coi là trùng nhau) | File tự rollback. Gửi log cho nhóm phát triển xử lý dòng trùng |
| `migrate_pg` báo `Chưa có bảng schema_migrations` | DB không được tạo bằng `load` | DB này không dùng được cho cutover: làm lại từ B.1 |
