const courseService = require('./courseService');
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
	return success(res, await courseService.listEnrollments(req.params.id));
});

const registerTrainee = asyncHandler(async (req, res) => {
	const { trainee_id, user_id } = req.body;
	// Admin (system:manage) và quản lý đào tạo (courses:update/manage) được ghi
	// danh hộ cả khi khóa học đã đóng/chưa mở cửa sổ đăng ký.
	const opts = { bypassWindow: hasPermission(req.user, 'courses', 'update') };
	const item = user_id
		? await courseService.registerStaff(req.params.id, user_id, req.user.id, opts)
		: await courseService.registerTrainee(req.params.id, trainee_id, req.user.id, opts);
	return created(res, item);
});

const listStaffCandidates = asyncHandler(async (req, res) => {
	return success(res, await courseService.listStaffCandidates());
});

const decideEnrollment = asyncHandler(async (req, res) => {
	const item = await courseService.decideEnrollment(
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
		await courseService.assertCourseChildInScope('enrollmentId', id, req.user);
	}
	const results = await courseService.bulkDecideEnrollments(
		req.body.ids,
		req.body.status,
		req.user.id,
		req.body.note,
	);
	return success(res, results, 'Đã xử lý hàng loạt');
});

const removeEnrollment = asyncHandler(async (req, res) => {
	await courseService.removeEnrollment(req.params.enrollmentId);
	return success(res, null, 'Đã xoá đăng ký');
});

// ─── Lecturer assignments ─────────────────────────────────────────────────
const listAssignments = asyncHandler(async (req, res) => {
	return success(res, await courseService.listAssignments(req.params.id));
});

const assignLecturer = asyncHandler(async (req, res) => {
	return created(res, await courseService.assignLecturer(req.params.id, req.body, req.user.id));
});

const removeAssignment = asyncHandler(async (req, res) => {
	await courseService.removeAssignment(req.params.assignmentId);
	return success(res, null, 'Đã gỡ phân công');
});

// ─── Class sessions ───────────────────────────────────────────────────────
const listSessionsInRange = asyncHandler(async (req, res) => {
	const { from, to, course_id } = req.query;
	return success(res, await courseService.listSessionsInRange({ from, to, course_id }, req.user));
});

const listSessions = asyncHandler(async (req, res) => {
	return success(res, await courseService.listSessions(req.params.id));
});

const createSession = asyncHandler(async (req, res) => {
	return created(res, await courseService.createSession(req.params.id, req.body, req.user.id));
});

const updateSession = asyncHandler(async (req, res) => {
	await courseService.updateSession(req.params.sessionId, req.body, req.user.id);
	return success(res, null, 'Đã cập nhật buổi học');
});

const removeSession = asyncHandler(async (req, res) => {
	await courseService.removeSession(req.params.sessionId);
	return success(res, null, 'Đã xoá buổi học');
});

const createSessionsBulk = asyncHandler(async (req, res) => {
	return created(res, await courseService.createSessionsBulk(req.params.id, req.body, req.user.id));
});

// ─── Attendance ───────────────────────────────────────────────────────────
const listAttendance = asyncHandler(async (req, res) => {
	return success(res, await courseService.listAttendance(req.params.sessionId));
});

const setAttendance = asyncHandler(async (req, res) => {
	await courseService.bulkSetAttendance(req.params.sessionId, req.body.records || [], req.user.id);
	return success(res, null, 'Đã lưu điểm danh');
});

const getAttendanceQrToken = (req, res) => {
	return success(res, { token: courseService.generateAttendanceQrToken(req.params.sessionId) });
};

const checkInSelf = asyncHandler(async (req, res) => {
	const result = await courseService.checkInSelf(req.body.token, req.body.device_id, req.user);
	return success(res, result, 'Điểm danh thành công');
});

// ─── Documents ────────────────────────────────────────────────────────────
const listDocuments = asyncHandler(async (req, res) => {
	return success(res, await courseService.listDocuments(req.params.id));
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
		await courseService.addDocument(req.params.id, req.body, req.file, req.user.id),
	);
});

const removeDocument = asyncHandler(async (req, res) => {
	await courseService.removeDocument(req.params.docId, req.user.id);
	return success(res, null, 'Đã xoá tài liệu');
});

const incrementDocumentDownload = asyncHandler(async (req, res) => {
	return success(res, await courseService.incrementDocumentDownload(req.params.docId));
});

// ─── Grades ───────────────────────────────────────────────────────────────
const listGrades = asyncHandler(async (req, res) => {
	return success(res, await courseService.listGrades(req.params.id));
});

const upsertGrade = asyncHandler(async (req, res) => {
	const { enrollment_id, subject_id, ...data } = req.body;
	return created(
		res,
		await courseService.upsertGrade(enrollment_id, subject_id, data, req.user.id),
	);
});

const removeGrade = asyncHandler(async (req, res) => {
	await courseService.removeGrade(req.params.gradeId);
	return success(res, null, 'Đã xoá kết quả');
});

// ─── Certificates ─────────────────────────────────────────────────────────
const listCertificates = asyncHandler(async (req, res) => {
	return success(res, await courseService.listCertificates(req.params.id));
});

const issueCertificate = asyncHandler(async (req, res) => {
	return created(
		res,
		await courseService.issueCertificate(req.body.enrollment_id, req.user.id, req.body.expiry_date),
	);
});

const removeCertificate = asyncHandler(async (req, res) => {
	await courseService.removeCertificate(req.params.certId);
	return success(res, null, 'Đã xoá chứng chỉ');
});

const revokeCertificate = asyncHandler(async (req, res) => {
	await courseService.revokeCertificate(req.params.certId, req.body.reason, req.user.id);
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
	listStaffCandidates,
	decideEnrollment,
	bulkDecideEnrollments,
	removeEnrollment,
	listAssignments,
	assignLecturer,
	removeAssignment,
	listSessions,
	listSessionsInRange,
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
