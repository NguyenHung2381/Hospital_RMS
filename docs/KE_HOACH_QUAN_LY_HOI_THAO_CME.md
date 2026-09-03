# Kế hoạch: Chức năng Quản lý Hội thảo – Hội nghị & Cấp CME

_Tài liệu phân tích 4 file Excel trong `docs/` và đề xuất module mới cho RMS Hospital._
_Ngày lập: 2026-09-03._

---

## 0. Trạng thái triển khai

**Giai đoạn 1 (Nền tảng) — ĐÃ LÀM:**

| Thành phần | File |
|---|---|
| Migration (3 bảng + `sp_gen_cme_no` + 8 quyền `seminars:*` + gán VT01/VT02/VT03) | `server/migrations/2026-09-03_seminars.sql` |
| Service sự kiện + thống kê + sổ CME | `server/src/services/seminarService.js` |
| Service người tham dự + cấp/thu hồi CME | `server/src/services/seminarParticipantService.js` |
| Controller | `server/src/controllers/seminarController.js` |
| Routes (mount `${API}/seminars`) | `server/src/routes/seminars.js`, sửa `server/src/app.js` |
| FE: types / api / hooks | `client/src/features/seminar/{types,api,hooks}` |
| FE: trang Danh sách · Chi tiết · Sổ cấp CME | `client/src/features/seminar/pages/*` |
| FE: modal sự kiện / người / cấp CME / xoá | `client/src/features/seminar/components/*` |
| Router + menu (nhóm "Đào tạo & Hội nghị") | `client/src/app/router/privateRoutes.tsx`, `client/src/layouts/AdminLayout/{index,icons}.tsx` |
| Ma trận phân quyền: thêm resource `seminars` + action `import`/`export`/`cme_manage` | `client/src/features/roles/types/role.type.ts`, `client/src/features/roles/components/RolePermissionModal.tsx` |

Chỉ có ở khu **/admin**, không có ở portal người dùng. Sau khi chạy migration, mở
**Vai trò & Quyền → chọn vai trò → Phân quyền**: nhóm "Hội thảo, Hội nghị & CME"
cho cấu hình từng tài khoản (theo vai trò) được Xem / Tạo / Sửa / Xoá / Nhập /
Xuất / Cấp CME.

> ⚠️ Migration `2026-09-03_seminars.sql` **cần chạy tay** trên SQL Server (dự án
> chưa có runner). Idempotent.

**Chưa làm:** import Excel (P2), export Excel + widget dashboard (P3), mục "hội
thảo đã tham dự" trong hồ sơ cán bộ (P4).

---

## 1. Phân tích các file Excel

### 1.1. `Copy of 2026 Theo dõi cử tham dự Hội thảo, Hội nghị.xlsx`

Mục đích: **theo dõi cán bộ được cử đi dự hội thảo/hội nghị bên ngoài** trong năm 2026.

| Sheet | Số dòng dữ liệu | Cột |
|---|---|---|
| `Hội nghị HT` | ~89 | TT, MNV, Khoa/phòng/TT, Họ tên, Ngày sinh, TĐCM, Hình thức, Nội dung, Địa điểm, Thời gian tham gia, _(cột cuối: người điều phối "Lộc"/"Hà")_ |
| `Tập huấn NCKH` | 7 | TT, MNV, Họ tên, Ngày sinh, Khoa/phòng/TT, TĐCM, Nội dung, Thời gian tham gia |

