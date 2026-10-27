const certificateService = require('./certificateService');
const classSessionService = require('./classSessionService');
const courseAttendanceService = require('./courseAttendanceService');
const courseDocumentService = require('./courseDocumentService');
const courseEnrollmentService = require('./courseEnrollmentService');
const programClassService = require('./programClassService');
const enrollmentProgramService = require('./enrollmentProgramService');
const practiceBoardService = require('./practiceBoardService');
const coursePolicy = require('./coursePolicy');
const courseService = require('./courseService');
const gradeService = require('./gradeService');
const gradebookService = require('./gradebookService');
const lecturerAssignmentService = require('./lecturerAssignmentService');
const { success, created, notFound } = require('../../../utils/response');
const formCustomValueService = require('../../forms/formCustomValueService');
const { hasPermission } = require('../../../permissions/authz');
const { asyncHandler } = require('../../../utils/asyncHandler');
const {
	listRotations,
	autoArrangeRotations,
	autoArrangeCourse,
	scheduleRotations,
	addRotationSegment,
	updateRotation,
	refreshRotationMentor,
	retakeRotation,
	moveRotation,
	importPracticeBook,
	exportPracticeBook,
	listPracticeDocuments,
	downloadPracticeDocument,
	removeRotation,
} = require('./practiceController');

const getAll = asyncHandler(async (req, res) => {
	return success(
		res,
		await formCustomValueService.attachResult(
			'course',
			await courseService.getAll(req.query, req.user),
		),
	);
});

const getById = asyncHandler(async (req, res) => {
	const item = await courseService.getById(req.params.id, req.user);
	if (!item) return notFound(res);
	item.custom = await formCustomValueService.get('course', item.id);
	return success(res, item);
});

const createOne = asyncHandler(async (req, res) => {
	const item = await courseService.create(req.body, req.user.id);
	const custom = await formCustomValueService.save('course', item.id, req.formCustom, req.user.id);
	return created(res, custom ? { ...item, custom } : item);
});

const updateOne = asyncHandler(async (req, res) => {
	const item = await courseService.update(req.params.id, req.body, req.user.id);
	if (!item) return notFound(res);
	const custom = await formCustomValueService.save(
		'course',
		req.params.id,
		req.formCustom,
		req.user.id,
	);
	return success(res, custom ? { ...item, custom } : item, 'Cập nhật thành công');
});

const removeOne = asyncHandler(async (req, res) => {
	await courseService.remove(req.params.id, req.user.id);
	await formCustomValueService.remove('course', req.params.id);
	return success(res, null, 'Xóa thành công');
});

// ─── Chương trình đào tạo áp dụng (course_programs, N:N) ──────────────────
const listProgramLinks = asyncHandler(async (req, res) => {
	return success(res, await courseService.listProgramLinks(req.params.id));
});

// ─── Enrollments ──────────────────────────────────────────────────────────
const listEnrollments = asyncHandler(async (req, res) => {
	return success(
		res,
		await formCustomValueService.attachResult(
			'enrollment',
			await courseEnrollmentService.listEnrollments(req.params.id),
		),
	);
});

const registerTrainee = asyncHandler(async (req, res) => {
	const { trainee_id, user_id, program_id } = req.body;
	// Admin (system:manage) và quản lý đào tạo (courses:update/manage) được ghi
	// danh hộ cả khi khóa học đã đóng/chưa mở cửa sổ đăng ký.
	const opts = {
		bypassWindow: hasPermission(req.user, 'courses', 'update'),
		programId: program_id || null,
	};
	const item = user_id
		? await courseEnrollmentService.registerStaff(req.params.id, user_id, req.user.id, opts)
		: await courseEnrollmentService.registerTrainee(req.params.id, trainee_id, req.user.id, opts);
	// Phòng Đào tạo ghi danh hộ ⇒ duyệt luôn (đủ sĩ số thì vào danh sách chờ). Khóa GPHN: xếp lịch vòng là bước sau.
	const decided = await courseEnrollmentService.decideEnrollment(item.id, 'approved', req.user.id);
	await formCustomValueService.save('enrollment', item.id, req.formCustom, req.user.id);
	return created(res, {
		...item,
		status: decided.status,
		waitlist_position: decided.waitlist_position,
	});
});

