// Phòng Đào tạo đối chiếu bản khai đăng ký (tab "Đơn đăng ký" của hồ sơ ghi danh) và
// tải Tờ trình theo khoa — registration/registrationReviewService, registrationProposalService.
const registrationReviewService = require('../registration/registrationReviewService');
const registrationProposalService = require('../registration/registrationProposalService');
const { success } = require('../../../utils/response');
const { asyncHandler } = require('../../../utils/asyncHandler');
const { hasPermission } = require('../../../permissions/authz');
const { httpError } = require('../../../utils/httpError');

// Đơn và hồ sơ PDF có số CCCD — cùng điều kiện với giấy tờ thực hành (practiceController)
const assertSensitive = (user) => {
	if (!hasPermission(user, 'trainees', 'read_sensitive'))
		throw httpError(
			403,
			'Giấy tờ có số CCCD của học viên — cần quyền xem dữ liệu nhạy cảm của học viên.',
		);
};

const sendDocx = (res, out) => {
	res.setHeader('Content-Type', out.mime);
	res.setHeader(
		'Content-Disposition',
		`attachment; filename*=UTF-8''${encodeURIComponent(out.filename)}`,
	);
	res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
	return res.end(out.buffer);
};

const getRegistration = asyncHandler(async (req, res) =>
	success(res, await registrationReviewService.getForReview(req.params.enrollmentId, req.user)),
);

const setRegistrationChecks = asyncHandler(async (req, res) =>
	success(
		res,
		await registrationReviewService.setChecks(req.params.enrollmentId, req.body, req.user),
		'Đã lưu mốc đối chiếu',
	),
);

const downloadApplication = asyncHandler(async (req, res) => {
	assertSensitive(req.user);
	return sendDocx(
		res,
		await registrationReviewService.applicationForEnrollment(req.params.enrollmentId),
	);
});

const getDossier = asyncHandler(async (req, res) => {
	assertSensitive(req.user);
	return success(
		res,
		await registrationReviewService.dossierForEnrollment(req.params.enrollmentId),
	);
});

const listProposals = asyncHandler(async (req, res) =>
	success(res, await registrationProposalService.listForCourse(req.params.id)),
);

const downloadProposal = asyncHandler(async (req, res) => {
	const group = await registrationProposalService.findGroup({
		courseId: req.params.id,
		departmentId: String(req.query.department_id),
		programId: req.query.program_id ? String(req.query.program_id) : null,
	});
	if (!group) throw httpError(404, 'Không có nhân viên của khoa này đăng ký lớp đã chọn.');
	return sendDocx(res, await registrationProposalService.renderGroup(group));
});

module.exports = {
	getRegistration,
	setRegistrationChecks,
	downloadApplication,
	getDossier,
	listProposals,
	downloadProposal,
};