Đặc điểm dữ liệu (ảnh hưởng thiết kế):
- **Tiêu đề nằm ở dòng 1**, header thật ở **dòng 3**, data từ dòng 4 → không đọc cứng dòng 1 (giống `councilImportService.findHeader`).
- `Hình thức` nhiều biến thể: `Hội nghị`, `Hội thảo khoa học`, `Hội thảo quốc tế`, `Hội nghị khoa học`, `Hội thảo` → cần chuẩn hoá về enum + giữ nhãn gốc.
- `Thời gian tham gia` **không chuẩn**: `"05-06/06/2026"`, `"05/06/2026"`, ô ngày thật (datetime), lỗi gõ `"09-10/012026"`, có ô để trống. → **giữ nguyên chuỗi gốc** (`date_text`), parse best-effort ra `start_date`/`end_date`, đánh dấu dòng không parse được.
- `Ngày sinh` kiểu hỗn hợp: datetime, chuỗi `"12/9/1984"`, chỉ có năm `"1989"`. → lưu `date` nullable + chuỗi gốc.
- `MNV` đôi khi trống; **là khoá match mạnh nhất** với `users.staff_number`.
- Một người xuất hiện nhiều lần (mỗi sự kiện một dòng) — **không dedupe**.
- Có dòng chỉ có tên, bỏ trống toàn bộ cột sự kiện (người dự kiến cử, sự kiện chưa chốt).
- Cột cuối (`Lộc`, `Hà`) = người lập/điều phối danh sách; một ô lạc số `54`.

### 1.2. `Danh sách cấp CME ngoại viện HN gan mật tụy.xlsx`

Mục đích: **danh sách đại biểu NGOẠI VIỆN được cấp CME** cho "Hội nghị khoa học Phẫu thuật Gan, Mật, Tụy Việt Nam lần thứ 1 năm 2026".

- `Sheet1`, dữ liệu bắt đầu từ **cột C**, header ở **dòng 2**, có cột kỹ thuật `Column1..Column13` ở dòng 1 (bỏ qua).
- Cột: `STT`, `SQĐ` (số quyết định/chứng nhận, vd `"0261"` — giữ dạng chuỗi có số 0 đầu), _(cột danh xưng `Ông`/`Bà`)_, `Họ và tên`, `Ngày tháng năm sinh`, `Đơn vị công tác` (tổ chức ngoài), `Số tín chỉ` (`3`), `Vai trò` (`Đại biểu` / `Báo cáo viên`), `Sửa đổi` (ghi chú: `"ko thấy CME"`, `"đã lấy"`, `"đã lấy ngày 13/8"`).
- 70 đại biểu. Toàn bộ là người **không có trong `users`** → lưu dạng text.

### 1.3. `Danh sách cấp CME nội viện HN gan mật tụy.xlsx`

Cùng hội nghị, **đại biểu NỘI VIỆN** (cán bộ bệnh viện).

- Sheet `CME nội viện`, tiêu đề dòng 1, header **dòng 3**, data từ dòng 4.
- Cột: `STT`, `SQĐ`, `HỌ VÀ TÊN` (có tiền tố `Ông`/`Bà` trong cùng ô), `SINH NGÀY`, `GIỚI TÍNH` (`Nam`/`Nữ`), `ĐƠN VỊ CÔNG TÁC` (đều là "Bệnh viện Hữu nghị đa khoa Nghệ An"), `SỐ TÍN CHỈ` (`3`, hoặc `"3,5"`, `"5,5"` cho báo cáo viên — **dấu phẩy thập phân**), `VAI TRÒ`, `Ký nhận CME` (cột trống để ký).
- 260 đại biểu. Cần **match với `users`** theo tên (sau khi bỏ `Ông`/`Bà`) + giới tính; không match được thì lưu text.

### 1.4. `Thống kê Hội thảo, hội nghị.xlsx`

**Template rỗng** — bảng tổng hợp các hội thảo/hội nghị **do bệnh viện tổ chức**.

Cột: `Ngày tổ chức`, `Tên Hội thảo`, `Địa điểm tổ chức`, `Chủ tọa`, `Báo cáo viên`, `Công văn cấp phép của Sở`, `Số lượng đại biểu trong viện`, `Số lượng đại biểu ngoại viện`, `Số lượng đại biểu nước ngoài`, `Đơn vị phối hợp tổ chức`, `Ghi chú`.

→ Đây là **báo cáo tổng hợp suy ra được** từ 3 file trên, không phải bảng nhập tay riêng.

