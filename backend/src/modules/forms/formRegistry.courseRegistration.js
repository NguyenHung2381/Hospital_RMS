// Form 'course_registration' (đăng ký khóa học ĐTLT trên cổng công khai) — tách khỏi
// formRegistry.js cho gọn; quy ước khai báo trường xem đầu formRegistry.js.
const { GENDERS } = require('./formRegistry.training');

const PARTICIPANT_SOURCES = [
	{ value: 'internal', label: 'Nội viện' },
	{ value: 'external', label: 'Ngoại viện' },
];

const COURSE_REGISTRATION_FORM = {
	key: 'course_registration',
	module: 'TRAINING',
	title: 'Đăng ký khóa học',
	description:
		'Form đăng ký khóa đào tạo liên tục trên cổng công khai (nội viện / ngoại viện) — dữ liệu in ra Đơn đăng ký.',
	variants: [{ key: 'public', label: 'Đăng ký công khai' }],
	// Khóa = SNAPSHOT_FIELDS / INVOICE_FIELDS (training/registration/registrationConstants.js).
	// Luật cứng không cấu hình được (2 cam kết = true, cấu trúc CCCD, mã NV, khớp lại
	// nhân viên) nằm ở public/courseRegistration.validators.js và service.
	fields: [
		{
			key: 'source',
			label: 'Đối tượng (nội viện / ngoại viện)',
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
			base: { maxLength: 150 },
		},
		{ key: 'dob', label: 'Ngày sinh', type: 'date', required: true },
		{ key: 'gender', label: 'Giới tính', type: 'select', required: true, options: GENDERS },
		{ key: 'ethnicity', label: 'Dân tộc', type: 'text', base: { maxLength: 50 } },
		{ key: 'hometown', label: 'Quê quán', type: 'text', base: { maxLength: 255 } },
		{
			key: 'national_id',
			label: 'Số CCCD',
			type: 'text',
			required: true,
			base: { maxLength: 20 },
		},
		{ key: 'national_id_issued_date', label: 'Ngày cấp', type: 'date', required: true },
		{
			key: 'national_id_issued_place',
			label: 'Nơi cấp',
			type: 'text',
			required: true,
			base: { maxLength: 200 },
		},
		{
			key: 'permanent_address',
			label: 'Địa chỉ thường trú',
			type: 'text',
			required: true,
			base: { maxLength: 255 },
		},
		{ key: 'address', label: 'Địa chỉ liên hệ', type: 'text', base: { maxLength: 255 } },
		{
			key: 'phone',
			label: 'Số điện thoại',
			type: 'text',
			required: true,
			base: { maxLength: 20 },
		},
		{ key: 'email', label: 'Email', type: 'email', required: true, base: { maxLength: 100 } },
		{
			key: 'qualification',
			label: 'Trình độ',
			type: 'text',
			required: true,
			// Nội viện: lấy từ hồ sơ nhân sự (có người chưa ghi trình độ) — form không hỏi
			when: { source: 'external' },
			base: { maxLength: 150 },
		},
		{
			key: 'graduated_school',
			label: 'Trường tốt nghiệp',
			type: 'text',
			required: true,
			base: { maxLength: 200 },
		},
		{
			key: 'graduated_year',
			label: 'Năm tốt nghiệp',
			type: 'number',
			required: true,
			base: { min: 1900, max: 2100, integer: true },
		},
		{
			key: 'graduated_major',
			label: 'Chuyên ngành tốt nghiệp',
			type: 'text',
			base: { maxLength: 200 },
		},
		{
			key: 'degree_number',
			label: 'Số hiệu văn bằng',
			type: 'text',
			required: true,
			base: { maxLength: 50 },
		},
		{
			key: 'degree_registry_number',
			label: 'Số vào sổ cấp bằng',
			type: 'text',
			required: true,
			base: { maxLength: 50 },
		},
		{ key: 'workplace', label: 'Đơn vị công tác', type: 'text', base: { maxLength: 200 } },
		{
			key: 'work_specialty',
			label: 'Chuyên ngành đang công tác',
			type: 'text',
			base: { maxLength: 200 },
		},
		{
			key: 'work_seniority',
			label: 'Thâm niên công tác',
			type: 'text',
			base: { maxLength: 100 },
		},
		{ key: 'trainee_type_id', label: 'Đối tượng học viên', type: 'select', dynamic: true },
		// Nội viện: mã NV + họ tên để khớp hồ sơ nhân sự; khoa / trình độ server lấy từ hồ sơ đó
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
			key: 'department_id',
			label: 'Khoa/Phòng/TT đang công tác',
			type: 'select',
			dynamic: true,
			// Lấy từ hồ sơ nhân sự (form không có ô chọn khoa); nhân viên chưa ghi khoa vẫn
			// phải gửi được — như Trình độ
			required: false,
			when: { source: 'internal' },
		},
		// Thông tin xuất hóa đơn — chỉ hỏi ngoại viện
		{
			key: 'invoice_org_name',
			label: 'Tên đơn vị (hóa đơn)',
			type: 'text',
			when: { source: 'external' },
			base: { maxLength: 255 },
		},
		{
			key: 'invoice_org_address',
			label: 'Địa chỉ đơn vị',
			type: 'text',
			when: { source: 'external' },
			base: { maxLength: 255 },
		},
		{
			key: 'invoice_tax_code',
			label: 'Mã số thuế đơn vị',
			type: 'text',
			when: { source: 'external' },
			base: { maxLength: 20 },
		},
		{
			key: 'invoice_budget_code',
			label: 'Mã đơn vị quan hệ ngân sách',
			type: 'text',
			when: { source: 'external' },
			base: { maxLength: 20 },
		},
		{
			key: 'invoice_email',
			label: 'Email nhận hóa đơn',
			type: 'email',
			when: { source: 'external' },
			base: { maxLength: 100 },
		},
		// 2 cam kết luôn bắt buộc (express-validator cũng chặn khi khác true)
		{
			key: 'rules_accepted',
			label: 'Cam kết thực hiện nội quy',
			type: 'checkbox',
			required: true,
			lock: { visible: true, required: true },
		},
		{
			key: 'declared_true',
			label: 'Cam kết thông tin đúng sự thật',
			type: 'checkbox',
			required: true,
			lock: { visible: true, required: true },
		},
	],
};

module.exports = { PARTICIPANT_SOURCES, COURSE_REGISTRATION_FORM };
