const { z } = require('zod');

const region = z
	.string()
	.trim()
	.toLowerCase()
	.regex(/^[a-z0-9]{1,20}$/, 'Vùng máy chủ chỉ gồm chữ thường và số, vd: hn10');
const apiKey = z.string().trim().max(200, 'API key quá dài');
const secret = z.string().trim().max(500, 'Secret quá dài');
const label = z.string().trim().min(1, 'Nhập tên tài khoản').max(200, 'Tên tối đa 200 ký tự');

const idParams = z.object({ id: z.coerce.number().int().positive('Mã tài khoản không hợp lệ') });

const createAccount = z.object({
	label,
	kind: z.enum(['organization', 'personal'], { message: 'Loại tài khoản không hợp lệ' }),
	user_id: z.string().trim().max(20).nullish(),
	region,
	api_key: apiKey.min(1, 'Nhập API key'),
	secret: secret.min(1, 'Nhập secret'),
	use_for_certificates: z.boolean().optional(),
	is_active: z.boolean().optional(),
});

const updateAccount = z.object({
	label: label.optional(),
	region: region.optional(),
	api_key: apiKey.optional(),
	secret: secret.optional(),
	use_for_certificates: z.boolean().optional(),
	is_active: z.boolean().optional(),
});

const saveMine = z.object({
	label: z.string().trim().max(200).optional(),
	region,
	api_key: apiKey.optional(),
	secret: secret.optional(),
});

const signatureImage = z.object({
	// data URL / base64 của ảnh; null = xóa ảnh
	image: z.string().max(5_000_000, 'Ảnh chữ ký quá lớn').nullable().optional(),
	show_text: z.boolean().optional(),
	// Chức vụ in dưới chữ ký; rỗng / null = lấy chức vụ trong hồ sơ
	caption: z.string().max(150, 'Chức vụ tối đa 150 ký tự').nullable().optional(),
	// Họ tên in dưới khung chữ ký; rỗng / null = họ tên tài khoản
	display_name: z.string().max(150, 'Họ tên tối đa 150 ký tự').nullable().optional(),
});

// Ký PDF tự tải lên: vị trí khung chữ ký (pt, gốc dưới-trái), multipart ⇒ chuỗi → số
const num = (min, max, msg) => z.coerce.number({ message: msg }).min(min, msg).max(max, msg);
const signPdf = z.object({
	page: z.coerce.number().int().min(1, 'Trang không hợp lệ').max(10000, 'Trang không hợp lệ'),
	x: num(0, 20000, 'Vị trí chữ ký không hợp lệ'),
	y: num(0, 20000, 'Vị trí chữ ký không hợp lệ'),
	width: num(40, 1000, 'Khung chữ ký quá nhỏ hoặc quá lớn'),
	height: num(20, 600, 'Khung chữ ký quá nhỏ hoặc quá lớn'),
});

const logsQuery = z.object({
	page: z.coerce.number().int().min(1).optional(),
	limit: z.coerce.number().int().min(1).max(200).optional(),
	status: z.enum(['ok', 'error']).optional(),
	doc_type: z.string().trim().max(30).optional(),
	account_id: z.coerce.number().int().positive().optional(),
});

// Cấu hình ký số — khóa thiếu = bật (signingConfig.normalize)
const flags = z.record(z.string().max(40), z.boolean()).optional();
const config = z.object({
	enabled: z.boolean(),
	self_manage: z.boolean(),
	features: flags,
	providers: flags,
});

module.exports = {
	config,
	idParams,
	createAccount,
	updateAccount,
	saveMine,
	signatureImage,
	signPdf,
	logsQuery,
};
