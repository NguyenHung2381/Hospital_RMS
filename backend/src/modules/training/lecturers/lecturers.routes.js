const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('./lecturerController');
const { authenticate, authorizePermission } = require('../../../middlewares/auth');
const { validate } = require('../../../middlewares/errorHandler');

router.use(authenticate);

router.get('/', authorizePermission(['lecturers', 'read']), ctrl.getAll);
router.get('/:id', authorizePermission(['lecturers', 'read']), ctrl.getById);

router.post(
	'/',
	authorizePermission(['lecturers', 'create']),
	[
		body('full_name').trim().notEmpty().withMessage('Họ tên không được để trống'),
		body('email').optional({ checkFalsy: true }).isEmail().withMessage('Email không hợp lệ'),
	],
	validate,
	ctrl.createOne,
);

// Thêm giảng viên hàng loạt từ nhân sự (thường là người có CCHN)
router.post(
	'/from-staff',
	authorizePermission(['lecturers', 'create']),
	[body('user_ids').isArray({ min: 1, max: 200 }).withMessage('Chọn 1–200 nhân sự')],
	validate,
	ctrl.createFromStaff,
);

router.put(
	'/:id',
	authorizePermission(['lecturers', 'update']),
	[
		body('full_name').optional().trim().notEmpty(),
		body('email').optional({ checkFalsy: true }).isEmail().withMessage('Email không hợp lệ'),
	],
	validate,
	ctrl.updateOne,
);

router.delete('/:id', authorizePermission(['lecturers', 'delete']), ctrl.removeOne);

module.exports = router;
