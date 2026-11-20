/**
 * cmeCycle.js — Chu kỳ cập nhật kiến thức y khoa liên tục (CME): hàm thuần, không
 * chạm DB. Căn cứ: Thông tư 32/2023/TT-BYT Điều 3 (tối thiểu 120 giờ tín chỉ trong
 * 05 năm liên tục), Luật Khám bệnh, chữa bệnh 2023 Điều 27 (giấy phép hành nghề có
 * thời hạn 05 năm), Điều 32 (đủ cập nhật là điều kiện gia hạn; nộp hồ sơ gia hạn
 * chậm nhất 60 ngày trước ngày hết hạn).
 *
 * Ngày luôn là chuỗi 'YYYY-MM-DD' (hoặc Date ở 00:00 UTC như cột DATE do db.pg trả
 * về) — tính theo lịch, không dính múi giờ máy chủ.
 */

// Còn ≤ 60 ngày tới hết chu kỳ mà vẫn thiếu giờ = đã tới hạn nộp hồ sơ gia hạn.
const RENEWAL_WINDOW_DAYS = 60;
// Còn ≤ 12 tháng tới hết chu kỳ mà vẫn thiếu giờ = có nguy cơ không đủ điều kiện.
const AT_RISK_MONTHS = 12;

const DEFAULT_CYCLE_YEARS = 5;
const DEFAULT_REQUIRED_HOURS = 120;

const STATUSES = ['met', 'on_track', 'at_risk', 'overdue_window'];

const pad2 = (n) => String(n).padStart(2, '0');
const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysInMonth = (y, m) =>
	[31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];

/**
 * @param {unknown} v 'YYYY-MM-DD' (chấp nhận kèm giờ phía sau) hoặc Date (đọc bằng getter UTC)
 * @returns {{ y: number, m: number, d: number } | null}
 */
const parseYmd = (v) => {
	let y;
	let m;
	let d;
	if (v instanceof Date) {
		if (Number.isNaN(v.getTime())) return null;
		y = v.getUTCFullYear();
		m = v.getUTCMonth() + 1;
		d = v.getUTCDate();
	} else {
		const hit = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? ''));
		if (!hit) return null;
		[y, m, d] = [Number(hit[1]), Number(hit[2]), Number(hit[3])];
	}
	if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
	return { y, m, d };
};

/** @param {{ y: number, m: number, d: number }} p */
const fmtYmd = (p) => `${String(p.y).padStart(4, '0')}-${pad2(p.m)}-${pad2(p.d)}`;

/** @param {{ y: number, m: number, d: number }} p số ngày kể từ 1970-01-01 */
const toDayNumber = (p) => Math.round(Date.UTC(p.y, p.m - 1, p.d) / 86400000);

/** @param {number} n @returns {{ y: number, m: number, d: number }} */
const fromDayNumber = (n) => {
	const dt = new Date(n * 86400000);
	return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
};

/**
 * Ngày kỷ niệm sau `years` năm. Sinh nhật 29/02 mà năm đích không nhuận → 28/02
 * (giống `date + interval 'n year'` của PostgreSQL). Luôn tính từ ngày gốc, không cộng
 * dồn từ mốc trước, nên 29/02/2020 → 28/02/2025 → ... → 29/02/2040.
 * @param {{ y: number, m: number, d: number }} base
 * @param {number} years
 */
const addYears = (base, years) => {
	const y = base.y + years;
	return { y, m: base.m, d: Math.min(base.d, daysInMonth(y, base.m)) };
};

const cmp = (a, b) => a.y - b.y || a.m - b.m || a.d - b.d;

/** Số ngày từ `from` tới `to` (to − from), âm nếu `to` đã qua. */
const diffDays = (from, to) => toDayNumber(to) - toDayNumber(from);

const normalizeYears = (v) => {
	const n = Number(v);
	return Number.isInteger(n) && n >= 1 && n <= 50 ? n : DEFAULT_CYCLE_YEARS;
};

/**
 * Chu kỳ CME hiện tại của 1 người.
 *  - Có ngày cấp giấy phép: khoảng N năm chứa `today`, tính từ ngày cấp theo từng bước N
 *    năm (cấp 15/03/2019, N=5 → 15/03/2024 – 14/03/2029). basis = 'license'.
 *    Ngày cấp nằm trong tương lai (nhập sai) → chu kỳ đầu tiên, tính từ ngày cấp đó.
 *  - Không có (hoặc ngày cấp không đọc được): N năm lịch gần nhất tính đến hết năm nay
 *    (năm nay − N + 1 → năm nay, vd N=5: 01/01/2022 – 31/12/2026). basis = 'calendar'.
 * @param {{ issuedDate?: unknown, today: unknown, cycleYears?: unknown }} input
 * @returns {{ cycle_start: string, cycle_end: string, basis: 'license' | 'calendar' }}
 */
