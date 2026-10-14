/**
 * cmePersonalExportController.js — Báo cáo tín chỉ CME của 1 cá nhân (Excel),
 * cùng mẫu "BC tổng" + "BC chi tiết" với báo cáo toàn viện (cmeReportService).
 *
 *   POST /api/v1/me/cme/export-excel                       Body: { year? } — của chính mình
 *   POST /api/v1/seminars/cme-personal/:userId/export-excel Body: { year? } — quản lý CME
 */
const cmeRequirementService = require('../services/cmeRequirementService');
const cmeReportService = require('../services/cmeReportService');

async function buildWorkbook(userId, year) {
	const profile = await cmeRequirementService.getPersonProfile(userId);
	if (!profile) throw Object.assign(new Error('Không tìm thấy nhân sự'), { statusCode: 404 });

	const data = await cmeReportService.getData({ year, userId });
	const wb = cmeReportService.buildWorkbook(data, {
		title: `BÁO CÁO TÍN CHỈ CME NĂM ${year}`,
		subtitle: [profile.full_name, profile.staff_number, profile.department_name].filter(Boolean).join(' · '),
		personal: true,
	});
	return { wb, profile };
}

const parseYear = (v) => {
	const y = Number(v);
	return Number.isInteger(y) && y >= 2000 && y <= 2100 ? y : new Date().getFullYear();
};

// Tên file không dấu: cme-<mã NV hoặc id>-<năm>.xlsx
const fileNameOf = (profile, year) =>
	`cme-${String(profile.staff_number || profile.id).replace(/[^\w-]+/g, '')}-${year}.xlsx`;

async function send(res, userId, year) {
	const { wb, profile } = await buildWorkbook(userId, year);
	res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
	res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileNameOf(profile, year))}`);
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

module.exports = { exportMine, exportPerson };
