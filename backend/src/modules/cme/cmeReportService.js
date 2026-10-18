/**
 * cmeReportService.js — Báo cáo tín chỉ CME (Excel), dựa theo mẫu "mẫu bc CME.xlsx":
 *   Sheet "Tổng quan"     : chỉ tiêu tổng hợp + cơ cấu theo hình thức CME
 *   Sheet "BC tổng"       : TT | MNV | Họ và tên | Khoa/Phòng | Tổng số tiết (| Ngưỡng | Đánh giá)
 *   Sheet "BC chi tiết"   : TT | MNV | Họ và tên | Khoa/Phòng | <từng nhóm hình thức CME> | Tổng
 *   Sheet "Theo khoa"     : tổng hợp theo khoa/phòng
 *   Sheet "Chưa đạt"      : nhân sự chưa đủ ngưỡng (khi trong khoảng năm có cấu hình ngưỡng)
 *   Sheet "DS hoạt động"  : từng hoạt động được tính tín chỉ
 * Báo cáo theo khoảng năm (từ năm – đến năm): BC tổng / Theo khoa / Chưa đạt có thêm
 * cột từng năm, thêm sheet "Theo năm" và mỗi năm 1 sheet "Năm <yyyy>"; ngưỡng đánh giá = cộng dồn ngưỡng các năm.
 * Các sheet danh sách có AutoFilter + cố định hàng tiêu đề; dòng tổng dùng SUBTOTAL nên
 * tự cộng theo kết quả lọc.
 * Phiếu CME cá nhân (personal) chỉ gồm BC tổng, BC chi tiết, DS hoạt động.
 * Cộng dồn 2 nguồn giống cmeRequirementService.getComplianceReport: tham dự hội
 * thảo đã cấp CME (seminar_participants.cme_year) + ghi nhận độc lập đã duyệt.
 * Dùng cho file xuất trang Ghi nhận CME (toàn viện) và phiếu CME cá nhân (userId).
 */
const { getPool, sql } = require('../../config/db');
const { deptAccountJoinSql, isDeptAccountJoinedSql } = require('../../utils/deptAccount');
const { httpError } = require('../../utils/httpError');

// Tín chỉ hội thảo/hội nghị thuộc nhóm "Khóa đào tạo, bồi dưỡng ngắn hạn, hội nghị, hội thảo"
const SEMINAR_GROUP = {
	id: 'CME_DAOTAO',
	name: 'Khóa đào tạo, bồi dưỡng ngắn hạn, hội nghị, hội thảo về y khoa',
};
const NO_GROUP = { id: '__none__', name: 'Chưa phân loại' };
const NO_DEPT = '(Chưa có khoa/phòng)';

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

// Khoảng năm tối đa của một báo cáo (mỗi năm thêm 1 cột ở BC tổng / Theo khoa / Chưa đạt)
const MAX_YEAR_SPAN = 20;

const toYear = (v) => {
	if (v === undefined || v === null || v === '') return null;
	const y = Number(v);
	return Number.isInteger(y) && y >= 2000 && y <= 2100 ? y : NaN;
};

/**
 * Chuẩn hoá khoảng năm của báo cáo: { year } (1 năm) hoặc { fromYear, toYear }.
 * Trống cả hai = mọi năm; chỉ có một đầu = không giới hạn đầu kia.
 * @param {{ year?: unknown, fromYear?: unknown, toYear?: unknown }} input
 * @returns {{ fromYear: number|null, toYear: number|null }}
 */
const parseYearRange = ({ year, fromYear, toYear: to } = {}) => {
	let from = toYear(fromYear);
	let until = toYear(to);
	if (from === null && until === null) from = until = toYear(year);
	if (Number.isNaN(from) || Number.isNaN(until))
		throw httpError(400, 'Năm không hợp lệ (2000 – 2100)');
	if (from !== null && until !== null) {
		if (from > until) throw httpError(400, '"Từ năm" phải nhỏ hơn hoặc bằng "Đến năm"');
		if (until - from + 1 > MAX_YEAR_SPAN)
			throw httpError(400, `Mỗi báo cáo tối đa ${MAX_YEAR_SPAN} năm`);
	}
	return { fromYear: from, toYear: until };
};

/** Nhãn khoảng năm cho tiêu đề: "NĂM 2025" / "GIAI ĐOẠN 2021 – 2025" / "TỪ NĂM 2021"... */
const rangeLabel = ({ fromYear, toYear: to }) => {
	if (fromYear === null && to === null) return 'TẤT CẢ CÁC NĂM';
	if (fromYear === to) return `NĂM ${fromYear}`;
	if (fromYear === null) return `ĐẾN NĂM ${to}`;
	if (to === null) return `TỪ NĂM ${fromYear}`;
	return `GIAI ĐOẠN ${fromYear} – ${to}`;
};

