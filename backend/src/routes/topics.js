const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('../controllers/topicController');
const exportCtrl = require('../controllers/topicExportController');
const fullExportCtrl = require('../controllers/topicFullExportController');
const fileCtrl = require('../controllers/fileController');
const { authenticate, authorizePermission } = require('../middlewares/auth');
const { validate } = require('../middlewares/errorHandler');
const upload = require('../middlewares/upload');

router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Topics
 *   description: Quản lý đề tài nghiên cứu
 */

/**
 * @swagger
 * /topics:
 *   get:
 *     summary: Lấy danh sách đề tài
 *     tags: [Topics]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, example: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, example: 20 }
 *       - in: query
 *         name: round_id
 *         schema: { type: string, example: "DOT20241" }
 *       - in: query
 *         name: year
 *         schema: { type: integer, example: 2026 }
 *     responses:
 *       200:
 *         description: Danh sách đề tài
 */
router.get('/', authorizePermission(['topics', 'read']), ctrl.getAll);

/**
 * @swagger
 * /topics/export-data:
 *   post:
 *     summary: Lấy dữ liệu xuất Excel (đề tài + thành viên trong một lần gọi)
 *     tags: [Topics]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ids]
 *             properties:
 *               ids:
 *                 type: array
 *                 items: { type: string }
 *                 example: ["DT001", "DT002"]
 *     responses:
 *       200:
 *         description: Danh sách đề tài kèm thành viên
 */
router.post('/export-data', authorizePermission(['reports', 'create']), [body('ids').isArray()], validate, ctrl.exportData);

/**
 * @swagger
 * /topics/export-excel:
 *   post:
 *     summary: Xuất Excel đề tài (server-side, trả về file .xlsx)
 *     tags: [Topics]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ids]
 *             properties:
 *               ids:
 *                 type: array
 *                 items: { type: string }
 *               fileName:     { type: string, example: "lich-bao-ve-2026" }
 *               customTitle:  { type: string }
 *               customSubtitle: { type: string }
 *               refNumber:    { type: string }
 *               refDate:      { type: string }
 *     responses:
 *       200:
 *         description: File Excel .xlsx
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 */
router.post(
	'/export-excel',
	authorizePermission(['reports', 'create']),
	[body('ids').isArray()],
	validate,
	exportCtrl.exportExcel,
);

/**
 * @swagger
 * /topics/export-report:
 *   post:
 *     summary: Xuất báo cáo NCKH đầy đủ (nhiều sheet — tổng quan, danh sách, thành viên, theo phân loại)
 *     tags: [Topics]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ids]
 *             properties:
 *               ids:        { type: array, items: { type: string } }
 *               fileName:   { type: string, example: "bao-cao-nckh-2026" }
 *               title:      { type: string }
 *               subtitle:   { type: string }
 *               refNumber:  { type: string }
 *               refDate:    { type: string }
 *               sections:
 *                 type: array
 *                 items: { type: string, enum: [overview, topics, members, by_category] }
 *     responses:
 *       200:
 *         description: File Excel .xlsx nhiều sheet
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema: { type: string, format: binary }
 */
router.post(
	'/export-report',
	authorizePermission(['reports', 'create']),
	[body('ids').isArray()],
	validate,
	fullExportCtrl.exportReport,
);

/**
 * @swagger
 * /topics/{id}:
 *   get:
 *     summary: Lấy chi tiết một đề tài
 *     tags: [Topics]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Chi tiết đề tài
 *       404:
 *         description: Không tìm thấy đề tài
 */
router.get('/:id', authorizePermission(['topics', 'read']), ctrl.getById);

/**
 * @swagger
 * /topics:
 *   post:
 *     summary: Tạo đề tài mới
 *     tags: [Topics]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, round_id]
 *             properties:
 *               title:
 *                 type: string
 *                 example: "Nghiên cứu ứng dụng AI trong chẩn đoán ảnh y tế"
 *               round_id:
 *                 type: string
 *                 example: "DOT20241"
 *     responses:
 *       201:
 *         description: Tạo đề tài thành công
 */