### 1.5. Kết luận: 2 nghiệp vụ, 1 thực thể lõi

| Nghiệp vụ | File nguồn | Bản chất |
|---|---|---|
| **A. Cử cán bộ đi dự sự kiện bên ngoài** | 1.1 | BV cử người ra ngoài; theo dõi ai / sự kiện gì / hình thức / nội dung / địa điểm / thời gian |
| **B. Sự kiện BV tổ chức + cấp CME** | 1.2, 1.3, 1.4 | BV tổ chức hội nghị; đăng ký đại biểu (nội + ngoại viện); cấp tín chỉ CME kèm số quyết định; thống kê tổng hợp |

Cả hai quy về thực thể **Hội thảo/Hội nghị** (`seminar`) + danh sách **người tham dự** (`seminar_participant`). File 1.4 là **view báo cáo**, không phải bảng.

### 1.6. Lưu ý nghiệp vụ CME (theo phản hồi)

- **CME KHÔNG liên quan đến nghiên cứu khoa học** — không gắn `research_rounds`, không tính vào KPI NCKH. Đây là nghiệp vụ đào tạo liên tục độc lập.
- **Số quyết định cấp CME (SQĐ) là dãy số chạy theo NĂM**: bắt đầu từ `1` (hiển thị `0001`), tăng liên tục cho **mọi** lượt cấp CME trong năm — xuyên suốt tất cả hội nghị/lớp trong năm đó (bằng chứng: file nội viện `0001–0260` rồi file ngoại viện `0261–0330` cùng một hội nghị). Hết năm, sang năm mới **reset về `1`** (chu trình mới).
- Vì vậy hệ thống cần **sổ cấp CME theo năm** (bộ đếm khoá theo năm) để tự sinh SQĐ kế tiếp; thống kê CME là **thống kê theo năm**, không theo đợt.

---

## 2. Thiết kế dữ liệu

> Lưu ý đặt tên: route `${API}/events` đã dùng cho kênh SSE realtime (`eventService`). Module mới dùng **`seminars`** (resource quyền, route, entity realtime = `seminar`).

### 2.1. Bảng `seminars`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | `VARCHAR(20)` PK | prefix `SEM` + `LEFT(REPLACE(NEWID(),'-',''),17)` (theo `crudService`) |
| `title` | `NVARCHAR(500)` NOT NULL | Tên hội thảo / Nội dung |
| `event_type` | `VARCHAR(30)` | enum: `conference` (hội nghị), `sci_seminar` (hội thảo khoa học), `intl_seminar` (hội thảo quốc tế), `sci_conference` (hội nghị khoa học), `training` (tập huấn), `other` |
| `event_type_raw` | `NVARCHAR(100)` NULL | nhãn gốc từ Excel |
| `scope` | `VARCHAR(20)` NOT NULL | `external` (đơn vị ngoài tổ chức – BV cử người dự) \| `hosted` (BV tổ chức) |
| `location` | `NVARCHAR(255)` NULL | Địa điểm |
| `start_date` / `end_date` | `DATE` NULL | parse best-effort |
| `date_text` | `NVARCHAR(100)` NULL | chuỗi thời gian gốc (nguồn không chuẩn) |
| `host_chair` | `NVARCHAR(255)` NULL | Chủ tọa (chỉ `hosted`) |
| `speakers` | `NVARCHAR(MAX)` NULL | Báo cáo viên (text tự do) |
| `permit_doc_no` | `NVARCHAR(255)` NULL | Công văn cấp phép của Sở |
| `co_organizers` | `NVARCHAR(500)` NULL | Đơn vị phối hợp tổ chức |
| `grants_cme` | `BIT` NOT NULL DEFAULT 0 | có cấp CME hay không |
| `cme_default_credits` | `DECIMAL(4,1)` NULL | số tín chỉ mặc định (vd 3.0) |
| `coordinator` | `NVARCHAR(100)` NULL | người lập/điều phối (cột "Lộc"/"Hà") |
| `event_year` | `INT` NULL | năm diễn ra (suy từ `start_date`/`date_text`); dùng lọc & gắn năm cho SQĐ CME |
| `notes` | `NVARCHAR(MAX)` NULL | |
| audit | `created_at/by`, `updated_at/by` | + trigger `trg_seminars_audit` (theo mẫu `trg_cat_audit`) |

