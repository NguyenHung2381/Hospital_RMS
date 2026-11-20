/**
 * cmeCycleService.js — Tiến độ "đủ 120 giờ tín chỉ trong 05 năm liên tục" của nhân sự
 * (Thông tư 32/2023/TT-BYT Điều 3; Luật KBCB 2023 Điều 27, 32). Quy tắc tính chu kỳ và
 * phân loại trạng thái nằm ở cmeCycle.js (hàm thuần); file này lấy dữ liệu:
 *   - cài đặt hệ thống CME_CYCLE_YEARS (5) và CME_MIN_HOURS (120);
 *   - nhân sự đang hoạt động (bỏ tài khoản khoa/phòng dùng chung) + ngày cấp giấy phép
 *     hành nghề (staff_practice_licenses.issued_date);
 *   - giờ tín chỉ đã có trong chu kỳ của từng người, cộng dồn 2 nguồn giống
 *     cmeRequirementService.getComplianceReport: cme_records đã duyệt (ngày hoạt động)
 *     và seminar_participants đã được cấp CME (cme_year có giá trị; ngày cấp).
 * Tổng cộng 2 câu SQL cho cả báo cáo (không N+1): câu 1 lấy nhân sự, câu 2 tổng hợp giờ
 * của mọi người một lượt (chu kỳ từng người truyền vào dưới dạng mảng JSON).
 * Khác getComplianceReport: tính theo chu kỳ của từng người, không dùng ngưỡng nhập tay
 * theo năm ở cme_requirements (bảng đó vẫn dùng cho ngưỡng nội bộ từng năm).
 */
const { getPool, sql, jsonRows, ilike } = require('../../config/db');
const { deptAccountJoinSql, isDeptAccountJoinedSql } = require('../../utils/deptAccount');
const { paging } = require('../../utils/paging');
const { todayKeyVN } = require('../../utils/vnDate');
const logger = require('../../config/logger');
const systemSettingService = require('../settings/systemSettingService');
const {
	DEFAULT_CYCLE_YEARS,
	DEFAULT_REQUIRED_HOURS,
	RENEWAL_WINDOW_DAYS,
	AT_RISK_MONTHS,
	STATUSES,
	parseYmd,
	normalizeYears,
	computeCycle,
	evaluateCycle,
} = require('./cmeCycle');

// Mức khẩn: tới hạn nộp hồ sơ → có nguy cơ → còn thời gian → đã đủ
const URGENCY = { overdue_window: 0, at_risk: 1, on_track: 2, met: 3 };

/** Cài đặt chu kỳ đang áp dụng (UI hoặc .env); thiếu / sai kiểu → mặc định 5 năm, 120 giờ. */
const getCycleSettings = async () => {
	const [years, hours] = await Promise.all([
		systemSettingService.getValue('CME_CYCLE_YEARS', String(DEFAULT_CYCLE_YEARS)),
		systemSettingService.getValue('CME_MIN_HOURS', String(DEFAULT_REQUIRED_HOURS)),
	]);
	const requiredHours = Number(hours);
	return {
		cycleYears: normalizeYears(years),
		requiredHours:
			Number.isFinite(requiredHours) && requiredHours > 0 ? requiredHours : DEFAULT_REQUIRED_HOURS,
	};
};

// Nhân sự đang hoạt động + giấy phép hành nghề (nếu có). Dạng JOIN cho tài khoản khoa/phòng
// (xem utils/deptAccount.js) vì trả về nhiều dòng.
const PEOPLE_SELECT = `
  SELECT u.id, u.full_name, u.staff_number, u.department_id, d.name AS department_name,
         sl.license_no, sl.issued_date AS license_issued_date
  FROM users u
  LEFT JOIN departments d ON d.id = u.department_id
  LEFT JOIN staff_practice_licenses sl ON sl.user_id = u.id
  ${deptAccountJoinSql('u', 'da')}
`;

/**
 * @param {{ scope?: string, department_id?: string, search?: string, userId?: string }} filters
 */