const openClass = asyncHandler(async (req, res) => {
	const { program_id, start_date, end_date } = req.body;
	const result = await programClassService.openClass(req.params.id, program_id, req.user.id, {
		start_date,
		end_date,
	});
	return success(res, result, `Đã mở lớp với ${result.trainees} học viên`);
});

const cancelOpenClass = asyncHandler(async (req, res) => {
	const result = await programClassService.cancelOpenClass(
		req.params.id,
		req.body.program_id,
		req.user.id,
	);
	return success(res, result, 'Đã hủy mở lớp');
});

const suggestClassDates = asyncHandler(async (req, res) => {
	return success(res, await programClassService.suggestDates(req.params.id, req.query.program_id));
});

const setClassDates = asyncHandler(async (req, res) => {
	const { program_id, start_date, end_date } = req.body;
	return success(
		res,
		await programClassService.setClassDates(
			req.params.id,
			program_id,
			{ start_date, end_date },
			req.user.id,
		),
		'Đã lưu ngày học của lớp',
	);
});

const listStaffCandidates = asyncHandler(async (req, res) => {
	return success(res, await courseEnrollmentService.listStaffCandidates());
});

const decideEnrollment = asyncHandler(async (req, res) => {
	const item = await courseEnrollmentService.decideEnrollment(
		req.params.enrollmentId,
		req.body.status,
		req.user.id,
		req.body.note,
	);
	return success(res, item, 'Đã cập nhật đăng ký');
});

const bulkDecideEnrollments = asyncHandler(async (req, res) => {
	// Danh sách mã do client gửi — mọi đăng ký phải thuộc khóa học trong phạm
	// vi người duyệt (router.param không áp cho body)
	for (const id of Array.isArray(req.body.ids) ? req.body.ids : []) {
		await coursePolicy.assertCourseChildInScope('enrollmentId', id, req.user);
	}
	const results = await courseEnrollmentService.bulkDecideEnrollments(
		req.body.ids,
		req.body.status,
		req.user.id,
		req.body.note,
	);
	return success(res, results, 'Đã xử lý hàng loạt');
});

const removeEnrollment = asyncHandler(async (req, res) => {
	await courseEnrollmentService.removeEnrollment(req.params.enrollmentId, req.user.id);
	return success(res, null, 'Đã xóa đăng ký');
});

const updateEnrollment = asyncHandler(async (req, res) => {
	await enrollmentProgramService.updateEnrollment(req.params.enrollmentId, req.body, req.user.id);
	await formCustomValueService.save(
		'enrollment',
		req.params.enrollmentId,
		req.formCustom,
		req.user.id,
	);
	return success(res, null, 'Đã cập nhật đăng ký');
});

const listEnrollmentLessons = asyncHandler(async (req, res) => {
	return success(res, await enrollmentProgramService.listLessons(req.params.enrollmentId));
});

const syncEnrollmentLessons = asyncHandler(async (req, res) => {
	const out = await enrollmentProgramService.syncLessons(req.params.enrollmentId, {
		replace: true,
	});
	return success(res, out, 'Đã đồng bộ bài học theo chương trình');
});

// ─── Lecturer assignments ─────────────────────────────────────────────────
const listAssignments = asyncHandler(async (req, res) => {
	return success(res, await lecturerAssignmentService.listAssignments(req.params.id));
});

const listLecturerCandidates = asyncHandler(async (req, res) => {
	return success(res, await lecturerAssignmentService.listLecturerCandidates(req.params.id));
});

const assignLecturer = asyncHandler(async (req, res) => {
	return created(
		res,
		await lecturerAssignmentService.assignLecturer(req.params.id, req.body, req.user.id),
	);
});

const removeAssignment = asyncHandler(async (req, res) => {
	await lecturerAssignmentService.removeAssignment(req.params.assignmentId);
	return success(res, null, 'Đã gỡ phân công');
});

const listCourseLessons = asyncHandler(async (req, res) => {
	return success(res, await lecturerAssignmentService.listCourseLessons(req.params.id));
});

const setLessonLecturers = asyncHandler(async (req, res) => {
	await lecturerAssignmentService.setLessonLecturers(
		req.params.id,
		req.body.lesson_id,
		req.body,
		req.user.id,
	);
	return success(res, null, 'Đã lưu giảng viên của bài');
});