Không có FK sang `research_rounds` — module này độc lập với NCKH (xem 1.6).

Index: `IX_seminars_scope_type`, `IX_seminars_event_year`, `IX_seminars_start_date`.

### 2.2. Bảng `seminar_participants`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | `VARCHAR(24)` PK | prefix `SPT` + NEWID |
| `seminar_id` | `VARCHAR(20)` NOT NULL FK `seminars(id)` ON DELETE CASCADE | |
| `user_id` | `VARCHAR(20)` NULL FK `users(id)` | khi match được cán bộ nội viện |
| `title_prefix` | `NVARCHAR(10)` NULL | Ông / Bà |
| `full_name` | `NVARCHAR(255)` NOT NULL | luôn lưu (kể cả khi có `user_id`, để giữ bản gốc) |
| `dob` | `DATE` NULL | |
| `dob_text` | `NVARCHAR(50)` NULL | chuỗi gốc khi không parse được (vd `"1989"`) |
| `gender` | `VARCHAR(10)` NULL | Nam / Nữ |
| `organization` | `NVARCHAR(255)` NULL | Đơn vị công tác (ngoại viện) |
| `department_raw` | `NVARCHAR(255)` NULL | Khoa/phòng/TT ghi trong Excel (khi chưa map `departments`) |
| `staff_number` | `INT` NULL | MNV |
| `qualification_raw` | `NVARCHAR(100)` NULL | TĐCM gốc |
| `source` | `VARCHAR(20)` NOT NULL | `internal` (nội viện) \| `external` (ngoại viện) |
| `is_foreign` | `BIT` NOT NULL DEFAULT 0 | phục vụ đếm "đại biểu nước ngoài" (file 1.4) |
| `participation_type` | `VARCHAR(20)` NOT NULL | `attendee` (Đại biểu), `speaker` (Báo cáo viên), `chair`, `organizer`, `trainee` (tập huấn) |
| `cme_year` | `INT` NULL | năm của chu trình SQĐ (thường = `seminar.event_year`) |
| `cme_seq` | `INT` NULL | số thứ tự trong sổ CME của năm đó (1, 2, 3, …) |
| `cme_certificate_no` | `AS RIGHT('0000' + CAST(cme_seq AS VARCHAR(10)), 4) PERSISTED` | SQĐ hiển thị `0001` — **cột tính** từ `cme_seq`; nới `RIGHT(...,N)` nếu năm nào vượt 9999 |
| `cme_credits` | `DECIMAL(4,1)` NULL | parse `"3,5"` → `3.5` |
| `cme_status` | `VARCHAR(15)` NOT NULL DEFAULT `'none'` | `none` \| `pending` \| `issued` \| `signed` |
| `cme_issued_date` | `DATE` NULL | |
| `notes` | `NVARCHAR(255)` NULL | cột "Sửa đổi" / "Ký nhận CME" |
| audit | `created_at/by`, `updated_at/by` | |

Ràng buộc/độ toàn vẹn:
- `CHECK (user_id IS NOT NULL OR full_name IS NOT NULL)`.
- `CHECK ((cme_seq IS NULL AND cme_year IS NULL) OR (cme_seq IS NOT NULL AND cme_year IS NOT NULL))`.
- **`UNIQUE (cme_year, cme_seq)`** — SQĐ là dãy **duy nhất toàn hệ thống trong 1 năm**, không phải theo từng hội nghị.
- Index: `IX_sp_seminar`, `IX_sp_user`, `IX_sp_staff_number`, `IX_sp_cme_year_seq`.

