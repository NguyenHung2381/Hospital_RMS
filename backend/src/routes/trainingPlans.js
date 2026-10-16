const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('../controllers/trainingPlanController');
const { authenticate, authorizePermission } = require('../middlewares/auth');
const { validate } = require('../middlewares/errorHandler');

/**
 * @swagger
 * tags:
 *   name: TrainingPlans
 *   description: Kế hoạch đào tạo theo năm (module Đào tạo)
 */

// Chỉ 1 quyền 'manage' cho toàn bộ resource — theo mẫu system_settings, đây là
// công cụ lập kế hoạch nội bộ, không phải danh mục CRUD công khai.
router.use(authenticate, authorizePermission(['training_plans', 'manage']));

router.get('/', ctrl.getAll);
// Hạng mục để gắn khóa học (form khóa học) — khai báo trước '/:id'
router.get('/item-options', ctrl.listItemOptions);
router.get('/:id', ctrl.getById);

router.post(
	'/',
	[
		body('title').trim().notEmpty().withMessage('Tên kế hoạch không được để trống'),
		body('year').isInt({ min: 2000, max: 2100 }).withMessage('Năm không hợp lệ'),
		body('status').optional().isIn(['draft', 'active', 'completed', 'cancelled']),
		body('items').optional().isArray(),
	],
	validate,
	ctrl.createOne,
);

router.put(
	'/:id',
	[
		body('title').optional().trim().notEmpty(),
		body('year').optional().isInt({ min: 2000, max: 2100 }),
		body('status').optional().isIn(['draft', 'active', 'completed', 'cancelled']),
		body('items').optional().isArray(),
	],
	validate,
	ctrl.updateOne,
);

router.delete('/:id', ctrl.removeOne);

router.put('/:id/items', [body('items').isArray().withMessage('items phải là mảng')], validate, ctrl.setItems);

module.exports = router;
