const certificateService = require('./certificateService');
const classSessionService = require('./classSessionService');
const courseAttendanceService = require('./courseAttendanceService');
const courseDocumentService = require('./courseDocumentService');
const courseEnrollmentService = require('./courseEnrollmentService');
const courseBatchService = require('./courseBatchService');
const enrollmentProgramService = require('./enrollmentProgramService');
const enrollmentRotationService = require('./enrollmentRotationService');
const practiceDocumentService = require('./practiceDocumentService');
const practiceBoardService = require('./practiceBoardService');
const practiceBookImportService = require('./practiceBookImportService');
const practiceBookExportService = require('./practiceBookExportService');
const practiceAutoService = require('./practiceAutoService');
const coursePolicy = require('./coursePolicy');
const courseService = require('./courseService');
const gradeService = require('./gradeService');
const lecturerAssignmentService = require('./lecturerAssignmentService');
const { success, created, notFound } = require('../../../utils/response');
const { hasPermission } = require('../../../permissions/authz');
const { asyncHandler } = require('../../../utils/asyncHandler');

const getAll = asyncHandler(async (req, res) => {
	return success(res, await courseService.getAll(req.query, req.user));
});

const getById = asyncHandler(async (req, res) => {
	const item = await courseService.getById(req.params.id, req.user);
	if (!item) return notFound(res);
	return success(res, item);
});

const createOne = asyncHandler(async (req, res) => {
	return created(res, await courseService.create(req.body, req.user.id));
});

const updateOne = asyncHandler(async (req, res) => {
	const item = await courseService.update(req.params.id, req.body, req.user.id);
	if (!item) return notFound(res);
	return success(res, item, 'Cập nhật thành công');
});

const removeOne = asyncHandler(async (req, res) => {
	await courseService.remove(req.params.id, req.user.id);
	return success(res, null, 'Xóa thành công');
});

// ─── Chương trình đào tạo áp dụng (course_programs, N:N) ──────────────────
const listProgramLinks = asyncHandler(async (req, res) => {
	return success(res, await courseService.listProgramLinks(req.params.id));
});

// ─── Enrollments ──────────────────────────────────────────────────────────
const listEnrollments = asyncHandler(async (req, res) => {
	return success(res, await courseEnrollmentService.listEnrollments(req.params.id));
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
	// Phòng Đào tạo ghi danh hộ ⇒ duyệt luôn (đủ sĩ số thì vào danh sách chờ; khóa GPHN tự xếp vòng / khoa / NHD)
	const decided = await courseEnrollmentService.decideEnrollment(item.id, 'approved', req.user.id);
	return created(res, {
		...item,
		status: decided.status,
		batch_name: decided.batch_name,
		waitlist_position: decided.waitlist_position,
		auto_warning: decided.auto_warning,
	});
});

const listBatches = asyncHandler(async (req, res) => {
	return success(res, await courseBatchService.overview(req.params.id));
});

const formBatchNow = asyncHandler(async (req, res) => {
	const result = await courseBatchService.formNow(req.params.id, req.body.program_id, req.user.id);
	return created(res, result, `Đã xếp ${result.moved.length} học viên vào đợt`);
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
	// Danh sách mã do client gửi — mọi đăng ký phải thuộc khoá học trong phạm
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
	return success(res, null, 'Đã xoá đăng ký');
});

