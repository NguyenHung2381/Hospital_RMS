# Tối ưu CSDL để vận hành lâu dài khi dữ liệu phình to

> Trạng thái: **đề xuất** (03/11/2026). Đi kèm [`POSTGRESQL_MIGRATION_PLAN.md`](POSTGRESQL_MIGRATION_PLAN.md).
> Số liệu đo trên DB dev bằng truy vấn chỉ đọc (`sys.*`). Production cần đo lại.

## 1. Tóm tắt

- Với quy mô một bệnh viện (~1.900 tài khoản), sau 5–10 năm bảng lớn nhất chỉ cỡ
  **vài triệu dòng**. PostgreSQL trên 1 máy xử lý tốt mức này **nếu có index đúng
  và dọn dữ liệu cũ đúng hạn**. Không cần sharding, không cần chia nhỏ (partition)
  phần lớn các bảng.
- Rủi ro tăng trưởng nằm ở **4 bảng**:
  1. `notifications`: mỗi người nhận 1 dòng chứa **nguyên** tiêu đề và nội dung.
     Gửi 1 thông báo cho cả viện là ~1.900 dòng.
  2. `security_events`: ghi mỗi sự kiện đăng nhập/bảo mật. Từ 03/11/2026 đã có
     job dọn (giữ 24 tháng), nhưng xoá từng dòng vẫn tốn kém khi bảng lớn.
  3. `staff_attendance`: 1 dòng/nhân viên/ngày làm việc, phải lưu lâu.
  4. `exam_answers`, `survey_answers`: lượt làm × số câu.
- Việc cần làm chia 3 giai đoạn (mục 6):
  1. **Ngay trên SQL Server**: thêm job dọn dữ liệu cũ, bỏ index trùng.
  2. **Khi tạo schema PostgreSQL**: chọn kiểu dữ liệu đúng, thêm index cho khoá
     ngoại, index tìm kiếm `pg_trgm`, cấu hình autovacuum.
  3. **Sau cutover ổn định**: tách bảng `notifications`, partition `security_events`,
     phân trang keyset cho các danh sách dài.

## 2. Ước lượng tăng trưởng

Giả định: ~1.900 tài khoản, ~260 ngày làm việc/năm, vài trăm học viên/năm, mỗi
đề thi ~50 câu. Số dòng là **ước lượng thô** để xếp thứ tự ưu tiên, cần đo lại
trên production sau 3–6 tháng chạy thật.

| Bảng | Tăng theo | Ước lượng / năm | Sau 5 năm (nếu không dọn) | Hiện có dọn? |
|---|---|---|---|---|
| `notifications` | số thông báo × số người nhận | 0,3–1 triệu | 1,5–5 triệu | ✅ đã đọc > 90 ngày, chưa đọc > 180 ngày (`notificationCleanupJob`) |
| `security_events` | đăng nhập, 2FA, đổi mật khẩu, khoá tài khoản | 0,5–2 triệu | 2,5–10 triệu | ✅ từ 03/11/2026: giữ 24 tháng (`dataRetentionJob`) |
| `staff_attendance` | nhân viên × ngày làm việc | ~0,5 triệu | ~2,5 triệu | Không nên xoá (dữ liệu chấm công) |
| `exam_answers` | lượt thi × số câu | 0,1–0,5 triệu | 0,5–2,5 triệu | Không xoá |
| `survey_answers` | phiếu × số câu | 0,05–0,3 triệu | 0,25–1,5 triệu | Không xoá |
| `attendance` (học viên) | buổi học × học viên | 50–200 nghìn | 0,25–1 triệu | Không xoá |
| `refresh_tokens` | phiên đăng nhập | ổn định | ổn định | ✅ hết hạn thì xoá (`accountMaintenanceJob`) |
| `job_execution_log` | lượt chạy job (khoá chống chạy trùng) | vài nghìn | vài chục nghìn | ✅ một phần: chỉ job có khoá theo ngày (mục 6) |
| `password_reset_otps` | 1 dòng/người (khoá chính `user_id`) | ổn định | ổn định | ✅ xoá khi dùng; mã hết hạn xoá hằng đêm (`accountMaintenanceJob`) |
| `grade_history`, `person_merge_log`, `cme_records`, `files`, `workflow_tasks` | nghiệp vụ | nhỏ | nhỏ | Giữ vĩnh viễn (lịch sử, kiểm toán) |

