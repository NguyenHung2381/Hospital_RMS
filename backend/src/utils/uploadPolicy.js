const systemSettingService = require('../modules/settings/systemSettingService');
const { DOCUMENT_EXTENSIONS } = require('../middlewares/fileTypeAllowlist');

// Định dạng & dung lượng file tài liệu được nhận — admin chỉnh ở Cấu hình hệ
// thống (UPLOAD_ALLOWED_EXTENSIONS, UPLOAD_MAX_MB), fallback .env rồi mặc định.
// Chỉ chọn được trong DOCUMENT_EXTENSIONS (đã có kiểm tra magic bytes) — không
// thể bật html/svg/exe qua cấu hình.
const DEFAULT_EXTENSIONS = [
	'.pdf',
	'.doc',
	'.docx',
	'.xls',
	'.xlsx',
	'.ppt',
	'.pptx',
	'.rar',
	'.zip',
];
const DEFAULT_MAX_MB = 50;
const MAX_MB_CEILING = 1024;

const parseExtensions = (raw) => [
	...new Set(
		String(raw ?? '')
			.split(/[\s,;]+/)
			.filter(Boolean)
			.map((e) => `.${e.replace(/^\.+/, '').toLowerCase()}`),
	),
];

// null = hợp lệ; ngược lại là thông báo lỗi (dùng khi admin lưu cấu hình)
const validateSetting = (key, value) => {
	if (value === null || value === '') return null;
	if (key === 'UPLOAD_ALLOWED_EXTENSIONS') {
		const bad = parseExtensions(value).filter((e) => !DOCUMENT_EXTENSIONS.has(e));
		return bad.length ? `Định dạng không hỗ trợ: ${bad.join(', ')}` : null;
	}
	if (key === 'UPLOAD_MAX_MB') {
		const n = Number(value);
		return Number.isInteger(n) && n > 0 && n <= MAX_MB_CEILING
			? null
			: `Dung lượng phải là số nguyên 1–${MAX_MB_CEILING} MB`;
	}
	return null;
};

const getPolicy = async () => {
	const [rawExt, rawMax] = await Promise.all([
		systemSettingService.getValue('UPLOAD_ALLOWED_EXTENSIONS'),
		systemSettingService.getValue('UPLOAD_MAX_MB'),
	]);
	const extensions = parseExtensions(rawExt).filter((e) => DOCUMENT_EXTENSIONS.has(e));
	const maxSizeMB = Number(rawMax);
	return {
		extensions: extensions.length ? extensions : DEFAULT_EXTENSIONS,
		maxSizeMB: maxSizeMB > 0 ? Math.min(maxSizeMB, MAX_MB_CEILING) : DEFAULT_MAX_MB,
	};
};

module.exports = {
	getPolicy,
	validateSetting,
	parseExtensions,
	DEFAULT_EXTENSIONS,
	DEFAULT_MAX_MB,
};
