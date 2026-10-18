/**
 * seminarController.js — Hội thảo / Hội nghị & CME.
 * Base CRUD lấy từ createCrudController(seminarService); phần người tham dự,
 * cấp CME và thống kê xử lý riêng.
 */
const seminarService = require('./seminarService');
const partService = require('./seminarParticipantService');
const importService = require('./seminarImportService');
const listExcelService = require('./seminarListExcelService');
const detailExcelService = require('./seminarDetailExcelService');
const { createCrudController } = require('../../shared/crudController');
const { success, created, notFound, sendWorkbook } = require('../../utils/response');
const { asyncHandler } = require('../../utils/asyncHandler');

const base = createCrudController(seminarService);

// ─── Thống kê ────────────────────────────────────────────────────────────────
const statsHosted = asyncHandler(async (req, res) => {
	return success(res, await seminarService.statsHosted(req.query));
});

const cmeStats = asyncHandler(async (req, res) => {
	return success(res, await seminarService.statsCme(req.query));
});

const cmeRegister = asyncHandler(async (req, res) => {
	return success(res, await seminarService.cmeRegister(req.query));
});

const updateCmeRegister = asyncHandler(async (req, res) => {
	const out = await seminarService.updateRegisterSeq(
		req.params.year,
		req.body.last_seq,
		req.user.id,
	);
	return success(res, out, 'Đã cập nhật sổ cấp CME');
});

// ─── Người tham dự ───────────────────────────────────────────────────────────
const listParticipants = asyncHandler(async (req, res) => {
	return success(res, await partService.listBySeminar(req.params.id));
});

const addParticipant = asyncHandler(async (req, res) => {
	return created(
		res,
		await partService.add(req.params.id, req.body, req.user.id),
		'Đã thêm người tham dự',
	);
});

const updateParticipant = asyncHandler(async (req, res) => {
	const p = await partService.update(req.params.id, req.params.pid, req.body, req.user.id);
	if (!p) return notFound(res);
	return success(res, p, 'Đã cập nhật');
});

const removeParticipant = asyncHandler(async (req, res) => {
	await partService.remove(req.params.id, req.params.pid, req.user.id);
	return success(res, null, 'Đã xoá');
});

// ─── CME ─────────────────────────────────────────────────────────────────────
const issueCme = asyncHandler(async (req, res) => {
	const ids = req.body.participant_ids || (req.params.pid ? [req.params.pid] : []);
	const out = await partService.issueCme(req.params.id, ids, req.user.id, {
		year: req.body.year,
	});
	return success(
		res,
		out,
		out.issued
			? `Đã cấp ${out.issued} số CME (${String(out.from).padStart(4, '0')}–${String(out.to).padStart(4, '0')} / ${out.year})`
			: out.skipped
				? `${out.skipped} người chưa đủ điều kiện (chưa điểm danh / chưa làm hoặc chưa đạt bài test)`
				: 'Không có người nào cần cấp số CME',
	);
});

const revokeCme = asyncHandler(async (req, res) => {
	await partService.revokeCme(req.params.id, req.params.pid, req.user.id);
	return success(res, null, 'Đã thu hồi số CME');
});

const bulkCmeStatus = asyncHandler(async (req, res) => {
	const out = await partService.setCmeStatus(
		req.params.id,
		req.body.participant_ids || [],
		req.body.status,
		req.user.id,
	);
	return success(res, out, `Đã cập nhật ${out.updated} bản ghi`);
});

// ─── Điểm danh QR ─────────────────────────────────────────────────────────────
const getCheckInQrToken = (req, res) => {
	return success(res, { token: partService.generateCheckInQrToken(req.params.id) });
};

const checkInSelf = asyncHandler(async (req, res) => {
	const result = await partService.checkInSelf(req.body.token, req.body.device_id, req.user);
	return success(res, result, 'Điểm danh thành công');
});

const checkInTicket = asyncHandler(async (req, res) => {
	const row = await partService.checkInTicket(req.params.id, req.body.code, req.user.id);
	return success(
		res,
		row,
		row.already ? 'Người này đã điểm danh trước đó' : 'Điểm danh thành công',
	);
});

// ─── Nhập Excel danh sách người tham dự ──────────────────────────────────────
const importParticipants = asyncHandler(async (req, res) => {
	if (!req.file) {
		return res.status(400).json({ success: false, message: 'Chưa chọn file Excel.' });
	}
	const out = await importService.importExcel(
		{
			buffer: req.file.buffer,
			seminar_id: req.params.id,
			dry_run: req.body.dry_run === '1' || req.body.dry_run === 'true',
			issue_cme: req.body.issue_cme === '1' || req.body.issue_cme === 'true',
			credits_by_role: req.body.credits_by_role,
		},
		req.user.id,
	);
	return success(
		res,
		out,
		out.dry_run
			? 'Đã đọc file — kiểm tra trước khi nhập'
			: `Đã nhập ${out.inserted} người${out.cme_issued ? `, cấp ${out.cme_issued} số CME` : ''}`,
	);
});

// ─── Nhập / xuất Excel danh sách hội thảo ────────────────────────────────────
const exportListExcel = asyncHandler(async (req, res) => {
	const { search, scope, event_type, year, grants_cme } = req.body || {};
	const wb = await listExcelService.exportWorkbook({
		search,
		scope,
		event_type,
		year,
		grants_cme,
	});
	return sendWorkbook(res, wb, `hoi-thao-hoi-nghi${year ? `-${year}` : ''}.xlsx`);
});

// Xuất Excel 1 hội nghị: thông tin + người tham dự + bài học (parts để chọn bớt)
const exportDetailExcel = asyncHandler(async (req, res) => {
	const parts = Array.isArray(req.body?.parts) ? req.body.parts : undefined;
	const out = await detailExcelService.exportWorkbook(req.params.id, parts);
	if (!out) return notFound(res);
	const year = out.seminar.event_year ? `-${out.seminar.event_year}` : '';
	return sendWorkbook(res, out.wb, `hoi-nghi-${out.seminar.id}${year}.xlsx`);
});

const importListTemplate = asyncHandler(async (req, res) => {
	return sendWorkbook(res, await listExcelService.templateWorkbook(), 'mau-nhap-hoi-thao.xlsx');
});

const participantImportTemplate = asyncHandler(async (req, res) => {
	return sendWorkbook(res, importService.templateWorkbook(), 'mau-nhap-nguoi-tham-du.xlsx');
});

const importListExcel = asyncHandler(async (req, res) => {
	if (!req.file) {
		return res.status(400).json({ success: false, message: 'Chưa chọn file Excel.' });
	}
	const out = await listExcelService.importExcel(
		{
			buffer: req.file.buffer,
			dry_run: req.body.dry_run === '1' || req.body.dry_run === 'true',
		},
		req.user.id,
	);
	return success(
		res,
		out,
		out.dry_run ? 'Đã đọc file — kiểm tra trước khi nhập' : `Đã nhập ${out.inserted} sự kiện`,
	);
});

module.exports = {
	...base,
	exportListExcel,
	exportDetailExcel,
	importListTemplate,
	importListExcel,
	participantImportTemplate,
	statsHosted,
	cmeStats,
	cmeRegister,
	updateCmeRegister,
	listParticipants,
	addParticipant,
	updateParticipant,
	removeParticipant,
	issueCme,
	revokeCme,
	bulkCmeStatus,
	importParticipants,
	getCheckInQrToken,
	checkInSelf,
	checkInTicket,
};
