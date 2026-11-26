/**
 * tuitionController.js — route học phí phía phòng Đào tạo (gắn trong courses.routes.js
 * để dùng chung kiểm phạm vi khóa học theo :id) và phía học viên (myTuition.routes.js).
 */
const tuitionService = require('./tuitionService');
const { renderReceipt } = require('./tuitionReceiptPdf');
const { receiptUnit } = require('./tuitionSettings');
const { success, created } = require('../../../utils/response');
const { asyncHandler } = require('../../../utils/asyncHandler');

const HOSPITAL = 'Bệnh viện Hữu nghị Đa khoa Nghệ An';

const sendReceipt = async (res, data) => {
	const pdf = await renderReceipt(data, { hospital: HOSPITAL, unit: await receiptUnit() });
	res.setHeader('Content-Type', 'application/pdf');
	res.setHeader('Content-Disposition', `inline; filename="phieu-thu-${data.receipt_no}.pdf"`);
	res.end(pdf);
};

// ─── Phòng Đào tạo ───────────────────────────────────────────────────────────
const listForCourse = asyncHandler(async (req, res) =>
	success(res, await tuitionService.listForCourse(req.params.id, req.query.program_id || null)),
);

const listPending = asyncHandler(async (req, res) =>
	success(res, await tuitionService.listPending(req.user)),
);

const setFee = asyncHandler(async (req, res) =>
	success(
		res,
		await tuitionService.setFee(req.params.id, req.params.enrollmentId, req.body, req.user.id),
		'Đã lưu học phí',
	),
);

const recordPayment = asyncHandler(async (req, res) =>
	created(
		res,
		await tuitionService.recordPayment(
			req.params.id,
			req.params.enrollmentId,
			req.body,
			req.user.id,
		),
		'Đã ghi nhận khoản nộp và cấp biên lai',
	),
);

const confirmPayment = asyncHandler(async (req, res) =>
	success(
		res,
		await tuitionService.confirmPayment(req.params.id, req.params.paymentId, req.user.id),
		'Đã xác nhận và cấp biên lai',
	),
);

const rejectPayment = asyncHandler(async (req, res) =>
	success(
		res,
		await tuitionService.rejectPayment(
			req.params.id,
			req.params.paymentId,
			req.body.review_note,
			req.user.id,
		),
		'Đã từ chối khoản nộp',
	),
);

const courseReceipt = asyncHandler(async (req, res) =>
	sendReceipt(
		res,
		await tuitionService.receiptData(req.params.paymentId, { courseId: req.params.id }),
	),
);

// ─── Học viên ────────────────────────────────────────────────────────────────
const listMine = asyncHandler(async (req, res) =>
	success(res, await tuitionService.listMine(req.user.id)),
);

const submitMine = asyncHandler(async (req, res) =>
	created(
		res,
		await tuitionService.submitMine(req.user.id, req.params.id, req.body, req.file),
		'Đã gửi, chờ phòng Đào tạo xác nhận',
	),
);

const cancelMine = asyncHandler(async (req, res) =>
	success(res, await tuitionService.cancelMine(req.user.id, req.params.paymentId), 'Đã rút lại'),
);

const myReceipt = asyncHandler(async (req, res) =>
	sendReceipt(res, await tuitionService.receiptData(req.params.paymentId, { userId: req.user.id })),
);

module.exports = {
	listForCourse,
	listPending,
	setFee,
	recordPayment,
	confirmPayment,
	rejectPayment,
	courseReceipt,
	listMine,
	submitMine,
	cancelMine,
	myReceipt,
};
