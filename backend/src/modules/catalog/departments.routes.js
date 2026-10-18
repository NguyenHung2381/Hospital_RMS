const router = require('express').Router();
const { body } = require('express-validator');
const { authenticate, authorizePermission } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/errorHandler');
const { success, created, notFound } = require('../../utils/response');
const { asyncHandler } = require('../../utils/asyncHandler');
const deptService = require('./departmentService');

// ─── Departments ──────────────────────────────────────────────────────────────

/**
 * @swagger
 * /departments:
 *   get:
 *     summary: Lấy danh sách khoa
 *     tags: [Departments]
 *     responses:
 *       200:
 *         description: Danh sách khoa
 *   post:
 *     summary: Tạo khoa mới
 *     tags: [Departments]
 *     description: Chỉ admin mới có quyền
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, code, abbreviation]
 *             properties:
 *               name: { type: string, example: "Khoa Nội tổng hợp" }
 *               code: { type: string, example: "NTTQ" }
 *               abbreviation: { type: string, example: "NTH" }
 *     responses:
 *       201:
 *         description: Tạo thành công
 *       403:
 *         description: Không có quyền
 */
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

/**
 * @swagger
 * /departments/{id}:
 *   get:
 *     summary: Lấy chi tiết khoa
 *     tags: [Departments]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         example: "DVNTTQ"
 *     responses:
 *       200:
 *         description: Chi tiết khoa
 *       404:
 *         description: Không tìm thấy
 *   put:
 *     summary: Cập nhật khoa
 *     tags: [Departments]
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
 *               code: { type: string }
 *               abbreviation: { type: string }
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *   delete:
 *     summary: Xoá khoa
 *     tags: [Departments]
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
