const router = require('express').Router();
const { body } = require('express-validator');
const { createCrudService } = require('../services/crudService');
const { createCrudController } = require('../controllers/crudController');
const { authenticate, authorizePermission } = require('../middlewares/auth');
const { validate } = require('../middlewares/errorHandler');
const roundCtrl    = require('../controllers/roundController');
const deadlineSvc  = require('../services/deadlineService');
const deptService = require('../services/departmentService');
const extReviewerService = require('../services/externalReviewerService');
const permService = require('../services/permissionService');
const { success, created, notFound } = require('../utils/response');

/**
 * @swagger
 * tags:
 *   - name: Departments
 *     description: Quản lý phòng ban
 *   - name: Categories
 *     description: Quản lý danh mục
 *   - name: Levels
 *     description: Quản lý cấp độ
 *   - name: Roles
 *     description: Quản lý vai trò
 *   - name: ResearchRounds
 *     description: Quản lý đợt nghiên cứu
 */

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
router.get('/departments', authenticate, authorizePermission(['departments', 'read']), async (req, res, next) => {
  try { return success(res, await deptService.getAll(req.query)); } catch (e) { next(e); }
});

router.post(
  '/departments',
  authenticate,
  authorizePermission(['departments', 'create']),
  [body('name').notEmpty(), body('code').notEmpty(), body('abbreviation').notEmpty()],
  validate,
  async (req, res, next) => {
    try { return created(res, await deptService.create(req.body, req.user.id)); } catch (e) { next(e); }
  },
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
router.get('/departments/:id', authenticate, async (req, res, next) => {
  try {
    const item = await deptService.getById(req.params.id);
    if (!item) return notFound(res);
    return success(res, item);
  } catch (e) { next(e); }
});

router.put(
  '/departments/:id',
  authenticate,
  authorizePermission(['departments', 'update']),
  async (req, res, next) => {
    try {
      const item = await deptService.update(req.params.id, req.body, req.user.id);
      if (!item) return notFound(res);
      return success(res, item, 'Cập nhật thành công');
    } catch (e) { next(e); }
  },
);

router.delete('/departments/:id', authenticate, authorizePermission(['departments', 'delete']), async (req, res, next) => {
  try { await deptService.remove(req.params.id, req.user.id); return success(res, null, 'Xóa thành công'); } catch (e) { next(e); }
});

// ─── External Reviewers (người ngoài viện tham gia hội đồng) ──────────────────

/**
 * @swagger
 * /external-reviewers:
 *   get:
 *     summary: Lấy danh sách người ngoài viện tham gia hội đồng
 *     tags: [Councils]
 *     responses:
 *       200:
 *         description: Danh sách người ngoài viện
 *   post:
 *     summary: Thêm người ngoài viện mới
 *     tags: [Councils]
 *     description: Chỉ admin mới có quyền
 *     responses:
 *       201:
 *         description: Tạo thành công
 */
router.get('/external-reviewers', authenticate, authorizePermission(['councils', 'read']), async (req, res, next) => {
  try { return success(res, await extReviewerService.getAll(req.query)); } catch (e) { next(e); }
});

router.post(
  '/external-reviewers',
  authenticate,
  authorizePermission(['councils', 'create']),
  [body('full_name').notEmpty().withMessage('Họ tên không được để trống')],
  validate,
  async (req, res, next) => {
    try { return created(res, await extReviewerService.create(req.body, req.user.id)); } catch (e) { next(e); }
  },
);

router.put(
  '/external-reviewers/:id',
  authenticate,
  authorizePermission(['councils', 'update']),
  async (req, res, next) => {
    try {
      const item = await extReviewerService.update(req.params.id, req.body);
      if (!item) return notFound(res);
      return success(res, item, 'Cập nhật thành công');
    } catch (e) { next(e); }
  },
);

router.delete('/external-reviewers/:id', authenticate, authorizePermission(['councils', 'delete']), async (req, res, next) => {
  try { await extReviewerService.remove(req.params.id); return success(res, null, 'Xóa thành công'); } catch (e) { next(e); }
});

// Constraint CHK_cat_id yêu cầu id LIKE 'LDT[0-9][0-9]' → LDT01, LDT02, ...
// crudService dùng NEWID() (hex) nên phải override hàm create riêng.
const _catBase = createCrudService('categories', 5, 'LDT');
const catService = {
	..._catBase,
	create: async (data, actorId) => {
		const pool = await getPool();
		const result = await pool
			.request()
			.input('actor_id', sql.VarChar(20), actorId)
			.input('name', sql.NVarChar(500), data.name)
			.input('description', sql.NVarChar(sql.MAX), data.description || null)
			.input('abbr', sql.VarChar(10), data.abbr || null)
			.query(`
				DECLARE @seq INT;
				SELECT @seq = ISNULL(MAX(CAST(RIGHT(id, 2) AS INT)), 0) + 1
				FROM categories
				WHERE id LIKE 'LDT[0-9][0-9]';
				IF @seq > 99 THROW 50001, N'Đã đạt giới hạn 99 danh mục', 1;
				DECLARE @new_id VARCHAR(5) = 'LDT' + RIGHT('0' + CAST(@seq AS VARCHAR(2)), 2);
				EXEC sp_set_actor @actor_id;
				INSERT INTO categories (id, name, description, abbr, created_by)
				VALUES (@new_id, @name, @description, @abbr, @actor_id);
				SELECT * FROM categories WHERE id = @new_id;
			`);
		broadcast('update', { entity: 'category' });
		return result.recordset[0];
	},
};
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
router.post('/categories', authenticate, authorizePermission(['catalog', 'manage']), catCtrl.createOne);

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
	authorizePermission(['catalog', 'manage']),
	catCtrl.updateOne,
);
router.delete(
	'/categories/:id',
	authenticate,
	authorizePermission(['catalog', 'manage']),
	catCtrl.removeOne,
);

