# Kế hoạch chuẩn bị chuyển CSDL: SQL Server → PostgreSQL

> Trạng thái: **bản nháp để thảo luận** (28/10/2026, rà soát lại 03/11/2026). Chưa có quyết định chuyển.
> Mục tiêu tài liệu: biết chính xác phải sửa những gì, làm theo thứ tự nào để
> hệ thống vẫn chạy ổn trong suốt quá trình, và có đường lui khi chuyển hỏng.
>
> Tài liệu đi kèm: [`DB_SCALING_PLAN.md`](DB_SCALING_PLAN.md) — tối ưu bảng, index,
> cấu hình PostgreSQL để vận hành lâu dài khi dữ liệu phình to.

## 0. Rà soát 03/11/2026: đã sẵn sàng chưa?

**Kết luận ngắn:**

- **Chạy trên Linux: gần sẵn sàng.** Ứng dụng đã chạy trong container Linux
  (`node:24-alpine`, Nginx, Redis, ClamAV) và đã có hướng dẫn dựng máy Ubuntu
  (`infra/cai-dat-may-ao-ubuntu.md`). Còn thiếu khâu **triển khai tự động**, vì
  nó viết bằng PowerShell cho server Windows. Ước lượng khoảng 1 tuần.
- **Chạy trên PostgreSQL: chưa sẵn sàng.** Mới xong 2 việc chuẩn bị (`dbErrors.js`,
  script đếm `check:tsql`). Số chỗ T-SQL còn **1.135** (mốc đã sửa lỗi đếm nhầm, mục 6 chặng 0).
  Chưa có adapter `pg`, chưa có schema PG, chưa có script chuyển dữ liệu, CI
  chưa chạy với PG. Còn khoảng **8–11 tuần** cho 1 người (mục 9).

**Đề xuất: tách 2 việc, không đổi hệ điều hành và DB cùng lúc.**

1. **Bước A — Lên Linux, vẫn dùng SQL Server** (theo `infra/cai-dat-may-ao-ubuntu.md`,
   nên dùng Ubuntu **24.04 LTS**, bản SQL Server được hỗ trợ chính thức). Rủi ro
   thấp vì code DB không đổi.
2. **Bước B — Đổi sang PostgreSQL** trên cùng máy Linux, theo chặng 1–4 bên dưới.
   PostgreSQL 18 có gói chính thức (kho PGDG) cho cả Ubuntu 24.04 và 26.04.

Nếu bắt buộc bỏ SQL Server ngay (bản quyền, giới hạn bản Express), có thể bỏ
bước A và giữ máy Windows hiện tại tới khi xong bước B.

### 0.1 Bảng đánh giá

| Hạng mục | Trạng thái | Chi tiết |
|---|---|---|
| Ứng dụng chạy trên Linux | ✅ | Image `node:24-alpine`; đường dẫn dùng `path.join/resolve`; entrypoint tự bỏ CRLF; font cho `@napi-rs/canvas` nằm trong `src/assets/fonts`; DB lưu đường dẫn file dạng `/uploads/...` (gạch chéo xuôi) |
| Hướng dẫn dựng server Linux | ✅ | `infra/cai-dat-may-ao-ubuntu.md` (Ubuntu 26.04 + SQL Server 2025 bản cho 24.04, chưa được Microsoft hỗ trợ chính thức) |
| Triển khai tự động (CI/CD) | ❌ | `.github/workflows/deploy.yml` dùng `shell: powershell` và gọi `scripts/deploy.ps1`. Cần viết lại `deploy.sh` (bash), hoặc cài `pwsh` trên runner Linux và sửa script cho chạy được trên PowerShell 7. Tương tự `scripts/rotate-jwt-secrets.ps1`, `backend/scripts/import-dtlt.ps1` |
| Backup trước migration | ⚠️ | `MIGRATION_BACKUP_DIR` là thư mục **trên máy SQL Server** (`BACKUP DATABASE`). Lên Linux vẫn chạy được nếu SQL Server cùng máy. Với PG phải đổi sang `pg_dump` |
| Driver và lớp truy cập DB | ❌ | Chỉ có `mssql`. Chưa có `db.pg.js`, chưa có biến `DB_CLIENT` |
| Câu SQL trong code | ❌ | 1.135 chỗ / 27 loại cú pháp chỉ T-SQL có (`npm run check:tsql`) |
| Logic nằm trong DB | ❌ | 44 procedure, 16 trigger, 2 view, 1 function, chưa chuyển cái nào về JS |
| Schema gốc trong repo | ❌ | Các bảng lõi (`users`, `topics`, `notifications`, `refresh_tokens`, `files`, `departments`, `roles`...) **không có** câu `CREATE TABLE` trong `migrations/`, vì được tạo tay trước khi có migration. Schema PG phải sinh từ DB thật (mục 5.3), không dựng lại được từ repo |
| Mã lỗi DB | ✅ | `src/utils/dbErrors.js`, không còn chỗ so `err.number` |
| Theo dõi tiến độ | ✅ | `check:tsql` + test ratchet trong CI |
| Test trên PG | ❌ | CI không có DB; `fakeDb` trong test khớp theo chuỗi SQL, sẽ phải sửa theo |
| Script chuyển dữ liệu | ❌ | Chưa có (thiết kế ở mục 6.5) |
| Dữ liệu sẵn sàng để chuyển | ⚠️ | Đo trên DB dev: 10 ràng buộc `CHECK` ở trạng thái "không tin cậy" (dữ liệu cũ có thể vi phạm), 48 khoá ngoại không có index (PG không tự tạo), 4 cột tính toán, collation `SQL_Latin1_General_CP1_CI_AS` (không phân biệt hoa/thường) |

### 0.2 Số liệu DB dev (03/11/2026, chỉ đọc)

- SQL Server 2025 **Express**, DB `RMS_HOSPITAL` 144 MB, 108 bảng. Bảng lớn nhất là
  `users` (1.860 dòng), `persons` (1.936), `staff_practice_licenses` (1.479),
  `program_lessons` (1.764). Dữ liệu dev còn nhỏ, chuyển dữ liệu chỉ mất vài phút.
- Bản Express giới hạn **10 GB mỗi DB** và ~1,4 GB RAM cho bộ đệm. Nếu production
  cũng là Express thì đây là một lý do chính đáng để chuyển (Q1).
- Cần đo lại trên **production** ở chặng 0 (kích thước, số dòng, collation).

## 1. Tóm tắt

- Backend phụ thuộc **khá sâu** vào T-SQL: ~770 lời gọi `.query()` trong 127 file,
  ~1.850 tham số `.input()` có kiểu `sql.*`, 44 procedure + 16 trigger + 2 view +
  1 function, ~11.900 dòng migration viết bằng T-SQL.
- Không có ORM hay query builder. SQL viết tay trong từng service, nên phải
  sửa **từng câu**. Chỉ đổi driver là không đủ.
- Đề xuất làm **4 chặng**, mỗi chặng có thể phát hành riêng:
  1. **Trung lập hoá trên SQL Server** (hệ thống vẫn chạy SQL Server): bỏ dần cú
     pháp chỉ T-SQL mới có, chuyển nghiệp vụ trong DB về JS, dựng lớp truy cập
     DB mỏng. Đây là phần lớn công việc, và rủi ro thấp vì mỗi bước kiểm tra
     được ngay trên DB hiện tại.
  2. **Dựng PostgreSQL song song**: schema baseline, chuyển dữ liệu thử, chạy
     test và smoke test trên PG.
  3. **Chuyển SQL còn lại** sang PG và **diễn tập** chuyển dữ liệu trên bản sao
     production (ít nhất 2 lần).
  4. **Cutover** trong một khung bảo trì, giữ SQL Server ở chế độ chỉ đọc để lui.
- Ước lượng thô cho 1 lập trình viên quen code: **8–12 tuần**. Chi tiết ở mục 9.

## 2. Hiện trạng (đo trên nhánh `main`, 28/10/2026)

### 2.1 Kết nối và hạ tầng

| Thành phần | Hiện tại | Ghi chú khi chuyển |
|---|---|---|
| Driver | `mssql` 12 (tedious), pool chung ở `backend/src/config/db.js` | Thay bằng `pg` (node-postgres). `getPool`, `sql`, `withTransaction` được import ở 130 file. |
| Cấu hình | `DB_SERVER`, `DB_PORT=1433`, `DB_ENCRYPT`, `DB_TRUST_SERVER_CERT`, `DB_POOL_MAX` (`src/config/env.js`) | Đổi sang `DB_HOST`, `DB_PORT=5432`, `DB_SSLMODE`... Cảnh báo prod (`DB_USER=sa`) cần viết lại. |
| Vị trí DB | Ngoài Docker, trên máy host hoặc máy riêng (`host.docker.internal`) | Cần chọn nơi đặt PG (mục 3). |
| Migration | `src/database/migrator.js`: tách batch theo `GO`, khoá `sp_getapplock`, `BACKUP DATABASE ... COPY_ONLY`, bảng `dbo.schema_migrations` | Viết lại phần phụ thuộc T-SQL (mục 5.3). |
| Deploy | `scripts/deploy.ps1` chạy `node scripts/migrate.js` bằng login có quyền ALTER/BACKUP | Đổi cách backup trước migration (`pg_dump`). |
| CI | `.github/workflows/ci.yml` **không cần DB**: test dùng CSDL giả `test/**/fakeDb.js` | Nên thêm job có service container PostgreSQL (mục 7). |
| Smoke test | `test-integration/smoke.test.js` gọi mọi API GET trên DB thật, so dạng JSON với baseline | Công cụ rất có giá trị để so SQL Server và PG trên cùng dữ liệu. |
| Kết nối số lượng | `WEB_CONCURRENCY × DB_POOL_MAX` (prod mặc định 6 × 10) | Phải nhỏ hơn `max_connections` của PG. Cân nhắc PgBouncer. |

### 2.2 Mức độ dùng cú pháp riêng của T-SQL trong `src/` và `scripts/`

