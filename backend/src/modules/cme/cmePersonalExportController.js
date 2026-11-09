/**
 * cmePersonalExportController.js — Báo cáo tín chỉ CME của 1 cá nhân (Excel),
 * cùng mẫu "BC tổng" + "BC chi tiết" với báo cáo toàn viện (cmeReportService).
 *
 *   POST /api/v1/me/cme/export-excel                       Body: { year? } — của chính mình
 *   POST /api/v1/seminars/cme-personal/:userId/export-excel Body: { year? } — quản lý CME
 *   POST /api/v1/trainees/:id/cme/export-excel             Body: { year? } — hồ sơ học viên
 *
 * year: số năm (2000 – 2100) = 1 năm; 'all' = tất cả các năm (mỗi năm thêm 1 sheet);
 * thiếu / không hợp lệ = năm hiện tại.
 */
const cmeRequirementService = require('./cmeRequirementService');
const cmeReportService = require('./cmeReportService');
const cmeUserService = require('./cmeUserService');
const cmeReportWorkbook = require('./exports/cmeReportWorkbook');
const { httpError } = require('../../utils/httpError');

/** @param {number|null} year null = tất cả các năm */
async function buildWorkbook(userId, year) {
	const profile = await cmeRequirementService.getPersonProfile(userId);
	if (!profile) throw httpError(404, 'Không tìm thấy nhân sự');

	// Không truyền year = không giới hạn năm (cmeReportService.parseYearRange)
	const data = await cmeReportService.getData(year === null ? { userId } : { year, userId });
	const wb = cmeReportWorkbook.buildWorkbook(data, {
		title: `BÁO CÁO TÍN CHỈ CME ${data.rangeLabel}`,
		subtitle: [profile.full_name, profile.staff_number, profile.department_name]
			.filter(Boolean)
			.join(' · '),
		personal: true,
	});
	return { wb, profile };
}

/** @returns {number|null} null = tất cả các năm */
const parseYear = (v) => {
	if (v === 'all') return null;
	const y = Number(v);
	return Number.isInteger(y) && y >= 2000 && y <= 2100 ? y : new Date().getFullYear();
};

// Tên file không dấu: cme-<mã NV hoặc id>-<năm | tat-ca-nam>.xlsx
const fileNameOf = (profile, year) =>
	`cme-${String(profile.staff_number || profile.id).replace(/[^\w-]+/g, '')}-${year ?? 'tat-ca-nam'}.xlsx`;

async function send(res, userId, year) {
	const { wb, profile } = await buildWorkbook(userId, year);
	res.setHeader(
		'Content-Type',
		'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	);
	res.setHeader(
		'Content-Disposition',
		`attachment; filename*=UTF-8''${encodeURIComponent(fileNameOf(profile, year))}`,
	);
	await wb.xlsx.write(res);
	res.end();
}

async function exportMine(req, res, next) {
	try {
		await send(res, req.user.id, parseYear(req.body?.year));
	} catch (err) {
		next(err);
	}
}

async function exportPerson(req, res, next) {
	try {
		await send(res, req.params.userId, parseYear(req.body?.year));
	} catch (err) {
		next(err);
	}
}

// Học viên: sổ CME theo tài khoản gắn với hồ sơ học viên (trainees.user_id)
async function exportTrainee(req, res, next) {
	try {
		const userId = await cmeUserService.getTraineeUserId(req.params.id);
		if (!userId) throw httpError(404, 'Học viên chưa có tài khoản nên chưa có sổ CME.');
		await send(res, userId, parseYear(req.body?.year));
	} catch (err) {
		next(err);
	}
}

module.exports = { exportMine, exportPerson, exportTrainee };
