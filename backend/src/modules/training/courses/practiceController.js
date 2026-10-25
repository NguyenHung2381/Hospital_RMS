// Handler thực hành GPHN của khóa học: vòng thực hành, sổ thực hành (nhập / xuất Excel), giấy tờ.
// Route ở courses.routes.js (qua courseController, export lại).
const enrollmentRotationService = require('./enrollmentRotationService');
const practiceDocumentService = require('./practiceDocumentService');
const practiceBookImportService = require('./practiceBookImportService');
const practiceBookExportService = require('./practiceBookExportService');
const practiceAutoService = require('./practiceAutoService');
const { success } = require('../../../utils/response');
const { hasPermission } = require('../../../permissions/authz');
const { asyncHandler } = require('../../../utils/asyncHandler');

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
	return success(res, null, 'Đã xóa vòng');
});

module.exports = {
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
};