const updateEnrollment = asyncHandler(async (req, res) => {
	await enrollmentProgramService.updateEnrollment(req.params.enrollmentId, req.body, req.user.id);
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

const updateEnrollmentLesson = asyncHandler(async (req, res) => {
	await enrollmentProgramService.updateLesson(
		req.params.enrollmentId,
		req.body.lesson_id,
		req.body,
		req.user.id,
	);
	return success(res, null, 'Đã cập nhật bài học');
});

// ─── Vòng thực hành GPHN ─────────────────────────────────────────────────
const listRotations = asyncHandler(async (req, res) => {
	return success(res, await enrollmentRotationService.list(req.params.enrollmentId));
});

// Tự động: sinh vòng + xếp lịch so le + khoa / NHD ít người nhất + điền hồ sơ
const autoArrangeRotations = asyncHandler(async (req, res) => {
	await practiceAutoService.arrange(
		req.params.enrollmentId,
		{
			startDate: req.body?.start_date || null,
			replace: req.body?.replace === true,
			firstLessonId: req.body?.first_lesson_id || null,
			carryOver: req.body?.carry_over === true,
		},
		req.user.id,
	);
	return success(
		res,
		await enrollmentRotationService.list(req.params.enrollmentId),
		'Đã tự xếp vòng thực hành',
	);
});

const autoArrangeCourse = asyncHandler(async (req, res) => {
	return success(res, await practiceAutoService.arrangeCourse(req.params.id, req.user.id));
});

const scheduleRotations = asyncHandler(async (req, res) => {
	const out = await enrollmentRotationService.schedule(
		req.params.enrollmentId,
		req.body.start_date,
		req.user.id,
	);
	return success(res, out, 'Đã xếp lịch các vòng');
});

const addRotationSegment = asyncHandler(async (req, res) => {
	await enrollmentRotationService.addSegment(
		req.params.enrollmentId,
		req.body.lesson_id,
		req.user.id,
	);
	return success(res, null, 'Đã thêm khoa cho vòng');
});

const updateRotation = asyncHandler(async (req, res) => {
	await enrollmentRotationService.update(req.params.rotationId, req.body, req.user.id);
	return success(res, null, 'Đã cập nhật vòng');
});

const refreshRotationMentor = asyncHandler(async (req, res) => {
	await enrollmentRotationService.refreshMentor(req.params.rotationId, req.user.id);
	return success(res, null, 'Đã cập nhật thông tin người hướng dẫn');
});

const retakeRotation = asyncHandler(async (req, res) => {
	await enrollmentRotationService.retake(req.params.rotationId, req.user.id);
	return success(res, null, 'Đã thêm lượt học lại vòng');
});

const moveRotation = asyncHandler(async (req, res) => {
	await enrollmentRotationService.move(
		req.params.rotationId,
		req.body.direction === 'up',
		req.user.id,
	);
	return success(res, null, 'Đã đổi thứ tự vòng');
});

// ─── Sổ thực hành GPHN (nhập / xuất Excel) ───────────────────────────────
const importPracticeBook = asyncHandler(async (req, res) => {
	if (!hasPermission(req.user, 'trainees', 'import')) {
		return res
			.status(403)
			.json({ success: false, message: 'Nhập sổ thực hành cần quyền nhập Excel học viên.' });
	}
	if (!req.file) return res.status(400).json({ success: false, message: 'Chưa chọn file Excel.' });
	const out = await practiceBookImportService.importBook(
		req.params.id,
		{ buffer: req.file.buffer, dry_run: req.body.dry_run === '1' || req.body.dry_run === 'true' },
		req.user.id,
	);
	return success(res, out);
});

const exportPracticeBook = asyncHandler(async (req, res) => {
	if (!hasPermission(req.user, 'trainees', 'read_sensitive')) {
		return res.status(403).json({
			success: false,
			message:
				'Sổ thực hành có số CCCD của học viên — cần quyền xem dữ liệu nhạy cảm của học viên.',
		});
	}
	const out = await practiceBookExportService.exportBook(req.params.id);
	res.setHeader(
		'Content-Type',
		'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	);
	res.setHeader(
		'Content-Disposition',
		`attachment; filename*=UTF-8''${encodeURIComponent(`so-thuc-hanh_${out.courseName}.xlsx`)}`,
	);
	return res.end(Buffer.from(out.buffer));
});

// ─── Giấy tờ thực hành ───────────────────────────────────────────────────
const listPracticeDocuments = asyncHandler(async (req, res) => {
	return success(res, await practiceDocumentService.describe(req.params.enrollmentId));
});

const downloadPracticeDocument = asyncHandler(async (req, res) => {
	if (!hasPermission(req.user, 'trainees', 'read_sensitive')) {
		return res.status(403).json({
			success: false,
			message: 'Giấy tờ có số CCCD của học viên — cần quyền xem dữ liệu nhạy cảm của học viên.',
		});
	}
	const out = await practiceDocumentService.generate(
		req.params.enrollmentId,
		req.body.type,
		req.body.rotation_id || null,
	);
	res.setHeader('Content-Type', out.mime);
	res.setHeader(
		'Content-Disposition',
		`attachment; filename*=UTF-8''${encodeURIComponent(out.fileName)}`,
	);
	res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
	return res.end(out.buffer);
});

const removeRotation = asyncHandler(async (req, res) => {
	await enrollmentRotationService.remove(req.params.rotationId);
	return success(res, null, 'Đã xoá vòng');
});

// ─── Lecturer assignments ─────────────────────────────────────────────────
const listAssignments = asyncHandler(async (req, res) => {
	return success(res, await lecturerAssignmentService.listAssignments(req.params.id));
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
		req.params.lessonId,
		req.body,
		req.user.id,
	);
	return success(res, null, 'Đã lưu giảng viên của bài');
});

// ─── Class sessions ───────────────────────────────────────────────────────
const listSessionsInRange = asyncHandler(async (req, res) => {
	const { from, to, course_id } = req.query;
	return success(
		res,
		await classSessionService.listSessionsInRange({ from, to, course_id }, req.user),
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
	return success(res, await classSessionService.listSessions(req.params.id));
});

const createSession = asyncHandler(async (req, res) => {
	return created(
		res,
		await classSessionService.createSession(req.params.id, req.body, req.user.id),
	);
});

const updateSession = asyncHandler(async (req, res) => {
	return success(
		res,
		await classSessionService.updateSession(req.params.sessionId, req.body, req.user.id),
		'Đã cập nhật buổi học',
	);
});

const removeSession = asyncHandler(async (req, res) => {
	await classSessionService.removeSession(req.params.sessionId);
	return success(res, null, 'Đã xoá buổi học');
});

const createSessionsBulk = asyncHandler(async (req, res) => {
	return created(
		res,
		await classSessionService.createSessionsBulk(req.params.id, req.body, req.user.id),
	);
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
	return success(res, null, 'Đã xoá tài liệu');
});

const incrementDocumentDownload = asyncHandler(async (req, res) => {
	return success(res, await courseDocumentService.incrementDocumentDownload(req.params.docId));
});

// ─── Grades ───────────────────────────────────────────────────────────────
const listGrades = asyncHandler(async (req, res) => {
	return success(res, await gradeService.listGrades(req.params.id));
});

const upsertGrade = asyncHandler(async (req, res) => {
	const { enrollment_id, subject_id, ...data } = req.body;
	return created(res, await gradeService.upsertGrade(enrollment_id, subject_id, data, req.user.id));
});

const removeGrade = asyncHandler(async (req, res) => {
	await gradeService.removeGrade(req.params.gradeId);
	return success(res, null, 'Đã xoá kết quả');
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
	await certificateService.removeCertificate(req.params.certId);
	return success(res, null, 'Đã xoá chứng chỉ');
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
	listBatches,
	formBatchNow,
	listStaffCandidates,
	decideEnrollment,
	bulkDecideEnrollments,
	removeEnrollment,
	updateEnrollment,
	listEnrollmentLessons,
	syncEnrollmentLessons,
	updateEnrollmentLesson,
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
	upsertGrade,
	removeGrade,
	listCertificates,
	issueCertificate,
	removeCertificate,
	revokeCertificate,
};
