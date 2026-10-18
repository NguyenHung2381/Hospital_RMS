const router = require('express').Router();
const { body } = require('express-validator');
const { authenticate, authorizePermission } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/errorHandler');
const { success, created, notFound } = require('../../utils/response');
const { asyncHandler } = require('../../utils/asyncHandler');
const deptService = require('./departmentService');

// ─── Departments ──────────────────────────────────────────────────────────────

router.get(
	'/departments',
	authenticate,
	authorizePermission(['departments', 'read']),
	asyncHandler(async (req, res) => {
		return success(res, await deptService.getAll(req.query));
	}),
);

router.post(
	'/departments',
	authenticate,
	authorizePermission(['departments', 'create']),
	[body('name').notEmpty(), body('code').notEmpty(), body('abbreviation').notEmpty()],
	validate,
	asyncHandler(async (req, res) => {
		return created(res, await deptService.create(req.body, req.user.id));
	}),
);

router.get(
	'/departments/:id',
	authenticate,
	asyncHandler(async (req, res) => {
		const item = await deptService.getById(req.params.id);
		if (!item) return notFound(res);
		return success(res, item);
	}),
);

router.put(
	'/departments/:id',
	authenticate,
	authorizePermission(['departments', 'update']),
	asyncHandler(async (req, res) => {
		const item = await deptService.update(req.params.id, req.body, req.user.id);
		if (!item) return notFound(res);
		return success(res, item, 'Cập nhật thành công');
	}),
);

router.delete(
	'/departments/:id',
	authenticate,
	authorizePermission(['departments', 'delete']),
	asyncHandler(async (req, res) => {
		await deptService.remove(req.params.id, req.user.id);
		return success(res, null, 'Xóa thành công');
	}),
);

module.exports = router;
