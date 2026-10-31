# Kế hoạch chuẩn bị chuyển CSDL: SQL Server → PostgreSQL

> Trạng thái: **bản nháp để thảo luận** (28/10/2026). Chưa có quyết định chuyển.
> Mục tiêu tài liệu: biết chính xác phải sửa những gì, làm theo thứ tự nào để
> hệ thống vẫn chạy ổn trong suốt quá trình, và có đường lui khi chuyển hỏng.

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
| `recordset` / `recordsets[i]` (nhiều kết quả trong 1 batch) | 673 / 91 | `rows`; nhiều kết quả → tách thành nhiều câu |
| `GETDATE()`, `SYSDATETIME()`, `SYSUTCDATETIME()` | 212 (86) | `LOCALTIMESTAMP` / `now()` — xem mục 4.3 về múi giờ |
| `N'...'` | 339 (98) | `'...'` (PG luôn là UTF-8) |
| Định danh `[ten]` | 658 (156) | `"ten"` hoặc bỏ ngoặc |
| `ISNULL(` | 108 (33) | `COALESCE(` (chạy được trên cả 2 DB) |
| `EXEC sp_set_actor @actor_id; ...` | 76 (27) | `set_config('app.current_user_id', $1, true)` trong transaction |
| `EXEC sp_gen_*` / `.execute(...)` | ~20 / 10 | Hàm sinh mã mới (mục 5.4) |
| `DECLARE @...` (batch nhiều câu) | 80 (47) | Viết lại: CTE, nhiều lời gọi JS, hoặc hàm PL/pgSQL |
| `TOP n` | 71 (45) | `LIMIT n` (hoặc `FETCH FIRST n ROWS ONLY`, chạy cả 2 DB) |
| `NEWID()` | 42 (27) | `gen_random_uuid()` |
| `OPENJSON(@ids)` | 31 (15) | `= ANY($1::text[])` hoặc `jsonb_array_elements_text($1)` |
| `DATEADD` / `DATEDIFF` | 31 (18) | `+ interval '...'`, `date_part`, phép trừ ngày |
| `STRING_AGG(...) WITHIN GROUP (ORDER BY ...)` | 25 (13) | `string_agg(x, ',' ORDER BY ...)` |
| `CROSS APPLY` / `OUTER APPLY` | 25 (19) | `CROSS JOIN LATERAL` / `LEFT JOIN LATERAL ... ON true` |
| `LIKE ... ESCAPE`, `LIKE '[0-9]'` | 25 (4) + nhiều mẫu `[0-9]` | PG `LIKE` **không** có lớp ký tự `[...]` → dùng `~ '^...[0-9]{3}$'` |
| `OUTPUT INSERTED/DELETED` | 19 (13) | `RETURNING` |
| `SCOPE_IDENTITY()`, `@@ROWCOUNT`, `@@TRANCOUNT` | 18 (13) | `RETURNING id`, `rowCount`, không có tương đương trực tiếp |
| `CAST(... AS NVARCHAR/BIT/DATETIME)` | 59 (35) | `::text`, `::boolean`, `::timestamp` |
| `CONVERT(`, `TRY_CAST(` | 20 (8) | `CAST`, `to_char`; `TRY_CAST` cần hàm tự viết |
| `MERGE` (có `WITH (HOLDLOCK)`) | 10 (9) | `INSERT ... ON CONFLICT DO UPDATE` |
| Gợi ý khoá `UPDLOCK/HOLDLOCK`, `sp_getapplock` | 5 + 6 | `SELECT ... FOR UPDATE`; khoá dải mã → `pg_advisory_xact_lock(hashtext(...))` |
| Bảng tạm `#t`, biến bảng `@t TABLE` | 21 (3) + 8 | `CREATE TEMP TABLE ... ON COMMIT DROP`, CTE |
| `THROW 5xxxx` / `RAISERROR` + kiểm `err.number` | 7 + 45 (19) | `RAISE EXCEPTION ... USING ERRCODE`; đọc `err.code` (mã SQLSTATE) |
| `err.number === 2627/2601` (trùng khoá), `547` (FK), `207/208` | ~20 | `23505`, `23503`, `42703/42P01` |
| `OFFSET ... FETCH NEXT` | 6 (3) | Giữ nguyên (PG hỗ trợ cú pháp chuẩn này) |
| `FOR JSON` | 5 (4) | `json_agg`, `jsonb_build_object` |
| `ROW_NUMBER() OVER` | 5 (3) | Giữ nguyên |