| Cú pháp | Số chỗ (file) | Tương đương PostgreSQL |
|---|---|---|
| `@ten` tham số đặt tên + `.input(name, sql.Type, v)` | 1.848 (118) | `$1, $2…` (thứ tự) — xử lý tự động trong lớp adapter, mục 5.1 |
| `sql.NVarChar`, `sql.Int`, `sql.DateTime`... | 2.115 (119) | Bỏ, hoặc chỉ dùng để ép kiểu `$1::int` khi cần |
| `recordset` / `recordsets[i]` (nhiều kết quả trong 1 batch) | 673 / 91 — **recordsets đã hết** (`queryAll`) | `rows`; nhiều kết quả → tách thành nhiều câu |
| `GETDATE()`, `SYSDATETIME()`, `SYSUTCDATETIME()` | 212 (86) → 5 (comment + migrator SQL Server) | `nowSql` / `utcNowSql` / `vnTodaySql` của adapter — xem mục 4.3 về múi giờ |
| `N'...'` | 339 (98) | `'...'` (PG luôn là UTF-8) |
| Định danh `[ten]` | 658 (156) | `"ten"` hoặc bỏ ngoặc |
| `ISNULL(` | 108 (33) — **đã đổi hết** | `COALESCE(` (chạy được trên cả 2 DB) |
| `EXEC sp_set_actor @actor_id; ...` | 76 (27) | `set_config('app.current_user_id', $1, true)` trong transaction |
| `EXEC sp_gen_*` / `.execute(...)` | ~20 / 10 → 0 (đã xong) | Hàm sinh mã `src/utils/idGenerator.js` (mục 5.4) |
| `DECLARE @...` (batch nhiều câu) | 80 (47) → 1 (chỉ còn `sp_getapplock` trong `db.mssql.js`) | Viết lại: CTE, nhiều lời gọi JS, hoặc hàm PL/pgSQL |
| `TOP n` | 71 (45) → 1 (nhãn Excel, không phải SQL) | `ORDER BY … OFFSET 0 ROWS FETCH NEXT n ROWS ONLY` (chạy cả 2 DB) |
| `NEWID()` | 42 (27) — **đã đổi hết** | `randomId` / `randomHex32` (JS) hoặc `newIdSql` của adapter |
| `OPENJSON(@ids)` | 31 (15) | `= ANY($1::text[])` hoặc `jsonb_array_elements_text($1)` |
| `DATEADD` / `DATEDIFF` | 31 (18) → 0 | `dateAdd` / `dateDiff` của adapter (PG: `+ n * interval`, `date - date`, `date_trunc`) |
| `STRING_AGG(...) WITHIN GROUP (ORDER BY ...)` | 25 (13) → 0 | `stringAgg(x, sep, thứ tự)` của adapter (PG: `string_agg(CAST(x AS TEXT), sep ORDER BY ...)`) |
| `CROSS APPLY` / `OUTER APPLY` | 25 (19) → 2 (comment) | `crossApply` / `outerApply` của adapter (PG: `CROSS JOIN LATERAL` / `LEFT JOIN LATERAL ... ON true`) |
| `LIKE ... ESCAPE`, `LIKE '[0-9]'` | 25 (4) + nhiều mẫu `[0-9]` | PG `LIKE` **không** có lớp ký tự `[...]` → dùng `~ '^...[0-9]{3}$'` |
| `OUTPUT INSERTED/DELETED` | 19 (13) → 0 | `RETURNING` (`insertReturning` / `updateReturning` / `deleteReturning` của adapter) |
| `SCOPE_IDENTITY()`, `@@ROWCOUNT`, `@@TRANCOUNT` | 18 (13) → 0 | `rowsAffected[0]` của câu ghi (PG: `rowCount`); upsert `IF @@ROWCOUNT = 0` viết bằng JS |
| `CAST(... AS NVARCHAR/BIT/DATETIME)` | 59 (35) | `::text`, `::boolean`, `::timestamp`. Cột boolean trong SELECT: `boolExpr(đk)` / `castBool(x)` của adapter (SQL Server ra BIT, PG ra boolean) |
| `CONVERT(`, `TRY_CAST(` | 20 (8) → 0 | `formatDate` / `tryCastInt` của adapter (PG: `to_char`, regex rồi `CAST`) |
| `MERGE` (có `WITH (HOLDLOCK)`) | 10 (9) → 0 | `upsert({...})` của adapter (PG: `INSERT ... ON CONFLICT DO UPDATE`) |
| Gợi ý khoá `UPDLOCK/HOLDLOCK`, `sp_getapplock` | 5 + 6 | `SELECT ... FOR UPDATE`; khoá dải mã → `pg_advisory_xact_lock(hashtext(...))` |
| Bảng tạm `#t`, biến bảng `@t TABLE` | 21 (3) + 8 | `CREATE TEMP TABLE ... ON COMMIT DROP`, CTE |
| `THROW 5xxxx` / `RAISERROR` + kiểm `err.number` | 7 + 45 (19) | `RAISE EXCEPTION ... USING ERRCODE`; đọc `err.code` (mã SQLSTATE) |
| `err.number === 2627/2601` (trùng khoá), `547` (FK), `207/208` | ~20 | `23505`, `23503`, `42703/42P01` |
| `OFFSET ... FETCH NEXT` | 6 (3) | Giữ nguyên (PG hỗ trợ cú pháp chuẩn này) |
| `FOR JSON` | 5 (4) → 0 | `jsonArray(select, orderBy)` của adapter (PG: `jsonb_agg(jsonb_strip_nulls(to_jsonb(j)) ORDER BY …)`) |
| `ROW_NUMBER() OVER` | 5 (3) | Giữ nguyên |

> Số liệu đếm bằng `grep`, có thể lệch vài chỗ (chuỗi trong comment). Mục 6.1
> có bước tạo script đếm lại tự động để theo dõi tiến độ.

### 2.3 Schema và object trong DB

| Nhóm | Số lượng | Ghi chú |
|---|---|---|
| Bảng | ~80 | Khoá chính chủ yếu là mã chuỗi `VARCHAR` sinh theo tiền tố (`LDT01`, `NV..`, `<abbr>_<năm>_001`) |
| Cột `NVARCHAR` | 461 (93 cột `NVARCHAR(MAX)`) | → `text` / `varchar(n)` |
| `DATETIME2` / `DATETIME` | ≥56 | → `timestamp` (không múi giờ), mục 4.3 |
| `BIT` | 56 | → `boolean`. Code so `= 1` / `= 0` đã đổi sang `= 'true'` / `'false'` (chạy cả 2 DB) |
| `IDENTITY` | 11 | → `GENERATED BY DEFAULT AS IDENTITY` + `setval` sau khi nạp dữ liệu |
| `SEQUENCE` | vài cái (`seq_person_id`...) | Giữ, nhớ `setval` |
| Cột tính toán `PERSISTED` | 7 | → `GENERATED ALWAYS AS (...) STORED` |
| Index lọc (`WHERE`) / `INCLUDE` | 17 / 9 | PG hỗ trợ cả hai (partial index, `INCLUDE`) |
| `CHECK`, `DEFAULT` | 81 / 144 | Phần lớn chuyển thẳng; `DEFAULT (getdate())` → `DEFAULT LOCALTIMESTAMP` |
| Procedure | 44 | 11 cái không ai gọi hoặc đã no-op (theo `database/README.md`) → **xoá, không chuyển** |
| Trigger | 16 | 13 trigger audit giống nhau → 1 hàm trigger PL/pgSQL dùng chung |
| View / Function | 2 / 1 | 2 view không ai gọi trong code — hỏi vận hành trước |

### 2.4 Hành vi ngầm cần giữ nguyên (dễ sai nhất)

1. **Không phân biệt hoa/thường.** Collation SQL Server mặc định là `*_CI_AS`:
   `username = 'ABC'` khớp `'abc'`, `LIKE` không phân biệt hoa/thường, index
   `UNIQUE` chặn cả `Abc` lẫn `abc`. PostgreSQL mặc định **phân biệt**. Đăng
   nhập, tìm kiếm, kiểm tra trùng mã/email có thể sai ngay mà không báo lỗi.
2. **Giờ.** `GETDATE()` trả giờ địa phương của máy SQL Server (giờ VN). Driver
   `mssql` mặc định `useUTC: true`, nên JS nhận giờ VN nhưng gắn nhãn UTC.
   Code đã viết dựa theo quy ước này (`credentialService.js`, `seminarPublicService.js`,
   `vnDate.js`). Driver `pg` đọc `timestamp` theo múi giờ của tiến trình Node,
   nên giờ sẽ lệch 7 tiếng nếu không cấu hình lại.
3. **Chuỗi rỗng và khoảng trắng cuối.** SQL Server bỏ qua khoảng trắng cuối khi
   so sánh `=` (`'a ' = 'a'`), PostgreSQL thì không (với `text`/`varchar`).
4. **Thứ tự mặc định khi không có `ORDER BY`** khác nhau. Câu nào phụ thuộc
   "thứ tự tự nhiên" sẽ trả kết quả khác.
5. **Ép kiểu ngầm.** SQL Server tự ép `'123' = 123`, PG báo lỗi kiểu. Tham số
   gửi dưới dạng chuỗi so với cột số cần `::int`.
6. **Batch nhiều câu + tham số.** `mssql` cho chạy `EXEC sp_set_actor @a; UPDATE ...`
   trong 1 lời gọi. Giao thức có tham số của PG chỉ nhận **1 câu** mỗi lời gọi.
7. **Transaction bị huỷ.** Trong PG, sau 1 lỗi bất kỳ thì transaction ở trạng
   thái "aborted", mọi câu sau đều lỗi cho tới `ROLLBACK`. Code đang bắt lỗi
   trùng khoá rồi chạy tiếp trong cùng transaction phải dùng `SAVEPOINT` hoặc
   `ON CONFLICT`.

## 3. Quyết định cần chốt trước khi bắt đầu

| # | Câu hỏi | Đề xuất |
|---|---|---|
| Q1 | Lý do chuyển (bản quyền, chi phí, hạ tầng, chính sách)? Có hạn chót không? | Ghi rõ lý do. Lý do quyết định mức đầu tư hợp lý. |
| Q2 | Phiên bản PostgreSQL | **18** (hoặc mới hơn, đã có vài bản vá). Cần ≥ 17 nếu muốn `MERGE ... RETURNING`. |
| Q3 | Đặt PG ở đâu: container trong compose, VM riêng, hay dịch vụ quản lý? | **Đã chốt:** cài thẳng trên server Ubuntu (systemd, ngoài Docker), giống SQL Server hiện tại. Container gọi ra qua `host.docker.internal`. Hướng dẫn: `infra/cai-dat-postgresql.md`. |
| Q4 | Thời gian dừng hệ thống cho phép khi cutover | Nếu DB < vài chục GB: 1 khung bảo trì 2–4 giờ ngoài giờ hành chính là đủ, không cần đồng bộ liên tục (CDC). |
| Q5 | Có hệ thống ngoài đọc/ghi thẳng DB không (SQL Agent job, báo cáo, Power BI, Excel kết nối DB, hai view `vw_*_audit`)? | Kiểm kê trên production (mục 6.1). Mỗi thứ tìm được đều phải có phương án. |
| Q6 | Cách xử lý không phân biệt hoa/thường | Collation `rms_ci` (ICU, không tất định) cho cột định danh (`username`, `email`, mã) + `ILIKE` cho tìm kiếm. Xem mục 4.2. |
| Q7 | Có dừng thêm migration schema trong thời gian chuyển không? | Từ khi bắt đầu chặng 2: **mỗi migration mới phải viết kèm bản PG**. Trước cutover 1–2 tuần: đóng băng schema. |

## 4. Quy tắc chuyển đổi

### 4.1 Kiểu dữ liệu

| SQL Server | PostgreSQL | Ghi chú |
|---|---|---|
| `VARCHAR(n)`, `NVARCHAR(n)` | `varchar(n)` (thêm `COLLATE "rms_ci"` cho cột cần không phân biệt hoa/thường) | PG đếm ký tự, không đếm byte |
| `NVARCHAR(MAX)`, `VARCHAR(MAX)`, `NTEXT` | `text` | Cột chứa JSON (`options`, `answer_options`...) → cân nhắc `jsonb` ở bước sau, chưa đổi ngay |
| `CHAR(n)`, `NCHAR(n)` | `char(n)` | Cẩn thận khoảng trắng đệm |
| `BIT` | `boolean` | Sửa `= 1` → `= true` (hoặc `IS TRUE`) |
| `TINYINT` | `smallint` | PG không có số 1 byte |
| `INT`, `BIGINT`, `SMALLINT` | giữ nguyên | |
| `DECIMAL(p,s)`, `NUMERIC` | `numeric(p,s)` | `pg` trả `numeric` dạng **chuỗi** → cần type parser |
| `FLOAT`, `REAL` | `double precision`, `real` | |
| `MONEY` | `numeric(19,4)` | |
| `DATE` | `date` | `pg` mặc định đổi `date` thành `Date` theo giờ địa phương → cấu hình parser |
| `DATETIME`, `DATETIME2`, `SMALLDATETIME` | `timestamp(3)` / `timestamp` | Xem 4.3 |
| `DATETIMEOFFSET` | `timestamptz` | |
| `TIME` | `time` | |
| `UNIQUEIDENTIFIER` | `uuid` | Chưa thấy dùng làm kiểu cột |
| `VARBINARY` | `bytea` | Chưa thấy dùng |
| `IDENTITY(1,1)` | `GENERATED BY DEFAULT AS IDENTITY` | `BY DEFAULT` để nạp được id cũ |

### 4.2 Không phân biệt hoa/thường

- Cột định danh người dùng gõ vào (`users.username`, `email`, `staff_number`, mã
  khoa/danh mục): dùng collation ICU không tất định `rms_ci`
  (`00_extensions.sql`, cần PG ≥ 18 để `LIKE` chạy được trên cột này). `=`,
  `UNIQUE`, `IN` không phân biệt hoa/thường như cũ, vẫn phân biệt dấu như
  `_CI_AS`, không phải sửa câu SQL. **Không dùng `citext`**: tham số kiểu
  `text` (`$1::text`, cách adapter gửi chuỗi) so với cột `citext` lại thành
  so sánh phân biệt hoa/thường và bỏ qua index; với `rms_ci` thì không.
