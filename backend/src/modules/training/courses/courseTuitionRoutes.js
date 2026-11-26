const { body } = require('express-validator');
const tuitionCtrl = require('../tuition/tuitionController');
const { authorizePermission } = require('../../../middlewares/auth');
const { validate } = require('../../../middlewares/errorHandler');

// Học phí của khóa (training/tuition/) — gắn vào router của courses.routes.js để :id /
// :enrollmentId / :paymentId được kiểm phạm vi khóa học như các route khác (router.param).
module.exports = (router) => {
	// Service kiểm thêm lượt ghi danh / khoản nộp thuộc đúng khóa :id.
	router.get('/:id/tuition', authorizePermission(['courses', 'read']), tuitionCtrl.listForCourse);
	router.put(
		'/:id/tuition/enrollments/:enrollmentId/fee',
		authorizePermission(['courses', 'approve']),
		[
			body('base_amount')
				.optional({ values: 'null' })
				.isInt({ min: 0 })
				.withMessage('Học phí không hợp lệ'),
			body('discount_amount').isInt({ min: 0 }).withMessage('Số tiền miễn giảm không hợp lệ'),
			body('discount_reason').optional({ values: 'null' }).isString().isLength({ max: 500 }),
		],
		validate,
		tuitionCtrl.setFee,
	);
	router.post(
		'/:id/tuition/enrollments/:enrollmentId/payments',
		authorizePermission(['courses', 'approve']),
		[
			body('amount').isInt({ min: 1 }).withMessage('Số tiền phải là số nguyên dương'),
			body('method').isIn(['transfer', 'cash']).withMessage('Hình thức nộp không hợp lệ'),
			body('paid_date').isISO8601().withMessage('Ngày nộp không hợp lệ'),
			body('transfer_ref').optional({ values: 'null' }).isString().isLength({ max: 100 }),
			body('note').optional({ values: 'null' }).isString().isLength({ max: 500 }),
		],
		validate,
		tuitionCtrl.recordPayment,
	);
	router.patch(
		'/:id/tuition/payments/:paymentId/confirm',
		authorizePermission(['courses', 'approve']),
		tuitionCtrl.confirmPayment,
	);
	router.patch(
		'/:id/tuition/payments/:paymentId/reject',
		authorizePermission(['courses', 'approve']),
		[
			body('review_note')
				.isString()
				.trim()
				.isLength({ min: 1, max: 500 })
				.withMessage('Nhập lý do từ chối'),
		],
		validate,
		tuitionCtrl.rejectPayment,
	);
	router.post(
		'/:id/tuition/payments/:paymentId/receipt',
		authorizePermission(['courses', 'read']),
		tuitionCtrl.courseReceipt,
	);
};
