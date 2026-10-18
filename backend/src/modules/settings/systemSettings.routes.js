const router = require('express').Router();
const { body } = require('express-validator');
const systemSettingService = require('./systemSettingService');
const { authenticate, authorizePermission } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/errorHandler');
const mailService = require('../notifications/mailService');
const uploadPolicy = require('../../utils/uploadPolicy');
const attendancePolicy = require('../../utils/attendancePolicy');
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

// Gửi thử bằng cấu hình SMTP hiện tại (đã lưu) — báo lỗi thật thay vì nuốt như send().
router.post('/test-mail', [body('to').isEmail()], validate, async (req, res, next) => {
	try {
		await mailService.sendTest(req.body.to);
		return success(res, null, `Đã gửi email thử tới ${req.body.to}`);
	} catch (err) {
		return error(res, `Gửi thử thất bại: ${err.message}`, 400);
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

router.put(
	'/:key',
	[body('value').optional({ nullable: true }).isString()],
	validate,
	asyncHandler(async (req, res) => {
		if (!systemSettingService.isKey(req.params.key)) return notFound(res);
		const value = req.body.value ?? null;
		const invalid =
			uploadPolicy.validateSetting(req.params.key, value) ??
			attendancePolicy.validateSetting(req.params.key, value);
		if (invalid) return error(res, invalid, 400);
		const item = await systemSettingService.update(
			req.params.key,
			req.body.value ?? null,
			req.user.id,
		);
		return success(res, item, 'Đã cập nhật cấu hình');
	}),
);

module.exports = router;