- Tìm kiếm `LIKE @search` (27 file): đổi sang `ILIKE`. Nếu cần tìm không dấu
  ("nguyen" khớp "Nguyễn"), thêm extension `unaccent` và index theo biểu thức.
  Hiện tại SQL Server `_CI_AS` **có** phân biệt dấu, nên tìm không dấu là tính
  năng mới, không bắt buộc.
- Ghi lại collation thật của DB và từng cột trên production trước (mục 6.1),
  vì có thể có cột khai báo collation riêng.

### 4.3 Ngày giờ

Giữ đúng quy ước hiện tại: **DB lưu giờ VN không kèm múi giờ; JS nhận `Date`
như thể giờ đó là UTC**. Cách làm:

- Cột `DATETIME/DATETIME2` → `timestamp` (không `tz`), chuyển giá trị nguyên văn.
- Đặt `timezone = 'Asia/Ho_Chi_Minh'` cho DB/role ứng dụng, để `LOCALTIMESTAMP`
  trả giờ VN như `GETDATE()`.
- Trong adapter: `types.setTypeParser(1114, s => new Date(s.replace(' ', 'T') + 'Z'))`
  cho `timestamp`, và `1082` (`date`) → `new Date(s + 'T00:00:00Z')`. Khi gửi
  tham số `Date` xuống, định dạng theo UTC (giống `useUTC: true`).
- Cột `jsonb`/`json` (danh sách ở `scripts/pg/schemaRules.js`): `pg` mặc định
  trả **object** đã parse, còn code hiện tại nhận chuỗi rồi tự `JSON.parse`.
  Adapter phải đặt `setTypeParser(3802, s => s)` và `(114, s => s)` để trả chuỗi
  nguyên văn, nếu không các chỗ `JSON.parse(row.config)` sẽ lỗi.
- Viết test riêng cho các chỗ đang ghi chú "useUTC" (`credentialService.js`,
  `seminarPublicService.js`, `attendancePolicy.js`, `vnDate.js`...).
- Không đổi sang `timestamptz` trong đợt này. Muốn chuẩn hoá thì làm sau, trên PG.

### 4.4 Cú pháp truy vấn (bảng tra nhanh)

| T-SQL | PostgreSQL | Chạy được trên cả 2? |
|---|---|---|
| `ISNULL(a, b)` | `COALESCE(a, b)` | ✓ — đổi ngay ở chặng 1 |
| `SELECT TOP 10 ...` | `... LIMIT 10` | ✓ `ORDER BY … OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY` (SQL Server bắt buộc `ORDER BY`); kiểm tra tồn tại: `SELECT 1 WHERE EXISTS (…)` |
| `GETDATE()` | `LOCALTIMESTAMP` | ✓ qua adapter: `${nowSql}` (giờ VN), `${utcNowSql}`, `${vnTodaySql}`. Không dùng `CURRENT_TIMESTAMP`: PG trả `timestamptz`, JS đọc lệch 7 giờ |
| `LEN(s)` | `length(s)` | ✗ (LEN bỏ khoảng trắng cuối) |
| `a + b` (nối chuỗi) | `a \|\| b` hoặc `concat(a, b)` | `CONCAT(a, b)` ✓ |
| `CAST(x AS NVARCHAR(20))` | `x::text` | `CAST(x AS VARCHAR(20))` ✓ |
| `IIF`, `CASE` | `CASE` | `CASE` ✓ |
| `DATEADD(day, n, d)` | `d + n * interval '1 day'` | ✓ qua adapter: `${dateAdd('DAY', n, 'd')}` |
| `DATEDIFF(day, a, b)` | `b::date - a::date` | ✓ qua adapter: `${dateDiff('DAY', a, b)}` |
| `CONVERT(VARCHAR, d, 103)` | `to_char(d, 'DD/MM/YYYY')` | ✓ qua adapter: `${formatDate('d', 'DD/MM/YYYY')}`; `YEAR(x)` → `${datePart('YEAR', 'x')}` |
| `OUTPUT INSERTED.*` | `RETURNING *` | ✓ qua adapter: `insertReturning` / `updateReturning` / `deleteReturning` (cột ghi `new.x` / `old.x`, PG ≥ 18) |
| `MERGE ... WITH (HOLDLOCK)` | `INSERT ... ON CONFLICT (...) DO UPDATE` | ✓ qua adapter: `upsert({ table, key, values, update })` — cần khoá chính / `UNIQUE` trên khoá xung đột (cột được NULL: `NULLS NOT DISTINCT`) |
| `CROSS APPLY (SELECT TOP 1 ...)` | `CROSS JOIN LATERAL (SELECT ... LIMIT 1)` | ✓ qua adapter: `${crossApply(`SELECT … ORDER BY … OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY`, 'x')}` |
| `OPENJSON(@ids)` | `= ANY($1::text[])` (truyền mảng JS) | ✗ — có thể chuyển về `IN (@id0, @id1...)` qua `inClause` ở chặng 1 |
| `STRING_AGG(x, ',') WITHIN GROUP (ORDER BY y)` | `string_agg(x, ',' ORDER BY y)` | ✓ qua adapter: `${stringAgg('x', ',', 'y')}`; `STRING_AGG(x, ',')` không thứ tự chạy nguyên cả 2 DB khi `x` là chuỗi |
| `FOR JSON PATH` | `json_agg(json_build_object(...))` | ✓ qua adapter: `${jsonArray('SELECT … FROM … WHERE …', 'thứ tự')}` (lồng trong jsonArray khác: `{ nested: true }`) |
| `NEWID()` | `gen_random_uuid()` | ✗ |
| `WHERE id LIKE 'LDT[0-9][0-9]'` | `WHERE id ~ '^LDT[0-9]{2}$'` | ✗ |
| `[col]` | `"col"` hoặc bỏ ngoặc | Bỏ ngoặc ✓ (khi tên không trùng từ khoá) |
| `N'chuỗi'` | `'chuỗi'` | ✗ (SQL Server cần `N` cho chữ Việt) |
| `SELECT ... WITH (UPDLOCK, HOLDLOCK)` | `SELECT ... FOR UPDATE` | ✗ — khoá dải mã chưa tồn tại → advisory lock |
| `sp_getapplock 'x'` | `SELECT pg_advisory_xact_lock(hashtext('x'))` | ✗ |
| `SCOPE_IDENTITY()` | `INSERT ... RETURNING id` | ✗ |
| `@@ROWCOUNT` trong JS | `result.rowCount` | adapter trả `rowsAffected` |
| `THROW 51000, N'...', 1` | `RAISE EXCEPTION '...' USING ERRCODE = 'P0001', DETAIL = '51000'` | ✗ |

### 4.5 Mã lỗi

Tạo `src/utils/dbErrors.js` **ngay ở chặng 1** với các hàm `isUniqueViolation(err)`,
`isForeignKeyViolation(err)`, `isMissingObject(err)`, `appErrorCode(err)`. Sửa 19
file đang kiểm `err.number` sang gọi các hàm này. Khi chuyển DB chỉ cần sửa 1 file:

| Ý nghĩa | SQL Server `err.number` | PostgreSQL `err.code` |
|---|---|---|
| Trùng khoá / unique | 2627, 2601 | `23505` |
| Vi phạm khoá ngoại | 547 | `23503` |
| Vi phạm CHECK | 547 | `23514` |
| NOT NULL | 515 | `23502` |
| Thiếu cột / bảng | 207 / 208 | `42703` / `42P01` |
| Deadlock | 1205 | `40P01` (`40001` khi serializable) |
| Lỗi nghiệp vụ tự ném | 50000, 50001, 50002, 51000–51012 | Tự quy ước, ví dụ `RAISE ... USING ERRCODE='P0001', DETAIL='51003'` |

## 5. Thiết kế kỹ thuật chính

### 5.1 Lớp truy cập DB (adapter)

Mục tiêu: các service **giữ nguyên cách gọi**, chỉ phải sửa câu SQL.

```js
// Cách gọi hiện nay — giữ nguyên
const pool = await getPool();
const { recordset, rowsAffected } = await pool.request()
  .input('id', sql.VarChar(20), id)
  .query('SELECT ... WHERE id = @id');
```

Adapter PG (`src/config/db.pg.js`) cung cấp cùng giao diện:

- `request().input(name, type?, value)` lưu tham số; `query(text)` đổi `@ten`
  thành `$n` (bỏ qua phần trong chuỗi `'...'`, comment, và `@@`), rồi gọi `pg`.
  Kiểu `sql.*` dùng để ép kiểu khi cần (`$1::int`, `$2::timestamp`).
- Trả `{ recordset: rows, recordsets: [rows], rowsAffected: [rowCount] }`.
- `withTransaction(fn)`: lấy 1 client, `BEGIN` / `COMMIT` / `ROLLBACK`; `tx.request()` dùng client đó.
- `withActor(tx, actorId)`: thay `EXEC sp_set_actor @actor_id;` —
  chạy `SELECT set_config('app.current_user_id', $1, true)` trong cùng
  transaction (cả 2 bản đều từ chối khi không truyền transaction). Không có
  transaction sẵn thì dùng `withActorTransaction(actorId, (tx) => ...)` hoặc
  `actorRequest(actorId)` (dựng dần `.input()` rồi `.query()`) ở `config/db.js`. Với `true` (`is_local`), giá trị hết hạn khi transaction kết thúc
  nên không rò sang request khác dùng chung kết nối (an toàn với cả PgBouncer
  chế độ transaction).
- Type parser cho `timestamp`, `date`, `numeric`, `int8` (mục 4.1, 4.3).
- `pool.connected`, sự kiện `error`, reconnect: làm tương đương logic `getPool` hiện tại.

Chọn DB bằng biến `DB_CLIENT=mssql|pg` trong thời gian chuyển, để chạy cùng một
nhánh code trên cả hai DB. Xoá nhánh `mssql` sau khi cutover ổn định.

Không dùng ORM/query builder trong đợt này: viết lại 770 câu truy vấn sang
Knex/Kysely là một dự án khác, rủi ro cao hơn và không cần cho mục tiêu đổi DB.

### 5.2 Câu truy vấn nhiều lệnh

Các chỗ dùng `DECLARE @x ...; SELECT ...; UPDATE ...;` trong 1 lời gọi (47 file)
và chỗ đọc `recordsets[1]`, `recordsets[2]` (91 chỗ) phải viết lại theo 1 trong 3 cách:

1. Tách thành nhiều lời gọi JS trong `withTransaction` (ưu tiên, dễ đọc, dễ test).
2. Gộp bằng CTE (`WITH a AS (...), b AS (...) UPDATE ...`).
3. Hàm PL/pgSQL nếu logic thật sự cần chạy trong DB (hạn chế).

Phần lớn việc này **làm được ngay trên SQL Server** (chặng 1) mà không đổi kết quả.

### 5.3 Migration

- **Không dịch** 11.900 dòng lịch sử T-SQL. Thay vào đó:
  1. **Đã làm:** `npm run pg:baseline` (`scripts/pg/gen-baseline.js`) đọc `sys.*`
     của SQL Server, sinh `database/pg/baseline/01_tables.sql` và
     `02_constraints_indexes.sql`; `00_extensions.sql` và `03_toi_uu.sql` viết tay.
     Quy tắc đổi kiểu ở `scripts/pg/tsqlToPg.js` và `schemaRules.js`; mẫu lạ thì
     script dừng, không đoán. Trước cutover **chạy lại trên bản sao production**
     (schema dev có thể lệch) và so diff.
  2. Dữ liệu danh mục cố định (quyền, vai trò, danh mục mặc định) đưa vào
     `0001_seed.sql` hoặc lấy từ dữ liệu thật khi chuyển.
  3. Migration sau cutover viết bằng SQL PostgreSQL, tiếp tục quy ước đặt tên và idempotent hiện có.