### 2.3. Sổ cấp CME theo năm — bảng `cme_year_register`

Bộ đếm để tự sinh SQĐ kế tiếp; mỗi năm 1 dòng.

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `year` | `INT` PK | năm chu trình |
| `last_seq` | `INT` NOT NULL DEFAULT 0 | số cuối cùng đã cấp trong năm |
| `updated_at` / `updated_by` | | |

- Cấp số mới = tăng `last_seq` **dưới `sp_getapplock`** (mẫu `sp_gen_*` trong `script.sql`, đã có bài học ở migration `2026-08-28_fix_gen_id_applock_owner.sql` về độ dài biến `@owner`).
- Sang năm mới: dòng mới `last_seq = 0` → SQĐ tự về `0001`.
- Cho phép sửa `last_seq` thủ công (màn quản trị) khi cần chèn/bỏ số.

### 2.4. Báo cáo "Thống kê Hội thảo, hội nghị" (file 1.4) — **không tạo bảng**

Endpoint tổng hợp `GET /seminars/stats?year=&from=&to=` trả mỗi `seminar` (`scope='hosted'`) kèm:
`COUNT(source='internal')`, `COUNT(source='external' AND is_foreign=0)`, `COUNT(is_foreign=1)`.
Xuất Excel đúng layout file 1.4.

### 2.5. Thống kê CME theo năm

`GET /seminars/cme/stats?year=` — tổng số lượt cấp, tách theo `participation_type` (đại biểu / báo cáo viên), theo `source` (nội / ngoại viện), tổng `cme_credits`, `last_seq` hiện tại của năm. Đây là số liệu chính của nghiệp vụ CME (không dính đợt NCKH).

---

## 3. Backend

Theo đúng khuôn mẫu hiện có (`services/*Service.js` + `routes/*.js` + `controllers/crudController.js` khi đủ đơn giản, `utils/paging`, `broadcast('update', { entity })`, `authorizePermission`).

### 3.1. Migration `server/migrations/2026-09-03_seminars.sql` (idempotent)
1. `CREATE TABLE seminars`, `seminar_participants`, `cme_year_register` + FK + CHECK + index. `cme_certificate_no` là **computed column PERSISTED** từ `cme_seq`.
2. Trigger audit `trg_seminars_audit`, `trg_seminar_participants_audit` (mẫu `trg_cat_audit` dòng ~6998 trong `script.sql`).
3. `sp_gen_cme_no @year INT, @no INT OUTPUT` — cấp số CME kế tiếp dưới `sp_getapplock` (mẫu `sp_gen_*`; chú ý `@owner NVARCHAR(20)` theo bài học migration `2026-08-28_fix_gen_id_applock_owner.sql`): `MERGE cme_year_register` tạo dòng năm nếu chưa có → `UPDATE last_seq = last_seq + 1 OUTPUT inserted.last_seq`.
4. Seed phân quyền:
   - `permission_groups`: thêm `NQ__` code `SEMINAR_MGT` – "Quản lý Hội thảo, Hội nghị & CME".
   - `permissions` (mẫu `PERM-DEPT-*`): `seminars:read`, `:create`, `:update`, `:delete`, `:manage`, `:import`, `:export`, và `:cme_manage` (cấp/thu hồi số CME, sửa sổ năm).
   - `role_permissions`: cấp đủ cho `VT01` (admin); `VT02` (director) `read`+`export`; `VT03` (manager) `read/create/update/import/export/cme_manage`.
5. (Tùy chọn) `sp_gen_seminar_id` theo mẫu `sp_gen_council_id` — hoặc dùng NEWID trong service cho gọn.

### 3.2. `services/seminarService.js`
`getAll({ page, limit, search, scope, event_type, year, from, to, grants_cme })` — WHERE động (mẫu `utils/sqlFilters.js`), phân trang `paging(...,20)`, trả kèm `participant_count`, `cme_issued_count`.
`getById(id)` — seminar + mảng participants + số liệu tổng hợp.
`create / update / remove` — `remove` có `deleteGuard` đếm `seminar_participants` (mẫu `crudService`), `broadcast('update', { entity: 'seminar' })`.
`statsHosted(query)` — mục 2.4; `statsCme({ year })` — mục 2.5.

