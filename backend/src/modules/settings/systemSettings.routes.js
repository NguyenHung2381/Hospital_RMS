const router = require('express').Router();
const { body } = require('express-validator');
const systemSettingService = require('./systemSettingService');
const { authenticate, authorizePermission } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/errorHandler');
const settingRules = require('./settingRules');
const mailService = require('../notifications/mailService');
const clamav = require('../../utils/clamav');
const captcha = require('../../utils/captcha');
const { holidayCalendar } = require('../../utils/classDates');
const holidaySync = require('./holidaySync');
const { success, notFound, error } = require('../../utils/response');
const { asyncHandler } = require('../../utils/asyncHandler');

// Chỉ 1 quyền 'manage' cho toàn bộ resource — đây là bảng key-value cấu hình
// nhạy cảm (chứa SMTP_PASS), không cần tách read/create/update/delete như danh
// mục thông thường.
router.use(authenticate, authorizePermission(['system_settings', 'manage']));

router.get(
	'/',
	asyncHandler(async (req, res) => {
		return success(res, await systemSettingService.getAll());
	}),
);

// Kiểm tra Google reCAPTCHA bằng khóa đã lưu. token (tùy chọn) = token admin vừa tích trên
// trang cấu hình — có thì thử trọn cặp khóa + tên miền, không thì chỉ thử kết nối tới Google.
router.post(
	'/test-recaptcha',
	[body('token').optional().isString().isLength({ max: 4096 })],
	validate,
	asyncHandler(async (req, res) => {
		const r = await captcha.testRecaptcha(req.body.token);
		return r.ok ? success(res, r, r.message) : error(res, r.message, 400);
	}),
);

// Xem trước ngày nghỉ lễ của 1 năm theo giá trị ĐANG NHẬP (chưa lưu cũng được) —
// trang cấu hình hiện để admin đối chiếu với thông báo nghỉ lễ của Chính phủ.
router.post(
	'/holidays/preview',
	[
		body('year').isInt({ min: 1900, max: 2199 }).toInt(),
		body('auto').isBoolean().toBoolean(),
		body('text').optional({ nullable: true }).isString().isLength({ max: 10000 }),
	],
	validate,
	asyncHandler(async (req, res) => {
		const current = { text: req.body.text ?? '', auto: req.body.auto };
		const synced = await holidaySync.getSynced();
		// Ngày nhập tay trùng ngày của lịch đồng bộ ⇒ lấy tên ở đó (vd "Ngày Văn hoá Việt Nam")
		const syncedName = new Map((synced?.days ?? []).map((d) => [d.date, d.name]));
		return success(res, {
			days: holidayCalendar(current)
				.list(req.body.year)
				.map((d) =>
					d.source === 'manual' && syncedName.has(d.date)
						? { ...d, name: syncedName.get(d.date) }
						: d,
				),
			// Bản đồng bộ lịch ngoài gần nhất + khác biệt so với giá trị đang nhập (của năm đang xem)
			sync: synced && {
				source: synced.source,
				fetched_at: synced.fetched_at,
				error: synced.error ?? null,
				error_at: synced.error_at ?? null,
				covered: synced.days.some((d) => d.date.startsWith(`${req.body.year}-`)),
				suggestions: holidaySync.suggestionsFor(synced, current, [req.body.year]),
			},
		});
	}),
);

// Tải lịch ngày lễ ngay (không cần bật công tắc đồng bộ hằng tuần) — lỗi vẫn trả 200 kèm `error`
// để trang cấu hình hiện đúng lý do (máy chủ không ra Internet, sai địa chỉ…).
router.post(
	'/holidays/sync',
	asyncHandler(async (req, res) => {
		const data = await holidaySync.sync();
		return success(
			res,
			{ fetched_at: data.fetched_at, error: data.error ?? null, count: data.days.length },
			data.error ? `Đồng bộ thất bại: ${data.error}` : `Đã tải ${data.days.length} ngày nghỉ`,
		);
	}),
);

// Gửi thử bằng cấu hình SMTP hiện tại (đã lưu) — báo lỗi thật thay vì nuốt như send().
router.post('/test-mail', [body('to').isEmail()], validate, async (req, res, next) => {
	try {
		await mailService.sendTest(req.body.to);
		return success(res, null, `Đã gửi email thử tới ${req.body.to}`);
	} catch (err) {
		return error(res, `Gửi thử thất bại: ${err.message}`, 400);
	}
});

// Kiểm tra kết nối ClamAV bằng cấu hình đã lưu (PING + quét thử dữ liệu sạch).
router.post('/test-clamav', async (req, res) => {
	try {
		const r = await clamav.testConnection();
		return success(
			res,
			r,
			`ClamAV ${r.host}:${r.port} hoạt động bình thường${r.version ? ` — ${r.version}` : ''}`,
		);
	} catch (err) {
		return error(res, `Kiểm tra thất bại: ${err.message}`, 400);
	}
});

router.get(
	'/:key',
	asyncHandler(async (req, res) => {
		if (!systemSettingService.isKey(req.params.key)) return notFound(res);
		const item = await systemSettingService.getById(req.params.key);
		if (!item) return notFound(res);
		return success(res, item);
	}),
);

// Lưu nhiều cấu hình một lần: { values: { KEY: "giá trị" | null } }. Kiểm cả lô trước, có
// ô sai thì không lưu gì và trả errors theo từng khóa để trang cấu hình tô đỏ đúng ô.
router.put(
	'/',
	[body('values').isObject()],
	validate,
	asyncHandler(async (req, res) => {
		const input = req.body.values;
		const n = Object.keys(input).length;
		if (!n) return error(res, 'Không có thay đổi nào để lưu', 400);
		if (n > 300) return error(res, 'Quá nhiều cấu hình trong một lần lưu', 400);
		const { values, errors } = settingRules.checkMany(input);
		const bad = Object.keys(errors).length;
		if (bad) return error(res, `${bad} giá trị chưa hợp lệ — chưa lưu gì`, 400, errors);
		const saved = await systemSettingService.updateMany(values, req.user.id);
		return success(res, { saved }, `Đã lưu ${saved} thay đổi`);
	}),
);

router.put(
	'/:key',
	[body('value').optional({ nullable: true }).isString()],
	validate,
	asyncHandler(async (req, res) => {
		if (!systemSettingService.isKey(req.params.key)) return notFound(res);
		const value = settingRules.normalize(req.params.key, req.body.value);
		const invalid = settingRules.validate(req.params.key, value);
		if (invalid) return error(res, invalid, 400);
		const item = await systemSettingService.update(req.params.key, value, req.user.id);
		return success(res, item, 'Đã cập nhật cấu hình');
	}),
);

module.exports = router;