- `migrator.js` cần đổi: bỏ tách batch theo `GO` (PG chạy được nhiều lệnh trong
  1 file khi không có tham số); khoá `sp_getapplock` → `pg_advisory_lock`; bảng
  `schema_migrations` bỏ tiền tố `dbo.`; `BACKUP DATABASE` → gọi `pg_dump` (chạy
  ở phía ứng dụng, không cần thư mục trên máy DB); có thể chạy cả file trong 1
  transaction (PG cho phép DDL trong transaction — tốt hơn SQL Server).
- Test `test/database/migrator.test.js` và `sqlEncoding.test.js` cập nhật theo.
- Trong chặng 2–3: migration mới viết **2 bản** (`migrations/` cho SQL Server,
  `pg/` cho PG). Thêm test CI kiểm tra mỗi file mới trong `migrations/` có file
  tương ứng trong `pg/`.

### 5.4 Procedure, trigger, view

Làm theo thứ tự, **ưu tiên chuyển về JS ngay trên SQL Server** (đúng hướng
`database/README.md` đã đề xuất):

| Object | Việc |
|---|---|
| 7 `sp_gen_*` không ai gọi, `sp_process_daily_deadlines`, `sp_remind_deadlines` (no-op), `sp_close_supplement_window`, `sp_use_refresh_token` | Xoá bằng migration (sau khi kiểm tra SQL Agent trên prod). Không chuyển. |
| 23 `sp_gen_*` đang dùng (gọi từ JS hoặc từ procedure khác) | **Đã xong phần JS:** `src/utils/idGenerator.js` (`nextId` + 1 hàm cho mỗi loại mã, cùng định dạng), khoá `lockResource(tx, key, timeoutMs)` ở 2 adapter (SQL Server: `sp_getapplock` LockOwner = Transaction; PG: `pg_advisory_xact_lock`). Không còn code JS gọi `sp_gen_*`. 4 thủ tục chỉ được thủ tục khác gọi (`sp_gen_token_id`, `sp_gen_user_id`, `sp_gen_batch_id`, `sp_gen_file_id`) cũng thôi dùng vì các thủ tục gọi chúng đã chuyển về JS (`genFileBatchId` / `genFileId`). |
| `trg_topic_auto_approval` | **Đã xong phần JS:** `src/modules/topics/approvalRecord.js` (`ensureApproval` khi tạo đề tài, `withApprovalSync` khi đổi trạng thái). Câu chỉ thêm khi chưa có phiếu ⇒ trigger còn trong DB vẫn đúng. |
| `sp_approve_topic` + `sp_grant_member_accounts` | **Đã xong phần JS:** `topicApprovalService.approve` (phiếu duyệt + đề tài + `topic_progress`, thông báo 1 lần). **Bỏ việc tự cấp tài khoản thành viên khi duyệt** (thủ tục cũ tạo tài khoản không đăng nhập được và báo mật khẩu "123456", thông báo bị gửi 2 lần); cấp tài khoản qua nút "Cấp tài khoản" (`topicMemberService`). |
| `sp_push_notification` + `sp_resolve_recipients` | **Đã xong phần JS:** `notificationService.push` (lọc người đang hoạt động, mã `NTF…` / batch `NTFB…` lấy từ `seq_notification_suffix` qua `nextSequenceValues` ở 2 adapter, ghi nhiều dòng 1 câu). |
| `sp_upload_files`, `trg_file_batch_count`, `sp_create_refresh_token`, `sp_deactivate_expired_accounts`, `sp_cleanup_*` | **Đã xong phần JS** (trừ `trg_file_batch_count`, trigger đếm file — có bản PG, giữ): `fileService.uploadFiles`, `sessionTokenService` (INSERT `refresh_tokens`), `accountMaintenanceJob.deactivateExpired`; `sp_cleanup_*` đã được job Node thay từ trước. `trg_dept_gen_id`: **đã bỏ** (migration `2026-12-14_bo_trigger_sinh_ma_khoa`, mã DVxxx sinh ở `genDeptId`). |
| 13 trigger audit `trg_*_audit` | Giữ ở DB. Trên PG: 1 hàm `audit_set_updated()` dùng chung, `BEFORE UPDATE ... FOR EACH ROW`, đọc `current_setting('app.current_user_id', true)`, chỉ cập nhật khi các cột theo dõi thay đổi (`NEW.col IS DISTINCT FROM OLD.col`). |
| `sp_set_actor` | Bỏ; thay bằng `withActor` (mục 5.1). |
| `fn_normalize_phone` | Viết lại PL/pgSQL hoặc chuyển về JS. |
| `vw_approvals_audit`, `vw_topics_audit` | Chỉ chuyển nếu vận hành xác nhận còn dùng. |

Sau bước này, DB PG chỉ còn: bảng, index, sequence, 1 hàm trigger audit, có thể 1–2 hàm tiện ích.

## 6. Lộ trình chi tiết

### Bước A — Lên Linux, vẫn dùng SQL Server (khoảng 1 tuần, làm song song chặng 0–1)

- [ ] Dựng máy Ubuntu 24.04 theo `infra/cai-dat-may-ao-ubuntu.md`; restore bản
      backup production vào SQL Server trên Linux; kiểm tra collation giống bản cũ.
- [ ] Viết `scripts/deploy.sh` làm đúng các bước của `deploy.ps1` (kéo image theo
      SHA, migrate bằng image mới, `compose up`, smoke test, tự rollback, ghi
      `logs/deploy-history.log`). Đổi `deploy.yml` sang `shell: bash` cho runner Linux.
      Giữ `deploy.ps1` tới khi bỏ hẳn server Windows.
- [ ] Bản bash (hoặc Node) cho `rotate-jwt-secrets.ps1`; `import-dtlt.ps1` chỉ
      cần nếu còn dùng.
- [ ] Cài self-hosted runner trên máy Linux (nhãn `rms-staging`, `rms-production`).
- [ ] Chuyển file upload: `rsync -a` volume `uploads` sang máy mới, rồi
      `npm run sync:upload-paths` (chỉ liệt kê) để chắc mọi đường dẫn còn đúng.
- [ ] Giờ hệ thống `Asia/Ho_Chi_Minh` (`timedatectl`), vì `GETDATE()` lấy giờ máy chủ DB.
- [ ] Chạy smoke test so với baseline trên Windows, rồi mới đổi DNS/cổng.

### Chặng 0 — Kiểm kê và chốt quyết định (1 tuần)

- [ ] Trả lời các câu hỏi ở mục 3.
- [ ] Chạy trên **production** (chỉ đọc), lưu kết quả vào thư mục ngoài repo:
  - Kích thước DB, số dòng từng bảng, 20 bảng lớn nhất.
  - Collation của server, DB và mọi cột có collation riêng.
  - Danh sách SQL Agent job và lệnh của chúng (truy vấn mẫu ở `database/README.md`).
  - Danh sách login/user, ai kết nối vào DB (`sys.dm_exec_sessions` theo `program_name`, `host_name` trong vài ngày).
  - Object trong DB không có trong `database/objects/` (so lại bằng `npm run dump:db-objects`).
  - Top truy vấn tốn tài nguyên (`sys.dm_exec_query_stats`) để so hiệu năng sau này.
- [x] Viết `backend/scripts/check-tsql-usage.js`: đếm các mẫu ở mục 2.2 theo
  từng file, in bảng tiến độ. Chạy trong CI ở chế độ "ratchet" (chỉ cho giảm,
  không cho tăng) — giống `typecheckRatchet.test.js` đang có.
  → `npm run check:tsql` (`--files` xem theo file, `--update` hạ mốc);
  mốc ở `scripts/tsql-usage-baseline.json`, test `test/contract/tsqlUsageRatchet.test.js`.
  Mốc ban đầu (03/11/2026): 1.156 chỗ. Sửa lỗi đếm nhầm hàm JS `getUTCDate()`
  thành `GETUTCDATE()` của T-SQL: mốc đúng là **1.135** chỗ (`getdate` 197, không phải 218).

### Chặng 1 — Trung lập hoá trên SQL Server (3–5 tuần, phát hành dần)

Mọi việc dưới đây chạy trên SQL Server hiện tại, test và smoke test như bình
thường. Mỗi nhóm là 1 PR nhỏ theo module.

- [x] `dbErrors.js` + sửa 19 file đang kiểm `err.number` (mục 4.5).
  → `src/utils/dbErrors.js`; 15 file đã chuyển, mẫu `err_number` trong ratchet = 0.
- [x] `withActor()` thay 76 chỗ `EXEC sp_set_actor @actor_id;` (trên SQL Server
  vẫn gọi `sp_set_actor` bên trong, nhưng tách thành lời gọi riêng trong transaction).
  Câu ghi trên pool chuyển sang `withActorTransaction` / `actorRequest` (mỗi câu
  ghi giờ chạy trong 1 transaction ngắn). Kiểm bằng `test-integration/actorAudit.test.js`
  (SQL Server) và `test-integration-pg/adapter.test.js` (PG); `check:tsql` set_actor = 0.
- [x] Hàm sinh mã JS dùng chung; thay các `EXEC sp_gen_*` (mục 5.4): `src/utils/idGenerator.js`,
  `lockResource` ở 2 adapter; `check:tsql` exec_proc 31 → 7 (còn các thủ tục khác).
  Kiểm bằng `test/utils/idGenerator.test.js`, `test-integration/idGenerator.test.js` (SQL Server,
  so với thủ tục cũ trên cùng dữ liệu) và `test-integration-pg/idGenerator.test.js`.
  Bỏ luôn trigger `trg_dept_gen_id` (INSTEAD OF INSERT làm mất cột khi tạo khoa) bằng
  migration `2026-12-14_bo_trigger_sinh_ma_khoa` (có bản PG).
- [x] Chuyển `trg_topic_auto_approval`, `sp_approve_topic`, `sp_push_notification`,
  `sp_upload_files`, `sp_create_refresh_token`, `sp_deactivate_expired_accounts` về JS
  (bảng mục 5.4); `check:tsql` exec_proc 7 → 2. Duyệt đề tài **không còn tự cấp tài khoản
  thành viên**. Kiểm bằng `test/topics/approvalRecord.test.js` và
  `test-integration/procToJs.cases.js` (chạy trên SQL Server và PG, rollback).
  Code mới so cột BIT qua tham số `sql.Bit` và chạy từng câu riêng (`actorRequest().query(mảng)`):
  PG không so boolean với số và không ghép nhiều câu có tham số bằng `;`.
- [ ] Xoá khỏi DB (migration ở **bản phát hành sau**, khi không còn backend cũ chạy song song
  lúc deploy cuốn chiếu): trigger `trg_topic_auto_approval`; thủ tục `sp_approve_topic`,
  `sp_grant_member_accounts`, `sp_push_notification`, `sp_resolve_recipients`,
  `sp_upload_files`, `sp_create_refresh_token`, `sp_deactivate_expired_accounts`, các
  `sp_gen_*`, `sp_cleanup_*`.
- [x] Đổi cú pháp chạy được trên cả 2 DB (đợt 1): `ISNULL` → `COALESCE` (107 → 0; cột BIT
  mặc định qua tham số `sql.Bit`); `CAST(CASE ... AS BIT)` → `boolExpr` / `castBool` của adapter
  (23 → 6); bỏ `N` ở chuỗi chỉ có ký tự CP1252 (76 → 34); `+` nối chuỗi → `CONCAT` ở câu
  đơn. `check:tsql` tổng 917 → 751. Kiểm bằng `test-integration/portableSql.cases.js` (2 DB).
  Lưu ý khi viết SQL chung:
  - **Không đổi `CAST AS NVARCHAR` → `VARCHAR`, không bỏ `N` ở chuỗi tiếng Việt**: DB SQL Server
    dùng collation `SQL_Latin1_General_CP1_CI_AS` (CP1252), chuỗi / kiểu không N mất dấu
    (`Chưa xác định` → `Chua xác d?nh`). Chữ Việt truyền qua tham số `sql.NVarChar`, hoặc ghép sẵn bằng JS.
  - Trên PG, `N'...'` là kiểu `char` ⇒ **mất khoảng trắng cuối** (`N' · '` → `' ·'`,
    `REPLACE(x, N'  ', N' ')` thành thay chuỗi rỗng). Nhãn không có khoảng trắng cuối thì vẫn đúng.
  - PG không suy được kiểu tham số chuỗi nằm trong `CONCAT(...)` — ghép sẵn bằng JS, hoặc để
    tham số trong `COALESCE(cột, @x)`.
