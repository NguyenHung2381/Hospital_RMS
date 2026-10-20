const router = require('express').Router();
const { body, query } = require('express-validator');
const ctrl = require('./courseController');
const uploadExcel = require('../../../middlewares/uploadExcel');
const { authenticate, authorizePermission } = require('../../../middlewares/auth');
const { validate } = require('../../../middlewares/errorHandler');
const { createTrainingUpload } = require('../../../middlewares/uploadTraining');
const coursePolicy = require('./coursePolicy');

const uploadCourseDoc = createTrainingUpload('course_document', {
	maxSizeMB: Number(process.env.TRAINING_MEDIA_MAX_MB || 300),
	allowMedia: true,
});

router.use(authenticate);

// Chống IDOR: mọi route có mã khoá học (:id) hoặc mã bản ghi con (buổi học,
// đăng ký, tài liệu, điểm, chứng chỉ...) chỉ chạy khi khoá học tương ứng nằm
// trong phạm vi người gọi — giảng viên phạm vi 'assigned' chỉ khoá mình được
// phân công (modules/training/courses/coursePolicy.js). Route mới dùng đúng tên tham số dưới
// đây là tự được kiểm tra.
const inScope = (check) => async (req, _res, next, value) => {
	try {
		await check(value, req.user);
		next();
	} catch (err) {
		next(err);
	}
};
router.param(
	'id',
	inScope((id, user) => coursePolicy.assertCourseInScope(id, user)),
);
for (const name of Object.keys(coursePolicy.CHILD_COURSE_SQL)) {
	router.param(
		name,
		inScope((id, user) => coursePolicy.assertCourseChildInScope(name, id, user)),
	);
}

// ─── Courses ──────────────────────────────────────────────────────────────
router.get('/', authorizePermission(['courses', 'read']), ctrl.getAll);
// Nhân viên nội viện chưa có hồ sơ học viên — để ghi danh thẳng vào khóa (phải
// khai báo trước '/:id').
router.get(
	'/staff-candidates',
	authorizePermission(['courses', 'create']),
	ctrl.listStaffCandidates,
);
// Lịch học toàn hệ thống theo khoảng ngày (phải khai báo trước '/:id').
router.get(
	'/sessions/calendar',
	authorizePermission(['courses', 'read']),
	[
		query('from').isISO8601().withMessage('Ngày bắt đầu không hợp lệ'),
		query('to').isISO8601().withMessage('Ngày kết thúc không hợp lệ'),
	],
	validate,
	ctrl.listSessionsInRange,
);
// Thực hành GPHN đang diễn ra vào 1 ngày — theo khoa / người hướng dẫn (trước '/:id').
router.get(
	'/practice-board',
	authorizePermission(['courses', 'read']),
	[query('date').optional({ checkFalsy: true }).isISO8601().withMessage('Ngày không hợp lệ')],
	validate,
	ctrl.getPracticeBoard,
);
router.get('/:id', authorizePermission(['courses', 'read']), ctrl.getById);

router.post(
	'/',
	authorizePermission(['courses', 'create']),
	[
		body('name').trim().notEmpty().withMessage('Tên khóa học không được để trống'),
		body('capacity').optional({ checkFalsy: true }).isInt({ min: 1 }),
		body('batch_no')
			.optional({ checkFalsy: true })
			.isInt({ min: 1 })
			.withMessage('Số đợt phải là số nguyên dương'),
		body('is_rolling').optional().isBoolean(),
		body('prerequisites').optional({ nullable: true }).isArray(),
		body('objectives').optional({ nullable: true }).isArray(),
		body('program_ids').optional().isArray(),
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
		body('batch_no')
			.optional({ checkFalsy: true })
			.isInt({ min: 1 })
			.withMessage('Số đợt phải là số nguyên dương'),
		body('is_rolling').optional().isBoolean(),
		body('prerequisites').optional({ nullable: true }).isArray(),
		body('objectives').optional({ nullable: true }).isArray(),
		body('program_ids').optional().isArray(),
	],
	validate,
	ctrl.updateOne,
);

router.delete('/:id', authorizePermission(['courses', 'delete']), ctrl.removeOne);

// ─── Chương trình đào tạo áp dụng (N:N) ────────────────────────────────────
// Gán/gỡ qua program_ids khi tạo/sửa khóa học
router.get('/:id/programs', authorizePermission(['courses', 'read']), ctrl.listProgramLinks);

