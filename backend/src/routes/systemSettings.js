const router = require('express').Router();
const { body } = require('express-validator');
const systemSettingService = require('../services/systemSettingService');
const { authenticate, authorizePermission } = require('../middlewares/auth');
const { validate } = require('../middlewares/errorHandler');
const { success, notFound } = require('../utils/response');

/**
 * @swagger
 * tags:
 *   name: SystemSettings
 *   description: Cấu hình hệ thống (SMTP, ngưỡng CME, URL public) — thay .env
 */

// Chỉ 1 quyền 'manage' cho toàn bộ resource — đây là bảng key-value cấu hình
// nhạy cảm (chứa SMTP_PASS), không cần tách read/create/update/delete như danh
// mục thông thường.
router.use(authenticate, authorizePermission(['system_settings', 'manage']));

router.get('/', async (req, res, next) => {
	try {
		return success(res, await systemSettingService.getAll());
	} catch (err) {
		next(err);
	}
});

router.get('/:key', async (req, res, next) => {
	try {
		const item = await systemSettingService.getById(req.params.key);
		if (!item) return notFound(res);
		return success(res, item);
	} catch (err) {
		next(err);
	}
});

router.put(
	'/:key',
	[body('value').optional({ nullable: true }).isString()],
	validate,
	async (req, res, next) => {
		try {
			const item = await systemSettingService.update(req.params.key, req.body.value ?? null, req.user.id);
			return success(res, item, 'Đã cập nhật cấu hình');
		} catch (err) {
			next(err);
		}
	},
);

module.exports = router;
