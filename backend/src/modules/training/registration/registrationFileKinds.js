// Loại file hồ sơ bắt buộc khi đăng ký khóa ĐTLT theo đối tượng — nguồn duy nhất cho
// middleware upload, service, màn tra cứu / cổng nhân viên / quản trị. FE nhận qua
// GET /public/course-registration/rules (attachments.kinds).
//
// File THUẦN (không require CSDL / service) để registrationApprovalGate.js, middleware
// upload và service đều dùng được mà không vòng require.
const REGISTRATION_FILE_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];
const ACCEPT_MESSAGE = 'Hồ sơ chỉ nhận file PDF, JPG hoặc PNG.';

const REGISTRATION_FILE_KINDS = {
	internal: [
		{
			key: 'application_signed',
			label: 'Đơn đăng ký đã ký',
			required: true,
			doc_type: null,
			hint: 'Đơn đăng ký học khóa đào tạo liên tục (tải ở trên), đã ký tên — bản scan hoặc ảnh chụp rõ nét.',
		},
		{
			key: 'proposal_approved',
			label: 'Tờ trình đã duyệt',
			required: true,
			doc_type: null,
			hint: 'Tờ trình cử cán bộ kèm Bảng phân tích nhu cầu đào tạo, có xác nhận của Ban giám đốc. Nhiều trang thì gộp vào 1 file PDF.',
		},
	],
	external: [
		{
			key: 'national_id',
			label: 'Căn cước công dân',
			required: true,
			doc_type: 'national_id',
			hint: 'Cả 2 mặt: gộp vào 1 file PDF, hoặc chụp 2 mặt trong cùng 1 ảnh.',
		},
		{
			key: 'degree',
			label: 'Bằng tốt nghiệp',
			required: true,
			doc_type: 'degree',
			hint: 'Bản scan hoặc ảnh chụp bằng tốt nghiệp chuyên môn.',
		},
		{
			key: 'license',
			label: 'Chứng chỉ hành nghề',
			required: true,
			doc_type: 'license',
			hint: 'Bản scan hoặc ảnh chụp chứng chỉ hành nghề / giấy phép hành nghề.',
		},
		{
			key: 'decision',
			label: 'Quyết định cử đi học',
			required: true,
			doc_type: 'decision',
			hint: 'Quyết định hoặc công văn của đơn vị cử bạn tham gia khóa học.',
		},
	],
};

// Dữ liệu cũ (1 PDF gộp đơn + tờ trình của nội viện) — chỉ hiển thị, không nộp mới
const LEGACY_KIND = {
	key: 'dossier',
	label: 'Hồ sơ nộp bổ sung (đơn + tờ trình, 1 file)',
	required: false,
	doc_type: null,
};

const ALL_KINDS = [...REGISTRATION_FILE_KINDS.internal, ...REGISTRATION_FILE_KINDS.external];
const UPLOADABLE_KINDS = ALL_KINDS.map((k) => k.key);
// Tên phần multipart khi gửi đăng ký
const FORM_FIELD = (key) => `files[${key}]`;

const kindsFor = (source) => REGISTRATION_FILE_KINDS[source] ?? [];
const kindDef = (source, key) => kindsFor(source).find((k) => k.key === key) ?? null;
const labelOf = (key) =>
	key === LEGACY_KIND.key
		? LEGACY_KIND.label
		: (ALL_KINDS.find((k) => k.key === key)?.label ?? key);

/**
 * Khóa loại bắt buộc còn thiếu.
 * @param {string} source 'internal' | 'external'
 * @param {Iterable<string>} presentKinds loại có file còn hiệu lực (chưa xóa, không bị từ chối)
 * @returns {string[]}
 */
const missingKinds = (source, presentKinds) => {
	const have = new Set(presentKinds);
	if (source === 'internal' && have.has(LEGACY_KIND.key)) return [];
	return kindsFor(source)
		.filter((k) => k.required && !have.has(k.key))
		.map((k) => k.key);
};

/** Mô tả gửi FE (bỏ doc_type). */
const publicKinds = () => ({
	internal: REGISTRATION_FILE_KINDS.internal.map(({ doc_type: _d, ...k }) => k),
	external: REGISTRATION_FILE_KINDS.external.map(({ doc_type: _d, ...k }) => k),
});

module.exports = {
	REGISTRATION_FILE_EXTENSIONS,
	ACCEPT_MESSAGE,
	REGISTRATION_FILE_KINDS,
	LEGACY_KIND,
	UPLOADABLE_KINDS,
	FORM_FIELD,
	kindsFor,
	kindDef,
	labelOf,
	missingKinds,
	publicKinds,
};
