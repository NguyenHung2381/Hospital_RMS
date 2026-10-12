/**
 * cmePersonalExportController.js — Phiếu theo dõi tín chỉ CME của 1 cá nhân (Excel).
 *
 *   POST /api/v1/me/cme/export-excel                       Body: { year? } — của chính mình
 *   POST /api/v1/seminars/cme-personal/:userId/export-excel Body: { year? } — quản lý CME
 *
 * Sheets:
 *   1. "CME năm YYYY"   — thông tin nhân sự + CCHN, tổng hợp tín chỉ so với ngưỡng,
 *                         hội thảo/hội nghị đã tham dự, ghi nhận CME khác, ô ký xác nhận.
 *   2. "Tổng hợp 5 năm" — tín chỉ từng năm trong 5 năm liên tiếp (chu kỳ gia hạn
 *                         giấy phép hành nghề) để đối chiếu.
 * Số liệu dùng chung nguồn với trang "CME của tôi" (portalService.getUserCme).
 */
const ExcelJS = require('exceljs');
const portalService = require('../services/portalService');
const cmeRequirementService = require('../services/cmeRequirementService');
const { fnt, al, sf, bAll } = require('../utils/excelStyle');

const C = {
	hdrBlue: 'FF1F4E79',
	rowA: 'FFEBF3FB',
	rowB: 'FFF7FBFF',
	totalBg: 'FFD9E1F2',
	labelBg: 'FFF2F2F2',
	green: 'FFE2EFDA',
	red: 'FFFCE4D6',
	amber: 'FFFFF3CD',
};

const EVENT_TYPE_LABELS = {
	conference: 'Hội nghị',
	sci_seminar: 'Hội thảo khoa học',
	intl_seminar: 'Hội thảo quốc tế',
	sci_conference: 'Hội nghị khoa học',
	training: 'Tập huấn',
	other: 'Khác',
};
const PARTICIPATION_LABELS = {
	attendee: 'Đại biểu',
	speaker: 'Báo cáo viên',
	chair: 'Chủ tọa',
	organizer: 'Ban tổ chức',
	trainee: 'Học viên',
};
const CME_STATUS_LABELS = { none: 'Chưa cấp', pending: 'Chờ cấp', issued: 'Đã cấp', signed: 'Đã ký nhận' };

const CYCLE_YEARS = 5;
const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

const fmtDate = (d) => {
	if (!d) return '';
	const x = d instanceof Date ? d : new Date(d);
	if (Number.isNaN(x.getTime())) return '';
	const p = (n) => String(n).padStart(2, '0');
	return `${p(x.getDate())}/${p(x.getMonth() + 1)}/${x.getFullYear()}`;
};

const eventTime = (s) => {
	if (s.date_text) return s.date_text;
	const from = fmtDate(s.start_date);
	const to = fmtDate(s.end_date);
	return to && to !== from ? `${from} – ${to}` : from;
};

// Ghi giá trị vào ô (gộp c1..c2 nếu cần) và áp style cho cả vùng.
function put(ws, row, c1, c2, value, style = {}) {
	if (c2 > c1) ws.mergeCells(row, c1, row, c2);
	const cell = ws.getCell(row, c1);
	cell.value = value ?? '';
	for (let c = c1; c <= c2; c++) Object.assign(ws.getCell(row, c), style);
}

function writeLetterhead(ws, lastCol) {
	put(ws, 1, 1, 4, 'SỞ Y TẾ NGHỆ AN', { font: fnt({ size: 11 }), alignment: al('center', false) });
	put(ws, 1, 5, lastCol, 'CỘNG HOÀ XÃ HỘI CHỦ NGHĨA VIỆT NAM', {
		font: fnt({ bold: true, size: 11 }),
		alignment: al('center', false),
	});
	put(ws, 2, 1, 4, 'BỆNH VIỆN HNĐK NGHỆ AN', { font: fnt({ bold: true, size: 11 }), alignment: al('center', false) });
	put(ws, 2, 5, lastCol, 'Độc lập - Tự do - Hạnh phúc', {
		font: fnt({ italic: true, size: 11 }),
		alignment: al('center', false),
	});
	ws.getRow(1).height = 18;
	ws.getRow(2).height = 18;
}

function titleBlock(ws, lastCol, title, sub) {
	put(ws, 4, 1, lastCol, title, { font: fnt({ bold: true, size: 13 }), alignment: al('center', true) });
	ws.getRow(4).height = 30;
	put(ws, 5, 1, lastCol, sub, { font: fnt({ italic: true, size: 11 }), alignment: al('center', false) });
}

