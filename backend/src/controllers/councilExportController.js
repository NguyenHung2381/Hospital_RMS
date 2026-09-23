/**
 * councilExportController.js — POST /api/v1/councils/export-excel
 *
 * Xuất lịch bảo vệ đề cương của một đợt: mỗi dòng một đề tài kèm nhóm nghiên
 * cứu, hội đồng chấm (đã áp ghế thay thế theo đề tài), phiên và địa điểm —
 * layout theo file chuẩn "161_lich_bao_ve_chuan" của bệnh viện.
 *
 * Body: { round_id, fileName?, title?, subtitle? }
 */
const ExcelJS = require('exceljs');
const { getPool, sql } = require('../config/db');

const HD_ROLES = [
	['chairman', 'Chủ tịch'],
	['secretary', 'Thư ký'],
	['reviewer1', 'Phản biện 1'],
	['reviewer2', 'Phản biện 2'],
	['member', 'Thành viên'],
];
const NC_ROLES = {
	leader: 'Chủ nhiệm',
	secretary: 'Thư ký',
	member: 'Thành viên',
};
const SESSION_LABELS = {
	morning: 'Phiên 1\nTừ 8h00',
	afternoon: 'Phiên 2\nTừ 13h30',
};

const fnt = (o = {}) => ({ name: 'Times New Roman', size: 10, ...o });
const al = (h = 'center') => ({
	horizontal: h,
	vertical: 'middle',
	wrapText: true,
});
const thin = { style: 'thin', color: { argb: 'FF000000' } };
const bAll = { top: thin, bottom: thin, left: thin, right: thin };
const displayName = (r) =>
	r.qualification ? `${r.qualification}. ${r.full_name}` : (r.full_name ?? '');

const COLS = [
	{ h: 'STT', w: 4.5 },
	{ h: 'Khoa/phòng/TT', w: 12 },
	{ h: 'Tên Sáng kiến/Đề tài', w: 38, left: true },
	{ h: 'Thể loại', w: 7.5 },
	{ h: 'Nhóm nghiên cứu', w: 21, left: true },
	{ h: 'MNV', w: 6.5 },
	{ h: 'Vai trò nhóm NC', w: 11, left: true },
	{ h: 'Hội đồng', w: 26, left: true },
	{ h: 'Khoa, phòng, trung tâm', w: 24, left: true },
	{ h: 'Vai trò HĐ', w: 11, left: true },
	{ h: 'Phiên', w: 9 },
	{ h: 'Địa điểm', w: 11 },
];

