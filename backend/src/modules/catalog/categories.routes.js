const router = require('express').Router();
const { createCrudController } = require('../../shared/crudController');
const { authenticate, authorizePermission } = require('../../middlewares/auth');

const catService = require('./categoryService');
const catCtrl = createCrudController(catService);

/**
 * @swagger
 * /categories:
 *   get:
 *     summary: Lấy danh sách danh mục
 *     tags: [Categories]
 *     responses:
 *       200:
 *         description: Danh sách danh mục
 *   post:
 *     summary: Tạo danh mục mới
 *     tags: [Categories]
 *     description: Chỉ admin mới có quyền
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string, example: "Nghiên cứu lâm sàng" }
 *     responses:
 *       201:
 *         description: Tạo thành công
 */
router.get('/categories', authenticate, catCtrl.getAll);
router.post(
	'/categories',
	authenticate,
	authorizePermission(['catalog', 'create']),
	catCtrl.createOne,
);

/**
 * @swagger
 * /categories/{id}:
 *   get:
 *     summary: Lấy chi tiết danh mục
 *     tags: [Categories]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Chi tiết danh mục
 *   put:
 *     summary: Cập nhật danh mục
 *     tags: [Categories]
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
 *     summary: Xoá danh mục
 *     tags: [Categories]
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
router.get('/categories/:id', authenticate, catCtrl.getById);
router.put(
	'/categories/:id',
	authenticate,
	authorizePermission(['catalog', 'update']),
	catCtrl.updateOne,
);
router.delete(
	'/categories/:id',
	authenticate,
	authorizePermission(['catalog', 'delete']),
	catCtrl.removeOne,
);

module.exports = router;