function sectionTitle(ws, row, lastCol, text) {
	put(ws, row, 1, lastCol, text, { font: fnt({ bold: true, size: 11 }), alignment: al('left', false) });
	ws.getRow(row).height = 20;
}

// cols: [{ label, from, to? }] — 1 cột logic có thể gộp nhiều cột Excel.
function headerRow(ws, row, cols) {
	for (const c of cols) {
		put(ws, row, c.from, c.to ?? c.from, c.label, {
			font: fnt({ bold: true, size: 10, color: 'FFFFFF' }),
			fill: sf(C.hdrBlue),
			alignment: al('center', true),
			border: bAll,
		});
	}
	ws.getRow(row).height = 30;
}

function dataRow(ws, row, cols, values, { bg, bold = false } = {}) {
	cols.forEach((c, i) => {
		const v = values[i];
		put(ws, row, c.from, c.to ?? c.from, v, {
			font: fnt({ size: 10, bold }),
			fill: sf(bg || (row % 2 === 0 ? C.rowA : C.rowB)),
			alignment: al(typeof v === 'number' || c.center ? 'center' : 'left', true),
			border: bAll,
		});
	});
}

function emptyRow(ws, row, lastCol, text) {
	put(ws, row, 1, lastCol, text, {
		font: fnt({ size: 10, italic: true, color: '6B7280' }),
		alignment: al('center', true),
		border: bAll,
	});
}

function resultText(earned, required) {
	if (required == null) return { text: 'Chưa có ngưỡng yêu cầu', bg: C.labelBg };
	const missing = round2(Number(required) - earned);
	return missing <= 0
		? { text: 'Đạt yêu cầu', bg: C.green }
		: { text: `Còn thiếu ${missing} tín chỉ`, bg: C.red };
}

