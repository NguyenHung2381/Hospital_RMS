/**
 * cmeReportService.js — Báo cáo tín chỉ CME theo mẫu "mẫu bc CME.xlsx":
 *   Sheet "BC tổng"     : TT | MNV | Họ và tên | Tổng số tiết
 *   Sheet "BC chi tiết" : TT | MNV | Họ và tên | <từng nhóm hình thức CME> | Tổng
 * Cộng dồn 2 nguồn giống cmeRequirementService.getComplianceReport: tham dự hội
 * thảo đã cấp CME (seminar_participants.cme_year) + ghi nhận độc lập đã duyệt.
 * Dùng cho file xuất trang Ghi nhận CME (toàn viện) và phiếu CME cá nhân (userId).
 */
const ExcelJS = require('exceljs');
const { getPool, sql } = require('../config/db');
const xl = require('../utils/excelTemplate');

// Tín chỉ hội thảo/hội nghị thuộc nhóm "Khóa đào tạo, bồi dưỡng ngắn hạn, hội nghị, hội thảo"
const SEMINAR_GROUP = { id: 'CME_DAOTAO', name: 'Khóa đào tạo, bồi dưỡng ngắn hạn, hội nghị, hội thảo về y khoa' };
const NO_GROUP = { id: '__none__', name: 'Chưa phân loại' };

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

// Liệt kê mọi nhân sự đang hoạt động (kể cả 0 tiết) + người đã nghỉ nhưng có tín chỉ.
// year rỗng = mọi năm. department = tên khoa/phòng (khớp bộ lọc trang Ghi nhận CME).
const getData = async ({ year, userId, department, search } = {}) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('year', sql.Int, year ? Number(year) : null)
		.input('uid', sql.VarChar(20), userId || null)
		.input('dept', sql.NVarChar(255), department || null).query(`
    SELECT id, name FROM cme_credit_groups ORDER BY sort_order, name;

    SELECT u.id, u.staff_number, u.full_name, d.name AS department_name, x.group_id, SUM(x.credits) AS credits
    FROM users u
    LEFT JOIN departments d ON d.id = u.department_id
    LEFT JOIN (
      SELECT p.user_id, '${SEMINAR_GROUP.id}' AS group_id, p.cme_credits AS credits
      FROM seminar_participants p
      WHERE p.cme_year IS NOT NULL AND (@year IS NULL OR p.cme_year = @year) AND ISNULL(p.cme_credits, 0) > 0
      UNION ALL
      SELECT r.user_id, c.group_id, r.credits
      FROM cme_records r
      LEFT JOIN cme_credit_categories c ON c.id = r.category_id
      WHERE r.approval_status = 'approved' AND (@year IS NULL OR r.year = @year)
    ) x ON x.user_id = u.id
    WHERE (@uid IS NULL OR u.id = @uid) AND (@dept IS NULL OR d.name = @dept)
      AND (u.is_active = 1 OR x.user_id IS NOT NULL OR @uid IS NOT NULL)
    GROUP BY u.id, u.staff_number, u.full_name, d.name, x.group_id
    ORDER BY d.name, u.full_name;
  `);
	const [groupRows, creditRows] = r.recordsets;

	const q = String(search || '').trim().toLowerCase();
	const people = new Map();
	for (const row of creditRows) {
		if (q && !row.full_name.toLowerCase().includes(q) && !String(row.staff_number ?? '').includes(q)) continue;
		const p = people.get(row.id) ?? { ...row, by_group: {}, total: 0 };
		people.set(row.id, p);
		if (row.credits == null) continue; // nhân sự chưa có tín chỉ → dòng 0 tiết
		const gid = row.group_id ?? NO_GROUP.id;
		p.by_group[gid] = round2((p.by_group[gid] ?? 0) + Number(row.credits));
		p.total = round2(p.total + Number(row.credits));
	}

	// Cột hình thức = danh mục nhóm; thêm cột phụ nếu dữ liệu rơi vào nhóm không có trong danh mục
	const groups = [...groupRows];
	const used = new Set([...people.values()].flatMap((p) => Object.keys(p.by_group)));
	if (used.has(SEMINAR_GROUP.id) && !groups.some((g) => g.id === SEMINAR_GROUP.id)) groups.unshift(SEMINAR_GROUP);
	if (used.has(NO_GROUP.id)) groups.push(NO_GROUP);

	return { groups, people: [...people.values()] };
};

const buildWorkbook = ({ groups, people }, { title, subtitle }) => {
	const wb = new ExcelJS.Workbook();
	wb.creator = 'RMS Hospital';
	wb.created = new Date();
	const ident = [
		{ key: 'tt', header: 'TT', width: 6 },
		{ key: 'mnv', header: 'MNV', width: 10 },
		{ key: 'name', header: 'Họ và tên', width: 28 },
	];
	const identOf = (p, i) => ({ tt: i + 1, mnv: p.staff_number ?? '', name: p.full_name });

	const sum = xl.buildSheet(wb, {
		sheetName: 'BC tổng',
		letterhead: true,
		title,
		subtitle,
		columns: [...ident, { key: 'total', header: 'Tổng số tiết', width: 16 }],
	});
	people.forEach((p, i) => sum.addRow({ ...identOf(p, i), total: p.total }));
	xl.styleBody(sum);

	const groupCols = groups.map((g) => ({ key: g.id, header: g.name, width: 22 }));
	const det = xl.buildSheet(wb, {
		sheetName: 'BC chi tiết',
		letterhead: true,
		title,
		subtitle,
		columns: [...ident, ...groupCols, { key: 'total', header: 'Tổng', width: 12 }],
	});
	det.getRow(det.headRow).height = 60;
	const first = xl.colLetter(ident.length + 1);
	const last = xl.colLetter(ident.length + groupCols.length);
	people.forEach((p, i) => {
		const row = det.addRow({
			...identOf(p, i),
			...Object.fromEntries(groups.map((g) => [g.id, p.by_group[g.id] ?? 0])),
		});
		// Tổng là công thức như mẫu (sửa số từng hình thức thì tự cộng lại), kèm sẵn kết quả
		row.getCell('total').value = groups.length
			? { formula: `SUM(${first}${row.number}:${last}${row.number})`, result: p.total }
			: p.total;
	});
	xl.styleBody(det);
	return wb;
};

module.exports = { getData, buildWorkbook };
