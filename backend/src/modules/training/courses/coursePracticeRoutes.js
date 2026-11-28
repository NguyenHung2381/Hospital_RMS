// Route vòng thực hành + giấy tờ thực hành GPHN — tách khỏi courses.routes.js cho gọn.
// Đăng ký THẲNG vào router của khóa học (không dùng sub-router) để router.param kiểm
// phạm vi khóa học cho :enrollmentId / :rotationId vẫn áp dụng; gọi đúng vị trí cũ để
// giữ thứ tự route.
const { body } = require('express-validator');
const ctrl = require('./courseController');
const { authorizePermission } = require('../../../middlewares/auth');
const { validate } = require('../../../middlewares/errorHandler');

/** @param {import('express').Router} router */
module.exports = (router) => {
	// ─── Vòng thực hành GPHN (khoa, ngày, người hướng dẫn từng vòng) ───────────
	router.get(
		'/enrollments/:enrollmentId/rotations',
		authorizePermission(['courses', 'read']),
		ctrl.listRotations,
	);
	router.post(
		'/enrollments/:enrollmentId/rotations/auto',
		authorizePermission(['courses', 'update']),
		[
			body('start_date')
				.optional({ nullable: true, checkFalsy: true })
				.isISO8601()
				.withMessage('Ngày không hợp lệ'),
			body(['replace', 'carry_over']).optional().isBoolean(),
		],
		validate,
		ctrl.autoArrangeRotations,
	);
	router.post(
		'/enrollments/:enrollmentId/rotations/schedule',
		authorizePermission(['courses', 'update']),
		[body('start_date').isISO8601().withMessage('Cần ngày bắt đầu')],
		validate,
		ctrl.scheduleRotations,
	);
	router.post(
		'/enrollments/:enrollmentId/rotations/segment',
		authorizePermission(['courses', 'update']),
		[body('lesson_id').notEmpty().withMessage('Thiếu lesson_id')],
		validate,
		ctrl.addRotationSegment,
	);
	router.put(
		'/rotations/:rotationId',
		authorizePermission(['courses', 'update']),
		[
			body(['start_date', 'end_date'])
				.optional({ nullable: true, checkFalsy: true })
				.isISO8601()
				.withMessage('Ngày không hợp lệ'),
			body('result').optional().isIn(['pending', 'pass', 'fail']),
		],
		validate,
		ctrl.updateRotation,
	);
	router.post(
		'/rotations/:rotationId/refresh-mentor',
		authorizePermission(['courses', 'update']),
		ctrl.refreshRotationMentor,
	);
	router.post(
		'/rotations/:rotationId/retake',
		authorizePermission(['courses', 'update']),
		ctrl.retakeRotation,
	);
	router.post(
		'/rotations/:rotationId/move',
		authorizePermission(['courses', 'update']),
		[body('direction').isIn(['up', 'down']).withMessage('Hướng không hợp lệ')],
		validate,
		ctrl.moveRotation,
	);
	// ─── Giấy tờ thực hành GPHN (Đơn đề nghị, Hợp đồng, Phiếu nhận xét) ─────────
	router.get(
		'/enrollments/:enrollmentId/documents',
		authorizePermission(['courses', 'read']),
		ctrl.listPracticeDocuments,
	);
	// POST vì frontend tải file qua apiClient.postBlob. Giấy tờ in CCCD ⇒ controller
	// còn đòi thêm quyền trainees:read_sensitive.
	router.post(
		'/enrollments/:enrollmentId/documents',
		authorizePermission(['courses', 'update']),
		[
			body('type')
				.isIn(['don-de-nghi', 'hop-dong', 'phieu-nhan-xet'])
				.withMessage('Loại giấy tờ không hợp lệ'),
			body('sign').optional().isBoolean(),
		],
		validate,
		ctrl.downloadPracticeDocument,
	);
	router.delete(
		'/rotations/:rotationId',
		authorizePermission(['courses', 'update']),
		ctrl.removeRotation,
	);
};
