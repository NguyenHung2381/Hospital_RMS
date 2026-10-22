// Quy tắc chấm 2 phần Lý thuyết + Thực hành — Phụ lục III TT 32/2023/TT-BYT mục 1.10
// (docs/ke-hoach-nang-cap-dao-tao.md, giai đoạn 4). Hàm thuần, không đụng DB, để test.
//   - Lý thuyết đạt khi ≥ theoryPassPct% thang 10; thực hành đạt khi > practicePassPct%.
//   - Vắng lý thuyết không quá theoryMaxAbsentPct%, thực hành không quá practiceMaxAbsentPct%.
//   - Đạt = đồng thời đạt LT + đạt TH + đủ chuyên cần; không lấy trung bình để bù.
//   - Điểm tổng (chỉ để xếp loại) = trung bình theo số tiết LT/TH; chỉ xếp loại khi Đạt.

const DEFAULT_RULES = {
	theoryPassPct: 60,
	practicePassPct: 60,
	theoryMaxAbsentPct: 10,
	practiceMaxAbsentPct: 0,
	maxRetakes: 1,
	rankExcellent: 8,
	rankGood: 6.5,
	rankAverage: 5,
};

// Khóa setting → tên quy tắc (systemSettingService KEYS, tab Đào tạo)
const RULE_SETTING_KEYS = {
	theoryPassPct: 'GRADE_THEORY_PASS_PCT',
	practicePassPct: 'GRADE_PRACTICE_PASS_PCT',
	theoryMaxAbsentPct: 'ATTEND_THEORY_MAX_ABSENT_PCT',
	practiceMaxAbsentPct: 'ATTEND_PRACTICE_MAX_ABSENT_PCT',
	maxRetakes: 'GRADE_MAX_RETAKES',
	rankExcellent: 'GRADE_RANK_EXCELLENT',
	rankGood: 'GRADE_RANK_GOOD',
	rankAverage: 'GRADE_RANK_AVERAGE',
};

const round1 = (n) => Math.round(n * 10) / 10;

// Điểm đạt được / tổng điểm đề → thang 10 (vd 37/50 → 7,4)
const toTen = (points, maxPoints) => {
	if (points == null || !maxPoints || maxPoints <= 0) return null;
	return round1(Math.min(10, Math.max(0, (Number(points) / Number(maxPoints)) * 10)));
};

const fmt = (n) => String(n).replace('.', ',');
const fmtScore = (n) => Number(n).toFixed(1).replace('.', ',');

const classify = (total, rules) => {
	if (total == null) return null;
	if (total >= rules.rankExcellent) return 'Giỏi';
	if (total >= rules.rankGood) return 'Khá';
	if (total >= rules.rankAverage) return 'Trung bình';
	return 'Yếu';
};

// Tỉ lệ vắng (%) của 1 phần; held = số buổi đã học có điểm danh. held 0 → null (chưa tính được).
const absentPct = (att) => (att && att.held > 0 ? round1((att.absent / att.held) * 100) : null);

/**
 * @param {object} p
 * @param {number|null} p.theory          điểm LT thang 10
 * @param {number|null} p.practice        điểm TH thang 10
 * @param {string|null} [p.theoryFlag]    'absent' | 'exempt' | null
 * @param {string|null} [p.practiceFlag]
 * @param {{held:number, absent:number}} [p.theoryAttendance]
 * @param {{held:number, absent:number}} [p.practiceAttendance]
 * @param {number} [p.theoryHours]        tiết LT của chương trình; 0 = không có phần LT
 * @param {number} [p.practiceHours]      tiết TH; 0 = không có phần TH
 * @param {object} [p.rules]
 * @returns {{ result: 'pass'|'fail'|null, total: number|null, classification: string|null,
 *   theory: object, practice: object, reasons: string[] }}
 *   result null = chưa đủ dữ liệu (còn thiếu điểm).
 */
const evaluate = ({
	theory = null,
	practice = null,
	theoryFlag = null,
	practiceFlag = null,
	theoryAttendance,
	practiceAttendance,
	theoryHours = 1,
	practiceHours = 1,
	rules: rulesIn,
}) => {
	const rules = { ...DEFAULT_RULES, ...(rulesIn || {}) };
	const reasons = [];
	let missing = false;

	const part = (name, label, score, flag, hours, passPct, strict, att, maxAbsentPct) => {
		const applies = Number(hours) > 0;
		const out = {
			applies,
			score,
			flag,
			passed: null,
			absentPct: absentPct(att),
			attendanceOk: null,
		};
		if (!applies) return out;

		// Chuyên cần
		if (out.absentPct != null) {
			out.attendanceOk = out.absentPct <= maxAbsentPct;
			if (!out.attendanceOk)
				reasons.push(`Vắng ${label} ${fmt(out.absentPct)}% > ${fmt(maxAbsentPct)}%`);
		}

		// Điểm
		if (flag === 'exempt') out.passed = true;
		else if (flag === 'absent') {
			out.passed = false;
			reasons.push(`Vắng thi ${label}`);
		} else if (score == null) {
			missing = true;
		} else {
			const threshold = (passPct / 100) * 10;
			out.passed = strict ? score > threshold : score >= threshold;
			if (!out.passed)
				reasons.push(
					`${name} ${fmtScore(score)} ${strict ? '≤' : '<'} ${fmtScore(threshold)}${strict ? ' (phải lớn hơn)' : ''}`,
				);
		}
		return out;
	};

	const t = part(
		'LT',
		'lý thuyết',
		theory,
		theoryFlag,
		theoryHours,
		rules.theoryPassPct,
		false,
		theoryAttendance,
		rules.theoryMaxAbsentPct,
	);
	const p = part(
		'TH',
		'thực hành',
		practice,
		practiceFlag,
		practiceHours,
		rules.practicePassPct,
		true,
		practiceAttendance,
		rules.practiceMaxAbsentPct,
	);

	const failed =
		t.passed === false ||
		p.passed === false ||
		t.attendanceOk === false ||
		p.attendanceOk === false;
	const result = failed ? 'fail' : missing || (!t.applies && !p.applies) ? null : 'pass';

	// Điểm tổng theo số tiết, bỏ phần miễn thi / không áp dụng
	const parts = [
		{ x: t, h: Number(theoryHours) || 0 },
		{ x: p, h: Number(practiceHours) || 0 },
	].filter(({ x }) => x.applies && x.flag == null && x.score != null);
	const hours = parts.reduce((s, { h }) => s + h, 0);
	const total =
		hours > 0 ? round1(parts.reduce((s, { x, h }) => s + x.score * h, 0) / hours) : null;

	return {
		result,
		total,
		classification: result === 'pass' ? classify(total, rules) : null,
		theory: t,
		practice: p,
		reasons,
	};
};

module.exports = { DEFAULT_RULES, RULE_SETTING_KEYS, toTen, round1, classify, evaluate };