// ─── Levels ───────────────────────────────────────────────────────────────────
// Constraint CHK_lv_id yêu cầu id LIKE 'CD[0-9][0-9]' → CD01, CD02, ...
// crudService dùng NEWID() (hex) nên phải override hàm create riêng.
const { getPool, sql } = require('../config/db');
const { broadcast } = require('../services/eventService');

const _lvlBase = createCrudService('levels', 4, 'CD');
const lvlService = {
	..._lvlBase,
	create: async (data, actorId) => {
		const pool = await getPool();
		const result = await pool
			.request()
			.input('actor_id', sql.VarChar(20), actorId)
			.input('name', sql.NVarChar(500), data.name)
			.input('description', sql.NVarChar(sql.MAX), data.description || null)
			.query(`
				DECLARE @seq INT;
				SELECT @seq = ISNULL(MAX(CAST(RIGHT(id, 2) AS INT)), 0) + 1
				FROM levels
				WHERE id LIKE 'CD[0-9][0-9]';
				IF @seq > 99 THROW 50001, 'Đã đạt giới hạn 99 cấp độ', 1;
				DECLARE @new_id VARCHAR(4) = 'CD' + RIGHT('0' + CAST(@seq AS VARCHAR(2)), 2);
				EXEC sp_set_actor @actor_id;
				INSERT INTO levels (id, name, description, created_by)
				VALUES (@new_id, @name, @description, @actor_id);
				SELECT * FROM levels WHERE id = @new_id;
			`);
		broadcast('update', { entity: 'level' });
		return result.recordset[0];
	},
};
const lvlCtrl = createCrudController(lvlService);

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
router.get('/levels', authenticate, lvlCtrl.getAll);
router.post('/levels', authenticate, authorizePermission(['catalog', 'manage']), lvlCtrl.createOne);

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
router.put('/levels/:id', authenticate, authorizePermission(['catalog', 'manage']), lvlCtrl.updateOne);
router.delete(
	'/levels/:id',
	authenticate,
	authorizePermission(['catalog', 'manage']),
	lvlCtrl.removeOne,
);

// ─── Round Types ──────────────────────────────────────────────────────────────
// Constraint CHK_round_types_id yêu cầu id LIKE 'RT[0-9][0-9]' → RT01, RT02, ...
// crudService mặc định dùng NEWID() (hex) nên override hàm create riêng.
const _rtBase = createCrudService('round_types', 6, 'RT');
const rtService = {
	..._rtBase,
	create: async (data, actorId) => {
		const pool = await getPool();
		const result = await pool
			.request()
			.input('actor_id', sql.VarChar(20), actorId)
			.input('name', sql.NVarChar(500), data.name)
			.input('description', sql.NVarChar(sql.MAX), data.description || null)
			.query(`
				DECLARE @seq INT;
				SELECT @seq = ISNULL(MAX(CAST(RIGHT(id, 2) AS INT)), 0) + 1
				FROM round_types
				WHERE id LIKE 'RT[0-9][0-9]';
				IF @seq > 99 THROW 50002, 'Đã đạt giới hạn 99 loại đợt', 1;
				DECLARE @new_id VARCHAR(6) = 'RT' + RIGHT('0' + CAST(@seq AS VARCHAR(2)), 2);
				EXEC sp_set_actor @actor_id;
				INSERT INTO round_types (id, name, description, created_by)
				VALUES (@new_id, @name, @description, @actor_id);
				SELECT * FROM round_types WHERE id = @new_id;
			`);
		broadcast('update', { entity: 'round_type' });
		return result.recordset[0];
	},
};
const rtCtrl = createCrudController(rtService);