> Số liệu đếm bằng `grep`, có thể lệch vài chỗ (chuỗi trong comment). Mục 6.1
> có bước tạo script đếm lại tự động để theo dõi tiến độ.

### 2.3 Schema và object trong DB

| Nhóm | Số lượng | Ghi chú |
|---|---|---|
| Bảng | ~80 | Khoá chính chủ yếu là mã chuỗi `VARCHAR` sinh theo tiền tố (`LDT01`, `NV..`, `<abbr>_<năm>_001`) |
| Cột `NVARCHAR` | 461 (93 cột `NVARCHAR(MAX)`) | → `text` / `varchar(n)` |
| `DATETIME2` / `DATETIME` | ≥56 | → `timestamp` (không múi giờ), mục 4.3 |
| `BIT` | 56 | → `boolean`. Code đang so `= 1` / `= 0` ở nhiều nơi phải sửa |
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
| Q3 | Đặt PG ở đâu: container trong compose, VM riêng, hay dịch vụ quản lý? | VM/máy riêng như SQL Server hiện tại. Dev dùng container trong `docker-compose.yml`. |
| Q4 | Thời gian dừng hệ thống cho phép khi cutover | Nếu DB < vài chục GB: 1 khung bảo trì 2–4 giờ ngoài giờ hành chính là đủ, không cần đồng bộ liên tục (CDC). |
| Q5 | Có hệ thống ngoài đọc/ghi thẳng DB không (SQL Agent job, báo cáo, Power BI, Excel kết nối DB, hai view `vw_*_audit`)? | Kiểm kê trên production (mục 6.1). Mỗi thứ tìm được đều phải có phương án. |
| Q6 | Cách xử lý không phân biệt hoa/thường | `citext` cho cột định danh (`username`, `email`, mã) + `ILIKE` cho tìm kiếm. Xem mục 4.2. |
| Q7 | Có dừng thêm migration schema trong thời gian chuyển không? | Từ khi bắt đầu chặng 2: **mỗi migration mới phải viết kèm bản PG**. Trước cutover 1–2 tuần: đóng băng schema. |

## 4. Quy tắc chuyển đổi

### 4.1 Kiểu dữ liệu

| SQL Server | PostgreSQL | Ghi chú |
|---|---|---|
| `VARCHAR(n)`, `NVARCHAR(n)` | `varchar(n)` (hoặc `citext` cho cột cần không phân biệt hoa/thường) | PG đếm ký tự, không đếm byte |
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
  khoa/danh mục): dùng `citext` (extension có sẵn). `=`, `UNIQUE`, `IN` hoạt
  động như cũ, không phải sửa câu SQL.
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
- Viết test riêng cho các chỗ đang ghi chú "useUTC" (`credentialService.js`,
  `seminarPublicService.js`, `attendancePolicy.js`, `vnDate.js`...).
- Không đổi sang `timestamptz` trong đợt này. Muốn chuẩn hoá thì làm sau, trên PG.

### 4.4 Cú pháp truy vấn (bảng tra nhanh)