// ─── Class sessions ───────────────────────────────────────────────────────
const listSessionsInRange = asyncHandler(async (req, res) => {
	const { from, to, course_id, training_type_id } = req.query;
	return success(
		res,
		await classSessionService.listSessionsInRange(
			{ from, to, course_id, training_type_id },
			req.user,
		),
	);
});

// Tổng hợp thực hành GPHN theo khoa / người hướng dẫn vào 1 ngày
const getPracticeBoard = asyncHandler(async (req, res) => {
	const { date, department_id, mentor_user_id } = req.query;
	return success(
		res,
		await practiceBoardService.getBoard({ date, department_id, mentor_user_id }, req.user),
	);
});

const listSessions = asyncHandler(async (req, res) => {
	return success(
		res,
		await formCustomValueService.attachResult(
			'course_session',
			await classSessionService.listSessions(req.params.id),
		),
	);
});

const createSession = asyncHandler(async (req, res) => {
	const out = await classSessionService.createSession(req.params.id, req.body, req.user.id);
	await formCustomValueService.save('course_session', out.id, req.formCustom, req.user.id);
	return created(res, out);
});

const updateSession = asyncHandler(async (req, res) => {
	const out = await classSessionService.updateSession(req.params.sessionId, req.body, req.user.id);
	await formCustomValueService.save(
		'course_session',
		req.params.sessionId,
		req.formCustom,
		req.user.id,
	);
	return success(res, out, 'Đã cập nhật buổi học');
});

const removeSession = asyncHandler(async (req, res) => {
	await classSessionService.removeSession(req.params.sessionId, req.user.id);
	await formCustomValueService.remove('course_session', req.params.sessionId);
	return success(res, null, 'Đã xóa buổi học');
});

const createSessionsBulk = asyncHandler(async (req, res) => {
	const out = await classSessionService.createSessionsBulk(req.params.id, req.body, req.user.id);
	for (const id of out.ids ?? [])
		await formCustomValueService.save('course_session', id, req.formCustom, req.user.id);
	return created(res, out);
});

// ─── Attendance ───────────────────────────────────────────────────────────
const listAttendance = asyncHandler(async (req, res) => {
	return success(res, await courseAttendanceService.listAttendance(req.params.sessionId));
});

const setAttendance = asyncHandler(async (req, res) => {
	await courseAttendanceService.bulkSetAttendance(
		req.params.sessionId,
		req.body.records || [],
		req.user.id,
	);
	return success(res, null, 'Đã lưu điểm danh');
});

const getAttendanceQrToken = (req, res) => {
	return success(res, {
		token: courseAttendanceService.generateAttendanceQrToken(req.params.sessionId),
	});
};

const checkInSelf = asyncHandler(async (req, res) => {
	const result = await courseAttendanceService.checkInSelf(
		req.body.token,
		req.body.device_id,
		req.user,
	);
	return success(res, result, 'Điểm danh thành công');
});

// ─── Documents ────────────────────────────────────────────────────────────
const listDocuments = asyncHandler(async (req, res) => {
	return success(res, await courseDocumentService.listDocuments(req.params.id));
});

const addDocument = asyncHandler(async (req, res) => {
	const sourceType = req.body.source_type === 'link' ? 'link' : 'file';
	if (sourceType === 'file' && !req.file) {
		return res.status(400).json({ success: false, message: 'Vui lòng chọn file để tải lên' });
	}
	if (sourceType === 'link' && !req.body.external_url) {
		return res.status(400).json({ success: false, message: 'Vui lòng nhập đường dẫn tài liệu' });
	}
	return created(
		res,
		await courseDocumentService.addDocument(req.params.id, req.body, req.file, req.user.id),
	);
});

const removeDocument = asyncHandler(async (req, res) => {
	await courseDocumentService.removeDocument(req.params.docId, req.user.id);
	return success(res, null, 'Đã xóa tài liệu');
});

const incrementDocumentDownload = asyncHandler(async (req, res) => {
	return success(res, await courseDocumentService.incrementDocumentDownload(req.params.docId));
});

// ─── Grades ───────────────────────────────────────────────────────────────
const listGrades = asyncHandler(async (req, res) => {
	return success(res, await gradeService.listGrades(req.params.id));
});

