const courseService = require('../services/courseService');
const { success, created, notFound } = require('../utils/response');

const getAll = async (req, res, next) => {
	try {
		return success(res, await courseService.getAll(req.query));
	} catch (err) {
		next(err);
	}
};

const getById = async (req, res, next) => {
	try {
		const item = await courseService.getById(req.params.id);
		if (!item) return notFound(res);
		return success(res, item);
	} catch (err) {
		next(err);
	}
};

const createOne = async (req, res, next) => {
	try {
		return created(res, await courseService.create(req.body, req.user.id));
	} catch (err) {
		next(err);
	}
};

const updateOne = async (req, res, next) => {
	try {
		const item = await courseService.update(req.params.id, req.body, req.user.id);
		if (!item) return notFound(res);
		return success(res, item, 'Cập nhật thành công');
	} catch (err) {
		next(err);
	}
};

const removeOne = async (req, res, next) => {
	try {
		await courseService.remove(req.params.id, req.user.id);
		return success(res, null, 'Xóa thành công');
	} catch (err) {
		next(err);
	}
};

// ─── Chương trình đào tạo áp dụng (course_programs, N:N) ──────────────────
const listProgramLinks = async (req, res, next) => {
	try {
		return success(res, await courseService.listProgramLinks(req.params.id));
	} catch (err) {
		next(err);
	}
};

const addProgramLink = async (req, res, next) => {
	try {
		return created(res, await courseService.addProgramLink(req.params.id, req.body, req.user.id));
	} catch (err) {
		next(err);
	}
};

const updateProgramLink = async (req, res, next) => {
	try {
		await courseService.updateProgramLink(req.params.linkId, req.body, req.user.id);
		return success(res, null, 'Đã cập nhật chương trình áp dụng');
	} catch (err) {
		next(err);
	}
};

const removeProgramLink = async (req, res, next) => {
	try {
		await courseService.removeProgramLink(req.params.linkId);
		return success(res, null, 'Đã gỡ chương trình áp dụng');
	} catch (err) {
		next(err);
	}
};

// ─── Enrollments ──────────────────────────────────────────────────────────
const listEnrollments = async (req, res, next) => {
	try {
		return success(res, await courseService.listEnrollments(req.params.id));
	} catch (err) {
		next(err);
	}
};

const registerTrainee = async (req, res, next) => {
	try {
		return created(res, await courseService.registerTrainee(req.params.id, req.body.trainee_id, req.user.id));
	} catch (err) {
		next(err);
	}
};

const decideEnrollment = async (req, res, next) => {
	try {
		const item = await courseService.decideEnrollment(
			req.params.enrollmentId,
			req.body.status,
			req.user.id,
			req.body.note,
		);
		return success(res, item, 'Đã cập nhật đăng ký');
	} catch (err) {
		next(err);
	}
};

const bulkDecideEnrollments = async (req, res, next) => {
	try {
		const results = await courseService.bulkDecideEnrollments(
			req.body.ids,
			req.body.status,
			req.user.id,
			req.body.note,
		);
		return success(res, results, 'Đã xử lý hàng loạt');
	} catch (err) {
		next(err);
	}
};

const removeEnrollment = async (req, res, next) => {
	try {
		await courseService.removeEnrollment(req.params.enrollmentId);
		return success(res, null, 'Đã xoá đăng ký');
	} catch (err) {
		next(err);
	}
};

// ─── Lecturer assignments ─────────────────────────────────────────────────
const listAssignments = async (req, res, next) => {
	try {
		return success(res, await courseService.listAssignments(req.params.id));
	} catch (err) {
		next(err);
	}
};

const assignLecturer = async (req, res, next) => {
	try {
		return created(res, await courseService.assignLecturer(req.params.id, req.body, req.user.id));
	} catch (err) {
		next(err);
	}
};

const removeAssignment = async (req, res, next) => {
	try {
		await courseService.removeAssignment(req.params.assignmentId);
		return success(res, null, 'Đã gỡ phân công');
	} catch (err) {
		next(err);
	}
};

// ─── Class sessions ───────────────────────────────────────────────────────
const listSessions = async (req, res, next) => {
	try {
		return success(res, await courseService.listSessions(req.params.id));
	} catch (err) {
		next(err);
	}
};

const createSession = async (req, res, next) => {
	try {
		return created(res, await courseService.createSession(req.params.id, req.body, req.user.id));
	} catch (err) {
		next(err);
	}
};