// ─── Sổ thực hành GPHN (Excel mẫu 3.xlsx) — nhập vào khóa / xuất đúng bố cục sổ.
// Nhập ghi cả hồ sơ học viên ⇒ controller đòi thêm trainees:import; xuất có CCCD
// ⇒ đòi thêm trainees:read_sensitive.
router.post(
	'/:id/practice-book/import',
	authorizePermission(['courses', 'update']),
	uploadExcel.single('file'),
	ctrl.importPracticeBook,
);
router.post(
	'/:id/practice-book/export',
	authorizePermission(['courses', 'read']),
	ctrl.exportPracticeBook,
);
// Tự xếp vòng / khoa / NHD cho mọi hồ sơ GPHN của khóa chưa có vòng
router.post(
	'/:id/practice/auto-arrange',
	authorizePermission(['courses', 'update']),
	ctrl.autoArrangeCourse,
);

// ─── Enrollments ──────────────────────────────────────────────────────────
router.get('/:id/enrollments', authorizePermission(['courses', 'read']), ctrl.listEnrollments);
router.post(
	'/:id/enrollments',
	authorizePermission(['courses', 'create']),
	// trainee_id: học viên có sẵn; user_id: nhân viên nội viện (tự tạo/gắn hồ sơ học viên).
	[
		body('trainee_id')
			.if(body('user_id').not().exists({ checkFalsy: true }))
			.notEmpty()
			.withMessage('Vui lòng chọn học viên'),
	],
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
router.delete(
	'/enrollments/:enrollmentId',
	authorizePermission(['courses', 'delete']),
	ctrl.removeEnrollment,
);
// Chương trình đã chọn, hồ sơ thực hành GPHN, tiến độ của 1 lượt ghi danh;
// bài học tự gắn theo chương trình (ĐTLT) — xem enrollmentProgramService.
router.put(
	'/enrollments/:enrollmentId',
	authorizePermission(['courses', 'update']),
	[
		body('progress_status').optional().isIn(['in_progress', 'completed', 'dropped']),
		body(['start_date', 'end_date', 'progress_date'])
			.optional({ nullable: true, checkFalsy: true })
			.isISO8601()
			.withMessage('Ngày không hợp lệ'),
		body('practice_code').optional({ nullable: true }).isLength({ max: 30 }),
	],
	validate,
	ctrl.updateEnrollment,
);
router.get(
	'/enrollments/:enrollmentId/lessons',
	authorizePermission(['courses', 'read']),
	ctrl.listEnrollmentLessons,
);
router.post(
	'/enrollments/:enrollmentId/lessons/sync',
	authorizePermission(['courses', 'update']),
	ctrl.syncEnrollmentLessons,
);
router.put(
	'/enrollments/:enrollmentId/lessons',
	authorizePermission(['courses', 'update']),
	[
		body('lesson_id').notEmpty().withMessage('Thiếu lesson_id'),
		body('status').isIn(['not_started', 'in_progress', 'done']),
	],
	validate,
	ctrl.updateEnrollmentLesson,
);

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
		body('start_date').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Ngày không hợp lệ'),
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
	],
	validate,
	ctrl.downloadPracticeDocument,
);
router.delete(
	'/rotations/:rotationId',
	authorizePermission(['courses', 'update']),
	ctrl.removeRotation,
);

// ─── Lecturer assignments ─────────────────────────────────────────────────
router.get(
	'/:id/lecturer-assignments',
	authorizePermission(['courses', 'read']),
	ctrl.listAssignments,
);
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
router.delete(
	'/sessions/:sessionId',
	authorizePermission(['courses', 'update']),
	ctrl.removeSession,
);
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

// Mã QR điểm danh: sinh mã cần quyền courses:update (giảng viên/quản lý hiển
// thị lên màn hình lớp); tự quét chỉ cần đăng nhập (học viên dùng token
// trong QR để chứng minh, không cần quyền courses riêng).
router.get(
	'/sessions/:sessionId/attendance-qr',
	authorizePermission(['courses', 'update']),
	ctrl.getAttendanceQrToken,
);
router.post(
	'/attendance/check-in',
	[body('token').notEmpty(), body('device_id').isString().isLength({ min: 16, max: 64 })],
	validate,
	ctrl.checkInSelf,
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
router.patch(
	'/documents/:docId/download',
	authorizePermission(['courses', 'read']),
	ctrl.incrementDocumentDownload,
);

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
router.delete(
	'/certificates/:certId',
	authorizePermission(['courses', 'approve']),
	ctrl.removeCertificate,
);
router.patch(
	'/certificates/:certId/revoke',
	authorizePermission(['courses', 'approve']),
	ctrl.revokeCertificate,
);

module.exports = router;