Nhật ký thao tác người dùng (activity log) ghi ra **file** (`src/config/auditLogger.js`,
giữ 90 file), không nằm trong DB, nên không tính ở đây.

## 3. Bảng cần thiết kế lại

### 3.1 `notifications` → tách nội dung và người nhận (ưu tiên cao)

**Vấn đề.** `sp_push_notification` chèn 1 dòng/người nhận, mỗi dòng chép lại
`title` và `message` (`NVARCHAR(MAX)`). Bảng có 5 index, trong đó
`IX_notif_user_read` **INCLUDE cả cột `message`**, nên nội dung bị lưu thêm một
lần nữa trong index. Trang quản trị gom theo `COALESCE(batch_id, id)` và đếm
`read_count` trên toàn bảng, nên càng nhiều dữ liệu càng chậm.

**Thiết kế mới (PostgreSQL):**

```sql
CREATE TABLE notification_messages (            -- 1 dòng / lượt gửi
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  legacy_id   varchar(30) UNIQUE,               -- NTFB... / NTF... cũ, để link cũ còn chạy
  type        varchar(50)  NOT NULL,
  title       varchar(255) NOT NULL,
  message     text,
  ref_id      varchar(30),
  ref_type    varchar(20),
  recipient_count int NOT NULL DEFAULT 0,       -- đếm sẵn khi gửi
  created_at  timestamp NOT NULL DEFAULT LOCALTIMESTAMP,
  created_by  varchar(20)
);

CREATE TABLE notification_recipients (          -- 1 dòng / người nhận, ~40 byte
  message_id  bigint NOT NULL REFERENCES notification_messages(id) ON DELETE CASCADE,
  user_id     varchar(20) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_read     boolean NOT NULL DEFAULT false,
  read_at     timestamp,
  created_at  timestamp NOT NULL,               -- chép từ message, để lọc/dọn không cần JOIN
  PRIMARY KEY (user_id, message_id)
);
-- Đếm và liệt kê thông báo chưa đọc của 1 người: index chỉ chứa dòng chưa đọc
CREATE INDEX ix_notif_rcpt_unread ON notification_recipients (user_id, created_at DESC) WHERE NOT is_read;
CREATE INDEX ix_notif_rcpt_message ON notification_recipients (message_id);
```

**Lợi ích:** gửi cả viện chỉ còn 1 dòng nội dung + 1.900 dòng nhỏ; trang quản
trị đọc thẳng `notification_messages` (không còn `GROUP BY` toàn bảng); đếm
chưa đọc dùng partial index rất nhỏ.

**Việc phải làm:** sửa `notificationService.js` và phần thay `sp_push_notification`
(đằng nào cũng chuyển về JS ở chặng 1); script chuyển dữ liệu gom các dòng cũ
theo `COALESCE(batch_id, id)`. Làm **sau cutover**, để không đổi 2 thứ cùng lúc.

### 3.2 `security_events` → partition theo tháng + giữ có thời hạn

**Vấn đề.** Bảng chỉ ghi thêm, đọc chủ yếu theo thời gian gần nhất. Trên SQL
Server đã có job xoá theo lô (`dataRetentionJob`), nhưng trên PG xoá hàng triệu
dòng bằng `DELETE` gây phình bảng (bloat) và tốn WAL.

**Đề xuất (PostgreSQL):**