// Bảng điểm Lý thuyết + Thực hành (giai đoạn 4) — gradebookService
const getGradebook = asyncHandler(async (req, res) => {
	return success(res, await gradebookService.getGradebook(req.params.id));
});

const saveGradesBulk = asyncHandler(async (req, res) => {
	const r = await gradebookService.saveBulk(req.params.id, req.body.rows, req.user.id, {
		source: req.body.source === 'import' ? 'import' : 'manual',
	});
	return success(res, r, `Đã lưu điểm ${r.saved} học viên`);
});

const lockGrades = asyncHandler(async (req, res) => {
	return success(res, await gradebookService.lock(req.params.id, req.user.id), 'Đã khóa điểm');
});

const unlockGrades = asyncHandler(async (req, res) => {
	return success(
		res,
		await gradebookService.unlock(req.params.id, req.user.id, req.body?.reason),
		'Đã mở khóa điểm',
	);
});

const retakeGrade = asyncHandler(async (req, res) => {
	await gradebookService.retake(req.params.enrollmentId, req.body.part, req.user.id);
	return success(res, null, 'Đã mở lượt thi lại');
});

const gradeHistory = asyncHandler(async (req, res) => {
	return success(res, await gradebookService.history(req.params.enrollmentId));
});

const issueCertificatesBulk = asyncHandler(async (req, res) => {
	const r = await gradebookService.issueCertificatesForPassed(
		req.params.id,
		req.user.id,
		req.body?.expiry_date || null,
	);
	return success(res, r, `Đã cấp ${r.issued} giấy chứng nhận`);
});

const removeGrade = asyncHandler(async (req, res) => {
	await gradeService.removeGrade(req.params.gradeId);
	return success(res, null, 'Đã xóa kết quả');
});

// ─── Certificates ─────────────────────────────────────────────────────────
const listCertificates = asyncHandler(async (req, res) => {
	return success(res, await certificateService.listCertificates(req.params.id));
});

const issueCertificate = asyncHandler(async (req, res) => {
	return created(
		res,
		await certificateService.issueCertificate(
			req.body.enrollment_id,
			req.user.id,
			req.body.expiry_date,
		),
	);
});

const removeCertificate = asyncHandler(async (req, res) => {
	await certificateService.removeCertificate(req.params.certId, req.user.id);
	return success(res, null, 'Đã xóa chứng chỉ');
});

const revokeCertificate = asyncHandler(async (req, res) => {
	await certificateService.revokeCertificate(req.params.certId, req.body.reason, req.user.id);
	return success(res, null, 'Đã thu hồi chứng chỉ');
});

module.exports = {
	getAll,
	getById,
	createOne,
	updateOne,
	removeOne,
	listProgramLinks,
	listEnrollments,
	registerTrainee,
	openClass,
	cancelOpenClass,
	suggestClassDates,
	setClassDates,
	listStaffCandidates,
	decideEnrollment,
	bulkDecideEnrollments,
	removeEnrollment,
	updateEnrollment,
	listEnrollmentLessons,
	syncEnrollmentLessons,
	listRotations,
	autoArrangeRotations,
	autoArrangeCourse,
	scheduleRotations,
	addRotationSegment,
	updateRotation,
	refreshRotationMentor,
	retakeRotation,
	moveRotation,
	removeRotation,
	listPracticeDocuments,
	importPracticeBook,
	exportPracticeBook,
	downloadPracticeDocument,
	listAssignments,
	assignLecturer,
	listLecturerCandidates,
	removeAssignment,
	listCourseLessons,
	setLessonLecturers,
	listSessions,
	listSessionsInRange,
	getPracticeBoard,
	createSession,
	createSessionsBulk,
	updateSession,
	removeSession,
	listAttendance,
	setAttendance,
	getAttendanceQrToken,
	checkInSelf,
	listDocuments,
	addDocument,
	incrementDocumentDownload,
	removeDocument,
	listGrades,
	getGradebook,
	saveGradesBulk,
	lockGrades,
	unlockGrades,
	retakeGrade,
	gradeHistory,
	issueCertificatesBulk,
	removeGrade,
	listCertificates,
	issueCertificate,
	removeCertificate,
	revokeCertificate,
};