/**
 * @swagger
 * /round-types:
 *   get:
 *     summary: Lấy danh sách loại đợt nghiên cứu
 *     tags: [ResearchRounds]
 *     responses:
 *       200:
 *         description: Danh sách loại đợt
 *   post:
 *     summary: Tạo loại đợt mới
 *     tags: [ResearchRounds]
 *     description: Chỉ admin mới có quyền
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, example: "Nghiên cứu khoa học" }
 *               description: { type: string }
 *     responses:
 *       201:
 *         description: Tạo thành công
 */
router.get('/round-types', authenticate, rtCtrl.getAll);
router.post(
	'/round-types',
	authenticate,
	authorizePermission(['catalog', 'manage']),
	[body('name').trim().notEmpty().withMessage('Tên loại đợt không được để trống')],
	validate,
	rtCtrl.createOne,
);

/**
 * @swagger
 * /round-types/{id}:
 *   get:
 *     summary: Lấy chi tiết loại đợt
 *     tags: [ResearchRounds]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *   put:
 *     summary: Cập nhật loại đợt
 *     tags: [ResearchRounds]
 *     description: Chỉ admin mới có quyền
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *   delete:
 *     summary: Xoá loại đợt
 *     tags: [ResearchRounds]
 *     description: Chỉ admin mới có quyền. Không xoá được khi còn đợt đang dùng.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 */
router.get('/round-types/:id', authenticate, rtCtrl.getById);
router.put('/round-types/:id', authenticate, authorizePermission(['catalog', 'manage']), rtCtrl.updateOne);
router.delete('/round-types/:id', authenticate, authorizePermission(['catalog', 'manage']), rtCtrl.removeOne);

// ─── Roles ────────────────────────────────────────────────────────────────────
const roleService = require('../services/roleService');
const roleCtrl = createCrudController(roleService);

/**
 * @swagger
 * /roles:
 *   get:
 *     summary: Lấy danh sách vai trò
 *     tags: [Roles]
 *     responses:
 *       200:
 *         description: Danh sách vai trò
 *   post:
 *     summary: Tạo vai trò mới
 *     tags: [Roles]
 *     description: Chỉ admin mới có quyền
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string, example: "reviewer" }
 *     responses:
 *       201:
 *         description: Tạo thành công
 */
router.get('/roles', authenticate, authorizePermission(['roles', 'read']), roleCtrl.getAll);
router.post('/roles', authenticate, authorizePermission(['roles', 'create']), roleCtrl.createOne);