### 3.3. `services/seminarParticipantService.js`
`listBySeminar`, `add`, `bulkAdd`, `update`, `remove`, `bulkRemove`.
CME:
- `issueCme(participantId)` — nếu chưa có `cme_seq`: lấy `year` = `seminar.event_year` (hoặc năm truyền vào), gọi `sp_gen_cme_no` cấp số kế tiếp, set `cme_year/cme_seq`, `cme_status='issued'`, `cme_issued_date`.
- `bulkIssueCme(participantIds)` — cấp số **tuần tự theo thứ tự chọn** (giữ dãy liên tục), cùng transaction.
- `revokeCme(participantId)` — chỉ `cme_manage`: nhả `cme_year/cme_seq` về NULL, `status='none'`. Cảnh báo: tạo lỗ hổng số trong sổ; không tự dồn số.
- `setCmeFields(id, { credits, status, issued_date, notes })`, `bulkSetCmeStatus(ids, status)` (issued ↔ signed).
- `cmeRegister({ year })` — trả toàn bộ lượt cấp CME của năm, sắp theo `cme_seq` (Sổ cấp CME); `updateRegisterSeq(year, last_seq)` cho `cme_manage`.

Match nhanh cán bộ: tái dùng `GET /users/search`.

### 3.4. `services/seminarImportService.js` (mẫu `councilImportService.js`)
- multer `memoryStorage`, giới hạn ~10MB, `dry_run` trả preview, `commit` ghi DB.
- Tách helper chuẩn hoá tiếng Việt (`norm`, `dice`, `stripQualification`, `stripDiacritics`) ra `server/src/utils/vietnameseText.js` và cho `councilImportService` dùng chung (hiện đang export ở `module.exports._internal`).
- **3 profile parser** (tự nhận diện theo header):
  - **P1 – "Cử đi dự"** (file 1.1 sheet `Hội nghị HT`): gom dòng theo `(Nội dung + Địa điểm + Thời gian)` → 1 `seminar` (`scope='external'`); mỗi dòng → participant. Match `users` theo `staff_number` (MNV) trước, rồi tên. Cột cuối → `seminar.coordinator`.
  - **P2 – "Tập huấn"** (file 1.1 sheet `Tập huấn NCKH`): 1 seminar `event_type='training'`, participant `participation_type='trainee'`.
  - **P3 – "Danh sách CME"** (file 1.2 & 1.3): người dùng chọn seminar đích (hoặc tạo mới) + **năm chu trình CME** + `source` (`internal`/`external` — auto theo tên file/sheet). Mỗi dòng → participant có CME. Bỏ tiền tố `Ông`/`Bà` khỏi tên; parse `"3,5"→3.5`.
    - **Giữ nguyên SQĐ lịch sử**: đọc số trong cột SQĐ (`"0261"` → `cme_seq = 261`), gán `cme_year` = năm đã chọn, `cme_status='issued'`. Không tự sinh số mới khi nhập dữ liệu cũ.
    - Sau commit: cập nhật `cme_year_register.last_seq` của năm đó = `MAX(cme_seq)` để lần cấp mới trong app tiếp nối đúng dãy.
- Preview cảnh báo: dòng không parse được ngày, tên trùng nhiều `users`, thiếu tên, **trùng `(cme_year, cme_seq)`** với dữ liệu đã có, hoặc SQĐ bị khuyết số trong dãy.

### 3.5. `controllers/seminarExportController.js` (mẫu `councilExportController.js`, dùng `utils/excelStyle.js`)
- `POST /seminars/:id/export` — 1 sự kiện + danh sách đại biểu (layout file 1.2/1.3).
- `POST /seminars/export-dispatch?year=` — layout file 1.1.
- `POST /seminars/stats/export?year=` — layout file 1.4.
- `POST /seminars/cme/register/export?year=` — Sổ cấp CME cả năm, sắp theo SQĐ.

