const router = require('express').Router();
const { body } = require('express-validator');
const { createCrudController } = require('../../shared/crudController');
const { authenticate, authorizePermission } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/errorHandler');
const { success } = require('../../utils/response');
const { asyncHandler } = require('../../utils/asyncHandler');

// ─── Round Types ──────────────────────────────────────────────────────────────
const roundTypeService = require('./roundTypeService');
const rtCtrl = createCrudController(roundTypeService);

router.get('/round-types', authenticate, rtCtrl.getAll);
router.post(
	'/round-types',
	authenticate,
	authorizePermission(['catalog', 'create']),
	[body('name').trim().notEmpty().withMessage('Tên loại đợt không được để trống')],
	validate,
	rtCtrl.createOne,
);

router.get('/round-types/:id', authenticate, rtCtrl.getById);
router.put(
	'/round-types/:id',
	authenticate,
	authorizePermission(['catalog', 'update']),
	rtCtrl.updateOne,
);
router.delete(
	'/round-types/:id',
	authenticate,
	authorizePermission(['catalog', 'delete']),
	rtCtrl.removeOne,
);

// ── Cấp độ được phép theo loại đợt (round_type_levels) ──
router.get(
	'/round-types/:id/levels',
	authenticate,
	asyncHandler(async (req, res) => {
		return success(res, await roundTypeService.getLevels(req.params.id));
	}),
);

router.put(
	'/round-types/:id/levels',
	authenticate,
	authorizePermission(['catalog', 'update']),
	[body('level_ids').isArray().withMessage('level_ids phải là mảng')],
	validate,
	asyncHandler(async (req, res) => {
		const levels = await roundTypeService.setLevels(req.params.id, req.body.level_ids);
		return success(res, levels, 'Đã cập nhật cấp độ cho loại đợt');
	}),
);

module.exports = router;
