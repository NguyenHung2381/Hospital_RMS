const router = require('express').Router();
const { createCrudController } = require('../../shared/crudController');
const { authenticate, authorizePermission } = require('../../middlewares/auth');
const { success } = require('../../utils/response');
const { asyncHandler } = require('../../utils/asyncHandler');

// ─── Levels ───────────────────────────────────────────────────────────────────
const levelService = require('./levelService');
const lvlCtrl = createCrudController(levelService);

// Lọc cấp độ theo đợt / loại đợt: dùng ở form đăng ký đề tài.
// Loại đợt chưa cấu hình cấp độ nào ⇒ trả tất cả (fallback).
router.get(
	'/levels',
	authenticate,
	asyncHandler(async (req, res, next) => {
		const { round_id, round_type_id } = req.query;
		if (!round_id && !round_type_id) return lvlCtrl.getAll(req, res, next);

		return success(res, await levelService.getForRound({ round_id, round_type_id }));
	}),
);
router.post('/levels', authenticate, authorizePermission(['catalog', 'create']), lvlCtrl.createOne);

router.get('/levels/:id', authenticate, lvlCtrl.getById);
router.put(
	'/levels/:id',
	authenticate,
	authorizePermission(['catalog', 'update']),
	lvlCtrl.updateOne,
);
router.delete(
	'/levels/:id',
	authenticate,
	authorizePermission(['catalog', 'delete']),
	lvlCtrl.removeOne,
);

module.exports = router;