- [ ] Đợt sau: 34 chuỗi `N'...'` tiếng Việt còn lại (đa số trong lô nhiều câu / bảng tạm của
  dashboard, báo cáo CME, `courseCmeService`, các `THROW`) đổi sang tham số khi viết lại các lô đó;
  ~~`+` nối chuỗi trong mã sinh từ `NEWID()`~~ (đã xong cùng đợt 1 mục DECLARE).
- [x] `OPENJSON` → helper của adapter (31 → 0): `jsonValues('@ids', { type, withIndex })` (mảng →
  bảng cột `value`, `idx` từ 0; PG: `jsonb_array_elements_text ... WITH ORDINALITY`) và
  `jsonRows('@rows', alias, cột)` thay `OPENJSON ... WITH` (PG: `jsonb_to_recordset`, `NVARCHAR` tự đổi
  sang `varchar` / `text`). Vẫn 1 tham số JSON cho cả danh sách (không vướng giới hạn ~2100
  tham số của SQL Server như `inClause`). Cột số (`work_shifts.id`, năm) phải ghi `type: 'INT'`: PG
  không so `integer = varchar`. Kiểm bằng `test-integration/portableSql.cases.js`.
  Lưu ý: `ORDER BY` cột có NULL — SQL Server xếp NULL **đầu**, PG xếp **cuối** (cần thì ghi rõ
  `CASE WHEN x IS NULL THEN 0 ELSE 1 END, x`).
- [x] Tách các batch `DECLARE ...` và `recordsets[i]` thành nhiều lời gọi JS (mục 5.2).
  - [x] Đợt 1 — mã ngẫu nhiên (`DECLARE @new_id = 'XX' + LEFT(REPLACE(NEWID()...))`): 1 dòng thì sinh
    bằng JS `randomId(prefix, n)` / `randomHex32()` (`utils/idGenerator`), truyền vào bằng tham số và
    bỏ `SELECT @new_id AS id`; chèn nhiều dòng 1 câu thì `newIdSql(prefix, n)` của adapter (PG:
    `gen_random_uuid()` in hoa). `crudService.create`, người tham dự hội thảo, file đào tạo: INSERT
    rồi SELECT là 2 câu. newid 42 → 0, declare 60 → 32 (tổng ratchet 719 → 646). Kiểm bằng
    `test-integration/randomIds.cases.js` (PG bỏ ca `bulkAdd` vì `personService` còn dùng `OBJECT_ID`).
  - [x] Đợt 2 — lô nhiều câu / lô logic (declare 32 → 1, recordsets 110 → 0, bảng tạm 35 → 6; tổng
    ratchet 646 → 443):
    - `queryAll(req, [câu1, câu2…])` của adapter thay `req.query('câu1; câu2')` + `recordsets[i]`:
      SQL Server vẫn ghép 1 lô (1 lượt gọi); PG chạy từng câu với cùng tham số (trong transaction thì
      lần lượt, ngoài thì song song). Mỗi câu phải trả đúng 1 tập kết quả. ~35 chỗ đổi bằng script.
    - `updateReturning(update, where, cột)` thay `DECLARE @r TABLE … OUTPUT … INTO @r … SELECT FROM @r`
      (cột ghi `new.x` / `old.x`; PG ≥ 18 dùng `RETURNING old./new.`): TOTP, khoá đăng nhập, duyệt
      bước workflow, nộp bài thi (trễ hạn tính trong JS từ `started_at` / `submitted_at`), gộp hồ sơ
      người, gọi danh sách chờ, quét vé hội nghị.
    - Bảng tạm / biến bảng thành bảng con dùng chung: `#t` (dashboard NCKH), `#seat` (đánh giá tiến độ),
      `@mine` (lịch học viên), `@depts` (ứng viên giảng viên); `@only_program` thành subquery.
    - Biến `@year / @from / @today` của dashboard tính bằng JS (`todayVN`), truyền tham số.
    - Lô có IF / THROW viết lại bằng JS trong `withTransaction`: vòng thực hành (thêm khoa, học lại, đổi
      chỗ), ghi danh từ sổ thực hành, đồng bộ bài học (`UPDATE … FROM` → subquery tương quan), khoá tài
      khoản học viên, thu hồi CME theo giấy chứng nhận, điểm danh QR hội thảo, đăng xuất (subquery).
    - Mã `<PREFIX>NN` (danh mục LDT, cấp độ CD, loại đợt RT, vai trò VT): `genSeq2Id` (MAX+1 có khoá,
      hết số → 409). Khoá `person_sync` dùng `lockResource`.
    - Kiểm tra schema phân quyền đọc `information_schema.columns` thay `COL_LENGTH` / `OBJECT_ID`.
    - Sửa adapter PG: tham số có ép kiểu trước `ROWS` (`OFFSET @x ROWS`) được bọc ngoặc — trước đây
      mọi câu phân trang có tham số đều lỗi cú pháp trên PG.
    - Kiểm bằng `test-integration/batchSplit.cases.js` (SQL Server 10/10; PG 4 ca, bỏ 6 ca còn vướng
      `CROSS APPLY`, `GETDATE`, `YEAR` / `CONVERT` — các mục cú pháp khác).
    - Còn lại (mục khác): 6 bảng tạm `#…` (`courseCmeService` + `MERGE`, đã xong ở mục `MERGE`), `THROW` trong 3 lô kiểm tra trùng (`certificateRepository`, `courseEnrollmentService`, `programLessonService`).
- [x] Cột BIT so / gán với số (`is_active = 1`, `SET must_change_password = 0`, `<> 1`): 138 chỗ đổi
  sang chữ `'true'` / `'false'` — SQL Server tự đổi chữ thành BIT (vẫn dùng được chỉ mục), PG tự
  ép sang `boolean`; chạy được ở WHERE, SET, `CASE WHEN`, `SUM(CASE …)`. Đổi bằng script hiểu
  chuỗi JS (chuỗi `'...'` có chỗ đổi chuyển sang `"..."`), bỏ qua comment. Ratchet thêm khoá
  `bit_literal` (30 cột boolean của `database/pg/baseline/01_tables.sql`; mốc 14 = chỗ trong
  comment). Kiểm bằng ca "cột BIT so / gán bằng 'true' / 'false'" trong
  `test-integration/batchSplit.cases.js` (2 DB). Các ca PG khác vẫn bỏ vì vướng mục khác
  (đã bật lại ở mục `@@ROWCOUNT`).
  Còn lại (phát hiện dần qua test PG): `VALUES (…, 1)` / `CASE … THEN 1 ELSE 0` ghi vào cột
  boolean, `COALESCE(cột_bit, 0)` — PG cũng không tự ép số sang boolean ở các chỗ này.
- [x] Giờ hiện tại (`GETDATE` / `SYSDATETIME` / `GETUTCDATE` / `SYSUTCDATETIME`, 188 → 5): 185 chỗ
  đổi bằng script sang đoạn SQL của adapter chèn vào chuỗi (chuỗi `'...'` chuyển sang template):
  - `${nowSql}` giờ VN: SQL Server `GETDATE()`; PG `(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')` —
    đổi múi giờ tường minh, không phụ thuộc `timezone` của DB. `SYSDATETIME()` cũng thành
    `nowSql` (độ chính xác DATETIME đủ cho `updated_at` / `reviewed_at`).
  - `${utcNowSql}` cho các cột lưu giờ UTC (`locked_until`, `expires_at`, `checked_in_at`, mật khẩu
    tạm…): SQL Server `SYSUTCDATETIME()` (thay cả `GETUTCDATE()`); PG `(now() AT TIME ZONE 'UTC')`.
  - `${vnTodaySql}` thay `CAST(DATEADD(HOUR, 7, GETUTCDATE()) AS DATE)` (ngày VN không phụ thuộc
    múi giờ máy chủ; date_fn 28 → 21).
  - Khác biệt: PG `now()` là lúc **bắt đầu transaction** (SQL Server: lúc chạy câu) — trong 1
    transaction mọi dòng cùng 1 mốc.
  - Không đổi: `src/database/migrator.js` (nhánh SQL Server riêng), `scripts/pg/tsqlToPg.js`
    (bộ dịch DEFAULT, chuỗi là dữ liệu), comment. Tổng ratchet 457 → 267.
  - Kiểm bằng ca "nowSql / utcNowSql / vnTodaySql" trong `test-integration/batchSplit.cases.js`
    (2 DB, lệch đúng 7 giờ, ngày VN khớp `todayKeyVN`); PG bật thêm ca vòng thực hành và khoá tài
    khoản học viên.
- [x] `TOP n` (67 → 1): viết lại bằng cú pháp chuẩn chạy cả 2 DB.
  - Câu / subquery / `APPLY` đã có `ORDER BY` (44 chỗ, script): bỏ `TOP n`, thêm
    `OFFSET 0 ROWS FETCH NEXT n ROWS ONLY` sau `ORDER BY` (tham số `@limit` được, adapter PG bọc
    `($1::int)`).
  - Kiểm tra tồn tại `SELECT TOP 1 1 [AS x] FROM …` → `SELECT 1 [AS x] WHERE EXISTS (SELECT 1 FROM …)`
    (SQL Server và PG đều cho `SELECT … WHERE` không có `FROM`).
  - 21 chỗ chưa có `ORDER BY` (sửa tay) — thêm thứ tự xác định: hồ sơ học viên theo tài khoản lấy
    bản mới nhất (`created_at DESC`, giống `traineeRecordService`); `TOP 2` dò trùng email / username
    và các chỗ còn lại theo `id`; định nghĩa workflow đang bật lấy bản mới nhất.
  - `DELETE TOP (@batch)` + `SELECT @@ROWCOUNT` (dọn thông báo) → `DELETE … WHERE id IN (SELECT id …
    ORDER BY id OFFSET 0 ROWS FETCH NEXT @batch ROWS ONLY)` + `rowsAffected` (bảng không có trigger).
  - Kiểm bằng ca "TOP n đã đổi" và "xoá thông báo cũ theo lô" trong `test-integration/batchSplit.cases.js`
    (PG bỏ ca xoá thông báo vì còn `DATEADD`). Tổng ratchet 267 → 200.
- [x] `CROSS / OUTER APPLY` (25 → 2, còn trong comment): helper `crossApply(subquery, alias)` /
  `outerApply(subquery, alias)` của adapter — SQL Server sinh `CROSS / OUTER APPLY (…) alias`, PG sinh
  `CROSS JOIN LATERAL (…) alias` / `LEFT JOIN LATERAL (…) alias ON true` (2 DB không có cú pháp chung).
  23 chỗ đổi bằng script (APPLY lồng nhau đổi từ trong ra ngoài, vd. `DOC_COUNT_APPLY`). Bỏ luôn
  `SET NOCOUNT ON` cuối cùng (`userService.getGlobalStats`, chỉ 1 câu SELECT). Kiểm bằng ca
  "crossApply / outerApply" trong `test-integration/batchSplit.cases.js` (2 DB: APPLY rỗng giữ / bỏ dòng
  đúng; `roleService.getAll`, báo cáo tuân thủ CME, đơn nghỉ, đợt đăng ký). Các hàm khác có APPLY còn
  vướng mục khác trên PG: `DATEADD` (hạn bổ sung, phân trang người dùng), `YEAR` (báo cáo đào tạo),
  nối chuỗi `+` (danh sách học viên theo loại khóa). Tổng ratchet 200 → 177.