const loadPeople = async ({ scope = 'licensed', department_id, search, userId } = {}) => {
	const pool = await getPool();
	const req = pool.request();
	// Bỏ tài khoản khoa/phòng: tài khoản dùng chung, không phải nhân sự (như getComplianceReport)
	const where = ["u.is_active = 'true'", `NOT ${isDeptAccountJoinedSql('u', 'da')}`];
	if (userId) {
		where.length = 0; // 1 người cụ thể (cổng cá nhân): không lọc theo loại tài khoản
		where.push('u.id = @user_id');
		req.input('user_id', sql.VarChar(20), userId);
	}
	// Người hành nghề = có hồ sơ giấy phép hành nghề
	if (scope !== 'all' && !userId) where.push('sl.id IS NOT NULL');
	if (department_id) {
		where.push('u.department_id = @department_id');
		req.input('department_id', sql.VarChar(20), department_id);
	}
	if (search) {
		where.push(
			`(${ilike('u.full_name', '@search')} OR ${ilike('sl.license_no', '@search')} OR ${ilike('CAST(u.staff_number AS VARCHAR(20))', '@search')})`,
		);
		req.input('search', sql.NVarChar, `%${search}%`);
	}
	// Không ORDER BY: getCycleReport sắp xếp lại theo mức khẩn / tên sau khi tính chu kỳ
	const result = await req.query(`${PEOPLE_SELECT} WHERE ${where.join(' AND ')}`);
	return result.recordset;
};

/**
 * Tổng giờ tín chỉ đã được duyệt / đã cấp của từng người trong chu kỳ của họ — 1 câu SQL
 * cho cả danh sách. Dòng có ngày (cme_records.activity_date, seminar_participants.
 * cme_issued_date) tính theo ngày nằm trong [cycle_start, cycle_end]; dòng KHÔNG có ngày
 * thì rơi về cột năm (year / cme_year) nằm trong [năm của cycle_start, năm của cycle_end].
 * @param {Array<{ id: string, cycle_start: string, cycle_end: string }>} cycles
 * @returns {Promise<Map<string, { earned: number, undated: number }>>}
 */
const loadEarned = async (cycles) => {
	const map = new Map();
	if (!cycles.length) return map;
	const payload = cycles.map((c) => ({
		id: c.id,
		s: c.cycle_start,
		e: c.cycle_end,
		ys: parseYmd(c.cycle_start)?.y,
		ye: parseYmd(c.cycle_end)?.y,
	}));
	const pool = await getPool();
	const result = await pool
		.request()
		.input('cycles', sql.NVarChar(sql.MAX), JSON.stringify(payload)).query(`
    SELECT j.id, SUM(x.credits) AS earned,
           SUM(CASE WHEN x.activity_date IS NULL THEN x.credits ELSE 0 END) AS undated
    FROM ${jsonRows('@cycles', 'j', [
			['id', 'VARCHAR(20)'],
			['s', 'DATE'],
			['e', 'DATE'],
			['ys', 'INT'],
			['ye', 'INT'],
		])}
    JOIN (
      SELECT r.user_id, r.credits, r.activity_date, r.year AS yr
      FROM cme_records r
      WHERE r.approval_status = 'approved'
      UNION ALL
      SELECT p.user_id, p.cme_credits, p.cme_issued_date, p.cme_year
      FROM seminar_participants p
      WHERE p.user_id IS NOT NULL AND p.cme_year IS NOT NULL AND p.cme_credits IS NOT NULL
    ) x ON x.user_id = j.id
     AND ((x.activity_date IS NOT NULL AND x.activity_date BETWEEN j.s AND j.e)
       OR (x.activity_date IS NULL AND x.yr BETWEEN j.ys AND j.ye))
    GROUP BY j.id
  `);
	for (const row of result.recordset)
		map.set(row.id, { earned: Number(row.earned || 0), undated: Number(row.undated || 0) });
	return map;
};

