const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('../controllers/courseController');
const { authenticate, authorizePermission } = require('../middlewares/auth');
const { validate } = require('../middlewares/errorHandler');
const { createTrainingUpload } = require('../middlewares/uploadTraining');

const uploadCourseDoc = createTrainingUpload('course_document', {
	maxSizeMB: Number(process.env.TRAINING_MEDIA_MAX_MB || 300),
	allowMedia: true,
});

/**
 * @swagger
 * tags:
 *   name: Courses
 *   description: Quản lý khóa học, đăng ký, phân công giảng viên, lịch học, điểm danh (module Đào tạo)
 */

router.use(authenticate);

// ─── Courses ──────────────────────────────────────────────────────────────
router.get('/', authorizePermission(['courses', 'read']), ctrl.getAll);
router.get('/:id', authorizePermission(['courses', 'read']), ctrl.getById);

router.post(
	'/',
	authorizePermission(['courses', 'create']),
	[
		body('name').trim().notEmpty().withMessage('Tên khóa học không được để trống'),
		body('capacity').optional({ checkFalsy: true }).isInt({ min: 1 }),
		body('prerequisites').optional({ nullable: true }).isArray(),
		body('objectives').optional({ nullable: true }).isArray(),
	],
	validate,
	ctrl.createOne,
);

router.put(
	'/:id',
	authorizePermission(['courses', 'update']),
	[
		body('name').optional().trim().notEmpty(),
		body('capacity').optional({ checkFalsy: true }).isInt({ min: 1 }),
		body('prerequisites').optional({ nullable: true }).isArray(),
		body('objectives').optional({ nullable: true }).isArray(),
	],
	validate,
	ctrl.updateOne,
);

router.delete('/:id', authorizePermission(['courses', 'delete']), ctrl.removeOne);

// ─── Chương trình đào tạo áp dụng (N:N) ────────────────────────────────────
router.get('/:id/programs', authorizePermission(['courses', 'read']), ctrl.listProgramLinks);
router.post(
	'/:id/programs',
	authorizePermission(['courses', 'update']),
	[body('program_id').notEmpty().withMessage('Vui lòng chọn chương trình đào tạo')],
	validate,
	ctrl.addProgramLink,
);
router.put('/programs/:linkId', authorizePermission(['courses', 'update']), ctrl.updateProgramLink);
router.delete('/programs/:linkId', authorizePermission(['courses', 'update']), ctrl.removeProgramLink);

// ─── Enrollments ──────────────────────────────────────────────────────────
router.get('/:id/enrollments', authorizePermission(['courses', 'read']), ctrl.listEnrollments);
router.post(
	'/:id/enrollments',
	authorizePermission(['courses', 'create']),
	[body('trainee_id').notEmpty().withMessage('Vui lòng chọn học viên')],
	validate,
	ctrl.registerTrainee,
);
router.put(
	'/enrollments/:enrollmentId/decide',
	authorizePermission(['courses', 'approve']),
	[body('status').isIn(['approved', 'rejected'])],
	validate,
	ctrl.decideEnrollment,
);
router.post(
	'/enrollments/bulk-decide',
	authorizePermission(['courses', 'approve']),
	[body('ids').isArray({ min: 1 }), body('status').isIn(['approved', 'rejected'])],
	validate,
	ctrl.bulkDecideEnrollments,
);
router.delete('/enrollments/:enrollmentId', authorizePermission(['courses', 'delete']), ctrl.removeEnrollment);

// ─── Lecturer assignments ─────────────────────────────────────────────────
router.get('/:id/lecturer-assignments', authorizePermission(['courses', 'read']), ctrl.listAssignments);
router.post(
	'/:id/lecturer-assignments',
	authorizePermission(['courses', 'update']),
	[body('lecturer_id').notEmpty().withMessage('Vui lòng chọn giảng viên')],
	validate,
	ctrl.assignLecturer,
);
router.delete(
	'/lecturer-assignments/:assignmentId',
	authorizePermission(['courses', 'update']),
	ctrl.removeAssignment,
);

// ─── Class sessions ───────────────────────────────────────────────────────
router.get('/:id/sessions', authorizePermission(['courses', 'read']), ctrl.listSessions);
router.post(
	'/:id/sessions',
	authorizePermission(['courses', 'update']),
	[body('session_date').notEmpty().withMessage('Vui lòng chọn ngày học')],
	validate,
	ctrl.createSession,
);
router.put('/sessions/:sessionId', authorizePermission(['courses', 'update']), ctrl.updateSession);
router.delete('/sessions/:sessionId', authorizePermission(['courses', 'update']), ctrl.removeSession);
router.post(
	'/:id/sessions/bulk',
	authorizePermission(['courses', 'update']),
	[
		body('start_date').notEmpty().withMessage('Vui lòng chọn ngày bắt đầu'),
		body('end_date').notEmpty().withMessage('Vui lòng chọn ngày kết thúc'),
		body('weekdays').isArray({ min: 1 }).withMessage('Vui lòng chọn ít nhất 1 thứ trong tuần'),
	],
	validate,
	ctrl.createSessionsBulk,
);

// ─── Attendance ───────────────────────────────────────────────────────────
router.get(
	'/sessions/:sessionId/attendance',
	authorizePermission(['courses', 'read']),
	ctrl.listAttendance,
);
router.put(
	'/sessions/:sessionId/attendance',
	authorizePermission(['courses', 'update']),
	[body('records').isArray()],
	validate,
	ctrl.setAttendance,
);

// ─── Documents (tài liệu & bài kiểm tra) ───────────────────────────────────
router.get('/:id/documents', authorizePermission(['courses', 'read']), ctrl.listDocuments);
router.post(
	'/:id/documents',
	authorizePermission(['courses', 'update']),
	uploadCourseDoc.single('file'),
	ctrl.addDocument,
);
router.delete('/documents/:docId', authorizePermission(['courses', 'update']), ctrl.removeDocument);
router.patch('/documents/:docId/download', authorizePermission(['courses', 'read']), ctrl.incrementDocumentDownload);

// ─── Grades ─────────────────────────────────────────────────────────────────
router.get('/:id/grades', authorizePermission(['courses', 'read']), ctrl.listGrades);
router.post(
	'/grades',
	authorizePermission(['courses', 'update']),
	[body('enrollment_id').notEmpty().withMessage('Thiếu enrollment_id')],
	validate,
	ctrl.upsertGrade,
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
router.delete('/certificates/:certId', authorizePermission(['courses', 'approve']), ctrl.removeCertificate);
router.patch(
	'/certificates/:certId/revoke',
	authorizePermission(['courses', 'approve']),
	ctrl.revokeCertificate,
);

module.exports = router;