### 3.6. `routes/seminars.js` + mount trong `app.js`
```
app.use(`${API}/seminars`, require('./routes/seminars'));
```
Endpoints (đều `authenticate` + `authorizePermission(['seminars', <action>])`, có swagger JSDoc như `routes/lookups.js`):

| Method | Path | Quyền |
|---|---|---|
| GET | `/seminars` | `read` |
| GET | `/seminars/stats` (hosted, file 1.4) | `read` |
| GET | `/seminars/cme/stats?year=` | `read` |
| GET | `/seminars/cme/register?year=` (Sổ cấp CME) | `read` |
| PUT | `/seminars/cme/register/:year` (sửa `last_seq`) | `cme_manage` |
| GET | `/seminars/:id` | `read` |
| POST | `/seminars` | `create` |
| PUT | `/seminars/:id` | `update` |
| DELETE | `/seminars/:id` | `delete` |
| GET | `/seminars/:id/participants` | `read` |
| POST | `/seminars/:id/participants` | `update` |
| PUT | `/seminars/:id/participants/:pid` | `update` |
| DELETE | `/seminars/:id/participants/:pid` | `update` |
| POST | `/seminars/:id/participants/issue-cme` (cấp số, 1 hoặc nhiều) | `cme_manage` |
| POST | `/seminars/:id/participants/:pid/revoke-cme` | `cme_manage` |
| POST | `/seminars/:id/participants/bulk-cme` (issued ↔ signed) | `update` |
| POST | `/seminars/import-excel` | `import` |
| POST | `/seminars/:id/export` · `/seminars/export-dispatch` · `/seminars/stats/export` · `/seminars/cme/register/export` | `export` |

---

## 4. Frontend (`client/src/features/seminar/`)

Sao khuôn `features/council` + `features/department` (đã có sẵn realtime, bulk, phân trang client).

```
seminar/
  api/seminarApi.ts            // axios wrappers
  types/seminar.type.ts        // Seminar, SeminarParticipant, enums, EMPTY_FORM
  hooks/useSeminars.ts         // list + filter + CRUD + useRealtimeUpdate('seminar', …)
  hooks/useSeminarParticipants.ts
  pages/Seminars.tsx (+ .module.css)   // bảng danh sách: lọc Hình thức / Phạm vi / Năm / có CME,
                                       // tìm kiếm, chọn dòng + xoá hàng loạt (mẫu commit 67ff82d), nút Xuất Excel
  pages/SeminarDetail.tsx              // thông tin sự kiện + bảng đại biểu (tab Đại biểu / Báo cáo viên),
                                       // cột CME (SQĐ, tín chỉ, trạng thái) + nút "Cấp số CME" (1/nhiều), đánh dấu đã ký
  pages/CmeRegister.tsx (+ .module.css)// Sổ cấp CME theo năm: chọn năm → bảng toàn bộ lượt cấp sắp theo SQĐ,
                                       // ô "Số cuối đã cấp" (sửa được nếu có cme_manage), nút Xuất Excel, thẻ thống kê năm
  components/SeminarFormModal.tsx
  components/SeminarDeleteModal.tsx
  components/ParticipantFormModal.tsx      // autocomplete chọn cán bộ từ /users/search
  components/ParticipantImportModal.tsx    // upload + chọn năm CME + bảng preview dry-run (mẫu CouncilImportModal.tsx)
  components/IssueCmeModal.tsx             // xác nhận cấp số cho N người đã chọn (hiện dải SQĐ sẽ cấp: 0331–0345)
  components/CmeBulkModal.tsx              // đổi trạng thái issued ↔ signed hàng loạt
  index.ts
```

