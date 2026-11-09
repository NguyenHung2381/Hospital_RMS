// Quy tắc đổi schema SQL Server → PostgreSQL (quy ước kiểu dữ liệu:
// backend/README.md, mục Viết SQL). Baseline đã sinh từ đây (công cụ sinh đã gỡ); giờ pg-transfer dùng
// để đổi kiểu dữ liệu lúc chép. Sửa ở đây thì sửa cả database/baseline/ cho khớp.

// Không chuyển: bảng theo dõi migration của SQL Server (PG có migrator riêng).
const SKIP_TABLES = new Set(['schema_migrations']);

// Cột định danh người dùng gõ vào: so sánh / UNIQUE / LIKE không phân biệt hoa
// thường, phân biệt dấu — như collation *_CI_AS của SQL Server. Dùng collation
// ICU "không tất định" rms_ci (00_extensions.sql), KHÔNG dùng citext: tham số
// kiểu text so với cột citext lại thành so text (phân biệt hoa thường, bỏ qua
// index), còn với collation của cột thì "cột = $1::text" vẫn theo rms_ci.
// LIKE trên collation không tất định cần PostgreSQL ≥ 18.
const CI_COLUMNS = new Set(['username', 'email', 'code']);
const CI_COLLATION = 'rms_ci';

// Cột JSON: code luôn ghi bằng JSON.stringify hoặc có CHECK ISJSON. Cột JSON
// khác (seminars.test_questions, agenda...) giữ text: code đọc bằng hàm phân
// tích chấp nhận cả chuỗi không phải JSON.
// Adapter pg PHẢI đặt type parser jsonb/json trả về chuỗi gốc, vì code đang
// JSON.parse giá trị đọc ra (mặc định node-postgres trả object).
const JSONB_COLUMNS = new Set([
	'form_configs.config',
	'form_custom_values.data',
	'person_merge_log.kept_before',
	'person_merge_log.merged_snapshot',
	'person_merge_log.moved_json',
	'question_bank.options',
	'survey_questions.options',
	'survey_answers.answer_options',
	'exam_attempts.question_ids',
	'shift_patterns.days',
]);

// Địa chỉ IP: inet nhỏ hơn varchar(45/64) và lọc theo dải mạng được.
const INET_COLUMNS = new Set([
	'security_events.ip_address',
	'refresh_tokens.ip_address',
	'staff_attendance.check_in_ip',
	'staff_attendance.check_out_ip',
]);

// Cột tên/tiêu đề tiếng Việt: sắp xếp theo thứ tự tiếng Việt. DB tạo với
// locale builtin C.UTF-8 (so theo byte, nhanh, LIKE 'abc%' dùng được index),
// nên chỉ các cột hiển thị/sắp theo tên mới cần collation ICU.
const VI_COLLATION = 'vi-VN-x-icu';
const isVietnameseNameColumn = (col) =>
	col.type === 'nvarchar' &&
	col.max_length !== -1 &&
	(['full_name', 'name', 'title', 'ho_ten'].includes(col.name) || col.name.endsWith('_name'));

// Cột tính toán: viết lại bằng tay (biểu thức T-SQL có + nối chuỗi, CONVERT...).
// Giữ đúng kết quả của SQL Server, kể cả RIGHT('0000' + x, 4) cắt từ bên phải.
const COMPUTED_COLUMNS = {
	'persons.name_key':
		"CAST(lower(btrim(replace(replace(replace(full_name, '  ', ' '), '  ', ' '), '  ', ' '))) AS varchar(255))",
	'program_lessons.total_hours': 'theory_hours + practice_hours',
	'seminar_participants.cme_certificate_no':
		"CASE WHEN cme_seq IS NULL THEN NULL ELSE right('0000' || CAST(cme_seq AS varchar(10)), 4) END",
	'training_programs.total_hours': 'coalesce(theory_hours, 0) + coalesce(practice_hours, 0)',
};

// Bảng chia partition theo tháng. PG bắt buộc
// khoá chính chứa cột partition. Partition tạo bằng hàm
// rms_maintain_monthly_partitions (00_extensions.sql): lúc tạo bảng lùi
// monthsBack tháng (khớp hạn giữ 24 tháng của dataRetentionJob) và tạo sẵn
// monthsAhead tháng tới.
const PARTITIONED_TABLES = {
	security_events: {
		column: 'created_at',
		primaryKey: ['id', 'created_at'],
		monthsBack: 24,
		monthsAhead: 2,
	},
};

// Index không chép sang PG dù còn trên SQL Server (đã bỏ ở migration
// 2026-12-13_toi_uu_index_giai_doan_1, phòng khi DB nguồn chưa chạy migration đó).
const SKIP_INDEXES = new Set([
	'ix_exam_answers_attempt',
	'ix_exam_attempts_paper',
	'ix_exam_paper_questions_paper',
	'ix_course_programs_course',
	'ix_lesson_programs_lesson',
	'ix_lecass_course',
	'idx_da_deadline_action',
]);

/** Kiểu PG thay thế cho 1 cột, hoặc undefined = dùng quy tắc chung. */
const typeOverride = (table, col) => {
	const key = `${table}.${col.name}`;
	if (JSONB_COLUMNS.has(key)) return 'jsonb';
	if (INET_COLUMNS.has(key)) return 'inet';
	return undefined;
};

const collationFor = (table, col, pgType) => {
	if (!/^(var)?char\(/.test(pgType)) return undefined;
	if (CI_COLUMNS.has(col.name)) return CI_COLLATION;
	return isVietnameseNameColumn(col) ? VI_COLLATION : undefined;
};

module.exports = {
	SKIP_TABLES,
	CI_COLUMNS,
	CI_COLLATION,
	JSONB_COLUMNS,
	INET_COLUMNS,
	VI_COLLATION,
	COMPUTED_COLUMNS,
	PARTITIONED_TABLES,
	SKIP_INDEXES,
	typeOverride,
	collationFor,
};