- [x] `DATEADD` / `DATEDIFF` (date_fn 21 → 0): helper `dateAdd(unit, n, expr)` / `dateDiff(unit, from, to)` của
  adapter (unit SECOND / MINUTE / HOUR / DAY / MONTH / YEAR; `n` là số, tham số `'-@days'` hoặc biểu thức).
  - PG: `dateAdd` → `(expr + (n) * INTERVAL '1 unit')` (date + interval ra timestamp, so sánh với cột date /
    timestamp vẫn đúng; 31/3 lùi 1 tháng = 28/2 như SQL Server). `dateDiff` đếm mốc ranh giới như DATEDIFF:
    DAY = `date - date`, SECOND / MINUTE / HOUR = hiệu sau `date_trunc` (MONTH / YEAR chưa hỗ trợ — báo lỗi).
  - 21 chỗ đổi bằng script; hạn bổ sung đề tài bỏ `CAST(… AS DATETIME2)` (so date với datetime2 SQL Server
    tự hiểu 0 giờ, PG `date + interval` ra timestamp 0 giờ — cùng kết quả).
  - Ratchet `date_fn` phân biệt hoa / thường để không đếm tên helper. Tổng 176 → 155.
  - Kiểm bằng ca "dateAdd / dateDiff" trong `test-integration/batchSplit.cases.js` (2 DB); PG bật thêm ca
    phân trang người dùng và xoá thông báo theo lô.
- [x] `CONVERT` / `TRY_CAST` / `YEAR` / `MONTH` (convert 16 → 0, cùng 11 chỗ `YEAR` / `MONTH` ngoài ratchet):
  helper của adapter, SQL Server giữ nguyên câu cũ:
  - `formatDate(expr, mẫu)` — `'DD/MM/YYYY'` (style 103), `'YYYY-MM-DD'` (23), `'YYYY-MM'` (126),
    `'YYYY-MM-DD HH:MI'` (120 cắt 16 ký tự); PG `to_char`. Mẫu khác báo lỗi.
  - `datePart('YEAR' | 'MONTH' | 'DAY', expr)` — SQL Server `YEAR(x)`; PG `CAST(EXTRACT(… FROM x) AS INTEGER)`.
  - `tryCastInt(expr)` — SQL Server `TRY_CAST(x AS INT)`; PG kiểm regex `^\s*-?[0-9]{1,9}\s*$` rồi `CAST`
    (không số / tràn ⇒ NULL như TRY_CAST).
  - Sửa tay: `COURSE_IN_YEAR` sang template; khe giờ đầu tiên của giảng viên `+` → `CONCAT`;
    `scripts/import-staff.js` `STRING_SPLIT` + `TRY_CAST` → `jsonValues('@mnvs', { type: 'INT' })`.
  - Kiểm bằng ca "formatDate / datePart / tryCastInt" trong `test-integration/batchSplit.cases.js` (2 DB;
    báo cáo đào tạo theo năm); PG bật thêm ca dashboard. Còn vướng mục khác trên PG: tiến độ hội đồng
    (tên cột `[…]`), CME cá nhân (`FOR JSON`). Tổng ratchet 155 → 139.
- [x] `@@ROWCOUNT` / `@@TRANCOUNT` (identity_fn 15 → 1): số dòng đổi lấy từ `rowsAffected[0]` của chính câu
  ghi (adapter PG dựng từ `rowCount`). Mọi trigger đều `SET NOCOUNT ON` nên trên SQL Server số này là của câu
  chính, không lẫn câu trong trigger (đã thử trên `topics`, `users`, `seminar_participants`, `approvals`,
  `departments` — 2 DB cùng số).
  - `SELECT @@ROWCOUNT AS n` cuối lô → bỏ, đọc `rowsAffected[0]`: gán đề tài vào hội đồng, đặt buổi bảo vệ,
    đổi trạng thái CME hội thảo, nộp bài kiểm tra hội thảo, thu hồi chứng chỉ, sửa / chép vòng thực hành
    (chép vòng: nối chuỗi `+` → `CONCAT`), hoàn thành thực hành, tính lại trạng thái bài học.
  - `IF @@ROWCOUNT = 0 INSERT` (upsert) → JS trong 1 transaction: `UPDATE`, không có dòng nào thì `INSERT`
    (ghế thay của hội đồng, nhận xét tiến độ, kết luận hội đồng — helper `upsertRow`).
  - `IF @@ROWCOUNT > 0 UPDATE` (nộp lại đề tài → phiếu duyệt về `pending`) → câu thứ 2 chỉ chạy khi câu 1 đổi dòng.
  - Xoá khoa: bỏ `BEGIN TRANSACTION / TRY / CATCH … @@TRANCOUNT … THROW` lồng trong lô — 6 câu chạy lần lượt
    trong `withActorTransaction` (lỗi thì transaction ngoài rollback).
  - `UPDATE alias … FROM` của 2 chỗ trên (tính lại bài học, hoàn thành thực hành) → `UPDATE bảng SET … WHERE`
    với subquery tương quan theo tên bảng (cú pháp `UPDATE … FROM` của 2 DB khác nhau). Còn ~8 chỗ
    `UPDATE alias … FROM` khác (ratchet chưa đếm) — làm ở mục riêng.
  - Sửa thêm: lô `DELETE; UPDATE; SELECT` có tham số của `lecturerAssignmentService.setLessonLecturers`
    (PG không ghép được) → `queryAll`. Đây là lỗi thật của ca "xoá buổi học" trên PG.
  - Còn lại: `courseCmeService` (`MERGE … USING #cme; SELECT @@ROWCOUNT`) — làm cùng mục `MERGE` / bảng tạm.
  - Kiểm bằng 3 ca "rowsAffected: …" và "đặt buổi bảo vệ" trong `test-integration/batchSplit.cases.js`
    (2 DB: upsert chạy 2 lần vẫn 1 dòng, nộp lại chỉ reset phiếu khi đang `supplement`, tính lại lần 2 = 0,
    sai hội đồng → 404). PG bật lại ca đồng bộ bài học và xoá buổi học; chỉ bỏ ca "đặt buổi bảo vệ"
    (tên cột `[session]`). Tổng ratchet 139 → 125.
- [x] `OUTPUT INSERTED / DELETED` (output_clause 14 → 1): helper của adapter, cột ghi `new.x` (sau khi ghi) /
  `old.x` (trước khi ghi), được `new.*` và `AS tên`. SQL Server đổi thành `INSERTED.` / `DELETED.` đặt đúng chỗ
  của `OUTPUT`; PG ≥ 18 để nguyên trong `RETURNING` ở cuối câu (đã thử PG 18.6: `new.*`, `old.x` với INSERT /
  UPDATE / DELETE).
  - `insertReturning(insert, 'VALUES …' | 'SELECT …', cột)`: đơn xin phép, ca làm việc, mẫu ca.
  - `updateReturning(update, where, 'cột')` — dạng chuỗi là `OUTPUT` trần, chỉ cho bảng **không có trigger**
    (dạng mảng [biểu thức, tên, kiểu] giữ cách qua biến bảng): ca / mẫu ca, giữ lượt thử OTP quên mật khẩu,
    dùng mã khôi phục 2FA, đổi refresh token, thay minh chứng CME (`old.evidence_file_id`).
  - `deleteReturning(del, where, cột)`: xoá CME hàng loạt (lấy file minh chứng để gỡ), xoá câu hỏi.
  - Sửa tay: xoá câu hỏi bỏ lô `IF EXISTS … ELSE DELETE` → kiểm tra đang dùng rồi mới xoá (JS);
    tạo person bỏ `OUTPUT INSERTED.id` + `'PS' + RIGHT(… NEXT VALUE FOR …)` → `nextSequenceValues` rồi dựng mã
    `PS` + 8 số bằng JS.
  - Mọi bảng đã đổi đều không có trigger (`database/objects/triggers/`). Còn lại: `staffAttendanceService`
    (`MERGE … OUTPUT inserted.*, $action`) — làm cùng mục `MERGE`.
  - Kiểm bằng ca "insertReturning / updateReturning / deleteReturning" (2 DB: helper trực tiếp, mẫu ca thêm /
    sửa / 404, xoá CME, xoá câu hỏi đang dùng → 409) và "person mới: mã PS + 8 số" (SQL Server; PG bỏ vì
    `personService` kiểm schema bằng `OBJECT_ID` / `COL_LENGTH`) trong `test-integration/batchSplit.cases.js`.
    Tổng ratchet 125 → 112.
- [x] `STRING_AGG … WITHIN GROUP (ORDER BY …)` (within_group 12 → 0): helper `stringAgg(expr, sep, orderBy)` của
  adapter — SQL Server giữ `STRING_AGG(x, sep) WITHIN GROUP (ORDER BY …)`, PG sinh
  `string_agg(CAST(x AS TEXT), sep ORDER BY …)` (string_agg của PG chỉ nhận text: `trainee_type_id` là số).
  `sep` là chuỗi JS, không cho dấu `'`; bỏ `orderBy` = không thứ tự.
  - 11 chỗ đổi bằng script (khoa của bài học / vòng thực hành, đối tượng và loại chương trình, cổng công khai);
    tóm tắt thành viên hội đồng sửa tay (biểu thức `CONCAT(vai, ': ', tên)` tách thành `MEMBER_LABEL`).
  - Giới hạn SQL Server: các `stringAgg` có thứ tự trong cùng 1 SELECT phải cùng `orderBy` (PG không bắt buộc).
  - Không đổi: 10 chỗ `STRING_AGG(x, sep)` không thứ tự — cột đều `varchar`, PG chạy nguyên.
  - Kiểm bằng ca "stringAgg" trong `test-integration/batchSplit.cases.js` (2 DB: thứ tự tăng / giảm, cột số,
    `councilService.getAll` — trước đây lỗi trên PG —, danh sách bài học đúng thứ tự khoa, vòng thực hành).
    Còn vướng mục khác trên PG: `FOR JSON` (cổng công khai, chi tiết chương trình — đã xong ở mục `FOR JSON`).
    Tổng ratchet 112 → 100.
- [x] `MERGE` (merge 7 → 0, kéo theo temp_table 6 → 0, output_clause 1 → 0, identity_fn 1 → 0): helper
  `upsert({ table, key, values, update, source?, nullable?, conflictWhere?, returning?, action? })` của adapter —
  SQL Server `MERGE … WITH (HOLDLOCK) AS tgt USING (…) AS src`, PG `INSERT … AS tgt … ON CONFLICT (key) DO UPDATE`.
  - `update` ghi `EXCLUDED.cột` = giá trị lẽ ra được thêm (SQL Server thay bằng biểu thức trong `values`);
    `source` = câu SELECT nhiều dòng (bí danh `src`); `action` thêm cột `merge_action` (`$action` / PG 18
    `old.<key[0]> IS NULL`); `conflictWhere` cho index UNIQUE có lọc (`cme_records … WHERE source_type IS NOT NULL`).
  - 1 dòng: cấu hình form, giá trị trường tùy chỉnh, cài đặt hệ thống, sổ số CME theo năm (4 chỗ này trước không có
    `HOLDLOCK` — nay an toàn khi 2 request cùng lúc). Điểm danh học viên: `returning: 'new.*', action: true`,
    khoá `(user_id, work_date, shift_id)` với `nullable: ['shift_id']`.
  - CME tự động từ khóa (`courseCmeService`): bỏ bảng tạm `#cme` / `#hours` — câu SELECT thành `source`
    (`TRAINEE_SOURCE`, `LECTURER_SOURCE`; lọc tín chỉ > 0 trong subquery thay `DELETE FROM #cme`), nối chuỗi `+` →
    `CONCAT`, bỏ `CAST(… AS NVARCHAR)`. GV: xoá dòng cũ + upsert chạy trong 1 transaction. Số dòng = `rowsAffected`.
  - **Schema PG — UNIQUE có cột NULL:** SQL Server coi các NULL trùng nhau, PG mặc định không ⇒ 6 khoá không lọc có
    cột được NULL (`council_members`, `shift_assignments`, `staff_attendance`, `course_enrollments`,
    `exam_paper_questions`, `lecturer_assignments`) trước đây cho phép dòng trùng trên PG. `gen-baseline.js` sinh
    `NULLS NOT DISTINCT` (baseline sinh lại: đúng 6 dòng đổi; mốc `pgMigrations.test.js` dời sang 2026-12-14);
    migration `2026-12-15_unique_nulls_not_distinct` (bản PG dựng lại 6 khoá; bản SQL Server không đổi gì) cho DB PG
    đã tạo. Phải chạy bằng tài khoản chủ schema (`rms_app` không có quyền ALTER).
  - Kiểm bằng ca "upsert" (2 DB: thêm rồi sửa, nhiều dòng, `merge_action`, 3 dịch vụ gọi 2 lần vẫn 1 dòng, CME
    khóa chạy lại không thêm dòng) và "upsert khoá có cột NULL" (SQL Server; PG tự bỏ qua tới khi DB chạy migration
    — đã thử câu PG trên bảng tạm có `NULLS NOT DISTINCT`: thêm rồi sửa cùng dòng). Tổng ratchet 100 → 79.
