const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('./surveyController');
const { authenticate, authorizePermission } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/errorHandler');

/**
 * @swagger
 * tags:
 *   name: Surveys
 *   description: Khảo sát — admin tạo/quản lý, người dùng đã đăng nhập nộp phản hồi
 */

router.use(authenticate);

// ─── Người dùng: khảo sát đang mở dành cho mình + nộp phản hồi ──────────────
// Đặt TRƯỚC các route quản trị bên dưới (đều yêu cầu quyền 'surveys:manage')
// để mọi tài khoản hợp lệ dùng được, không cần quyền quản trị.
router.get('/active', ctrl.listActiveForUser);
router.get('/:id/respond', ctrl.getForRespond);
router.post(
	'/:id/respond',
	[body('answers').isArray().withMessage('answers phải là mảng')],
	validate,
	ctrl.submitResponse,
);

// ─── Quản trị (admin) ────────────────────────────────────────────────────────
router.get('/', authorizePermission(['surveys', 'manage']), ctrl.getAll);
router.get('/:id', authorizePermission(['surveys', 'manage']), ctrl.getById);
router.get('/:id/results', authorizePermission(['surveys', 'manage']), ctrl.getResults);

router.post(
	'/',
	authorizePermission(['surveys', 'manage']),
	[
		body('title').trim().notEmpty().withMessage('Tên khảo sát không được để trống'),
		body('status').optional().isIn(['draft', 'active', 'closed']),
		body('questions').optional().isArray(),
	],
	validate,
	ctrl.createOne,
);

router.put(
	'/:id',
	authorizePermission(['surveys', 'manage']),
	[
		body('title').optional().trim().notEmpty(),
		body('status').optional().isIn(['draft', 'active', 'closed']),
		body('questions').optional().isArray(),
	],
	validate,
	ctrl.updateOne,
);

router.delete('/:id', authorizePermission(['surveys', 'manage']), ctrl.removeOne);

module.exports = router;
