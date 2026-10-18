const router = require('express').Router();
const { createCrudController } = require('../../shared/crudController');
const { authenticate, authorizePermission } = require('../../middlewares/auth');
const { success } = require('../../utils/response');
const { asyncHandler } = require('../../utils/asyncHandler');

// ─── Levels ───────────────────────────────────────────────────────────────────
const levelService = require('./levelService');
const lvlCtrl = createCrudController(levelService);

/**
 * @swagger
 * /levels:
 *   get:
 *     summary: Lấy danh sách cấp độ
 *     tags: [Levels]
 *     responses:
 *       200:
 *         description: Danh sách cấp độ
 *   post:
 *     summary: Tạo cấp độ mới
 *     tags: [Levels]
 *     description: Chỉ admin mới có quyền
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string, example: "Cấp cơ sở" }
 *     responses:
 *       201:
 *         description: Tạo thành công
 */
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

/**
 * @swagger
 * /levels/{id}:
 *   get:
 *     summary: Lấy chi tiết cấp độ
 *     tags: [Levels]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Chi tiết cấp độ
 *   put:
 *     summary: Cập nhật cấp độ
 *     tags: [Levels]
 *     description: Chỉ admin mới có quyền
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *   delete:
 *     summary: Xoá cấp độ
 *     tags: [Levels]
 *     description: Chỉ admin mới có quyền
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Xoá thành công
 */
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
