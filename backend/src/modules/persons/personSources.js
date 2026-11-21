// Cấu hình bảng nguồn của dual-write persons — tách khỏi personService.js cho gọn.
// Xem nguyên tắc ở đầu personService.js.

// ─── Cấu hình từng bảng nguồn ────────────────────────────────────────────────
// Giá trị là BIỂU THỨC SQL tên cột trong bảng nguồn (hằng số trong code, không lấy từ input).
const SOURCES = {
	users: {
		table: 'users',
		name: 'full_name',
		email: 'email',
		phone: 'phone_number',
		dob: 'date_of_birth',
		staff: 'staff_number',
		internal: '1',
		verified: true,
	},
	trainees: {
		table: 'trainees',
		name: 'full_name',
		email: 'email',
		phone: 'phone',
		dob: 'dob',
		gender: 'gender',
		nationalId: 'national_id',
		// Dòng không có created_by = tạo bởi luồng không đăng nhập (đăng ký khóa học công khai):
		// dữ liệu do người ngoài tự khai ⇒ không được tự gắn vào person đã xác thực / có tài khoản.
		anonymousWhenNoCreator: true,
	},
	lecturers: {
		table: 'lecturers',
		name: 'full_name',
		email: 'email',
		phone: 'phone',
		dob: 'dob',
		gender: 'gender',
		linkedUser: 'user_id',
		internal: "CASE WHEN is_external = 'true' THEN 0 ELSE 1 END",
	},
	external_reviewers: {
		table: 'external_reviewers',
		name: 'full_name',
		email: 'email',
		phone: 'phone',
		internal: '0',
	},
	topic_members: {
		table: 'topic_members',
		name: 'name',
		email: 'email',
		phone: 'phone_number',
		staff: 'staff_number',
		linkedUser: 'user_id',
		// đăng ký đề tài công khai ghi created_by NULL: dữ liệu người ngoài tự khai ⇒ như học viên ẩn danh
		anonymousWhenNoCreator: true,
	},
	seminar_participants: {
		table: 'seminar_participants',
		name: 'full_name',
		dob: 'dob',
		gender: 'gender',
		staff: 'staff_number',
		linkedUser: 'user_id',
		// đăng ký hội thảo công khai ghi created_by NULL: dữ liệu người ngoài tự khai ⇒ như học viên ẩn danh
		anonymousWhenNoCreator: true,
		// trigger audit của bảng này bump updated_at với MỌI lần UPDATE trừ khi SET updated_at.
		// Ghi person_id kèm `updated_at = updated_at` để không làm bẩn cột audit.
		keepUpdatedAt: true,
	},
};

// Thứ tự xử lý khi quét hàng loạt: users trước (nguồn tin cậy nhất, các nguồn khác có thể trỏ vào).
const SOURCE_ORDER = [
	'users',
	'lecturers',
	'external_reviewers',
	'trainees',
	'topic_members',
	'seminar_participants',
];

// Cùng biểu thức với cột tính `persons.name_key`
const NAME_KEY = (p) =>
	`LOWER(LTRIM(RTRIM(REPLACE(REPLACE(REPLACE(${p}, '  ', ' '), '  ', ' '), '  ', ' '))))`;

module.exports = { SOURCES, SOURCE_ORDER, NAME_KEY };