- [x] `FOR JSON PATH` (for_json 5 → 0): helper `jsonArray(select, orderBy, { nested })` của adapter — `select` là
  `SELECT … FROM … WHERE …` chưa có `ORDER BY`. SQL Server giữ `(… ORDER BY … FOR JSON PATH)`; PG thêm cột tạm
  `ROW_NUMBER() OVER (ORDER BY …) AS __ord` rồi `jsonb_agg(jsonb_strip_nulls(to_jsonb(j) - '__ord') ORDER BY j.__ord)`:
  - cùng nghĩa với FOR JSON PATH: key NULL bị bỏ, đúng thứ tự, không có dòng → NULL;
  - trả TEXT (driver PG không tự parse, code vẫn `JSON.parse` như cũ); `nested: true` trả jsonb để lồng thành mảng
    (FOR JSON lồng trong FOR JSON — SQL Server tự hiểu). Khác duy nhất: thứ tự key trong object (jsonb tự sắp).
  - 5 chỗ: file kết quả CME (`RESULT_FILES_SQL`, dùng cả ở CME cá nhân), khoa bắt buộc của tập huấn bệnh viện,
    vòng thực hành của chương trình, cổng công khai — khóa mở đăng ký (chương trình → bài học, lồng 2 tầng).
  - Kiểm bằng ca "jsonArray" trong `test-integration/batchSplit.cases.js` (2 DB: helper trực tiếp — thứ tự, bỏ NULL,
    lồng, rỗng; khoa bắt buộc đúng thứ tự DB, file kết quả CME, CME cá nhân, danh sách chương trình, khóa mở đăng
    ký). Các hàm này nay chạy được trên PG. Tổng ratchet 79 → 74.
- [ ] Bỏ các chỗ phụ thuộc thứ tự ngầm: mọi câu trả danh sách phải có `ORDER BY`.
- [x] Ghi baseline smoke test (`UPDATE_SNAPSHOTS=1 npm run test:smoke`, đã ghi 2026-11-03;
  bản 24/10 lưu ở `get-shapes.2026-10-24.bak.json`) **trước**
  khi bắt đầu chặng 1 và chạy lại sau mỗi PR.

### Chặng 2 — Dựng PostgreSQL song song (2 tuần)

- [x] Cài PostgreSQL 18 trực tiếp trên server (không chạy trong Docker):
  `infra/cai-dat-postgresql.md`, cấu hình `infra/postgresql/`. Máy dev cài
  PostgreSQL trên Windows/WSL hoặc dùng tạm container chỉ để thử.
- [x] Adapter `src/config/db.pg.js` + biến `DB_CLIENT` (mục 5.1): `config/db.js`
  chọn `db.mssql.js` hoặc `db.pg.js`, cùng giao diện `request().input().query()`,
  `recordset`/`rowsAffected`, `withTransaction`, `withActor`. Unit test
  `test/database/pgAdapter.test.js` (đổi `@ten` → `$n`, type parser, pgpass);
  mã lỗi 2 DB ở `utils/dbErrors.js` (`test/utils/dbErrors.test.js`).
- [x] Schema baseline `database/pg/baseline/00–04` (`npm run pg:baseline`), có
  collation `rms_ci`, `jsonb`, `inet`, collation tiếng Việt, partition
  `security_events`. 107 bảng, 165 FK, 112 CHECK (10 CHECK `WITH NOCHECK` ở
  SQL Server → `NOT VALID` ở PG, giữ đúng ý đồ không hồi tố dữ liệu cũ).
- [x] Hàm trigger audit (`updated_at`/`updated_by`, `04_trigger.sql`); người sửa
  lấy từ `set_config('app.current_user_id')` qua `withActor(tx, userId)`. Cùng
  file: trigger sinh mã khoa `DVxxx`, đếm file theo batch, tự tạo phiếu duyệt đề tài.
- [x] Khi `DB_CLIENT=pg`: `dataRetentionJob` gọi
  `rms_maintain_monthly_partitions('security_events', 0, 2, <số tháng giữ>)`
  thay cho `DELETE` theo lô (tạo partition tháng tới, bỏ partition cũ, chuyển
  dòng lạc ở DEFAULT về đúng partition).
- [x] Migrator chạy được với PG (mục 5.3): migration PG ở `database/pg/migrations/`,
  `migrate init` trên DB trống chạy baseline 00–04.
- [x] Script chuyển dữ liệu (mục 6.5): `npm run pg:transfer precheck|load|verify`
  (`scripts/pg-transfer/`). Đã chạy DB dev → PostgreSQL 18 trên máy dev:
  107 bảng, 9.604 dòng, verify khớp checksum từng bảng.
- [x] CI: job `backend-postgres` (service container `postgres:18`) chạy
  `01_tao_db_va_role.sql` → `migrate init` → `npm run test:pg`
  (`test-integration-pg/`: adapter, mã lỗi, transaction, trigger, `rms_ci`,
  partition). Test đăng nhập/phân quyền/CRUD trên PG để sang chặng 3, khi SQL
  của các module đã chuyển.

### Chặng 3 — Chuyển SQL còn lại + diễn tập (2–3 tuần)

- [ ] Sửa phần còn lại của mục 2.2 theo module, mỗi module 1 PR. Câu nào khác
  nhau giữa 2 DB thì tạm để 2 bản qua helper `dialect({ mssql, pg })` — chỉ
  dùng cho chỗ thật sự không viết chung được, và xoá sau cutover.
  Thứ tự gợi ý: `auth`/`permissions` → `users`/`catalog` → `topics`/`councils`/`rounds`
  → `seminars`/`cme` → `training` (lớn nhất) → `attendance` → `dashboard`/báo cáo/xuất Excel.
- [ ] Cập nhật `fakeDb` trong test (các handler đang so khớp theo chuỗi SQL).
- [ ] Smoke test trên PG với dữ liệu chuyển từ cùng bản sao: dạng JSON phải
  giống baseline SQL Server. Nên mở rộng smoke test so **cả giá trị** (không
  chỉ dạng) giữa 2 backend chạy trên cùng dữ liệu.
- [ ] Test thủ công các luồng ghi quan trọng: đăng nhập/2FA, nộp và duyệt đề tài,
  hội đồng, điểm danh QR, đăng ký hội thảo, cấp CME, import Excel, xuất Word/Excel.
- [ ] Hiệu năng: bật `pg_stat_statements`, so các truy vấn "nóng"
  (`2026-12-07_chi_muc_truy_van_nong.sql`, `2026-12-09_toi_uu_tai_lon.sql`)
  bằng `EXPLAIN ANALYZE`; chạy thử tải đăng nhập/điểm danh.
- [ ] **Diễn tập cutover ít nhất 2 lần** trên bản sao production, đo thời gian
  từng bước, ghi vào runbook.

### Chặng 4 — Cutover (1 buổi + 1–2 tuần theo dõi)

Runbook (điền thời gian thật sau diễn tập):

1. T–7 ngày: đóng băng schema; thông báo lịch bảo trì.
2. T–1 ngày: diễn tập lần cuối với dữ liệu mới nhất.
3. T0: bật trang bảo trì / dừng backend; dừng job Node.
4. Backup đầy đủ SQL Server (`BACKUP DATABASE`), lưu ra ngoài máy.
5. Đặt SQL Server ở chế độ chỉ đọc (`ALTER DATABASE ... SET READ_ONLY`).
6. Chạy script chuyển dữ liệu → PG; `setval` cho mọi sequence/identity; `ANALYZE`.
7. Chạy script kiểm tra (mục 6.5). Không khớp → **dừng, quay lại SQL Server**.
8. Đổi biến môi trường backend sang PG (`DB_CLIENT=pg`, `DB_HOST`...), deploy.
9. Smoke test + kiểm tra tay 15–20 phút bằng tài khoản thật (chỉ đọc).
10. Mốc **go/no-go**: mở cho người dùng. Từ lúc này lui về SQL Server sẽ mất dữ
    liệu ghi mới, trừ khi có script chuyển ngược.
11. Theo dõi 1–2 tuần: log lỗi 5xx, truy vấn chậm, số kết nối.
12. Sau 1 tháng ổn định: xoá nhánh `mssql` trong code, xoá `database/migrations/`
    T-SQL (lưu tag git), gỡ dependency `mssql`, `@types/mssql`.

**Đường lui:**
- Trước bước 10: đổi biến môi trường về SQL Server, `SET READ_WRITE`, deploy lại. Không mất dữ liệu.
- Sau bước 10: cần script chuyển ngược PG → SQL Server cho dữ liệu phát sinh.
  Nên viết sẵn (dùng lại phần lớn script ở 6.5), dù hy vọng không phải dùng.

### 6.5 Chuyển dữ liệu SQL Server → PostgreSQL

Quy trình này chạy **nhiều lần**: lần đầu trên DB dev (chặng 2), ít nhất 2 lần
diễn tập trên bản sao production (chặng 3), và 1 lần thật lúc cutover (chặng 4).
Vì vậy mọi bước phải là script, chạy lại được, không có thao tác tay.

#### 6.5.1 Công cụ

Viết script Node riêng trong `backend/scripts/pg-transfer/`, chạy trong container
backend (Linux):

- Đọc từ SQL Server bằng `mssql` ở chế độ stream (`request.stream = true`), ghi
  vào PG bằng `COPY ... FROM STDIN` (gói `pg-copy-streams`). Đọc và ghi theo lô,
  không nạp cả bảng vào RAM.
- Bảng ánh xạ kiểu và cột lấy từ baseline PG (`database/pg/baseline/`):
  script đọc cột của bảng đích từ `information_schema.columns`, chỉ chép các cột
  có ở cả hai phía, theo thứ tự của PG.
- Lý do không dùng **pgloader** làm công cụ chính: pgloader đọc SQL Server qua
  FreeTDS, khó kiểm soát việc ép `BIT`/JSON/collation, và khó tích hợp vào bước
  kiểm tra. Vẫn có thể dùng pgloader **1 lần** để sinh khung schema tham khảo
  khi viết baseline.

```
npm run pg:transfer precheck   # kiểm tra dữ liệu nguồn, không ghi gì
npm run pg:transfer load       # tạo bảng, nạp dữ liệu, tạo index/FK, setval
npm run pg:transfer verify     # so số dòng, checksum, mẫu tiếng Việt
```

#### 6.5.2 Kiểm tra trước khi chuyển (`precheck`, chạy trên SQL Server)

Mỗi mục dưới đây đều làm lần nạp PG thất bại hoặc làm đổi nghĩa dữ liệu. Phải
sửa trên SQL Server (bằng migration hoặc `database/manual/`) **trước** lần
diễn tập đầu tiên.

