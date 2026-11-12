// Danh mục form cấu hình được (trang Cấu hình form). Mỗi nhóm = 1 loại bản ghi
// (vd 'topic'), dùng chung cho mọi form tạo/sửa bản ghi đó — `variants` là các
// form cụ thể (quản trị, cổng nhân viên, công khai...). Cấu hình admin lưu ở
// form_configs chỉ là phần ghi đè lên mặc định khai báo ở đây.
//
// Trường có sẵn:
//   type      text | textarea | number | date | select | email | phone
//   in        variant nào có trường này (bỏ trống = mọi variant)
//   required  mặc định bắt buộc: true | false | [variant...]
//   lock      { visible, required } — logic nghiệp vụ phụ thuộc (khóa ngoại,
//             sinh mã...) nên admin không ẩn / bỏ bắt buộc được. true | [variant...]
//   base      giới hạn cứng (độ dài cột DB...) — admin chỉ đặt CHẶT hơn
//   options   giá trị hợp lệ của select (admin được thu hẹp)
//   when      chỉ áp bắt buộc/ràng buộc khi điều kiện đúng, vd { article_type: 'bai_bao' }
//   dynamic   select lấy từ danh mục (đợt, khoa...) — không cấu hình option
//   editOnly  chỉ có ở form SỬA (vd kết quả nghiệm thu) — lúc tạo mới không đòi.
//             true | [variant...]
//
// Thêm form mới: khai báo ở đây + gắn formConfigGuard ở route tạo/sửa + dùng
// <CfgField>/<CustomFields> ở frontend (shared/formConfig).

const { GENDERS, TRAINING_FORMS } = require('./formRegistry.training');

const ARTICLE_TYPES = [
	{ value: 'de_tai', label: 'Đề tài' },
	{ value: 'bai_bao', label: 'Bài báo' },
];
const ACCEPTANCE_RATINGS = [
	{ value: 'xuat_sac', label: 'Xuất sắc' },
	{ value: 'tot', label: 'Tốt' },
	{ value: 'kha', label: 'Khá' },
	{ value: 'dat', label: 'Đạt' },
	{ value: 'khong_dat', label: 'Không đạt' },
];

const MEMBER_ROLES = [
	{ value: 'leader', label: 'Chủ nhiệm' },
	{ value: 'secretary', label: 'Thư ký' },
	{ value: 'member', label: 'Thành viên' },
];
const PARTICIPANT_SOURCES = [
	{ value: 'internal', label: 'Nội viện' },
	{ value: 'external', label: 'Ngoại viện' },
];
const LEAVE_TYPES = [
	{ value: 'absent', label: 'Xin nghỉ' },
	{ value: 'late', label: 'Xin đi muộn' },
];