// ─── Sheet 1: phiếu CME của năm ──────────────────────────────────────────────
function buildYearSheet(wb, profile, data) {
	const LAST = 10;
	const ws = wb.addWorksheet(`CME năm ${data.year}`, {
		pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
	});
	[5, 40, 18, 20, 16, 14, 14, 12, 9, 14].forEach((w, i) => (ws.getColumn(i + 1).width = w));

	writeLetterhead(ws, LAST);
	titleBlock(ws, LAST, 'PHIẾU THEO DÕI TÍN CHỈ ĐÀO TẠO Y KHOA LIÊN TỤC (CME)', `Năm ${data.year}`);

	// Thông tin nhân sự: 2 cặp nhãn – giá trị mỗi dòng
	const labelStyle = { font: fnt({ bold: true, size: 10 }), fill: sf(C.labelBg), alignment: al('left', true), border: bAll };
	const valueStyle = { font: fnt({ size: 10 }), alignment: al('left', true), border: bAll };
	const license = [profile.license_no, profile.license_issued_date && `cấp ngày ${fmtDate(profile.license_issued_date)}`]
		.filter(Boolean)
		.join(' – ');
	const info = [
		['Họ và tên', profile.full_name, 'Mã nhân viên', profile.staff_number],
		['Khoa / Phòng', profile.department_name, 'Chức danh / Trình độ', [profile.title, profile.qualification].filter(Boolean).join(' – ')],
		['Số CCHN', license, 'Chuyên khoa cập nhật KTYK', profile.cme_specialty || profile.primary_specialty],
	];
	let r = 7;
	for (const [l1, v1, l2, v2] of info) {
		put(ws, r, 1, 2, l1, labelStyle);
		put(ws, r, 3, 5, v1 || '—', valueStyle);
		put(ws, r, 6, 7, l2, labelStyle);
		put(ws, r, 8, LAST, v2 || '—', valueStyle);
		ws.getRow(r).height = 20;
		r++;
	}

	// I. Tổng hợp
	const counted = data.seminars.filter((s) => s.cme_year === data.year);
	const seminarCredits = round2(counted.reduce((t, s) => t + Number(s.cme_credits || 0), 0));
	const recordCredits = round2(data.records.reduce((t, x) => t + Number(x.credits || 0), 0));
	const required = data.required_credits != null ? Number(data.required_credits) : null;
	const result = resultText(data.earned_credits, required);

	r++;
	sectionTitle(ws, r++, LAST, 'I. TỔNG HỢP TÍN CHỈ');
	const summary = [
		['Tín chỉ từ hội thảo, hội nghị', seminarCredits],
		['Tín chỉ ghi nhận khác (tự học, trực tuyến, hoạt động quy đổi...)', recordCredits],
		['Tổng tín chỉ đạt được', data.earned_credits, { bold: true, bg: C.totalBg }],
		['Ngưỡng yêu cầu của năm', required ?? 'Chưa cấu hình'],
		['Kết quả', result.text, { bold: true, bg: result.bg }],
	];
	for (const [label, value, opt = {}] of summary) {
		put(ws, r, 1, 5, label, { ...labelStyle, ...(opt.bg ? { fill: sf(opt.bg) } : {}) });
		put(ws, r, 6, 7, value, {
			font: fnt({ size: 10, bold: !!opt.bold }),
			fill: sf(opt.bg || 'FFFFFFFF'),
			alignment: al('center', true),
			border: bAll,
		});
		ws.getRow(r).height = 20;
		r++;
	}

	// II. Hội thảo, hội nghị
	r++;
	sectionTitle(ws, r++, LAST, `II. HỘI THẢO, HỘI NGHỊ ĐÃ THAM DỰ (${data.seminars.length})`);
	const semCols = [
		{ label: 'STT', from: 1 },
		{ label: 'Tên hội thảo / hội nghị', from: 2 },
		{ label: 'Hình thức', from: 3 },
		{ label: 'Địa điểm', from: 4 },
		{ label: 'Thời gian', from: 5, center: true },
		{ label: 'Vai trò', from: 6, center: true },
		{ label: 'Số chứng nhận CME', from: 7, center: true },
		{ label: 'Ngày cấp', from: 8, center: true },
		{ label: 'Tín chỉ', from: 9 },
		{ label: 'Trạng thái CME', from: 10, center: true },
	];
	headerRow(ws, r++, semCols);
	if (data.seminars.length === 0) {
		emptyRow(ws, r++, LAST, 'Không có hội thảo, hội nghị nào trong năm');
	} else {
		data.seminars.forEach((s, i) => {
			const credits = s.cme_credits != null ? round2(s.cme_credits) : '';
			dataRow(ws, r++, semCols, [
				i + 1,
				s.seminar_title,
				EVENT_TYPE_LABELS[s.event_type] ?? '',
				s.location ?? '',
				eventTime(s),
				PARTICIPATION_LABELS[s.participation_type] ?? '',
				s.cme_certificate_no ?? '',
				fmtDate(s.cme_issued_date),
				credits,
				CME_STATUS_LABELS[s.cme_status] ?? '',
			]);
		});
		put(ws, r, 1, 8, 'Cộng tín chỉ tính vào năm', {
			font: fnt({ bold: true, size: 10 }),
			fill: sf(C.totalBg),
			alignment: al('right', false),
			border: bAll,
		});
		dataRow(ws, r++, [{ from: 9 }, { from: 10 }], [seminarCredits, ''], { bg: C.totalBg, bold: true });
	}

	// III. Ghi nhận khác
	r++;
	sectionTitle(ws, r++, LAST, `III. GHI NHẬN CME KHÁC (${data.records.length})`);
	const recCols = [
		{ label: 'STT', from: 1 },
		{ label: 'Nội dung hoạt động', from: 2 },
		{ label: 'Loại hoạt động', from: 3, to: 4 },
		{ label: 'Ngày', from: 5, center: true },
		{ label: 'Ghi chú', from: 6, to: 8 },
		{ label: 'Tín chỉ', from: 9 },
		{ label: 'Minh chứng', from: 10, center: true },
	];
	headerRow(ws, r++, recCols);
	if (data.records.length === 0) {
		emptyRow(ws, r++, LAST, 'Không có ghi nhận CME khác trong năm');
	} else {
		data.records.forEach((x, i) => {
			dataRow(ws, r++, recCols, [
				i + 1,
				x.title,
				x.category_name ?? '',
				fmtDate(x.activity_date),
				x.note ?? '',
				round2(x.credits),
				x.has_evidence ? 'Có' : '',
			]);
		});
		put(ws, r, 1, 8, 'Cộng', {
			font: fnt({ bold: true, size: 10 }),
			fill: sf(C.totalBg),
			alignment: al('right', false),
			border: bAll,
		});
		dataRow(ws, r++, [{ from: 9 }, { from: 10 }], [recordCredits, ''], { bg: C.totalBg, bold: true });
	}

	// Ghi chú + ký xác nhận
	r++;
	put(
		ws,
		r++,
		1,
		LAST,
		'Ghi chú: Tín chỉ hội thảo chỉ được cộng khi đã có số chứng nhận CME của năm; sự kiện chưa cấp CME được liệt kê để theo dõi.',
		{ font: fnt({ italic: true, size: 9, color: '6B7280' }), alignment: al('left', true) },
	);
	r++;
	const now = new Date();
	put(ws, r++, 7, LAST, `Nghệ An, ngày ${now.getDate()} tháng ${now.getMonth() + 1} năm ${now.getFullYear()}`, {
		font: fnt({ italic: true, size: 11 }),
		alignment: al('center', false),
	});
	put(ws, r, 1, 4, 'XÁC NHẬN CỦA KHOA / PHÒNG', { font: fnt({ bold: true, size: 11 }), alignment: al('center', false) });
	put(ws, r++, 7, LAST, 'NGƯỜI KÊ KHAI', { font: fnt({ bold: true, size: 11 }), alignment: al('center', false) });
	put(ws, r, 1, 4, '(Ký, ghi rõ họ tên)', { font: fnt({ italic: true, size: 10 }), alignment: al('center', false) });
	put(ws, r++, 7, LAST, '(Ký, ghi rõ họ tên)', { font: fnt({ italic: true, size: 10 }), alignment: al('center', false) });
	r += 4;
	put(ws, r, 7, LAST, profile.full_name, { font: fnt({ bold: true, size: 11 }), alignment: al('center', false) });

	return ws;
}