Tích hợp:
- `app/router/privateRoutes.tsx`: thêm `/admin/seminars`, `/admin/seminars/:id`, `/admin/cme-register` (dùng `admin(...)` + `lazy`).
- `layouts/AdminLayout/index.tsx`: nhóm nav mới **"Đào tạo & Hội nghị"** với `{ key:'seminars', label:'Hội thảo & Hội nghị', perm:'seminars:read' }` và `{ key:'cmeRegister', label:'Sổ cấp CME', perm:'seminars:read' }`; thêm `KEY_TO_PATH`.
- `layouts/AdminLayout/icons.tsx`: thêm icon.

---

## 5. Xử lý chất lượng dữ liệu (bắt buộc làm khi import)

| Vấn đề | Cách xử lý |
|---|---|
| `Thời gian tham gia` không chuẩn | giữ `date_text` gốc; regex tách `dd[-–]dd/mm/yyyy`, `dd/mm/yyyy`, ô datetime; không parse được → `start/end = NULL` + cảnh báo preview |
| `Ngày sinh` hỗn hợp / chỉ có năm | `dob` (DATE) + `dob_text` |
| `Số tín chỉ` `"3,5"` | thay `,`→`.` rồi `parseFloat`, cột `DECIMAL(4,1)` |
| Tiền tố `Ông`/`Bà` dính trong ô tên | tách ra `title_prefix`, `full_name` sạch |
| `SQĐ` `"0261"` | parse ra số nguyên `cme_seq = 261` + gán `cme_year` theo năm chu trình; hiển thị lại là cột tính `0261`. Dữ liệu cũ giữ nguyên số trong file, không sinh mới |
| Dãy SQĐ khuyết số / chồng lấn giữa 2 file cùng năm | preview đối chiếu `(cme_year, cme_seq)` toàn hệ thống; báo số trùng & số thiếu, để người dùng quyết định |
| `MNV` trống | match theo tên; không có thì để `user_id = NULL`, vẫn lưu participant |
| Người lặp lại nhiều sự kiện | đúng nghiệp vụ — mỗi (seminar, người) một dòng, không dedupe |
| Dòng chỉ có tên, trống cột sự kiện (file 1.1) | bỏ qua khi tạo seminar; gom vào seminar "Chưa xác định" + cảnh báo |
| Cột cuối `Lộc`/`Hà` + ô lạc `54` | map `coordinator`; giá trị số đơn lẻ → bỏ qua + cảnh báo |
| Tên khoa trong Excel ≠ `departments` | lưu `department_raw`; map mềm (bỏ tiền tố "Khoa/Phòng/TT", `dice ≥ 0.75`) như `councilImportService.normDept` |

---

## 6. Phân giai đoạn

| Giai đoạn | Nội dung | Ước lượng |
|---|---|---|
| **P1 – Nền tảng** | Migration (3 bảng + `sp_gen_cme_no`) + `seminarService` + `seminarParticipantService` + `routes/seminars.js` + quyền/nav + UI danh sách & chi tiết + CRUD tay | ~2–3 ngày |
| **P2 – Import Excel** | `seminarImportService` (3 profile) + tách `utils/vietnameseText.js` + `ParticipantImportModal` preview dry-run + seed `cme_year_register` từ SQĐ lịch sử | ~2 ngày |
| **P3 – CME & Thống kê** | Cấp/thu hồi số CME + Sổ cấp CME theo năm + `/seminars/cme/stats` + Thống kê hosted (file 1.4) + 4 bộ export Excel + widget dashboard | ~2–3 ngày |
| **P4 – Hoàn thiện** | Mục "Hội thảo đã tham dự / CME đã cấp" trong hồ sơ cán bộ; lọc nâng cao; nhắc ký nhận CME còn thiếu | ~1–2 ngày |

**Khuyến nghị bắt đầu:** P1 rồi lấy 2 file CME (1.2, 1.3) làm ca kiểm thử import ở P2 (dữ liệu sạch nhất, kiểm được cả logic seed sổ CME theo năm); file 1.1 xử lý sau vì cần nhiều luật parse thời gian.
