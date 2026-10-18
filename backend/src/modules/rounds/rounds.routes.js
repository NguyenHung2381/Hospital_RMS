const router = require('express').Router();
const { body } = require('express-validator');
const { authenticate, authorizePermission } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/errorHandler');
const { success, created } = require('../../utils/response');
const { asyncHandler } = require('../../utils/asyncHandler');
const roundCtrl = require('./roundController');
const deadlineSvc = require('./deadlineService');

// ─── Research Rounds ──────────────────────────────────────────────────────────

/**
 * @swagger
 * /research-rounds:
 *   get:
 *     summary: Lấy danh sách đợt nghiên cứu
 *     tags: [ResearchRounds]
 *     responses:
 *       200:
 *         description: Danh sách đợt nghiên cứu
 *   post:
 *     summary: Tạo đợt nghiên cứu mới
 *     tags: [ResearchRounds]
 *     description: Chỉ admin và manager mới có quyền
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, year, round_number, round_type_id, start_date, end_date]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Đợt nghiên cứu Q1 2024"
 *               year:
 *                 type: integer
 *                 example: 2024
 *               round_number:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 9
 *                 example: 1
 *               round_type_id:
 *                 type: string
 *                 example: "RT01"
 *               start_date:
 *                 type: string
 *                 format: date
 *                 example: "2024-01-01"
 *               end_date:
 *                 type: string
 *                 format: date
 *                 example: "2024-03-31"
 *               status:
 *                 type: string
 *                 enum: [draft, open, closed]
 *                 example: "draft"
 *     responses:
 *       201:
 *         description: Tạo đợt nghiên cứu thành công
 *       403:
 *         description: Không có quyền
 */
router.get(
	'/research-rounds',
	authenticate,
	authorizePermission(['rounds', 'read']),
	roundCtrl.getAll,
);
router.post(
	'/research-rounds',
	authenticate,
	authorizePermission(['rounds', 'create']),
	[
		body('name').notEmpty().withMessage('Tên đợt không được để trống'),
		body('year').isInt({ min: 2000, max: 2100 }).withMessage('Năm không hợp lệ'),
		body('round_number').isInt({ min: 1, max: 9 }).withMessage('Số đợt phải từ 1–9'),
		body('round_type_id')
			.trim()
			.notEmpty()
			.withMessage('Vui lòng chọn loại đợt')
			.bail()
			.matches(/^RT\d{2}$/)
			.withMessage('Loại đợt không hợp lệ'),
		body('start_date').notEmpty().withMessage('Ngày bắt đầu không được để trống'),
		body('end_date').notEmpty().withMessage('Ngày kết thúc không được để trống'),
		// Chấp nhận cả từ vựng phía FE ('active') lẫn DB ('open'); service tự quy đổi.
		body('status').optional().isIn(['draft', 'active', 'open', 'closed', 'cancelled']),
		// Cấu hình luôn khi tạo: cấp độ đề tài của đợt + các mốc thời gian.
		body('level_ids').optional().isArray().withMessage('level_ids phải là mảng'),
		body('deadlines').optional().isArray({ max: 9 }).withMessage('Tối đa 9 mốc thời gian'),
	],
	validate,
	roundCtrl.createOne,
);

/**
 * @swagger
 * /research-rounds/{id}:
 *   get:
 *     summary: Lấy chi tiết đợt nghiên cứu
 *     tags: [ResearchRounds]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         example: "DOT20241"
 *     responses:
 *       200:
 *         description: Chi tiết đợt nghiên cứu
 *       404:
 *         description: Không tìm thấy
 *   put:
 *     summary: Cập nhật đợt nghiên cứu
 *     tags: [ResearchRounds]
 *     description: Chỉ admin và manager mới có quyền
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
 *               status:
 *                 type: string
 *                 enum: [draft, open, closed]
 *               start_date:
 *                 type: string
 *                 format: date
 *               end_date:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *   delete:
 *     summary: Xoá đợt nghiên cứu
 *     tags: [ResearchRounds]
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
router.get(
	'/research-rounds/:id',
	authenticate,
	authorizePermission(['rounds', 'read']),
	roundCtrl.getById,
);
router.put(
	'/research-rounds/:id',
	authenticate,
	authorizePermission(['rounds', 'update']),
	[
		// Chấp nhận cả từ vựng phía FE ('active') lẫn DB ('open'); service tự quy đổi.
		body('status').optional().isIn(['draft', 'active', 'open', 'closed', 'cancelled']),
		body('round_type_id')
			.optional()
			.matches(/^RT\d{2}$/)
			.withMessage('Loại đợt không hợp lệ'),
		body('start_date').optional().notEmpty(),
		body('end_date').optional().notEmpty(),
		body('level_ids').optional().isArray().withMessage('level_ids phải là mảng'),
	],
	validate,
	roundCtrl.updateOne,
);
router.delete(
	'/research-rounds/:id',
	authenticate,
	authorizePermission(['rounds', 'delete']),
	roundCtrl.removeOne,
);

// ─── Round Deadlines ──────────────────────────────────────────────────────────
router.get(
	'/research-rounds/:id/deadlines',
	authenticate,
	authorizePermission(['rounds', 'read']),
	asyncHandler(async (req, res) => {
		return success(res, await deadlineSvc.getByRoundId(req.params.id));
	}),
);

router.post(
	'/research-rounds/:id/deadlines/:phase',
	authenticate,
	authorizePermission(['rounds', 'update']),
	[
		body('name').notEmpty().withMessage('Tên hạn nộp không được để trống'),
		body('deadline_date').notEmpty().withMessage('Ngày hạn nộp không được để trống'),
	],
	validate,
	asyncHandler(async (req, res) => {
		const phase = parseInt(req.params.phase, 10);
		if (isNaN(phase) || phase < 1 || phase > 9)
			return res.status(400).json({ success: false, message: 'Phase phải từ 1–9' });
		const item = await deadlineSvc.upsert(req.params.id, phase, req.body, req.user.id);
		return created(res, item, 'Lưu hạn nộp thành công');
	}),
);

router.delete(
	'/research-rounds/:id/deadlines/:phase',
	authenticate,
	authorizePermission(['rounds', 'update']),
	asyncHandler(async (req, res) => {
		const phase = parseInt(req.params.phase, 10);
		await deadlineSvc.remove(req.params.id, phase, req.user.id);
		return success(res, null, 'Xoá hạn nộp thành công');
	}),
);

module.exports = router;