```sql
CREATE TABLE security_events (
  id          bigint GENERATED BY DEFAULT AS IDENTITY,
  event_type  varchar(50) NOT NULL,
  actor_id    varchar(20),
  target_type varchar(50),
  target_id   varchar(50),
  ip_address  inet,                              -- thay varchar(64): nhỏ hơn, lọc theo dải IP được
  user_agent  varchar(255),
  detail      varchar(1000),
  created_at  timestamp NOT NULL DEFAULT LOCALTIMESTAMP,
  PRIMARY KEY (id, created_at)                   -- PG bắt buộc khoá chính chứa cột partition
) PARTITION BY RANGE (created_at);

CREATE INDEX ON security_events (created_at DESC);
CREATE INDEX ON security_events (event_type, created_at DESC);
CREATE INDEX ON security_events (actor_id, created_at DESC);
```

- Mỗi tháng 1 partition (`security_events_2027_01`...). Job Node chạy hằng tháng:
  tạo sẵn partition 2 tháng tới, `DROP` partition cũ hơn hạn giữ. Không cần
  extension `pg_partman`.
- Hạn giữ đề xuất **24 tháng**, đặt bằng biến `SECURITY_EVENTS_RETENTION_MONTHS`.
  Cần người phụ trách an toàn thông tin xác nhận theo quy định của viện.
- Kiểm tra lại `ip_address` trên dữ liệu thật: giá trị không phải IP hợp lệ thì
  giữ `varchar(64)`.

### 3.3 `staff_attendance` → giữ 1 bảng, chuẩn bị partition theo năm

- ~2,5 triệu dòng sau 5 năm là bình thường với PG. Index hiện có (`UNIQUE (user_id, work_date)`,
  `(work_date)`) đã đủ cho chấm công theo người và theo ngày.
- Thêm `BRIN (work_date)` nếu báo cáo theo khoảng ngày dài (cả năm) bị chậm. Index
  BRIN rất nhỏ, hợp với bảng ghi theo thứ tự thời gian.
- Chỉ partition theo năm khi bảng vượt ~10 triệu dòng hoặc cần lưu trữ năm cũ
  sang chỗ khác. Không xoá dữ liệu chấm công nếu chưa có quy định lưu trữ.

### 3.4 Bảng chi tiết bài thi / khảo sát (`exam_answers`, `survey_answers`, `attendance`)

- Giữ nguyên cấu trúc khi chuyển. Khoá chính `VARCHAR(20)` sinh bằng `sp_gen_*`
  vẫn chạy được, nhưng mỗi lần sinh mã phải lấy khoá (`sp_getapplock` / advisory
  lock), nên ghi hàng loạt bị xếp hàng.
- **Bảng mới có số dòng lớn** dùng `bigint GENERATED ... AS IDENTITY` làm khoá
  chính thay cho mã chuỗi: không cần khoá khi sinh mã, index nhỏ hơn khoảng 2 lần.
- Ghi hàng loạt (nộp bài thi, nộp khảo sát, import Excel): 1 câu `INSERT ...
  SELECT * FROM unnest($1::text[], $2::text[], ...)` hoặc `COPY`, không chèn từng dòng.

## 4. Index

### 4.1 Khoá ngoại chưa có index (48 cái trên DB dev)

SQL Server và PostgreSQL đều **không** tự tạo index cho cột khoá ngoại. Thiếu
index thì mỗi lần xoá/sửa dòng cha, DB phải quét cả bảng con; `JOIN` theo cột đó
cũng chậm khi bảng lớn. Không cần index cả 48. Thứ tự ưu tiên:

| Ưu tiên | Khoá ngoại | Lý do |
|---|---|---|
| Cao | `exam_answers.question_id`, `exam_paper_questions.question_id` | Bảng con lớn; sửa/xoá câu hỏi trong ngân hàng đề |
| Cao | `enrollment_rotations.lesson_id` (`SET NULL`), `users.shift_pattern_id` (`SET NULL`), `program_subjects.subject_id` (`CASCADE`) | Xoá dòng cha kéo theo cập nhật bảng con |
| Cao | `certificates.file_id`, `cme_records.evidence_file_id`, `course_documents.file_id`, `lesson_documents.file_id`, `trainee_documents.file_id` | Xoá file trong `training_files` phải kiểm tra 5 bảng |
| Trung bình | `survey_responses.respondent_user_id`, `course_enrollments.main_mentor_user_id`, `council_members.external_reviewer_id`, `topic_members.department_id`, `seminars.topic_id` | Lọc / JOIN trong màn hình danh sách |
| Thấp | FK tới bảng danh mục nhỏ (`trainee_type_id`, `training_form_id`, `practice_form_id`, `professional_field_id`...) và các cột `created_by` | Danh mục gần như không bị xoá. Bỏ qua tới khi `pg_stat_statements` cho thấy cần |

Trên PG, thêm 1 truy vấn kiểm tra vào CI hoặc script bảo trì để liệt kê FK chưa
có index, so với danh sách đã chấp nhận bỏ qua.

### 4.2 Index trùng: bỏ, để ghi nhanh hơn

Mỗi index thừa làm chậm mọi lần `INSERT/UPDATE/DELETE`. Các index dưới đây có
cột đầu đã nằm trong một `UNIQUE` **không lọc** (đã so đủ danh sách cột trên DB dev):

| Bảng | Index thừa | Đã có |
|---|---|---|
| `exam_answers` | `IX_exam_answers_attempt (attempt_id)` | `UQ_examans_attempt_question (attempt_id, question_id)` |
| `exam_attempts` | `IX_exam_attempts_paper (paper_id)` | `UQ_examatt_paper_enrollment_no (paper_id, ...)` |
| `exam_paper_questions` | `IX_exam_paper_questions_paper (paper_id)` | `UQ_epq_paper_code_question (paper_id, ...)` |
| `course_programs` | `IX_course_programs_course (course_id)` | `UQ_crsprog_course_program (course_id, program_id)` |
| `lesson_programs` | `IX_lesson_programs_lesson (lesson_id)` | `UQ_lsnprog_lesson_program (lesson_id, program_id)` |
| `lecturer_assignments` | `IX_lecass_course (course_id)` | `UQ_lecass_course_subject_lecturer (course_id, ...)` |
| `deadline_actions` | `idx_da_deadline_action (deadline_id, action_type) INCLUDE (is_executed)` | `UQ_da_deadline_action` cùng cột |

Giữ `IX_grades_enrollment` vì `UQ_grades_enrollment_course` là index có lọc (`WHERE`).

Index "phủ" (`INCLUDE` nhiều cột) kiểu SQL Server **không** chép sang PG:

- `IX_notif_user_read` INCLUDE `message` (cả nội dung thông báo).
- `IX_users_created_at_desc` INCLUDE 12 cột.
- `idx_users_username_active` INCLUDE cả `password`.

Trên PG, tạo index chỉ với cột khoá, rồi xem `EXPLAIN` có cần `INCLUDE` không.

### 4.3 Tìm kiếm chứa chuỗi (`LIKE '%...%'`, 17 service)

