/**
 * cmeReportService.js — Báo cáo tín chỉ CME (Excel), dựa theo mẫu "mẫu bc CME.xlsx":
 *   Sheet "Tổng quan"     : chỉ tiêu tổng hợp + cơ cấu theo hình thức CME
 *   Sheet "BC tổng"       : TT | MNV | Họ và tên | Khoa/Phòng | Tổng số tiết (| Ngưỡng | Đánh giá)
 *   Sheet "BC chi tiết"   : TT | MNV | Họ và tên | Khoa/Phòng | <từng nhóm hình thức CME> | Tổng
 *   Sheet "Theo khoa"     : tổng hợp theo khoa/phòng
 *   Sheet "Chưa đạt"      : nhân sự chưa đủ ngưỡng (chỉ khi lọc 1 năm và năm đó có cấu hình ngưỡng)
 *   Sheet "DS hoạt động"  : từng hoạt động được tính tín chỉ
 * Phiếu CME cá nhân (personal) chỉ gồm BC tổng, BC chi tiết, DS hoạt động.
 * Cộng dồn 2 nguồn giống cmeRequirementService.getComplianceReport: tham dự hội
 * thảo đã cấp CME (seminar_participants.cme_year) + ghi nhận độc lập đã duyệt.
 * Dùng cho file xuất trang Ghi nhận CME (toàn viện) và phiếu CME cá nhân (userId).
 */
const { getPool, sql } = require('../../config/db');
const { deptAccountJoinSql, isDeptAccountJoinedSql } = require('../../utils/deptAccount');

// Tín chỉ hội thảo/hội nghị thuộc nhóm "Khóa đào tạo, bồi dưỡng ngắn hạn, hội nghị, hội thảo"
const SEMINAR_GROUP = {
	id: 'CME_DAOTAO',
	name: 'Khóa đào tạo, bồi dưỡng ngắn hạn, hội nghị, hội thảo về y khoa',
};
const NO_GROUP = { id: '__none__', name: 'Chưa phân loại' };
const NO_DEPT = '(Chưa có khoa/phòng)';

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

// Liệt kê mọi nhân sự đang hoạt động (kể cả 0 tiết) + người đã nghỉ nhưng có tín chỉ,
// trừ tài khoản khoa/phòng (trừ khi xuất phiếu cá nhân theo userId).
// year rỗng = mọi năm. department = tên khoa/phòng (khớp bộ lọc trang Ghi nhận CME).
/** @param {{ year?: string|number, userId?: string, department?: string, search?: string }} [filters] */
const getData = async ({ year, userId, department, search } = {}) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('year', sql.Int, year ? Number(year) : null)
		.input('uid', sql.VarChar(20), userId || null)
		.input('dept', sql.NVarChar(255), department || null).query(`
    SELECT id, name FROM cme_credit_groups ORDER BY sort_order, name;

    SELECT u.id, u.staff_number, u.full_name, u.is_active, u.department_id, d.name AS department_name,
           x.group_id, SUM(x.credits) AS credits
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
    ${deptAccountJoinSql('u')}
    WHERE (@uid IS NULL OR u.id = @uid) AND (@dept IS NULL OR d.name = @dept)
      AND (u.is_active = 1 OR x.user_id IS NOT NULL OR @uid IS NOT NULL)
      -- Bỏ tài khoản khoa/phòng: tài khoản dùng chung, không phải nhân sự
      AND (@uid IS NOT NULL OR NOT ${isDeptAccountJoinedSql('u')})
    GROUP BY u.id, u.staff_number, u.full_name, u.is_active, u.department_id, d.name, x.group_id
    ORDER BY d.name, u.full_name;

    SELECT x.*
    FROM (
      SELECT p.user_id, N'Hội thảo/Hội nghị' AS source, '${SEMINAR_GROUP.id}' AS group_id, NULL AS category_name,
             s.title, p.participation_type AS role, s.start_date AS from_date, s.end_date AS to_date,
             p.cme_year AS year, p.cme_credits AS credits, p.cme_certificate_no AS cert_no
      FROM seminar_participants p
      JOIN seminars s ON s.id = p.seminar_id
      WHERE p.cme_year IS NOT NULL AND (@year IS NULL OR p.cme_year = @year) AND ISNULL(p.cme_credits, 0) > 0
      UNION ALL
      SELECT r.user_id, N'Ghi nhận độc lập', c.group_id, c.name,
             r.title, r.role, r.activity_date, r.end_date, r.year, r.credits, NULL
      FROM cme_records r
      LEFT JOIN cme_credit_categories c ON c.id = r.category_id
      WHERE r.approval_status = 'approved' AND (@year IS NULL OR r.year = @year)
    ) x
    WHERE (@uid IS NULL OR x.user_id = @uid)
    ORDER BY x.from_date, x.title;

    SELECT department_id, required_credits FROM cme_requirements WHERE year = @year;
  `);
	const [groupRows, creditRows, activityRows, reqRows] = r.recordsets;

	// Ngưỡng của năm: ưu tiên theo khoa/phòng, không có thì dùng ngưỡng toàn viện
	const reqByDept = new Map(
		reqRows.map((x) => [x.department_id ?? null, Number(x.required_credits)]),
	);
	const requiredOf = (deptId) =>
		reqByDept.has(deptId) ? reqByDept.get(deptId) : (reqByDept.get(null) ?? null);

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
		const p = people.get(row.id) ?? {
			id: row.id,
			staff_number: row.staff_number,
			full_name: row.full_name,
			is_active: !!row.is_active,
			department_name: row.department_name,
			// Chỉ đánh giá đạt/chưa đạt cho nhân sự đang làm việc (như getComplianceReport)
			required: row.is_active ? requiredOf(row.department_id) : null,
			by_group: {},
			total: 0,
			activities: 0,
		};
		people.set(row.id, p);
		if (row.credits == null) continue; // nhân sự chưa có tín chỉ → dòng 0 tiết
		const gid = row.group_id ?? NO_GROUP.id;
		p.by_group[gid] = round2((p.by_group[gid] ?? 0) + Number(row.credits));
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
			(a.from_date?.getTime?.() ?? 0) - (b.from_date?.getTime?.() ?? 0),
	);

	// Cột hình thức = danh mục nhóm; thêm cột phụ nếu dữ liệu rơi vào nhóm không có trong danh mục
	const groups = [...groupRows];
	const used = new Set([...people.values()].flatMap((p) => Object.keys(p.by_group)));
	if (used.has(SEMINAR_GROUP.id) && !groups.some((g) => g.id === SEMINAR_GROUP.id))
		groups.unshift(SEMINAR_GROUP);
	if (used.has(NO_GROUP.id)) groups.push(NO_GROUP);

	return {
		year: year ? Number(year) : null,
		groups,
		people: [...people.values()],
		activities,
		hasRequirement: !!year && reqRows.length > 0,
	};
};

module.exports = {
	getData,
	round2,
	NO_DEPT,
};