// Liệt kê mọi nhân sự đang hoạt động (kể cả 0 tiết) + người đã nghỉ nhưng có tín chỉ,
// trừ tài khoản khoa/phòng (trừ khi xuất phiếu cá nhân theo userId).
// fromYear / toYear rỗng = không giới hạn đầu đó (year = 1 năm, giữ cho phiếu cá nhân).
// department = tên khoa/phòng (khớp bộ lọc trang Ghi nhận CME).
/**
 * @param {{ year?: string|number, fromYear?: string|number, toYear?: string|number,
 *   userId?: string, department?: string, search?: string }} [filters]
 */
const getData = async ({ year, fromYear, toYear: to, userId, department, search } = {}) => {
	const range = parseYearRange({ year, fromYear, toYear: to });
	const pool = await getPool();
	const r = await pool
		.request()
		.input('from', sql.Int, range.fromYear)
		.input('to', sql.Int, range.toYear)
		.input('uid', sql.VarChar(20), userId || null)
		.input('dept', sql.NVarChar(255), department || null).query(`
    SELECT id, name FROM cme_credit_groups ORDER BY sort_order, name;

    SELECT u.id, u.staff_number, u.full_name, u.is_active, u.department_id, d.name AS department_name,
           x.group_id, x.year, SUM(x.credits) AS credits
    FROM users u
    LEFT JOIN departments d ON d.id = u.department_id
    LEFT JOIN (
      SELECT p.user_id, '${SEMINAR_GROUP.id}' AS group_id, p.cme_year AS year, p.cme_credits AS credits
      FROM seminar_participants p
      WHERE p.cme_year IS NOT NULL AND ISNULL(p.cme_credits, 0) > 0
        AND (@from IS NULL OR p.cme_year >= @from) AND (@to IS NULL OR p.cme_year <= @to)
      UNION ALL
      SELECT r.user_id, c.group_id, r.year, r.credits
      FROM cme_records r
      LEFT JOIN cme_credit_categories c ON c.id = r.category_id
      WHERE r.approval_status = 'approved'
        AND (@from IS NULL OR r.year >= @from) AND (@to IS NULL OR r.year <= @to)
    ) x ON x.user_id = u.id
    ${deptAccountJoinSql('u')}
    WHERE (@uid IS NULL OR u.id = @uid) AND (@dept IS NULL OR d.name = @dept)
      AND (u.is_active = 1 OR x.user_id IS NOT NULL OR @uid IS NOT NULL)
      -- Bỏ tài khoản khoa/phòng: tài khoản dùng chung, không phải nhân sự
      AND (@uid IS NOT NULL OR NOT ${isDeptAccountJoinedSql('u')})
    GROUP BY u.id, u.staff_number, u.full_name, u.is_active, u.department_id, d.name, x.group_id, x.year
    ORDER BY d.name, u.full_name;

    SELECT x.*
    FROM (
      SELECT p.user_id, N'Hội thảo/Hội nghị' AS source, '${SEMINAR_GROUP.id}' AS group_id, NULL AS category_name,
             s.title, p.participation_type AS role, s.start_date AS from_date, s.end_date AS to_date,
             p.cme_year AS year, p.cme_credits AS credits, p.cme_certificate_no AS cert_no
      FROM seminar_participants p
      JOIN seminars s ON s.id = p.seminar_id
      WHERE p.cme_year IS NOT NULL AND ISNULL(p.cme_credits, 0) > 0
        AND (@from IS NULL OR p.cme_year >= @from) AND (@to IS NULL OR p.cme_year <= @to)
      UNION ALL
      SELECT r.user_id, N'Ghi nhận độc lập', c.group_id, c.name,
             r.title, r.role, r.activity_date, r.end_date, r.year, r.credits, NULL
      FROM cme_records r
      LEFT JOIN cme_credit_categories c ON c.id = r.category_id
      WHERE r.approval_status = 'approved'
        AND (@from IS NULL OR r.year >= @from) AND (@to IS NULL OR r.year <= @to)
    ) x
    WHERE (@uid IS NULL OR x.user_id = @uid)
    ORDER BY x.year, x.from_date, x.title;

    SELECT year, department_id, required_credits FROM cme_requirements
    WHERE (@from IS NULL OR year >= @from) AND (@to IS NULL OR year <= @to);
  `);
	const [groupRows, creditRows, activityRows, reqRows] = r.recordsets;

	// Các năm của báo cáo (cột năm): đủ khoảng khi chọn cả 2 đầu, không thì
	// lấy các năm thực có dữ liệu / có cấu hình ngưỡng trong khoảng
	/** @type {number[]} */
	let years;
	if (range.fromYear !== null && range.toYear !== null) {
		years = Array.from(
			{ length: range.toYear - range.fromYear + 1 },
			(_, i) => /** @type {number} */ (range.fromYear) + i,
		);
	} else {
		const found = new Set(
			[...creditRows.map((x) => x.year), ...reqRows.map((x) => x.year)].filter((y) => y != null),
		);
		years = [...found].map(Number).sort((a, b) => a - b);
	}

	// Ngưỡng từng năm: ưu tiên theo khoa/phòng, không có thì dùng ngưỡng toàn viện
	/** @type {Map<number, Map<string|null, number>>} */
	const reqByYear = new Map();
	for (const x of reqRows) {
		if (!reqByYear.has(x.year)) reqByYear.set(x.year, new Map());
		reqByYear.get(x.year)?.set(x.department_id ?? null, Number(x.required_credits));
	}
	/** @param {string|null} deptId @param {number} y */
	const requiredOf = (deptId, y) => {
		const m = reqByYear.get(y);
		if (!m) return null;
		return m.has(deptId) ? (m.get(deptId) ?? null) : (m.get(null) ?? null);
	};
	/** @param {string|null} deptId */
	const requiredByYear = (deptId) => {
		/** @type {Record<number, number>} */
		const out = {};
		for (const y of years) {
			const v = requiredOf(deptId, y);
			if (v != null) out[y] = v;
		}
		return out;
	};

	const q = String(search || '')
		.trim()
		.toLowerCase();
	const people = new Map();
	for (const row of creditRows) {
		if (
			q &&
			!row.full_name.toLowerCase().includes(q) &&
			!String(row.staff_number ?? '').includes(q)
		)
			continue;
		let p = people.get(row.id);
		if (!p) {
			// Chỉ đánh giá đạt/chưa đạt cho nhân sự đang làm việc (như getComplianceReport)
			const reqs = row.is_active ? requiredByYear(row.department_id) : {};
			const reqValues = Object.values(reqs);
			p = {
				id: row.id,
				staff_number: row.staff_number,
				full_name: row.full_name,
				is_active: !!row.is_active,
				department_name: row.department_name,
				// Ngưỡng từng năm có cấu hình; required = cộng dồn các năm đó (null = không đánh giá)
				required_by_year: reqs,
				required: reqValues.length ? round2(reqValues.reduce((s, v) => s + v, 0)) : null,
				/** @type {Record<string, number>} */
				by_group: {},
				/** @type {Record<number, number>} */
				by_year: {},
				// Số tiết từng năm × hình thức (sheet riêng của từng năm)
				/** @type {Record<number, Record<string, number>>} */
				by_year_group: {},
				total: 0,
				activities: 0,
			};
			people.set(row.id, p);
		}
		if (row.credits == null) continue; // nhân sự chưa có tín chỉ → dòng 0 tiết
		const gid = row.group_id ?? NO_GROUP.id;
		p.by_group[gid] = round2((p.by_group[gid] ?? 0) + Number(row.credits));
		p.by_year[row.year] = round2((p.by_year[row.year] ?? 0) + Number(row.credits));
		const yg = (p.by_year_group[row.year] ??= {});
		yg[gid] = round2((yg[gid] ?? 0) + Number(row.credits));
		p.total = round2(p.total + Number(row.credits));
	}

	// Hoạt động: chỉ của nhân sự có trong báo cáo (đã qua lọc khoa / từ khoá / tài khoản khoa)
	const activities = [];
	for (const a of activityRows) {
		const p = people.get(a.user_id);
		if (!p) continue;
		p.activities++;
		activities.push({
			...a,
			group_id: a.group_id ?? NO_GROUP.id,
			person: p,
			credits: round2(a.credits),
		});
	}
	const deptKey = (p) => p.department_name ?? NO_DEPT;
	activities.sort(
		(a, b) =>
			deptKey(a.person).localeCompare(deptKey(b.person), 'vi') ||
			a.person.full_name.localeCompare(b.person.full_name, 'vi') ||
			a.year - b.year ||
			(a.from_date?.getTime?.() ?? 0) - (b.from_date?.getTime?.() ?? 0),
	);

	// Cột hình thức = danh mục nhóm; thêm cột phụ nếu dữ liệu rơi vào nhóm không có trong danh mục
	const groups = [...groupRows];
	const used = new Set([...people.values()].flatMap((p) => Object.keys(p.by_group)));
	if (used.has(SEMINAR_GROUP.id) && !groups.some((g) => g.id === SEMINAR_GROUP.id))
		groups.unshift(SEMINAR_GROUP);
	if (used.has(NO_GROUP.id)) groups.push(NO_GROUP);

	return {
		fromYear: range.fromYear,
		toYear: range.toYear,
		rangeLabel: rangeLabel(range),
		years,
		groups,
		people: [...people.values()],
		activities,
		hasRequirement: reqRows.length > 0,
	};
};

module.exports = {
	getData,
	parseYearRange,
	rangeLabel,
	round2,
	NO_DEPT,
	MAX_YEAR_SPAN,
};
