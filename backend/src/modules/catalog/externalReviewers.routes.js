const router = require('express').Router();
const { body } = require('express-validator');
const { authenticate, authorizePermission } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/errorHandler');
const { success, created, notFound } = require('../../utils/response');
const { asyncHandler } = require('../../utils/asyncHandler');
const extReviewerService = require('./externalReviewerService');

// ─── External Reviewers (người ngoài viện tham gia hội đồng) ──────────────────

router.get(
	'/external-reviewers',
	authenticate,
	authorizePermission(['councils', 'read']),
	asyncHandler(async (req, res) => {
		return success(res, await extReviewerService.getAll(req.query));
	}),
);

router.post(
	'/external-reviewers',
	authenticate,
	authorizePermission(['councils', 'create']),
	[body('full_name').notEmpty().withMessage('Họ tên không được để trống')],
	validate,
	asyncHandler(async (req, res) => {
		return created(res, await extReviewerService.create(req.body, req.user.id));
	}),
);

router.put(
	'/external-reviewers/:id',
	authenticate,
	authorizePermission(['councils', 'update']),
	asyncHandler(async (req, res) => {
		const item = await extReviewerService.update(req.params.id, req.body, req.user.id);
		if (!item) return notFound(res);
		return success(res, item, 'Cập nhật thành công');
	}),
);

router.delete(
	'/external-reviewers/:id',
	authenticate,
	authorizePermission(['councils', 'delete']),
	asyncHandler(async (req, res) => {
		await extReviewerService.remove(req.params.id, req.user.id);
		return success(res, null, 'Xóa thành công');
	}),
);

module.exports = router;
