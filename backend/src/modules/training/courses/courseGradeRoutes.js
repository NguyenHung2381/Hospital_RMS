// Route điểm, giấy chứng nhận và tự cộng CME của khóa học — tách khỏi courses.routes.js
// cho gọn. Đăng ký THẲNG vào router của khóa học (không dùng sub-router) để router.param
// kiểm phạm vi khóa học cho :id / :enrollmentId / :gradeId / :certId vẫn áp dụng; gọi đúng
// vị trí cũ để giữ thứ tự route.
const { body } = require('express-validator');
const ctrl = require('./courseController');
const cmeCtrl = require('./courseCmeController');
const { authorizePermission } = require('../../../middlewares/auth');
const { validate } = require('../../../middlewares/errorHandler');

/** @param {import('express').Router} router */
module.exports = (router) => {
	// ─── Grades ─────────────────────────────────────────────────────────────────
	router.get('/:id/grades', authorizePermission(['courses', 'read']), ctrl.listGrades);
	// Bảng điểm Lý thuyết + Thực hành: nhập cả bảng 1 lần, khóa điểm, thi lại (gradebookService).
	// Mở khóa cần quyền riêng grades:unlock; GV nhập phần mình ở /me/teaching (me.routes.js).
	router.get('/:id/gradebook', authorizePermission(['courses', 'read']), ctrl.getGradebook);
	router.put(
		'/:id/grades/bulk',
		authorizePermission(['courses', 'update']),
		[body('rows').isArray({ min: 1, max: 2000 }).withMessage('Danh sách điểm không hợp lệ')],
		validate,
		ctrl.saveGradesBulk,
	);
	router.post('/:id/grades/lock', authorizePermission(['courses', 'update']), ctrl.lockGrades);
	router.post('/:id/grades/unlock', authorizePermission(['grades', 'unlock']), ctrl.unlockGrades);
	router.post(
		'/enrollments/:enrollmentId/grades/retake',
		authorizePermission(['courses', 'update']),
		[body('part').isIn(['theory', 'practice']).withMessage('Phần thi không hợp lệ')],
		validate,
		ctrl.retakeGrade,
	);
	router.get(
		'/enrollments/:enrollmentId/grades/history',
		authorizePermission(['courses', 'read']),
		ctrl.gradeHistory,
	);
	router.delete('/grades/:gradeId', authorizePermission(['courses', 'update']), ctrl.removeGrade);

	// ─── Certificates ───────────────────────────────────────────────────────────
	router.get('/:id/certificates', authorizePermission(['courses', 'read']), ctrl.listCertificates);
	router.post(
		'/certificates',
		authorizePermission(['courses', 'approve']),
		[body('enrollment_id').notEmpty().withMessage('Thiếu enrollment_id')],
		validate,
		ctrl.issueCertificate,
	);
	router.delete(
		'/certificates/:certId',
		authorizePermission(['courses', 'approve']),
		ctrl.removeCertificate,
	);
	router.post(
		'/:id/certificates/bulk',
		authorizePermission(['courses', 'approve']),
		[
			body('expiry_date')
				.optional({ values: 'falsy' })
				.isISO8601()
				.withMessage('Ngày không hợp lệ'),
		],
		validate,
		ctrl.issueCertificatesBulk,
	);
	router.patch(
		'/certificates/:certId/revoke',
		authorizePermission(['courses', 'approve']),
		ctrl.revokeCertificate,
	);
	// Tự cộng CME (courseCmeService): ghi lại cho học viên đã có giấy + giảng viên khi điểm đã khóa.
	router.post('/:id/cme-sync', authorizePermission(['courses', 'approve']), cmeCtrl.sync);
};