Mẫu `LIKE '%' + @search + '%'` không dùng được index B-tree, nên luôn quét cả
bảng. Trên PG:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
-- unaccent() không IMMUTABLE nên phải bọc lại để dùng trong index
CREATE FUNCTION f_unaccent(text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

CREATE INDEX ix_users_fullname_trgm   ON users   USING gin (f_unaccent(lower(full_name)) gin_trgm_ops);
CREATE INDEX ix_persons_fullname_trgm ON persons USING gin (f_unaccent(lower(full_name)) gin_trgm_ops);
CREATE INDEX ix_topics_title_trgm     ON topics  USING gin (f_unaccent(lower(title)) gin_trgm_ops);
-- truy vấn: WHERE f_unaccent(lower(full_name)) LIKE '%' || f_unaccent(lower($1)) || '%'
```

Tìm không dấu ("nguyen" khớp "Nguyễn") là **tính năng mới**, SQL Server hiện
không có. Bật hay không thì hỏi người dùng nghiệp vụ. Nếu không bật, bỏ
`f_unaccent` và dùng `ILIKE` + `gin_trgm_ops`.

### 4.4 Partial index cho điều kiện cố định

| Bảng | Index | Dùng cho |
|---|---|---|
| `files`, `training_files` | `... WHERE NOT is_deleted` | Mọi truy vấn đều lọc file chưa xoá |
| `users` | `(department_id) WHERE is_active` | Chọn người nhận thông báo, danh sách nhân viên |
| `workflow_tasks` | `(assignee_role_id) WHERE status = 'pending'` | Hộp việc cần duyệt |
| `topics` | `(round_id, status)` | Danh sách đề tài theo đợt (kiểm tra lại bằng `EXPLAIN`) |

## 5. Kiểu dữ liệu khi tạo schema PostgreSQL

Bổ sung cho mục 4.1 của `POSTGRESQL_MIGRATION_PLAN.md`, tập trung vào dung lượng
và tốc độ.

| Việc | Áp dụng | Lý do |
|---|---|---|
| Cột JSON `NVARCHAR(MAX)` → `jsonb` | `form_custom_values.data`, `survey_answers.answer_options`, `person_merge_log.merged_snapshot/kept_before/moved_json`, cột câu hỏi/lựa chọn của đề thi | Kiểm tra JSON hợp lệ ngay khi ghi, đọc từng khoá bằng `->>`. Chỉ thêm index GIN khi thật sự lọc theo nội dung JSON |
| DB tạo với locale `builtin` `C.UTF-8` | Mặc định cho mọi cột chữ (`id`, `*_id`, mã, trạng thái...) | So sánh theo mã ký tự: nhanh, index nhỏ, không phụ thuộc phiên bản ICU/glibc của hệ điều hành (nâng cấp OS không làm hỏng index). Mã không cần sắp theo tiếng Việt |
| Cột tên tiếng Việt dùng `COLLATE "vi-VN-x-icu"` | `full_name`, `name`, `title`, `ho_ten`, `*_name` (không phải `MAX`) | `ORDER BY` đúng thứ tự tiếng Việt (Anh < Ánh < Ân < Dung < Đức). Chỉ đặt trên từng cột, không đặt cho cả DB: nếu DB mặc định là ICU thì mọi index chữ đều chậm hơn và phải `REINDEX` khi nâng ICU |
| Cột định danh người dùng gõ vào dùng collation `rms_ci` (ICU không tất định, không dùng `citext`) | `username`, `email`, `staff_number`, mã danh mục | Giữ hành vi không phân biệt hoa/thường như SQL Server |
| `NVARCHAR(MAX)` không phải JSON → `text` | mô tả, nội dung, ghi chú | PG tự nén (TOAST) giá trị dài, không cần giới hạn độ dài |
| `ip_address` → `inet` | `security_events`, `staff_attendance.check_*_ip` | 7–19 byte thay vì tới 64 byte; lọc theo dải mạng |
| Thời gian giữ `timestamp` (không múi giờ) | mọi cột `DATETIME/DATETIME2` | Giữ quy ước giờ VN hiện tại. Đổi sang `timestamptz` là việc riêng, làm sau |

## 6. Lộ trình

### Giai đoạn 1 — Làm ngay trên SQL Server (1 tuần, rủi ro thấp)

Không phụ thuộc việc chuyển DB, giảm dữ liệu phải chuyển và có ích ngay.
**Đã làm 03/11/2026**, đã chạy và kiểm tra trên DB dev.

- [x] Job dọn `security_events` theo hạn giữ, xoá theo lô 2.000 dòng.
      → `src/jobs/dataRetentionJob.js`, 04:30 hằng ngày. Hạn giữ
      `SECURITY_EVENTS_RETENTION_MONTHS` (mặc định 24, `0` = không xoá, tối thiểu 12
      vì `trustedDeviceService.isRevoked` đọc lại bảng này trong 181 ngày).
      Trên PG sẽ thay bằng `DROP PARTITION`.
- [x] Dọn `job_execution_log`, **chỉ** các job có khoá theo ngày
      (`deactivate_expired_accounts`, `notification_cleanup`, `data_retention`,
      dùng `todayKeyVN()`) và cũ hơn 180 ngày. **Không** xoá khoá của
      `password_expiry_warning` (`user:cycle`), `supplement_auto_reject`
      (`topic:deadline`), `deadline_reminder`: xoá đi thì job coi như chưa chạy
      và gửi lại thông báo. → cùng job trên.
- [x] `accountMaintenanceJob`: xoá thêm `password_reset_otps` đã hết hạn (`purgeExpiredResetOtps`).
- [x] Bỏ 7 index trùng ở mục 4.2. → `2026-12-13_toi_uu_index_giai_doan_1.sql`.
      Chỉ bỏ khi thấy có index UNIQUE không lọc phủ cột đó, nên an toàn cả khi
      production khác dev. Không code nào gọi tên các index này.
- [x] Thêm index cho 10 FK ưu tiên **cao** ở mục 4.1. → cùng migration.
- [x] Bỏ `message` khỏi `INCLUDE` của `IX_notif_user_read`. → cùng migration,
      giữ nguyên cột khoá, các cột `INCLUDE` khác và điều kiện lọc.

SQL của job viết theo cú pháp chạy được trên cả 2 DB (mốc thời gian tính ở JS,
xoá theo lô bằng `OFFSET ... FETCH`), nên không làm tăng số chỗ T-SQL.

### Giai đoạn 2 — Khi viết schema baseline PostgreSQL (trong chặng 2)

**Đã làm 03/11/2026**, chạy thử trên PostgreSQL 18.6 (container tạm, đã xoá).
Schema ở `database/pg/baseline/`, sinh bằng `npm run pg:baseline`.

- [x] Kiểu dữ liệu mục 5: `jsonb` (10 cột), collation `rms_ci` (`username`, `email`, `code`),
      `inet` (4 cột IP), locale `builtin C.UTF-8` + `vi-VN-x-icu` cho cột tên.
- [x] Không chép 7 index trùng; bỏ mọi `INCLUDE` (PG dùng index-only scan theo
      visibility map, `INCLUDE` dài chỉ làm phình index).
- [x] Index FK ưu tiên cao và trung bình; GIN `pg_trgm` cho 8 cột tìm kiếm;
      partial index mục 4.4 (`03_toi_uu.sql`).
- [x] `security_events` partition theo tháng, PK `(id, created_at)`, có partition
      DEFAULT. Hàm `rms_maintain_monthly_partitions` (SECURITY DEFINER, giữ tối
      thiểu 12 tháng) để `rms_app` tạo/xoá partition mà không cần quyền DDL.
      Còn lại: `dataRetentionJob` gọi hàm này khi có adapter PG (chặng 2 kế hoạch chính).
- [x] Cấu hình mục 7: `infra/postgresql/rms.conf`, `pg_hba.rms.conf`; role
      `rms_migrate` (DDL) / `rms_app` (chỉ DML, `statement_timeout 60s`).
      PostgreSQL cài thẳng trên server: `infra/cai-dat-postgresql.md`.
- Lưu ý cho adapter: `pg` mặc định parse `jsonb` thành object; code hiện tại
  cần chuỗi, nên đặt type parser trả chuỗi nguyên văn.

### Giai đoạn 3 — Sau cutover ổn định (1–2 tháng sau)

- [ ] Tách `notifications` (mục 3.1).
- [ ] Phân trang **keyset** cho danh sách chỉ ghi thêm và dài: thông báo, lịch
      sử chấm công (sự kiện bảo mật đã dùng keyset theo `id`, `securityEventService.getAll`). `WHERE (created_at, id) < ($1, $2) ORDER BY created_at DESC, id DESC LIMIT $3`
      thay cho `OFFSET`. `OFFSET` lớn buộc DB đọc rồi bỏ toàn bộ các dòng phía trước.
- [ ] Bỏ `COUNT(*)` tổng số dòng trên bảng lớn (hiện đếm ở mỗi lần tải trang thông
      báo): trả "còn trang sau" hoặc số ước lượng từ `pg_class.reltuples`.
- [ ] Báo cáo/dashboard tổng hợp nhiều năm mà chậm: bảng tổng hợp hoặc
      materialized view, làm mới bằng job đêm.
- [ ] Rà `pg_stat_user_indexes` (index `idx_scan = 0` sau 1 tháng là ứng viên bỏ)
      và `pg_stat_statements` (20 truy vấn tốn thời gian nhất).

## 7. Cấu hình PostgreSQL cho máy 12–16 GB RAM, ổ SSD

Điểm xuất phát, chỉnh lại theo số liệu thật sau khi chạy. Máy dùng chung với
Docker (backend, ClamAV, Redis), nên PG không được lấy hết RAM.

| Tham số | Giá trị | Ghi chú |
|---|---|---|
| `shared_buffers` | 3–4 GB | ~25% RAM |
| `effective_cache_size` | 8 GB | Ước lượng bộ đệm của hệ điều hành, không cấp phát thật |
| `work_mem` | 16 MB | Mỗi thao tác sắp xếp/hash; nhân với số kết nối |
| `maintenance_work_mem` | 512 MB | Tạo index, `VACUUM` (lúc nạp dữ liệu có thể tăng tạm lên 1–2 GB) |
| `random_page_cost` | 1.1 | Ổ SSD |
| `max_connections` | 100 | Phải ≥ `WEB_CONCURRENCY × DB_POOL_MAX` + job + dự phòng. Nhiều hơn thì dùng PgBouncer |
| `max_wal_size` / `checkpoint_timeout` | 4 GB / 15 phút | Ít checkpoint hơn khi ghi hàng loạt |
| `wal_compression` | `lz4` | Giảm dung lượng WAL và bản sao lưu |
| `timezone` | `Asia/Ho_Chi_Minh` | Đặt cho role ứng dụng (mục 4.3 kế hoạch chính) |
| `shared_preload_libraries` | `pg_stat_statements, auto_explain` | Theo dõi truy vấn chậm |
| `log_min_duration_statement` | 500 ms | Ghi log câu chậm |
| `auto_explain.log_min_duration` | 2 s | Ghi kế hoạch thực thi của câu rất chậm |

Autovacuum riêng cho bảng sửa/xoá nhiều (mặc định chờ 20% bảng thay đổi mới dọn,
quá trễ với bảng lớn):

```sql
ALTER TABLE notification_recipients SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.01);
ALTER TABLE refresh_tokens          SET (autovacuum_vacuum_scale_factor = 0.05);
ALTER TABLE staff_attendance        SET (autovacuum_analyze_scale_factor = 0.02);
```

## 8. Sao lưu, dung lượng, theo dõi

- **Sao lưu**: pgBackRest, bản đầy đủ hằng tuần + bản chênh lệch hằng đêm + lưu
  WAL liên tục, để khôi phục tới thời điểm bất kỳ. Lưu ra **ngoài máy** (NAS hoặc
  máy khác). Diễn tập khôi phục mỗi quý.
- **Dung lượng**: ước lượng DB < 5 GB sau 5 năm. Ổ `/data` 50 GB chủ yếu bị file
  upload và bản sao lưu chiếm. Đặt dữ liệu PG ở `/data/pgsql`, sao lưu ở thư mục khác.
- **Theo dõi hằng tháng** (script hoặc dashboard Grafana/Loki đã có trong `infra/`):
  kích thước từng bảng và index (`pg_total_relation_size`), tỉ lệ phình
  (`n_dead_tup`), index không dùng, truy vấn chậm nhất, số kết nối.
- **Mở rộng sau này**: khi báo cáo nặng làm chậm hệ thống chính, thêm 1 bản sao
  chỉ đọc (streaming replication) cho báo cáo. Chưa cần ở quy mô hiện tại.