const FORMS = [
	{
		key: 'topic',
		module: 'RESEARCH',
		title: 'Đề tài nghiên cứu',
		description: 'Thông tin đề tài / bài báo khi đăng ký và cập nhật.',
		variants: [
			{ key: 'admin', label: 'Quản trị (thêm / sửa đề tài)' },
			{ key: 'portal', label: 'Cổng nhân viên (đăng ký / sửa hồ sơ)' },
			{ key: 'public', label: 'Đăng ký công khai' },
		],
		fields: [
			{
				key: 'title',
				label: 'Tên đề tài',
				type: 'textarea',
				required: true,
				lock: { visible: true, required: true },
				base: { maxLength: 500 },
			},
			{ key: 'description', label: 'Mô tả / Tóm tắt', type: 'textarea', base: { maxLength: 4000 } },
			{
				key: 'article_type',
				label: 'Loại đăng ký',
				type: 'select',
				in: ['admin', 'portal'],
				options: ARTICLE_TYPES,
			},
			{
				key: 'round_id',
				label: 'Đợt nghiên cứu',
				type: 'select',
				dynamic: true,
				required: true,
				lock: { visible: true, required: true },
			},
			{
				key: 'category_id',
				label: 'Phân loại',
				type: 'select',
				dynamic: true,
				required: true,
				lock: { visible: true, required: true },
			},
			{
				key: 'department_id',
				label: 'Khoa/phòng',
				type: 'select',
				dynamic: true,
				required: true,
				lock: { visible: ['portal', 'public'], required: ['public'] },
			},
			{
				key: 'journal_name',
				label: 'Tên tạp chí',
				type: 'text',
				in: ['admin'], // form cổng nhân viên không hỏi tên tạp chí
				when: { article_type: 'bai_bao' },
				base: { maxLength: 255 },
			},
			{
				key: 'doi',
				label: 'DOI',
				type: 'text',
				in: ['admin', 'portal'],
				when: { article_type: 'bai_bao' },
				base: { maxLength: 100 },
			},
			{
				key: 'publish_date',
				label: 'Ngày xuất bản',
				type: 'date',
				in: ['admin', 'portal'],
				when: { article_type: 'bai_bao' },
			},
			{
				key: 'budget_estimated',
				label: 'Kinh phí dự toán',
				type: 'number',
				in: ['admin', 'portal'], // portal: trang Nhập đề tài đã hoàn thành
				when: { article_type: 'de_tai' },
				// Form đăng ký ở cổng không có ô này — chỉ form nhập đề tài đã hoàn thành
				editOnly: ['portal'],
				base: { min: 0, max: 999999999999999 },
			},
			{
				key: 'budget_actual',
				label: 'Kinh phí thực tế',
				type: 'number',
				in: ['admin', 'portal'], // portal: trang Nhập đề tài đã hoàn thành
				when: { article_type: 'de_tai' },
				editOnly: true,
				base: { min: 0, max: 999999999999999 },
			},
			{
				key: 'approval_decision_no',
				label: 'Số quyết định phê duyệt',
				type: 'text',
				in: ['admin', 'portal'], // portal: trang Nhập đề tài đã hoàn thành
				when: { article_type: 'de_tai' },
				editOnly: true,
				base: { maxLength: 100 },
			},
			{
				key: 'approval_decision_date',
				label: 'Ngày quyết định phê duyệt',
				type: 'date',
				in: ['admin', 'portal'], // portal: trang Nhập đề tài đã hoàn thành
				when: { article_type: 'de_tai' },
				editOnly: true,
			},
			{
				key: 'recognition_decision_no',
				label: 'Số quyết định công nhận',
				type: 'text',
				in: ['admin', 'portal'], // portal: trang Nhập đề tài đã hoàn thành
				when: { article_type: 'de_tai' },
				editOnly: true,
				base: { maxLength: 100 },
			},
			{
				key: 'recognition_decision_date',
				label: 'Ngày quyết định công nhận',
				type: 'date',
				in: ['admin', 'portal'], // portal: trang Nhập đề tài đã hoàn thành
				when: { article_type: 'de_tai' },
				editOnly: true,
			},
			{
				key: 'acceptance_rating',
				label: 'Xếp loại nghiệm thu',
				type: 'select',
				in: ['admin', 'portal'], // portal: trang Nhập đề tài đã hoàn thành
				when: { article_type: 'de_tai' },
				editOnly: true,
				options: ACCEPTANCE_RATINGS,
			},
			{
				key: 'acceptance_score',
				label: 'Điểm nghiệm thu',
				type: 'number',
				in: ['admin', 'portal'], // portal: trang Nhập đề tài đã hoàn thành
				when: { article_type: 'de_tai' },
				editOnly: true,
				base: { min: 0, max: 100 },
			},
			{
				key: 'acceptance_date',
				label: 'Ngày nghiệm thu',
				type: 'date',
				in: ['admin', 'portal'], // portal: trang Nhập đề tài đã hoàn thành
				when: { article_type: 'de_tai' },
				editOnly: true,
			},
			// Chủ nhiệm — chỉ form công khai hỏi (form nội bộ chọn từ danh sách nhân viên)
			{
				key: 'full_name',
				label: 'Họ tên chủ nhiệm',
				type: 'text',
				in: ['public'],
				required: true,
				lock: { visible: true, required: true },
				base: { maxLength: 200 },
			},
			{
				key: 'staff_number',
				label: 'Mã nhân viên',
				type: 'text',
				in: ['public'],
				required: true,
				lock: { visible: true, required: true },
				base: { maxLength: 9 },
			},
			{
				key: 'phone',
				label: 'Số điện thoại',
				type: 'text',
				in: ['public'],
				required: true,
				base: { maxLength: 20 },
			},
			{ key: 'email', label: 'Email', type: 'email', in: ['public'], base: { maxLength: 100 } },
			{
				key: 'position',
				label: 'Chức danh chuyên môn',
				type: 'text',
				in: ['public'],
				required: true,
				base: { maxLength: 200 },
			},
		],
	},
	{
		key: 'topic_member',
		module: 'RESEARCH',
		title: 'Thành viên đề tài',
		description: 'Thêm / sửa thành viên ở trang chi tiết đề tài của cổng nhân viên.',
		variants: [{ key: 'portal', label: 'Cổng nhân viên (thêm / sửa thành viên)' }],
		fields: [
			{
				key: 'ho_ten',
				label: 'Họ tên',
				type: 'text',
				required: true,
				lock: { visible: true, required: true },
				base: { maxLength: 200 },
			},
			{
				key: 'role',
				label: 'Vai trò',
				type: 'select',
				required: true,
				lock: { visible: true, required: true },
				options: MEMBER_ROLES,
			},
			{ key: 'email', label: 'Email', type: 'email', base: { maxLength: 100 } },
			{ key: 'so_dien_thoai', label: 'Điện thoại', type: 'text', base: { maxLength: 20 } },
			{ key: 'chuc_vu', label: 'Chức vụ', type: 'text', base: { maxLength: 200 } },
			// Cột INT — mã NV chỉ gồm chữ số (express-validator kiểm)
			{ key: 'staff_number', label: 'Mã NV', type: 'text', base: { maxLength: 9 } },
		],
	},
	{
		key: 'seminar_participant',
		module: 'SEMINAR',
		title: 'Đăng ký tham dự hội nghị',
		description: 'Form đăng ký qua mã QR / link của hội nghị.',
		variants: [{ key: 'public', label: 'Đăng ký công khai (quét QR)' }],
		fields: [
			{
				key: 'source',
				label: 'Đối tượng tham dự',
				type: 'select',
				required: true,
				lock: { visible: true, required: true },
				options: PARTICIPANT_SOURCES,
			},
			{
				key: 'full_name',
				label: 'Họ và tên',
				type: 'text',
				required: true,
				lock: { visible: true, required: true },
				base: { maxLength: 255 },
			},
			// Nội viện: họ tên + mã NV để tra hồ sơ nhân sự, phần còn lại lấy từ hồ sơ
			{
				key: 'staff_number',
				label: 'Mã nhân viên',
				type: 'text',
				required: true,
				lock: { visible: true, required: true },
				when: { source: 'internal' },
				base: { maxLength: 9 },
			},
			{
				key: 'title_prefix',
				label: 'Học hàm / học vị',
				type: 'text',
				when: { source: 'external' },
				base: { maxLength: 10 },
			},
			{ key: 'dob', label: 'Ngày sinh', type: 'date', when: { source: 'external' } },
			{
				key: 'gender',
				label: 'Giới tính',
				type: 'select',
				when: { source: 'external' },
				options: GENDERS,
			},
			// SĐT dùng chặn đăng ký trùng của người ngoại viện ⇒ luôn bắt buộc
			{
				key: 'phone',
				label: 'Số điện thoại',
				type: 'text',
				required: true,
				lock: { visible: true, required: true },
				when: { source: 'external' },
				base: { maxLength: 20 },
			},
			{
				key: 'email',
				label: 'Email',
				type: 'email',
				when: { source: 'external' },
				base: { maxLength: 255 },
			},
			{
				key: 'organization',
				label: 'Đơn vị công tác',
				type: 'text',
				required: true,
				when: { source: 'external' },
				base: { maxLength: 255 },
			},
			{
				key: 'department_raw',
				label: 'Khoa / phòng',
				type: 'text',
				when: { source: 'external' },
				base: { maxLength: 255 },
			},
			{
				key: 'qualification_raw',
				label: 'Trình độ chuyên môn',
				type: 'text',
				when: { source: 'external' },
				base: { maxLength: 100 },
			},
		],
	},
	{
		key: 'course_registration',
		module: 'TRAINING',
		title: 'Đăng ký khóa học',
		description: 'Form đăng ký khóa học đào tạo trên cổng công khai.',
		variants: [{ key: 'public', label: 'Đăng ký công khai' }],
		fields: [
			{
				key: 'full_name',
				label: 'Họ và tên',
				type: 'text',
				required: true,
				lock: { visible: true, required: true },
				base: { maxLength: 150 },
			},
			{ key: 'national_id', label: 'Số CCCD/CMND', type: 'text', base: { maxLength: 20 } },
			{ key: 'dob', label: 'Ngày sinh', type: 'date' },
			{ key: 'gender', label: 'Giới tính', type: 'select', options: GENDERS },
			{ key: 'trainee_type_id', label: 'Đối tượng học viên', type: 'select', dynamic: true },
			{ key: 'phone', label: 'Số điện thoại', type: 'text', base: { maxLength: 20 } },
			{ key: 'email', label: 'Email', type: 'email', base: { maxLength: 100 } },
			{ key: 'address', label: 'Địa chỉ', type: 'text', base: { maxLength: 255 } },
		],
	},
	{
		key: 'cme_record',
		module: 'SEMINAR',
		title: 'Tự khai CME',
		description: 'Nhân viên tự khai hoạt động CME ở cổng nhân viên (chờ duyệt).',
		variants: [{ key: 'portal', label: 'Cổng nhân viên (khai / gửi lại CME)' }],
		fields: [
			{ key: 'category_id', label: 'Hình thức / danh mục', type: 'select', dynamic: true },
			{
				key: 'title',
				label: 'Tên hoạt động',
				type: 'text',
				required: true,
				lock: { visible: true, required: true },
				base: { maxLength: 255 },
			},
			{ key: 'role', label: 'Vai trò', type: 'text', base: { maxLength: 100 } },
			{
				key: 'quantity',
				label: 'Số buổi tham gia',
				type: 'number',
				base: { min: 0, max: 999999 },
			},
			// Người dùng tự khai — người quản lý xem / sửa lại khi duyệt
			{
				key: 'credits',
				label: 'Số giờ tín chỉ',
				type: 'number',
				base: { min: 0, max: 9999 },
			},
			{ key: 'activity_date', label: 'Từ ngày', type: 'date' },
			{ key: 'end_date', label: 'Đến ngày', type: 'date' },
			{
				key: 'year',
				label: 'Năm',
				type: 'number',
				required: true,
				lock: { visible: true, required: true },
				base: { min: 1900, max: 2100, integer: true },
			},
			{ key: 'note', label: 'Ghi chú', type: 'text', base: { maxLength: 500 } },
		],
	},
	{
		key: 'leave_request',
		module: 'ATTENDANCE',
		title: 'Đơn xin phép',
		description: 'Đơn xin nghỉ / xin đi muộn của học viên ở cổng nhân viên.',
		variants: [{ key: 'portal', label: 'Cổng nhân viên (gửi đơn)' }],
		fields: [
			{
				key: 'type',
				label: 'Loại đơn',
				type: 'select',
				required: true,
				lock: { visible: true, required: true },
				options: LEAVE_TYPES,
			},
			{
				key: 'from_date',
				label: 'Từ ngày',
				type: 'date',
				required: true,
				lock: { visible: true, required: true },
			},
			{
				key: 'to_date',
				label: 'Đến ngày',
				type: 'date',
				lock: { visible: true },
				when: { type: 'absent' },
			},
			{
				key: 'reason',
				label: 'Lý do',
				type: 'textarea',
				required: true,
				lock: { visible: true, required: true },
				base: { minLength: 5, maxLength: 1000 },
			},
		],
	},
	{
		key: 'user_profile',
		module: 'SYSTEM',
		title: 'Hồ sơ cá nhân',
		description: 'Trang Hồ sơ cá nhân — chủ yếu để thêm trường riêng (chuyên khoa, số CCHN...).',
		variants: [{ key: 'profile', label: 'Hồ sơ cá nhân (người dùng tự sửa)' }],
		fields: [
			{
				key: 'full_name',
				label: 'Họ và tên',
				type: 'text',
				required: true,
				lock: { visible: true, required: true },
				base: { maxLength: 200 },
			},
		],
	},
	// ─── Đợt 3: Đào tạo (formRegistry.training.js) ─────────────────────────────
	...TRAINING_FORMS,
];

const byKey = new Map(FORMS.map((f) => [f.key, f]));
const getForm = (key) => byKey.get(key) || null;
const listForms = () => FORMS;

module.exports = { getForm, listForms };
