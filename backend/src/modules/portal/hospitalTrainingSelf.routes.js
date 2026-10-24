const router = require('express').Router();
const selfService = require('../seminars/hospitalTrainingSelfService');
const { authenticate } = require('../../middlewares/auth');
const { success, created } = require('../../utils/response');
const { asyncHandler } = require('../../utils/asyncHandler');

// Nhân viên tự đăng ký Tập huấn bệnh viện (/me/hospital-trainings — GĐ6). Không cần
// quyền seminars:* — service chỉ thêm / bớt chính tài khoản đang đăng nhập.
router.use(authenticate);

router.get(
	'/',
	asyncHandler(async (req, res) => success(res, await selfService.listForMe(req.user.id))),
);

router.post(
	'/:id/register',
	asyncHandler(async (req, res) =>
		created(res, await selfService.register(req.params.id, req.user.id), 'Đã đăng ký tham dự'),
	),
);

router.delete(
	'/:id/register',
	asyncHandler(async (req, res) =>
		success(res, await selfService.cancel(req.params.id, req.user.id), 'Đã hủy đăng ký'),
	),
);

module.exports = router;
