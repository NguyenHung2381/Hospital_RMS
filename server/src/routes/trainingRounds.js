const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('../controllers/trainingRoundController');
const { authenticate, authorizePermission } = require('../middlewares/auth');
const { validate } = require('../middlewares/errorHandler');

/**
 * @swagger
 * tags:
 *   name: TrainingRounds
 *   description: Quản lý đợt đào tạo (module Đào tạo)
 */

router.use(authenticate);

router.get('/', authorizePermission(['training_rounds', 'read']), ctrl.getAll);
router.get('/:id', authorizePermission(['training_rounds', 'read']), ctrl.getById);

router.post(
	'/',
	authorizePermission(['training_rounds', 'create']),
	[
		body('name').trim().notEmpty().withMessage('Tên đợt không được để trống'),
		body('year').isInt({ min: 2000, max: 2100 }).withMessage('Năm không hợp lệ'),
		body('start_date').notEmpty().withMessage('Ngày bắt đầu không được để trống'),
		body('end_date').notEmpty().withMessage('Ngày kết thúc không được để trống'),
		body('status').optional().isIn(['draft', 'open', 'closed']),
	],
	validate,
	ctrl.createOne,
);

router.put(
	'/:id',
	authorizePermission(['training_rounds', 'update']),
	[body('status').optional().isIn(['draft', 'open', 'closed'])],
	validate,
	ctrl.updateOne,
);

router.delete('/:id', authorizePermission(['training_rounds', 'delete']), ctrl.removeOne);

module.exports = router;