const computeCycle = ({ issuedDate, today, cycleYears = DEFAULT_CYCLE_YEARS }) => {
	const t = parseYmd(today);
	if (!t) throw new TypeError('computeCycle: today không hợp lệ');
	const n = normalizeYears(cycleYears);
	const issued = parseYmd(issuedDate);

	if (!issued) {
		return {
			cycle_start: fmtYmd({ y: t.y - n + 1, m: 1, d: 1 }),
			cycle_end: fmtYmd({ y: t.y, m: 12, d: 31 }),
			basis: 'calendar',
		};
	}

	// k = số chu kỳ đã trọn vẹn từ ngày cấp tới nay. Ước lượng theo năm rồi chỉnh theo
	// ngày kỷ niệm (tháng/ngày chưa tới thì lùi 1; 29/02 đã được kẹp ở addYears).
	let k = Math.max(0, Math.floor((t.y - issued.y) / n));
	while (k > 0 && cmp(addYears(issued, k * n), t) > 0) k--;
	while (cmp(addYears(issued, (k + 1) * n), t) <= 0) k++;
	const start = addYears(issued, k * n);
	const end = fromDayNumber(toDayNumber(addYears(issued, (k + 1) * n)) - 1);
	return { cycle_start: fmtYmd(start), cycle_end: fmtYmd(end), basis: 'license' };
};

/**
 * Số ngày còn lại tới hết chu kỳ (0 = hôm nay là ngày cuối).
 * @param {unknown} cycleEnd @param {unknown} today
 */
const daysLeftOf = (cycleEnd, today) => {
	const e = parseYmd(cycleEnd);
	const t = parseYmd(today);
	if (!e || !t) throw new TypeError('daysLeftOf: ngày không hợp lệ');
	return diffDays(t, e);
};

/**
 * Phân loại tiến độ:
 *  'met'            đủ giờ (missing ≤ 0)
 *  'overdue_window' thiếu giờ và còn ≤ 60 ngày — mốc nộp hồ sơ gia hạn
 *  'at_risk'        thiếu giờ và còn ≤ 12 tháng
 *  'on_track'       thiếu giờ nhưng còn hơn 12 tháng
 * basis 'calendar' (chưa có ngày cấp giấy phép): cycle_end chỉ là 31/12 của cửa sổ N năm lịch,
 * không phải hạn gia hạn thật — nếu xét theo số ngày thì ai cũng "sắp hết hạn" mỗi dịp cuối năm.
 * Thiếu giờ thì luôn là 'at_risk' (cần chú ý, chưa rõ hạn), không bao giờ 'overdue_window'.
 * @param {{ missing: number, cycleEnd: unknown, today: unknown, basis?: string }} input
 * @returns {'met' | 'on_track' | 'at_risk' | 'overdue_window'}
 */
const classifyStatus = ({ missing, cycleEnd, today, basis }) => {
	if (!(missing > 0)) return 'met';
	if (basis === 'calendar') return 'at_risk';
	const e = parseYmd(cycleEnd);
	const t = parseYmd(today);
	if (!e || !t) throw new TypeError('classifyStatus: ngày không hợp lệ');
	if (diffDays(t, e) <= RENEWAL_WINDOW_DAYS) return 'overdue_window';
	// Mốc "12 tháng" tính theo lịch (hôm nay + 1 năm), không quy ra 365 ngày
	if (cmp(e, addYears(t, AT_RISK_MONTHS / 12)) <= 0) return 'at_risk';
	return 'on_track';
};

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

/**
 * Ghép chu kỳ + số giờ đã có thành các trường báo cáo.
 * @param {{ issuedDate?: unknown, today: unknown, cycleYears?: unknown,
 *   requiredHours: number, earned?: number, earnedUndated?: number }} input
 */
const evaluateCycle = ({
	issuedDate,
	today,
	cycleYears,
	requiredHours,
	earned = 0,
	earnedUndated = 0,
}) => {
	const cycle = computeCycle({ issuedDate, today, cycleYears });
	const required = round2(requiredHours);
	const earnedHours = round2(earned);
	const missing = round2(Math.max(0, required - earnedHours));
	return {
		...cycle,
		required,
		earned: earnedHours,
		earned_undated: round2(earnedUndated),
		missing,
		days_left: daysLeftOf(cycle.cycle_end, today),
		status: classifyStatus({ missing, cycleEnd: cycle.cycle_end, today, basis: cycle.basis }),
	};
};

module.exports = {
	RENEWAL_WINDOW_DAYS,
	AT_RISK_MONTHS,
	DEFAULT_CYCLE_YEARS,
	DEFAULT_REQUIRED_HOURS,
	STATUSES,
	parseYmd,
	fmtYmd,
	normalizeYears,
	computeCycle,
	daysLeftOf,
	classifyStatus,
	evaluateCycle,
	round2,
};
