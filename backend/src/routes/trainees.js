const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('../controllers/traineeController');
const { authenticate, authorizePermission } = require('../middlewares/auth');
const { validate } = require('../middlewares/errorHandler');
const { createTrainingUpload } = require('../middlewares/uploadTraining');

const uploadTraineeDoc = createTrainingUpload('trainee_document');
const uploadExcel = require('../middlewares/uploadExcel');

/**
 * @swagger
 * tags:
 *   name: Trainees
 *   description: Quản lý học viên (module Đào tạo)
 */

router.use(authenticate);

/**
 * @swagger
 * /trainees:
 *   get:
 *     summary: Danh sách học viên
 *     tags: [Trainees]
 *     responses:
 *       200:
 *         description: Danh sách học viên (CCCD bị che nếu không có quyền trainees:read_sensitive)
 */
router.get('/', authorizePermission(['trainees', 'read']), ctrl.getAll);

/**
 * @swagger
 * /trainees/import-excel:
 *   post:
 *     summary: Nhập danh sách học viên hàng loạt từ file Excel (tự dò tiêu đề cột)
 *     tags: [Trainees]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file: { type: string, format: binary }
 *               dry_run: { type: string, example: "1" }
 *     responses:
 *       200:
 *         description: "dry_run: { rows[], summary, warnings[] }; commit: { inserted, warnings[] }"
 */
router.post(
	'/import-excel',
	authorizePermission(['trainees', 'import']),
	uploadExcel.single('file'),
	ctrl.importExcel,
);

/**
 * @swagger
 * /trainees/grant-accounts:
 *   post:
 *     summary: Cấp tài khoản đăng nhập cho học viên (mật khẩu tạm ngẫu nhiên, bắt đổi ở lần đăng nhập đầu)
 *     tags: [Trainees]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               trainee_ids:
 *                 type: array
 *                 items: { type: string }
 *                 description: Bỏ trống = cấp cho mọi học viên chưa có tài khoản
 *     responses:
 *       200:
 *         description: Cấp tài khoản thành công (kèm danh sách bị bỏ qua nếu có lỗi)
 */
router.post('/grant-accounts', authorizePermission(['trainees', 'manage']), ctrl.grantAccounts);

/**
 * @swagger
 * /trainees/{id}:
 *   get:
 *     summary: Chi tiết học viên
 *     tags: [Trainees]
 */
router.get('/:id', authorizePermission(['trainees', 'read']), ctrl.getById);

/**
 * @swagger
 * /trainees:
 *   post:
 *     summary: Tạo học viên mới
 *     tags: [Trainees]
 */
router.post(
	'/',
	authorizePermission(['trainees', 'create']),
	[
		body('full_name').trim().notEmpty().withMessage('Họ tên không được để trống'),
		body('email').optional({ checkFalsy: true }).isEmail().withMessage('Email không hợp lệ'),
		body('dob').optional({ checkFalsy: true }).isISO8601(),
	],
	validate,
	ctrl.createOne,
);

/**
 * @swagger
 * /trainees/{id}:
 *   put:
 *     summary: Cập nhật học viên
 *     tags: [Trainees]
 */
router.put(
	'/:id',
	authorizePermission(['trainees', 'update']),
	[
		body('full_name').optional().trim().notEmpty(),
		body('email').optional({ checkFalsy: true }).isEmail().withMessage('Email không hợp lệ'),
		body('dob').optional({ checkFalsy: true }).isISO8601(),
	],
	validate,
	ctrl.updateOne,
);

/**
 * @swagger
 * /trainees/{id}:
 *   delete:
 *     summary: Xoá học viên
 *     tags: [Trainees]
 */
router.delete('/:id', authorizePermission(['trainees', 'delete']), ctrl.removeOne);

/**
 * @swagger
 * /trainees/{id}/enrollments:
 *   get:
 *     summary: Danh sách khóa học / chương trình đào tạo học viên đã đăng ký
 *     tags: [Trainees]
 */
router.get('/:id/enrollments', authorizePermission(['trainees', 'read']), ctrl.listEnrollments);

/**
 * @swagger
 * /trainees/{id}/documents:
 *   get:
 *     summary: Hồ sơ đính kèm của học viên (CCCD, bằng cấp...) — dữ liệu nhạy cảm
 *     tags: [Trainees]
 *   post:
 *     summary: Tải lên hồ sơ học viên
 *     tags: [Trainees]
 */
router.get(
	'/:id/documents',
	authorizePermission(['trainees', 'read_sensitive']),
	ctrl.listDocuments,
);
router.post(
	'/:id/documents',
	authorizePermission(['trainees', 'update']),
	uploadTraineeDoc.single('file'),
	ctrl.addDocument,
);
router.delete(
	'/documents/:docId',
	authorizePermission(['trainees', 'update']),
	ctrl.removeDocument,
);

module.exports = router;