/**
 * @swagger
 * /roles/{id}:
 *   get:
 *     summary: Lấy chi tiết vai trò
 *     tags: [Roles]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Chi tiết vai trò
 *   put:
 *     summary: Cập nhật vai trò
 *     tags: [Roles]
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
 *     summary: Xoá vai trò
 *     tags: [Roles]
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
router.get('/roles/:id', authenticate, authorizePermission(['roles', 'read']), roleCtrl.getById);
router.put('/roles/:id', authenticate, authorizePermission(['roles', 'update']), roleCtrl.updateOne);
router.delete('/roles/:id', authenticate, authorizePermission(['roles', 'delete']), roleCtrl.removeOne);

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
router.get('/research-rounds', authenticate, authorizePermission(['rounds', 'read']), roundCtrl.getAll);
router.post(
	'/research-rounds',
	authenticate,
	authorizePermission(['rounds', 'create']),
	[
		body('name').notEmpty().withMessage('Tên đợt không được để trống'),
		body('year')
			.isInt({ min: 2000, max: 2100 })
			.withMessage('Năm không hợp lệ'),
		body('round_number').isInt({ min: 1, max: 9 }).withMessage('Số đợt phải từ 1–9'),
		body('round_type_id')
			.trim()
			.notEmpty()
			.withMessage('Vui lòng chọn loại đợt')
			.bail()
			.matches(/^RT\d{2}$/)
			.withMessage('Loại đợt không hợp lệ'),
		body('start_date')
			.notEmpty()
			.withMessage('Ngày bắt đầu không được để trống'),
		body('end_date')
			.notEmpty()
			.withMessage('Ngày kết thúc không được để trống'),
		// Chấp nhận cả từ vựng phía FE ('active') lẫn DB ('open'); service tự quy đổi.
		body('status')
			.optional()
			.isIn(['draft', 'active', 'open', 'closed', 'cancelled']),
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
router.get('/research-rounds/:id', authenticate, authorizePermission(['rounds', 'read']), roundCtrl.getById);
router.put(
	'/research-rounds/:id',
	authenticate,
	authorizePermission(['rounds', 'update']),
	[
		// Chấp nhận cả từ vựng phía FE ('active') lẫn DB ('open'); service tự quy đổi.
		body('status')
			.optional()
			.isIn(['draft', 'active', 'open', 'closed', 'cancelled']),
		body('round_type_id')
			.optional()
			.matches(/^RT\d{2}$/)
			.withMessage('Loại đợt không hợp lệ'),
		body('start_date').optional().notEmpty(),
		body('end_date').optional().notEmpty(),
	],
	validate,
	roundCtrl.updateOne,
);
router.delete('/research-rounds/:id', authenticate, authorizePermission(['rounds', 'delete']), roundCtrl.removeOne);

// ─── Round Deadlines ──────────────────────────────────────────────────────────
router.get('/research-rounds/:id/deadlines', authenticate, authorizePermission(['rounds', 'read']), async (req, res, next) => {
  try { return success(res, await deadlineSvc.getByRoundId(req.params.id)); } catch (e) { next(e); }
});

router.post(
  '/research-rounds/:id/deadlines/:phase',
  authenticate,
  authorizePermission(['rounds', 'update']),
  [
    body('name').notEmpty().withMessage('Tên hạn nộp không được để trống'),
    body('deadline_date').notEmpty().withMessage('Ngày hạn nộp không được để trống'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const phase = parseInt(req.params.phase, 10);
      if (isNaN(phase) || phase < 1 || phase > 9) return res.status(400).json({ success: false, message: 'Phase phải từ 1–9' });
      const item = await deadlineSvc.upsert(req.params.id, phase, req.body, req.user.id);
      return created(res, item, 'Lưu hạn nộp thành công');
    } catch (e) { next(e); }
  },
);

router.delete('/research-rounds/:id/deadlines/:phase', authenticate, authorizePermission(['rounds', 'update']), async (req, res, next) => {
  try {
    const phase = parseInt(req.params.phase, 10);
    await deadlineSvc.remove(req.params.id, phase, req.user.id);
    return success(res, null, 'Xoá hạn nộp thành công');
  } catch (e) { next(e); }
});

// ─── Job titles (danh mục chỉ đọc) ─────────────────────────────────────────────
router.get('/job-titles', authenticate, async (req, res, next) => {
	try {
		const pool = await getPool();
		const r = await pool
			.request()
			.query('SELECT id, name FROM job_titles ORDER BY name');
		return success(res, r.recordset);
	} catch (e) {
		next(e);
	}
});

// ─── Permissions ──────────────────────────────────────────────────────────────
// GET /permissions — danh sách toàn bộ quyền (dùng cho ma trận phân quyền)
router.get('/permissions', authenticate, authorizePermission(['roles', 'read']), async (req, res, next) => {
  try { return success(res, await permService.getAll()); } catch (e) { next(e); }
});

// GET /roles/:id/permissions — lấy danh sách quyền hiện tại của vai trò
router.get('/roles/:id/permissions', authenticate, authorizePermission(['roles', 'read']), async (req, res, next) => {
  try { return success(res, await permService.getRolePermissions(req.params.id)); } catch (e) { next(e); }
});

// PUT /roles/:id/permissions — cập nhật (thay thế toàn bộ) quyền của vai trò
router.put(
  '/roles/:id/permissions',
  authenticate,
  authorizePermission(['roles', 'manage']),
  [body('permission_ids').isArray()],
  validate,
  async (req, res, next) => {
    try {
      const result = await permService.setRolePermissions(
        req.params.id,
        req.body.permission_ids,
        req.user.id,
      );
      return success(res, result, 'Cập nhật phân quyền thành công');
    } catch (e) { next(e); }
  },
);

module.exports = router;
