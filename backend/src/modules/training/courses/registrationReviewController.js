// Phòng Đào tạo xem bản khai đăng ký (tab "Đơn đăng ký" của hồ sơ ghi danh) và
// tải Tờ trình theo khoa — registration/registrationReviewService, registrationProposalService.
const registrationReviewService = require('../registration/registrationReviewService');
const registrationProposalService = require('../registration/registrationProposalService');
const registrationSettingsService = require('../registration/registrationSettingsService');
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

// Bản ghi xác nhận điện tử (JSON nguyên văn; ?seq=N = lần sửa thứ N) — có IP / thiết bị ⇒ cần
// quyền dữ liệu nhạy cảm
const downloadConsent = asyncHandler(async (req, res) => {
	assertSensitive(req.user);
	return sendDocx(
		res,
		await registrationReviewService.consentRecordForEnrollment(
			req.params.enrollmentId,
			Number.parseInt(String(req.query.seq ?? ''), 10) || null,
		),
	);
});

const getSettings = asyncHandler(async (_req, res) =>
	success(res, await registrationSettingsService.get()),
);

// Lời nhắn theo công tắc vừa đổi (mỗi lần giao diện gửi 1 công tắc)
const settingsMessage = ({ email_otp_required: otp, doc_check_enabled: doc }) => {
	if (typeof doc === 'boolean')
		return doc ? 'Đã bật tự kiểm tra file hồ sơ' : 'Đã tắt tự kiểm tra file hồ sơ';
	return otp ? 'Đã bật gửi mã OTP xác minh email' : 'Đã tắt gửi mã OTP xác minh email';
};

const updateSettings = asyncHandler(async (req, res) =>
	success(
		res,
		await registrationSettingsService.update(
			{
				email_otp_required: req.body.email_otp_required,
				doc_check_enabled: req.body.doc_check_enabled,
			},
			req.user.id,
		),
		settingsMessage(req.body),
	),
);

module.exports = {
	downloadConsent,
	getSettings,
	updateSettings,
	getRegistration,
	downloadApplication,
	getDossier,
	listProposals,
	downloadProposal,
};