router.post(
	'/',
	authorizePermission(['topics', 'create']),
	[
		body('title').notEmpty(),
		body('round_id').notEmpty(),
		body('article_type').optional().isIn(['de_tai', 'bai_bao']),
		body('publish_date').optional({ checkFalsy: true }).isISO8601(),
		body('budget_estimated').optional({ checkFalsy: true }).isFloat({ min: 0 }),
	],
	validate,
	ctrl.createOne,
);

/**
 * @swagger
 * /topics/{id}:
 *   put:
 *     summary: Cập nhật đề tài
 *     tags: [Topics]
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
 *               title:
 *                 type: string
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 */
router.put(
	'/:id',
	authorizePermission(['topics', 'update']),
	[
		body('title').optional().notEmpty(),
		body('status')
			.optional()
			.isIn(['submitted', 'approved', 'rejected', 'supplement', 'cancelled']),
		body('article_type').optional().isIn(['de_tai', 'bai_bao']),
		body('publish_date').optional({ checkFalsy: true }).isISO8601(),
		body('budget_estimated').optional({ checkFalsy: true }).isFloat({ min: 0 }),
		body('budget_actual').optional({ checkFalsy: true }).isFloat({ min: 0 }),
		body('approval_decision_date').optional({ checkFalsy: true }).isISO8601(),
		body('recognition_decision_date').optional({ checkFalsy: true }).isISO8601(),
		body('is_featured').optional().isBoolean(),
	],
	validate,
	ctrl.updateOne,
);

/**
 * @swagger
 * /topics/{id}:
 *   delete:
 *     summary: Xoá đề tài
 *     tags: [Topics]
 *     description: Chỉ admin và manager mới có quyền
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Xoá thành công
 *       403:
 *         description: Không có quyền
 */
router.delete('/:id', authorizePermission(['topics', 'delete']), ctrl.removeOne);

/**
 * @swagger
 * /topics/{id}/members:
 *   get:
 *     summary: Lấy danh sách thành viên của đề tài
 *     tags: [Topics]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Danh sách thành viên
 */
router.get('/:id/members', authorizePermission(['topics', 'read']), ctrl.getMembers);

/**
 * @swagger
 * /topics/{id}/members:
 *   post:
 *     summary: Thêm thành viên vào đề tài
 *     tags: [Topics]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ho_ten, email]
 *             properties:
 *               ho_ten:
 *                 type: string
 *                 example: "Trần Thị B"
 *               email:
 *                 type: string
 *                 example: "b.tran@hospital.vn"
 *               role:
 *                 type: string
 *                 enum: [leader, secretary, member]
 *                 example: "member"
 *     responses:
 *       201:
 *         description: Thêm thành viên thành công
 */
router.post(
	'/:id/members',
	authorizePermission(['topics', 'update']),
	[
		body('ho_ten').notEmpty(),
		body('email').optional({ checkFalsy: true }).isEmail(),
		body('role').optional().isIn(['leader', 'secretary', 'member']),
	],
	validate,
	ctrl.addMember,
);

/**
 * @swagger
 * /topics/{id}/members/{member_id}:
 *   put:
 *     summary: Cập nhật thông tin thành viên
 *     tags: [Topics]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: member_id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ho_ten: { type: string }
 *               email: { type: string }
 *               role:
 *                 type: string
 *                 enum: [leader, secretary, member]
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 */
router.put(
	'/:id/members/:member_id',
	authorizePermission(['topics', 'update']),
	[
		body('ho_ten').optional().notEmpty(),
		body('email').optional().isEmail(),
		body('role').optional().isIn(['leader', 'secretary', 'member']),
	],
	validate,
	ctrl.updateMember,
);

/**
 * @swagger
 * /topics/{id}/members/{member_id}:
 *   delete:
 *     summary: Xoá thành viên khỏi đề tài
 *     tags: [Topics]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: member_id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Xoá thành viên thành công
 */