/** Gắn chu kỳ + giờ tín chỉ + trạng thái cho danh sách nhân sự. */
const evaluatePeople = async (people, { today, cycleYears, requiredHours }) => {
	const cycles = people.map((p) => ({
		id: p.id,
		...computeCycle({ issuedDate: p.license_issued_date, today, cycleYears }),
	}));
	const earnedBy = await loadEarned(cycles);
	return people.map((p) => {
		const got = earnedBy.get(p.id);
		return {
			id: p.id,
			full_name: p.full_name,
			staff_number: p.staff_number ?? null,
			department_id: p.department_id ?? null,
			department_name: p.department_name ?? null,
			license_no: p.license_no ?? null,
			...evaluateCycle({
				issuedDate: p.license_issued_date,
				today,
				cycleYears,
				requiredHours,
				earned: got?.earned,
				earnedUndated: got?.undated,
			}),
		};
	});
};

const compareRows = (sort) => (a, b) => {
	const byName =
		(a.department_name ?? '').localeCompare(b.department_name ?? '', 'vi') ||
		(a.full_name ?? '').localeCompare(b.full_name ?? '', 'vi');
	if (sort === 'name') return byName;
	return (
		URGENCY[a.status] - URGENCY[b.status] ||
		a.days_left - b.days_left ||
		b.missing - a.missing ||
		byName
	);
};

/**
 * Báo cáo theo chu kỳ cho toàn bộ nhân sự đang hoạt động.
 * @param {{ scope?: string, department_id?: string, search?: string, status?: string[],
 *   sort?: string, page?: number|string, limit?: number|string }} [query]
 * @param {{ today?: string }} [opts] today để test; mặc định hôm nay theo giờ VN
 */
const getCycleReport = async (query = {}, { today = todayKeyVN() } = {}) => {
	const { scope = 'licensed', department_id, search, status, sort = 'urgency' } = query;
	const settings = await getCycleSettings();
	const people = await loadPeople({ scope, department_id, search });
	const rows = await evaluatePeople(people, { today, ...settings });

	// Tổng hợp theo trạng thái trên tập đã lọc khoa/tìm kiếm, TRƯỚC khi lọc theo status
	const summary = { total: rows.length, ...Object.fromEntries(STATUSES.map((s) => [s, 0])) };
	for (const r of rows) summary[r.status]++;

	const picked = status?.length ? rows.filter((r) => status.includes(r.status)) : rows;
	picked.sort(compareRows(sort));

	const pg = paging(query.page, query.limit, 20);
	const data = pg.limit === 0 ? picked : picked.slice(pg.offset, pg.offset + pg.limit);
	return {
		data,
		pagination: { page: pg.page, limit: pg.limit, total: picked.length },
		summary,
		meta: {
			today,
			cycle_years: settings.cycleYears,
			required_hours: settings.requiredHours,
			renewal_window_days: RENEWAL_WINDOW_DAYS,
			at_risk_months: AT_RISK_MONTHS,
		},
	};
};

/**
 * Chu kỳ CME của chính 1 tài khoản (cổng "CME của tôi"). Có ngày cấp giấy phép thì tính theo
 * giấy phép, không thì theo 5 năm lịch gần nhất. Tài khoản không tồn tại → null.
 * @param {string} userId
 * @param {{ today?: string }} [opts]
 */
const getUserCycle = async (userId, { today = todayKeyVN() } = {}) => {
	const [settings, people] = await Promise.all([getCycleSettings(), loadPeople({ userId })]);
	if (!people.length) return null;
	const [row] = await evaluatePeople(people, { today, ...settings });
	return {
		cycle_start: row.cycle_start,
		cycle_end: row.cycle_end,
		basis: row.basis,
		cycle_years: settings.cycleYears,
		license_no: row.license_no,
		required: row.required,
		earned: row.earned,
		earned_undated: row.earned_undated,
		missing: row.missing,
		days_left: row.days_left,
		status: row.status,
	};
};

/** Như getUserCycle nhưng không bao giờ ném lỗi: khối phụ không được làm hỏng trang "CME của tôi". */
const getUserCycleSafe = async (userId, opts) => {
	try {
		return await getUserCycle(userId, opts);
	} catch (err) {
		logger.warn(`[cme] Không tính được chu kỳ CME của ${userId}:`, err);
		return null;
	}
};

module.exports = {
	getCycleSettings,
	getCycleReport,
	getUserCycle,
	getUserCycleSafe,
};