| T-SQL | PostgreSQL | Chạy được trên cả 2? |
|---|---|---|
| `ISNULL(a, b)` | `COALESCE(a, b)` | ✓ — đổi ngay ở chặng 1 |
| `SELECT TOP 10 ...` | `... LIMIT 10` | Dùng `OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY` (cần `ORDER BY`) nếu muốn chạy cả 2 |
| `GETDATE()` | `LOCALTIMESTAMP` | `CURRENT_TIMESTAMP` chạy cả 2 nhưng PG trả `timestamptz` → nên đổi trong adapter/chặng 3 |
| `LEN(s)` | `length(s)` | ✗ (LEN bỏ khoảng trắng cuối) |
| `a + b` (nối chuỗi) | `a \|\| b` hoặc `concat(a, b)` | `CONCAT(a, b)` ✓ |
| `CAST(x AS NVARCHAR(20))` | `x::text` | `CAST(x AS VARCHAR(20))` ✓ |
| `IIF`, `CASE` | `CASE` | `CASE` ✓ |
| `DATEADD(day, n, d)` | `d + n * interval '1 day'` | ✗ |
| `DATEDIFF(day, a, b)` | `b::date - a::date` | ✗ |
| `CONVERT(VARCHAR, d, 103)` | `to_char(d, 'DD/MM/YYYY')` | ✗ — nên định dạng ở JS |
| `OUTPUT INSERTED.*` | `RETURNING *` | ✗ |
| `MERGE ... WITH (HOLDLOCK)` | `INSERT ... ON CONFLICT (...) DO UPDATE` | ✗ — cần index `UNIQUE` trên khoá xung đột |
| `CROSS APPLY (SELECT TOP 1 ...)` | `CROSS JOIN LATERAL (SELECT ... LIMIT 1)` | ✗ |
| `OPENJSON(@ids)` | `= ANY($1::text[])` (truyền mảng JS) | ✗ — có thể chuyển về `IN (@id0, @id1...)` qua `inClause` ở chặng 1 |
| `STRING_AGG(x, ',') WITHIN GROUP (ORDER BY y)` | `string_agg(x, ',' ORDER BY y)` | ✗ |
| `FOR JSON PATH` | `json_agg(json_build_object(...))` | ✗ — hoặc gom ở JS |
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
- `withActor(txOrPool, actorId, fn)`: thay `EXEC sp_set_actor @actor_id;` —
  chạy `SELECT set_config('app.current_user_id', $1, true)` trong cùng
  transaction. Với `true` (`is_local`), giá trị hết hạn khi transaction kết thúc
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
  1. Sinh `database/pg/0000_baseline.sql` từ **schema hiện tại** của production
     (bảng, cột, khoá, index, sequence, ràng buộc), đã đổi kiểu theo mục 4.1.
     Có thể dùng `pgloader` để sinh khung rồi sửa tay, hoặc script đọc
     `INFORMATION_SCHEMA` / `sys.*`.
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
| 23 `sp_gen_*` đang dùng (gọi từ JS hoặc từ procedure khác) | Viết 1 hàm JS `nextCode({ table, prefix, digits, lockKey })` có khoá (trên SQL Server: `sp_getapplock`; trên PG: `pg_advisory_xact_lock`). Có sẵn mẫu `levelService.createWithSeqId`. Thay dần từng chỗ gọi. |
| `trg_topic_auto_approval` | Chuyển về service duyệt đề tài trong JS (logic hiện đang "ẩn"). |
| `sp_approve_topic` + `sp_grant_member_accounts` | Chuyển về JS service có test (150 dòng, gộp 3 việc). |
| `sp_push_notification` + `sp_resolve_recipients` | Chuyển về `notifications` service JS. |
| `sp_upload_files`, `trg_file_batch_count`, `trg_dept_gen_id`, `sp_create_refresh_token`, `sp_deactivate_expired_accounts`, `sp_cleanup_*` | Chuyển về JS (đã có job Node cho việc định kỳ). |
| 13 trigger audit `trg_*_audit` | Giữ ở DB. Trên PG: 1 hàm `audit_set_updated()` dùng chung, `BEFORE UPDATE ... FOR EACH ROW`, đọc `current_setting('app.current_user_id', true)`, chỉ cập nhật khi các cột theo dõi thay đổi (`NEW.col IS DISTINCT FROM OLD.col`). |
| `sp_set_actor` | Bỏ; thay bằng `withActor` (mục 5.1). |
| `fn_normalize_phone` | Viết lại PL/pgSQL hoặc chuyển về JS. |
| `vw_approvals_audit`, `vw_topics_audit` | Chỉ chuyển nếu vận hành xác nhận còn dùng. |