| Kiểm tra | Vì sao | Cách sửa |
|---|---|---|
| Dòng vi phạm 10 ràng buộc `CHECK` "không tin cậy" (`CHK_attendance_id`, `CHK_courses_id`, `CHK_trainees_id`...) | SQL Server bỏ qua dữ liệu cũ, PG kiểm tra hết khi tạo ràng buộc | Đã xử lý: baseline tạo các CHECK này `NOT VALID` (dòng mới vẫn bị kiểm); precheck chỉ cảnh báo số dòng cũ vi phạm |
| Dòng mồ côi theo khoá ngoại (kể cả FK bị tắt hoặc `NOCHECK` trên production) | Tạo FK trên PG sẽ lỗi | Xoá hoặc gắn lại dòng mồ côi |
| Ký tự NUL (`CHAR(0)`) trong cột chuỗi | PG không cho lưu NUL trong `text` | Bỏ ký tự này (thường từ dữ liệu import Excel cũ) |
| Giá trị chỉ khác hoa/thường hoặc khoảng trắng cuối ở cột `rms_ci UNIQUE` (`username`, `email`, `staff_number`, mã danh mục) | SQL Server coi `'a '` = `'A'`; PG `rms_ci` chỉ bỏ qua hoa/thường, không bỏ khoảng trắng cuối | Cắt khoảng trắng; gộp tay nếu trùng |
| JSON không hợp lệ ở cột sẽ đổi sang `jsonb` | `jsonb` từ chối JSON sai | Sửa dữ liệu, hoặc giữ cột đó là `text` |
| Cột `DATETIME2(7)` có phần lẻ dưới micro giây | PG chỉ lưu tới micro giây | Không cần sửa, ghi nhận trong so sánh checksum (làm tròn về 6 chữ số) |
| Object và job ngoài repo (SQL Agent, login, view) | Không chuyển sẽ mất chức năng mà không ai biết | Kiểm kê chặng 0 (Q5) |

#### 6.5.3 Thứ tự nạp (`load`)

1. Tạo DB PG mới, rỗng (`infra/postgresql/01_tao_db_va_role.sql`): extension (`pg_trgm`, `unaccent`), collation `rms_ci`, role
   `rms_migrate`/`rms_app`, `timezone = 'Asia/Ho_Chi_Minh'`.
2. Tạo **bảng và khoá chính** từ baseline: `00_extensions.sql`, `01_tables.sql`
   (tạo sẵn partition tháng của `security_events` trong 24 tháng qua + DEFAULT).
   Chưa tạo FK, index phụ, CHECK, trigger.
3. Nạp từng bảng bằng `COPY`, 2–4 bảng song song. Chuyển giá trị trong lúc nạp:
   - `BIT` → `true/false`; `TINYINT` → `smallint`.
   - `DATETIME/DATETIME2` → chuỗi `YYYY-MM-DD HH:MM:SS.ffffff` **nguyên văn**,
     không đổi múi giờ (giữ quy ước "giờ VN không múi giờ", mục 4.3).
   - `DATE` → `YYYY-MM-DD`, đọc từ SQL Server dạng chuỗi để tránh lệch ngày do múi giờ của Node.
   - `NVARCHAR` chứa JSON → `jsonb` cho các cột đã chọn ở `DB_SCALING_PLAN.md`.
   - Không chép 4 cột tính toán (`persons.name_key`, `program_lessons.total_hours`,
     `seminar_participants.cme_certificate_no`, `training_programs.total_hours`).
     PG tự tính bằng `GENERATED ALWAYS AS (...) STORED`.
4. `02_constraints_indexes.sql` (chạy **1 lần**): index, `UNIQUE`, CHECK, FK dạng
   `NOT VALID` rồi `VALIDATE CONSTRAINT` (nhanh hơn và báo rõ dòng sai). Rồi
   `03_toi_uu.sql`: index bổ sung, `pg_trgm`, autovacuum riêng từng bảng.
5. `setval` cho mọi identity và sequence (`seq_person_id`, `seq_notification_suffix`,
   11 cột identity) = `MAX(id) + 1`.
6. Tạo hàm và trigger audit **sau** khi nạp (`04_trigger.sql`), để không ghi đè `updated_at` / `updated_by`; tạo bảng `schema_migrations`.
7. `VACUUM (ANALYZE)` toàn DB, để planner có thống kê ngay từ truy vấn đầu tiên.

#### 6.5.4 Kiểm tra sau khi chuyển (`verify`)

Script in bảng kết quả và trả mã lỗi khác 0 khi có chênh lệch. Có chênh lệch lúc
cutover thì **dừng, quay lại SQL Server** (chặng 4, bước 7).

- Số dòng từng bảng bằng nhau.
- Checksum từng bảng: sắp theo khoá chính, chuẩn hoá giá trị (ngày giờ ISO 6 chữ
  số lẻ, boolean → 0/1, `NULL` → ký hiệu riêng, JSON chuẩn hoá khoá), băm SHA-256
  ở cả 2 phía bằng JS rồi so. Bảng lớn: băm theo từng khoảng khoá để biết khoảng nào lệch.
- Tiếng Việt: lấy ngẫu nhiên 1.000 giá trị `NVARCHAR` mỗi bảng, so từng byte UTF-8.
- Sequence: `nextval` của PG > `MAX(id)` hiện có.
- Mọi FK đã `VALIDATE` xong; không còn ràng buộc `NOT VALID` ngoài danh sách đã chấp nhận.
- Ứng dụng: smoke test (`npm run test:smoke`) trên PG so với baseline SQL Server
  cùng bản dữ liệu; đăng nhập bằng username viết **hoa**; mở file upload cũ.

#### 6.5.5 File upload

File nằm trên đĩa, không nằm trong DB, nên không đi qua script này. Chỉ cần
`rsync` thư mục upload (đã làm ở bước A) và chạy `npm run sync:upload-paths` để
kiểm tra cột đường dẫn.

#### 6.5.6 Đo thời gian và đường lui

- Mỗi lần diễn tập ghi lại thời gian từng bước vào runbook. DB dev 144 MB nạp
  trong vài phút. Với production, khung bảo trì = thời gian đo được × 2.
- Viết sẵn chiều ngược lại (`pg:transfer` với nguồn PG, đích SQL Server) dùng chung
  bảng ánh xạ, để có đường lui sau mốc go/no-go (chặng 4, bước 10).

## 7. Kiểm thử

| Loại | Hiện có | Cần thêm |
|---|---|---|
| Unit test (`node --test`, `fakeDb`) | ~70 file, không cần DB | Cập nhật handler khi đổi SQL; test adapter, `dbErrors`, type parser |
| Test tích hợp trên DB thật | `test-integration/` (smoke, batchedWrites, insertColumns), chạy tay | Chạy được với `DB_CLIENT=pg`; thêm vào CI với service container PG |
| Smoke so dạng JSON | Có baseline cục bộ | So cả giá trị giữa 2 DB; dùng làm tiêu chí chấp nhận chặng 3 |
| Kiểm tra dữ liệu | — | Script đếm dòng + checksum (mục 6.5) |
| Hiệu năng | — | `pg_stat_statements`, so với số liệu SQL Server ở chặng 0 |
| Ratchet T-SQL | — | `check-tsql-usage.js` trong CI (chặng 0) |

## 8. Vận hành sau khi chuyển

- **Backup**: `pg_dump` hằng đêm + lưu WAL (pgBackRest hoặc `archive_command`) để
  khôi phục tới thời điểm bất kỳ. Diễn tập khôi phục ít nhất 1 lần.
- **Role**: `rms_app` (chỉ DML trên schema ứng dụng), `rms_migrate` (DDL, dùng
  trong `deploy.ps1`), không dùng `postgres` cho ứng dụng. Cập nhật cảnh báo
  trong `env.js`.
- **Kết nối**: `max_connections` ≥ `WEB_CONCURRENCY × DB_POOL_MAX` + dự phòng;
  hoặc PgBouncer chế độ transaction.
- **Bảo trì**: autovacuum mặc định là đủ lúc đầu; theo dõi bảng ghi nhiều
  (`notifications`, `audit`, điểm danh, refresh token). Cấu hình, giữ dữ liệu
  theo thời gian và tách bảng: xem `DB_SCALING_PLAN.md`.
- **SSL**: `sslmode=require` (hoặc `verify-full` khi có chứng chỉ CA), thay cho `DB_ENCRYPT`.
- **Tài liệu**: cập nhật `README.md` (cài đặt, biến môi trường, xử lý sự cố),
  `backend/database/README.md`, `.github/CICD.md`, `scripts/deploy.ps1`.

## 9. Ước lượng công sức (1 lập trình viên, thô)

| Chặng | Tuần |
|---|---|
| A — Lên Linux với SQL Server, viết lại deploy (song song chặng 0–1) | 1 |
| 0 — Kiểm kê, quyết định, script ratchet | 1 |
| 1 — Trung lập hoá trên SQL Server, chuyển SP/trigger về JS | 3–5 |
| 2 — Adapter, baseline schema, migrator, chuyển dữ liệu thử, CI | 2 |
| 3 — Chuyển SQL còn lại, kiểm thử, hiệu năng, 2 lần diễn tập | 2–3 |
| 4 — Cutover + theo dõi | 1 |
| **Tổng** | **8–12** |

Chưa tính: viết lại báo cáo/hệ thống ngoài phát hiện ở chặng 0, và thời gian
chờ duyệt/khung bảo trì. Chặng 1 tự nó đã có ích (code dễ test hơn, ít logic ẩn
trong DB) kể cả khi cuối cùng quyết định không chuyển.

## 10. Rủi ro chính

| Rủi ro | Khả năng | Ảnh hưởng | Giảm thiểu |
|---|---|---|---|
| Lệch giờ 7 tiếng sau khi đổi driver | Cao nếu không xử lý | Khoá tài khoản, hạn nộp, điểm danh sai | Mục 4.3, test riêng, so smoke giá trị |
| Phân biệt hoa/thường làm hỏng đăng nhập, kiểm trùng | Cao | Người dùng không đăng nhập được, tạo trùng tài khoản | Collation `rms_ci`, `ILIKE`, test đăng nhập với chữ hoa |
| Transaction bị huỷ sau lỗi bắt được (mục 2.4 ý 7) | Trung bình | Lỗi 500 ở luồng import/ghi hàng loạt | Tìm mọi `catch` trong `withTransaction`, dùng `ON CONFLICT`/`SAVEPOINT` |
| Sót câu T-SQL ít dùng (xuất báo cáo cuối năm...) | Trung bình | Lỗi ở chức năng ít người dùng | Script ratchet về 0, smoke gọi mọi GET, test tay các luồng xuất file |
| Hệ thống ngoài đọc thẳng SQL Server | Chưa rõ | Báo cáo ngừng chạy | Kiểm kê chặng 0 (Q5) |
| Hiệu năng truy vấn khác (planner khác, thiếu index) | Trung bình | Chậm trang dashboard/danh sách | `EXPLAIN ANALYZE`, `pg_stat_statements` trước cutover |
| Schema thay đổi trong lúc chuyển | Trung bình | Lệch 2 DB | Quy tắc 2 bản migration + đóng băng trước cutover |

## 11. Việc làm tiếp theo (cập nhật 03/11/2026)

1. ~~PR nhỏ đầu tiên: `dbErrors.js` + `check-tsql-usage.js` (ratchet).~~ Xong (`38c6087`).
2. Chốt Q1–Q5 với người phụ trách hệ thống và vận hành. Hỏi thêm: production
   đang dùng bản SQL Server nào (Express có giới hạn 10 GB/DB).
3. Chạy các truy vấn kiểm kê ở chặng 0 trên production, thêm các kiểm tra ở mục 6.5.2.
4. Ghi baseline smoke test trên DB dev hiện tại.
5. Bắt đầu bước A (`deploy.sh`) và các việc chặng 1 không phụ thuộc nhau:
   ~~`withActor()`, `ISNULL` → `COALESCE`, `OPENJSON` → helper.~~ Xong (chặng 1, mục 6).
6. ~~Làm ngay trên SQL Server các việc dọn dữ liệu ở `DB_SCALING_PLAN.md` mục 6
   (giai đoạn 1).~~ Xong 03/11/2026 (`dataRetentionJob`, migration `2026-12-13_toi_uu_index_giai_doan_1`).