async function exportExcel(req, res, next) {
	try {
		const { round_id, fileName, title, subtitle = '' } = req.body;
		const pool = await getPool();

		const roundResult = await pool
			.request()
			.input('round_id', sql.VarChar(10), round_id)
			.query('SELECT name, year FROM research_rounds WHERE id = @round_id');
		const round = roundResult.recordset[0];
		if (!round) {
			return res
				.status(404)
				.json({ success: false, message: 'Không tìm thấy đợt nghiên cứu' });
		}

		const rq = () =>
			pool.request().input('round_id', sql.VarChar(10), round_id);

		const topicsResult = await rq().query(`
      SELECT t.id, t.title, t.[session], t.council_id,
             d.name AS department_name, cat.name AS category_name,
             c.location
      FROM topics t
      INNER JOIN councils c ON c.id = t.council_id
      LEFT JOIN departments d ON d.id = t.department_id
      LEFT JOIN categories cat ON cat.id = t.category_id
      WHERE c.round_id = @round_id
      ORDER BY c.id,
        CASE t.[session] WHEN 'morning' THEN 0 WHEN 'afternoon' THEN 1 ELSE 2 END,
        t.created_at
    `);
		const topics = topicsResult.recordset;
		if (!topics.length) {
			return res.status(404).json({
				success: false,
				message: 'Đợt này chưa có đề tài nào được gán hội đồng',
			});
		}

		const membersResult = await rq().query(`
      SELECT tm.topic_id, tm.name AS ho_ten, tm.staff_number, tm.role
      FROM topic_members tm
      INNER JOIN topics t ON t.id = tm.topic_id
      INNER JOIN councils c ON c.id = t.council_id
      WHERE c.round_id = @round_id
      ORDER BY tm.topic_id,
        CASE tm.role WHEN 'leader' THEN 0 WHEN 'secretary' THEN 1 ELSE 2 END
    `);
		const membersByTopic = new Map();
		for (const m of membersResult.recordset) {
			if (!membersByTopic.has(m.topic_id)) membersByTopic.set(m.topic_id, []);
			membersByTopic.get(m.topic_id).push(m);
		}

		const seatsResult = await rq().query(`
      SELECT cm.council_id, cm.role, u.full_name,
             q.code AS qualification, d.name AS department_name
      FROM council_members cm
      INNER JOIN councils c ON c.id = cm.council_id
      LEFT JOIN users u ON u.id = cm.user_id
      LEFT JOIN qualifications q ON q.id = u.qualification_id
      LEFT JOIN departments d ON d.id = u.department_id
      WHERE c.round_id = @round_id
    `);
		const seatsByCouncil = new Map();
		for (const s of seatsResult.recordset) {
			if (!seatsByCouncil.has(s.council_id))
				seatsByCouncil.set(s.council_id, new Map());
			seatsByCouncil.get(s.council_id).set(s.role, s);
		}

		const subsResult = await rq().query(`
      SELECT s.topic_id, s.role, u.full_name,
             q.code AS qualification, d.name AS department_name
      FROM council_seat_substitutes s
      INNER JOIN topics t ON t.id = s.topic_id
      INNER JOIN councils c ON c.id = t.council_id
      LEFT JOIN users u ON u.id = s.user_id
      LEFT JOIN qualifications q ON q.id = u.qualification_id
      LEFT JOIN departments d ON d.id = u.department_id
      WHERE c.round_id = @round_id
    `);
		const subsByTopic = new Map();
		for (const s of subsResult.recordset) {
			if (!subsByTopic.has(s.topic_id)) subsByTopic.set(s.topic_id, new Map());
			subsByTopic.get(s.topic_id).set(s.role, s);
		}

		// ── Build sheet ──────────────────────────────────────────────────────────
		const wb = new ExcelJS.Workbook();
		wb.creator = 'RMS Hospital';
		wb.created = new Date();
		const ws = wb.addWorksheet('Lịch bảo vệ', {
			pageSetup: {
				orientation: 'landscape',
				paperSize: 9,
				fitToPage: true,
				fitToWidth: 1,
				printTitlesRow: '1:6',
			},
			views: [{ state: 'frozen', xSplit: 0, ySplit: 6 }],
		});
		COLS.forEach((c, i) => (ws.getColumn(i + 1).width = c.w));

		// Letterhead
		const head = [
			['A1:D1', 'SỞ Y TẾ', fnt({ bold: true, size: 11 })],
			['F1:L1', 'CỘNG HOÀ XÃ HỘI CHỦ NGHĨA VIỆT NAM', fnt({ bold: true, size: 11 })],
			['A2:D2', 'BỆNH VIỆN HNĐK NGHỆ AN', fnt({ bold: true, size: 11 })],
			['F2:L2', 'Độc lập - Tự do - Hạnh phúc', fnt({ bold: true, size: 11, underline: true })],
		];
		for (const [range, value, font] of head) {
			ws.mergeCells(range);
			Object.assign(ws.getCell(range.split(':')[0]), {
				value,
				font,
				alignment: al('center'),
			});
		}
		ws.getRow(1).height = 18;
		ws.getRow(2).height = 18;
		ws.getRow(3).height = 8;

		ws.mergeCells('A4:L4');
		Object.assign(ws.getCell('A4'), {
			value:
				title ||
				`LỊCH BẢO VỆ ĐỀ CƯƠNG SÁNG KIẾN, ĐỀ TÀI NGHIÊN CỨU KHOA HỌC CẤP CƠ SỞ NĂM ${round.year}`,
			font: fnt({ bold: true, size: 13 }),
			alignment: al('center'),
		});
		ws.getRow(4).height = 24;

		ws.mergeCells('A5:L5');
		Object.assign(ws.getCell('A5'), {
			value: subtitle,
			font: fnt({ italic: true, size: 11 }),
			alignment: al('center'),
		});
		ws.getRow(5).height = subtitle ? 20 : 8;

		// Column headers (row 6)
		COLS.forEach((c, i) => {
			Object.assign(ws.getCell(6, i + 1), {
				value: c.h,
				font: fnt({ bold: true }),
				alignment: al('center'),
				border: bAll,
			});
		});
		ws.getRow(6).height = 30;

		// Data rows — one row per topic, multi-line cells
		topics.forEach((t, idx) => {
			const members = membersByTopic.get(t.id) ?? [];
			const subs = subsByTopic.get(t.id);
			const baseSeats = seatsByCouncil.get(t.council_id);
			const seats = HD_ROLES.map(
				([role]) => subs?.get(role) ?? baseSeats?.get(role) ?? null,
			);

			const values = [
				idx + 1,
				t.department_name ?? '',
				t.title ?? '',
				t.category_name ?? '',
				members.map((m) => m.ho_ten ?? '').join('\n'),
				members.map((m) => m.staff_number ?? '').join('\n'),
				members.map((m) => NC_ROLES[m.role] ?? m.role ?? '').join('\n'),
				seats.map((s) => (s ? displayName(s) : '')).join('\n'),
				seats.map((s) => s?.department_name ?? '').join('\n'),
				HD_ROLES.map(([, label]) => label).join('\n'),
				SESSION_LABELS[t.session] ?? '',
				t.location ?? '',
			];

			const r = 7 + idx;
			values.forEach((v, i) => {
				Object.assign(ws.getCell(r, i + 1), {
					value: v,
					font: fnt(),
					alignment: al(COLS[i].left ? 'left' : 'center'),
					border: bAll,
				});
			});
			// Chiều cao ~ số dòng lớn nhất trong ô (hội đồng luôn 5 ghế, tên đề tài wrap ~45 ký tự/dòng)
			const lines = Math.max(
				5,
				members.length,
				Math.ceil((t.title ?? '').length / 45),
			);
			ws.getRow(r).height = lines * 13 + 4;
		});

		const safeName =
			(fileName || `lich-bao-ve-${round_id}`)
				.replace(/[/\\?%*:|"<>]/g, '')
				.trim() || 'lich-bao-ve';

		res.setHeader(
			'Content-Type',
			'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		);
		res.setHeader(
			'Content-Disposition',
			`attachment; filename*=UTF-8''${encodeURIComponent(safeName + '.xlsx')}`,
		);
		await wb.xlsx.write(res);
		res.end();
	} catch (err) {
		next(err);
	}
}

module.exports = { exportExcel };