Sau bước này, DB PG chỉ còn: bảng, index, sequence, 1 hàm trigger audit, có thể 1–2 hàm tiện ích.

## 6. Lộ trình chi tiết

### Chặng 0 — Kiểm kê và chốt quyết định (1 tuần)

- [ ] Trả lời các câu hỏi ở mục 3.
- [ ] Chạy trên **production** (chỉ đọc), lưu kết quả vào thư mục ngoài repo:
  - Kích thước DB, số dòng từng bảng, 20 bảng lớn nhất.
  - Collation của server, DB và mọi cột có collation riêng.
  - Danh sách SQL Agent job và lệnh của chúng (truy vấn mẫu ở `database/README.md`).
  - Danh sách login/user, ai kết nối vào DB (`sys.dm_exec_sessions` theo `program_name`, `host_name` trong vài ngày).
  - Object trong DB không có trong `database/objects/` (so lại bằng `npm run dump:db-objects`).
  - Top truy vấn tốn tài nguyên (`sys.dm_exec_query_stats`) để so hiệu năng sau này.
- [ ] Viết `backend/scripts/check-tsql-usage.js`: đếm các mẫu ở mục 2.2 theo
  từng file, in bảng tiến độ. Chạy trong CI ở chế độ "ratchet" (chỉ cho giảm,
  không cho tăng) — giống `typecheckRatchet.test.js` đang có.

### Chặng 1 — Trung lập hoá trên SQL Server (3–5 tuần, phát hành dần)

Mọi việc dưới đây chạy trên SQL Server hiện tại, test và smoke test như bình
thường. Mỗi nhóm là 1 PR nhỏ theo module.

- [ ] `dbErrors.js` + sửa 19 file đang kiểm `err.number` (mục 4.5).
- [ ] `withActor()` thay 76 chỗ `EXEC sp_set_actor @actor_id;` (trên SQL Server
  vẫn gọi `sp_set_actor` bên trong, nhưng tách thành lời gọi riêng trong transaction).
- [ ] Hàm sinh mã JS dùng chung; thay các `EXEC sp_gen_*` (mục 5.4).
- [ ] Chuyển `trg_topic_auto_approval`, `sp_approve_topic`, `sp_push_notification`,
  `sp_upload_files`... về JS, có test. Xoá procedure không dùng.
- [ ] Đổi cú pháp chạy được trên cả 2 DB: `ISNULL` → `COALESCE`, `+` nối chuỗi →
  `CONCAT`, `CAST AS NVARCHAR` → `CAST AS VARCHAR`, bỏ `[...]` không cần thiết.
- [ ] `OPENJSON(@ids)` → `inClause` (đã có ở `src/utils/sqlFilters.js`) hoặc 1
  helper `anyOf()` để adapter PG đổi sang `= ANY($1)`.
- [ ] Tách các batch `DECLARE ...` và `recordsets[i]` thành nhiều lời gọi JS (mục 5.2).
- [ ] Bỏ các chỗ phụ thuộc thứ tự ngầm: mọi câu trả danh sách phải có `ORDER BY`.
- [ ] Ghi baseline smoke test (`UPDATE_SNAPSHOTS=1 npm run test:smoke`) **trước**
  khi bắt đầu chặng 1 và chạy lại sau mỗi PR.

### Chặng 2 — Dựng PostgreSQL song song (2 tuần)

- [ ] Thêm service `postgres` vào `docker-compose.yml` (dev) với volume riêng.
- [ ] Adapter `db.pg.js` + biến `DB_CLIENT` (mục 5.1), có unit test cho việc đổi
  `@ten` → `$n`, type parser ngày giờ, mã lỗi.
- [ ] `database/pg/0000_baseline.sql` + hàm trigger audit + extension `citext`.
- [ ] Migrator chạy được với PG (mục 5.3).
- [ ] Script chuyển dữ liệu lần đầu (mục 6.5) từ bản sao DB dev → PG dev.
- [ ] CI: thêm job có service container `postgres`, chạy migrate baseline +
  1 bộ test tích hợp nhỏ (đăng nhập, phân quyền, CRUD danh mục).

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