router.delete('/:id/members/:member_id', authorizePermission(['topics', 'update']), ctrl.deleteMember);

/**
 * @swagger
 * /topics/{id}/members/grant-accounts:
 *   post:
 *     summary: Cấp tài khoản cho các thành viên
 *     tags: [Topics]
 *     description: Chỉ admin và manager mới có quyền
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [member_ids]
 *             properties:
 *               member_ids:
 *                 type: array
 *                 items: { type: string }
 *                 example: ["MEM001", "MEM002"]
 *     responses:
 *       200:
 *         description: Cấp tài khoản thành công
 */
router.post(
	'/:id/members/grant-accounts',
	authorizePermission(['topics', 'update']),
	ctrl.grantAccounts,
);

/**
 * @swagger
 * /topics/{id}/submit:
 *   post:
 *     summary: Nộp đề tài để xét duyệt
 *     tags: [Topics]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Nộp đề tài thành công
 */
router.post('/:id/submit', authorizePermission(['topics', 'update']), ctrl.submit);

/**
 * @swagger
 * /topics/{id}/approvals:
 *   get:
 *     summary: Lấy lịch sử xét duyệt của đề tài
 *     tags: [Topics]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Danh sách lịch sử xét duyệt
 */
router.get('/:id/approvals', authorizePermission(['topics', 'read']), ctrl.getApprovals);

/**
 * @swagger
 * /topics/{id}/approve:
 *   post:
 *     summary: Duyệt hoặc từ chối đề tài
 *     tags: [Topics]
 *     description: Chỉ admin và manager mới có quyền
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [approved, rejected, supplement]
 *                 example: "approved"
 *     responses:
 *       200:
 *         description: Xét duyệt thành công
 *       403:
 *         description: Không có quyền
 */
router.post(
	'/:id/approve',
	authorizePermission(['topics', 'approve']),
	[body('status').isIn(['approved', 'rejected', 'supplement'])],
	validate,
	ctrl.approve,
);

/**
 * @swagger
 * /topics/{topic_id}/files:
 *   get:
 *     summary: Lấy danh sách file của đề tài
 *     tags: [Topics]
 *     parameters:
 *       - in: path
 *         name: topic_id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Danh sách file
 */
router.get('/:topic_id/files', authorizePermission(['files', 'read']), fileCtrl.getByTopic);

/**
 * @swagger
 * /topics/{topic_id}/files/batches:
 *   get:
 *     summary: Lấy danh sách batch upload của đề tài
 *     tags: [Topics]
 *     parameters:
 *       - in: path
 *         name: topic_id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Danh sách batch
 */
router.get('/:topic_id/files/batches', authorizePermission(['files', 'read']), fileCtrl.getBatches);

/**
 * @swagger
 * /topics/{topic_id}/files:
 *   post:
 *     summary: Upload file cho đề tài
 *     tags: [Topics]
 *     parameters:
 *       - in: path
 *         name: topic_id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [files]
 *             properties:
 *               files:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [file_name, file_url]
 *                   properties:
 *                     file_name: { type: string, example: "bao_cao.pdf" }
 *                     file_url: { type: string, example: "https://storage.example.com/bao_cao.pdf" }
 *     responses:
 *       201:
 *         description: Upload thành công
 */
router.post('/:topic_id/files', authorizePermission(['files', 'create']), fileCtrl.checkUploadWindow, upload.array('files', 30), fileCtrl.upload);

// ─── Đồng tác giả (bài báo/tập san) ──────────────────────────────────────────
router.get('/:id/authors', authorizePermission(['topics', 'read']), ctrl.getAuthors);
router.put(
	'/:id/authors',
	authorizePermission(['topics', 'update']),
	[body('authors').isArray().withMessage('authors phải là mảng')],
	validate,
	ctrl.setAuthors,
);

module.exports = router;
