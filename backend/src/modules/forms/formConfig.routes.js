const router = require('express').Router();
const { body, param, query } = require('express-validator');
const formConfigService = require('./formConfigService');
const { authenticate, authorizePermission } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/errorHandler');
const { success } = require('../../utils/response');
const { asyncHandler } = require('../../utils/asyncHandler');

const formKey = param('formKey').isString().isLength({ min: 1, max: 60 });

// Quản trị — đặt trước '/:formKey' để '/admin' không bị hiểu là formKey
router.get(
	'/admin',
	authenticate,
	authorizePermission(['form_configs', 'manage']),
	asyncHandler(async (req, res) => success(res, await formConfigService.listForAdmin())),
);

router.put(
	'/admin/:formKey',
	authenticate,
	authorizePermission(['form_configs', 'manage']),
	[formKey, body('config').isObject()],
	validate,
	asyncHandler(async (req, res) =>
		success(
			res,
			await formConfigService.save(req.params.formKey, req.body.config, req.user.id),
			'Đã lưu cấu hình form',
		),
	),
);

router.delete(
	'/admin/:formKey',
	authenticate,
	authorizePermission(['form_configs', 'manage']),
	[formKey],
	validate,
	asyncHandler(async (req, res) =>
		success(res, await formConfigService.reset(req.params.formKey), 'Đã khôi phục mặc định'),
	),
);

// Cấu hình đã ghép cho 1 form — public vì form đăng ký công khai cũng cần.
// Chỉ là nhãn/ràng buộc hiển thị, không chứa dữ liệu nghiệp vụ.
router.get(
	'/:formKey',
	[formKey, query('variant').isString().isLength({ min: 1, max: 30 })],
	validate,
	asyncHandler(async (req, res) =>
		success(res, await formConfigService.getResolved(req.params.formKey, req.query.variant)),
	),
);

module.exports = router;