### 6.5 Chuyển và kiểm tra dữ liệu

- Công cụ: **pgloader** (hỗ trợ đọc trực tiếp từ MS SQL) để chuyển nhanh, kèm
  file cấu hình ép kiểu theo mục 4.1. Nếu pgloader khó dùng với môi trường
  Windows/SQL Server, viết script Node đọc theo lô từ `mssql` và `COPY` vào PG.
- Thứ tự: tạo bảng (chưa có FK/index) → nạp dữ liệu → tạo index, FK, ràng buộc
  → `setval` → `ANALYZE`. Tắt trigger audit trong lúc nạp để không ghi đè `updated_at`.
- Kiểm tra tự động (script, chạy sau mỗi lần chuyển):
  - Số dòng từng bảng bằng nhau.
  - Checksum từng bảng: băm các dòng đã chuẩn hoá (sắp theo khoá chính, ngày
    giờ định dạng ISO, boolean → 0/1) ở cả 2 phía rồi so.
  - Chữ tiếng Việt: lấy mẫu ngẫu nhiên các cột `NVARCHAR`, so từng byte.
  - Giá trị lớn nhất của cột identity/sequence nhỏ hơn giá trị tiếp theo của sequence PG.
  - Không có giá trị vi phạm `citext UNIQUE` (2 dòng chỉ khác hoa/thường đã
    tồn tại trên SQL Server là không thể vì collation CI, nhưng vẫn kiểm).
- File upload nằm trên đĩa, không trong DB → không phải chuyển; chỉ kiểm cột đường dẫn.

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
  (`notifications`, `audit`, điểm danh, refresh token).
- **SSL**: `sslmode=require` (hoặc `verify-full` khi có chứng chỉ CA), thay cho `DB_ENCRYPT`.
- **Tài liệu**: cập nhật `README.md` (cài đặt, biến môi trường, xử lý sự cố),
  `backend/database/README.md`, `.github/CICD.md`, `scripts/deploy.ps1`.

## 9. Ước lượng công sức (1 lập trình viên, thô)

| Chặng | Tuần |
|---|---|
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
| Phân biệt hoa/thường làm hỏng đăng nhập, kiểm trùng | Cao | Người dùng không đăng nhập được, tạo trùng tài khoản | `citext`, `ILIKE`, test đăng nhập với chữ hoa |
| Transaction bị huỷ sau lỗi bắt được (mục 2.4 ý 7) | Trung bình | Lỗi 500 ở luồng import/ghi hàng loạt | Tìm mọi `catch` trong `withTransaction`, dùng `ON CONFLICT`/`SAVEPOINT` |
| Sót câu T-SQL ít dùng (xuất báo cáo cuối năm...) | Trung bình | Lỗi ở chức năng ít người dùng | Script ratchet về 0, smoke gọi mọi GET, test tay các luồng xuất file |
| Hệ thống ngoài đọc thẳng SQL Server | Chưa rõ | Báo cáo ngừng chạy | Kiểm kê chặng 0 (Q5) |
| Hiệu năng truy vấn khác (planner khác, thiếu index) | Trung bình | Chậm trang dashboard/danh sách | `EXPLAIN ANALYZE`, `pg_stat_statements` trước cutover |
| Schema thay đổi trong lúc chuyển | Trung bình | Lệch 2 DB | Quy tắc 2 bản migration + đóng băng trước cutover |

## 11. Việc làm đầu tiên (tuần này)

1. Chốt Q1–Q5 với người phụ trách hệ thống và vận hành.
2. Chạy các truy vấn kiểm kê ở chặng 0 trên production.
3. PR nhỏ đầu tiên, không ảnh hưởng hành vi: `dbErrors.js` + `check-tsql-usage.js` (ratchet).
4. Ghi baseline smoke test trên DB dev hiện tại.