const updateSession = async (req, res, next) => {
	try {
		await courseService.updateSession(req.params.sessionId, req.body, req.user.id);
		return success(res, null, 'Đã cập nhật buổi học');
	} catch (err) {
		next(err);
	}
};

const removeSession = async (req, res, next) => {
	try {
		await courseService.removeSession(req.params.sessionId);
		return success(res, null, 'Đã xoá buổi học');
	} catch (err) {
		next(err);
	}
};

const createSessionsBulk = async (req, res, next) => {
	try {
		return created(res, await courseService.createSessionsBulk(req.params.id, req.body, req.user.id));
	} catch (err) {
		next(err);
	}
};

// ─── Attendance ───────────────────────────────────────────────────────────
const listAttendance = async (req, res, next) => {
	try {
		return success(res, await courseService.listAttendance(req.params.sessionId));
	} catch (err) {
		next(err);
	}
};

const setAttendance = async (req, res, next) => {
	try {
		await courseService.bulkSetAttendance(req.params.sessionId, req.body.records || [], req.user.id);
		return success(res, null, 'Đã lưu điểm danh');
	} catch (err) {
		next(err);
	}
};

// ─── Documents ────────────────────────────────────────────────────────────
const listDocuments = async (req, res, next) => {
	try {
		return success(res, await courseService.listDocuments(req.params.id));
	} catch (err) {
		next(err);
	}
};

const addDocument = async (req, res, next) => {
	try {
		const sourceType = req.body.source_type === 'link' ? 'link' : 'file';
		if (sourceType === 'file' && !req.file) {
			return res.status(400).json({ success: false, message: 'Vui lòng chọn file để tải lên' });
		}
		if (sourceType === 'link' && !req.body.external_url) {
			return res.status(400).json({ success: false, message: 'Vui lòng nhập đường dẫn tài liệu' });
		}
		return created(res, await courseService.addDocument(req.params.id, req.body, req.file, req.user.id));
	} catch (err) {
		next(err);
	}
};

const removeDocument = async (req, res, next) => {
	try {
		await courseService.removeDocument(req.params.docId, req.user.id);
		return success(res, null, 'Đã xoá tài liệu');
	} catch (err) {
		next(err);
	}
};

const incrementDocumentDownload = async (req, res, next) => {
	try {
		return success(res, await courseService.incrementDocumentDownload(req.params.docId));
	} catch (err) {
		next(err);
	}
};

// ─── Grades ───────────────────────────────────────────────────────────────
const listGrades = async (req, res, next) => {
	try {
		return success(res, await courseService.listGrades(req.params.id));
	} catch (err) {
		next(err);
	}
};

const upsertGrade = async (req, res, next) => {
	try {
		const { enrollment_id, subject_id, ...data } = req.body;
		return created(res, await courseService.upsertGrade(enrollment_id, subject_id, data, req.user.id));
	} catch (err) {
		next(err);
	}
};

const removeGrade = async (req, res, next) => {
	try {
		await courseService.removeGrade(req.params.gradeId);
		return success(res, null, 'Đã xoá kết quả');
	} catch (err) {
		next(err);
	}
};

// ─── Certificates ─────────────────────────────────────────────────────────
const listCertificates = async (req, res, next) => {
	try {
		return success(res, await courseService.listCertificates(req.params.id));
	} catch (err) {
		next(err);
	}
};

const issueCertificate = async (req, res, next) => {
	try {
		return created(
			res,
			await courseService.issueCertificate(req.body.enrollment_id, req.user.id, req.body.expiry_date),
		);
	} catch (err) {
		next(err);
	}
};

const removeCertificate = async (req, res, next) => {
	try {
		await courseService.removeCertificate(req.params.certId);
		return success(res, null, 'Đã xoá chứng chỉ');
	} catch (err) {
		next(err);
	}
};

const revokeCertificate = async (req, res, next) => {
	try {
		await courseService.revokeCertificate(req.params.certId, req.body.reason, req.user.id);
		return success(res, null, 'Đã thu hồi chứng chỉ');
	} catch (err) {
		next(err);
	}
};

module.exports = {
	getAll,
	getById,
	createOne,
	updateOne,
	removeOne,
	listProgramLinks,
	addProgramLink,
	updateProgramLink,
	removeProgramLink,
	listEnrollments,
	registerTrainee,
	decideEnrollment,
	bulkDecideEnrollments,
	removeEnrollment,
	listAssignments,
	assignLecturer,
	removeAssignment,
	listSessions,
	createSession,
	createSessionsBulk,
	updateSession,
	removeSession,
	listAttendance,
	setAttendance,
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