// ─── Sheet 2: tổng hợp 5 năm ─────────────────────────────────────────────────
function buildCycleSheet(wb, profile, rows, fromYear, toYear) {
	const LAST = 8;
	const ws = wb.addWorksheet(`Tổng hợp ${CYCLE_YEARS} năm`);
	[10, 14, 16, 14, 16, 14, 14, 24].forEach((w, i) => (ws.getColumn(i + 1).width = w));

	writeLetterhead(ws, LAST);
	titleBlock(
		ws,
		LAST,
		`TỔNG HỢP TÍN CHỈ CME THEO NĂM (${fromYear} – ${toYear})`,
		[profile.full_name, profile.staff_number, profile.department_name].filter(Boolean).join(' · '),
	);

	const cols = [
		{ label: 'Năm', from: 1 },
		{ label: 'Số sự kiện được cấp CME', from: 2 },
		{ label: 'Tín chỉ hội thảo, hội nghị', from: 3 },
		{ label: 'Số ghi nhận khác', from: 4 },
		{ label: 'Tín chỉ ghi nhận khác', from: 5 },
		{ label: 'Tổng tín chỉ', from: 6 },
		{ label: 'Ngưỡng yêu cầu', from: 7 },
		{ label: 'Kết quả', from: 8, center: true },
	];
	let r = 7;
	headerRow(ws, r++, cols);
	const total = { sc: 0, scr: 0, rc: 0, rcr: 0 };
	for (const y of rows) {
		const earned = round2(Number(y.seminar_credits) + Number(y.record_credits));
		const res = resultText(earned, y.required_credits);
		dataRow(ws, r, cols, [
			y.year,
			y.seminar_count,
			round2(y.seminar_credits),
			y.record_count,
			round2(y.record_credits),
			earned,
			y.required_credits != null ? round2(y.required_credits) : '—',
			res.text,
		]);
		ws.getCell(r, 8).fill = sf(res.bg);
		total.sc += y.seminar_count;
		total.scr += Number(y.seminar_credits);
		total.rc += y.record_count;
		total.rcr += Number(y.record_credits);
		r++;
	}
	dataRow(
		ws,
		r++,
		cols,
		['Cộng', total.sc, round2(total.scr), total.rc, round2(total.rcr), round2(total.scr + total.rcr), '', ''],
		{ bg: C.totalBg, bold: true },
	);
	r++;
	put(
		ws,
		r,
		1,
		LAST,
		`Tổng hợp ${CYCLE_YEARS} năm liên tiếp phục vụ đối chiếu khi gia hạn giấy phép hành nghề. Ngưỡng từng năm lấy theo cấu hình của khoa/phòng (nếu có), nếu không theo ngưỡng toàn viện.`,
		{ font: fnt({ italic: true, size: 9, color: '6B7280' }), alignment: al('left', true) },
	);
	ws.getRow(r).height = 30;
	return ws;
}

async function buildWorkbook(userId, year) {
	const profile = await cmeRequirementService.getPersonProfile(userId);
	if (!profile) throw Object.assign(new Error('Không tìm thấy nhân sự'), { statusCode: 404 });

	const fromYear = year - CYCLE_YEARS + 1;
	const [raw, yearly] = await Promise.all([
		portalService.getUserCme(userId, year),
		cmeRequirementService.getPersonYearlySummary(userId, fromYear, year),
	]);
	// phiếu chỉ ghi nhận các khai báo đã được duyệt
	const data = { ...raw, records: raw.records.filter((x) => x.approval_status === 'approved') };

	const wb = new ExcelJS.Workbook();
	wb.creator = 'RMS Hospital';
	wb.created = new Date();
	buildYearSheet(wb, profile, data);
	buildCycleSheet(wb, profile, yearly, fromYear, year);
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
