const { VN_OFFSET_MS } = require('./vnDate');

// Điểm danh theo ca. Mọi giờ ca là giờ Việt Nam; ngày của ca (work_date) = ngày BẮT ĐẦU ca.
//   Ca (work_shifts): start_time/end_time 'HH:mm'. end <= start = qua đêm; end = start = 24 giờ.
//     checkin_before_min  được điểm danh vào sớm nhất trước giờ vào bao nhiêu phút
//     checkout_after_min  được điểm danh ra muộn nhất sau giờ ra bao nhiêu phút
//     grace_min           du di: vào trễ / ra sớm không quá số phút này thì không tính
//   Người điểm danh = học viên, chỉ trong những ngày đang học 1 khóa (courseOn).
//   Ca của 1 học viên trong 1 ngày: có dòng phân ca ngày đó (shift_assignments) thì theo phân
//   ca — dòng shift_id NULL = nghỉ; không có thì theo mẫu ca tuần của khóa (shift_patterns.days).
//   Không có mẫu lẫn phân ca = điểm danh tự do (1 lượt/ngày, không giới hạn giờ).

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const toMinutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

// Độ dài ca (phút): qua đêm cộng 1 ngày, trùng giờ = 24 giờ
const durationMin = (shift) => {
	const d = toMinutes(shift.end_time) - toMinutes(shift.start_time);
	return d > 0 ? d : d + 1440;
};

// 'YYYY-MM-DD' + 'HH:mm' giờ VN → Date
const vnDateTime = (dateKey, hhmm) => new Date(Date.parse(`${dateKey}T${hhmm}:00Z`) - VN_OFFSET_MS);

const dateKeyVN = (date) => new Date(date.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
const addDays = (dateKey, n) =>
	new Date(Date.parse(`${dateKey}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
// 1 = Thứ 2 … 7 = Chủ nhật
const weekdayOf = (dateKey) => ((new Date(`${dateKey}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

// Một lần làm ca cụ thể (ca × ngày bắt đầu)
const instanceOf = (shift, dateKey) => {
	const start_at = vnDateTime(dateKey, shift.start_time);
	const end_at = new Date(start_at.getTime() + durationMin(shift) * MIN);
	return {
		shift_id: shift.id,
		work_date: dateKey,
		name: shift.name,
		code: shift.code,
		color: shift.color,
		start_time: shift.start_time,
		end_time: shift.end_time,
		grace_min: shift.grace_min,
		start_at,
		end_at,
		open_at: new Date(start_at.getTime() - shift.checkin_before_min * MIN),
		close_at: new Date(end_at.getTime() + shift.checkout_after_min * MIN),
	};
};

// → { source: 'roster'|'pattern', shiftIds } | null (không có lịch ca → điểm danh tự do)
//   assignments: các dòng phân ca của người này [{ work_date, shift_id|null }]
const shiftIdsForDay = (pattern, assignments, dateKey) => {
	const rows = assignments.filter((a) => a.work_date === dateKey);
	if (rows.length)
		return { source: 'roster', shiftIds: rows.map((r) => r.shift_id).filter((id) => id != null) };
	if (pattern) return { source: 'pattern', shiftIds: pattern.days[weekdayOf(dateKey)] ?? [] };
	return null;
};

// Lượt học phủ ngày dateKey (khóa mới nhất nếu học viên học nhiều khóa cùng lúc).
//   periods: [{ course_id, start_date|null, end_date|null, … }] — 'YYYY-MM-DD', null = không giới hạn
const periodOn = (periods, dateKey) => {
	let best = null;
	for (const p of periods) {
		if ((p.start_date && p.start_date > dateKey) || (p.end_date && p.end_date < dateKey)) continue;
		if (!best || (p.start_date ?? '') > (best.start_date ?? '')) best = p;
	}
	return best;
};

// Ca có thể bấm lúc `now`. Bản ghi đã có của ca → lượt bấm là điểm danh ra (lấy lần cuối),
// chưa có → điểm danh vào (chỉ trước giờ kết thúc ca). Không có lịch ca hôm nay → 1 lựa chọn điểm danh tự do.
// Ngày không thuộc khóa học nào → không có lựa chọn.
//   courseOn(dateKey) → { course_id, course_name, pattern } | null — khóa đang học ngày đó
//   shiftsById: Map id → ca; records: bản ghi điểm danh gần đây [{ work_date, shift_id }]
const checkOptions = ({ courseOn, assignments, shiftsById, records, now = new Date() }) => {
	const today = dateKeyVN(now);
	const t = now.getTime();
	const hasRecord = (dateKey, shiftId) =>
		records.some((r) => r.work_date === dateKey && (r.shift_id ?? null) === shiftId);
	const options = [];
	// Ca dài nhất 24h + điểm danh ra muộn tối đa 12h ⇒ ca bắt đầu từ 2 ngày trước vẫn có thể còn mở
	for (const dateKey of [addDays(today, -2), addDays(today, -1), today, addDays(today, 1)]) {
		const course = courseOn(dateKey);
		if (!course) continue;
		const tag = { course_id: course.course_id, course_name: course.course_name ?? null };
		const day = shiftIdsForDay(course.pattern, assignments, dateKey);
		if (!day) {
			if (dateKey === today)
				options.push({
					shift_id: null,
					work_date: today,
					...tag,
					action: hasRecord(today, null) ? 'check_out' : 'check_in',
				});
			continue;
		}
		for (const id of new Set(day.shiftIds)) {
			const shift = shiftsById.get(id);
			if (!shift) continue;
			const inst = instanceOf(shift, dateKey);
			const done = hasRecord(dateKey, id);
			if (t < inst.open_at.getTime() || t > inst.close_at.getTime()) continue;
			if (!done && t > inst.end_at.getTime()) continue; // hết ca mà chưa vào thì không điểm danh vào nữa
			options.push({ ...inst, ...tag, action: done ? 'check_out' : 'check_in' });
		}
	}
	const key = (o) => o.start_at?.getTime() ?? Infinity; // điểm danh tự do xếp sau các ca
	return options.sort((a, b) => key(a) - key(b));
};

// Số phút đi muộn / về sớm — trong ngưỡng du di thì 0
const lateMin = (inst, at) => {
	const m = Math.floor((at.getTime() - inst.start_at.getTime()) / MIN);
	return m > inst.grace_min ? m : 0;
};
const earlyMin = (inst, at) => {
	const m = Math.floor((inst.end_at.getTime() - at.getTime()) / MIN);
	return m > inst.grace_min ? m : 0;
};

const intIn = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

// null = hợp lệ; ngược lại là thông báo lỗi
const validateShift = (s) => {
	if (!String(s.name ?? '').trim()) return 'Vui lòng nhập tên ca';
	if (!String(s.code ?? '').trim() || String(s.code).trim().length > 10)
		return 'Ký hiệu ca 1–10 ký tự';
	if (!TIME_RE.test(s.start_time ?? '') || !TIME_RE.test(s.end_time ?? ''))
		return 'Giờ vào/ra phải dạng HH:mm';
	if (!intIn(s.checkin_before_min, 0, 720)) return 'Điểm danh vào sớm: 0–720 phút';
	if (!intIn(s.checkout_after_min, 0, 720)) return 'Điểm danh ra muộn: 0–720 phút';
	if (!intIn(s.grace_min, 0, 240)) return 'Du di đi muộn/về sớm: 0–240 phút';
	return null;
};

// days: { "1": [shiftId...], …, "7": [...] } — cho phép ngày trống (nghỉ)
const normalizePatternDays = (days) => {
	const out = {};
	for (let d = 1; d <= 7; d++) {
		const ids = days?.[d] ?? days?.[String(d)] ?? [];
		out[d] = Array.isArray(ids)
			? [...new Set(ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))]
			: [];
	}
	return out;
};

module.exports = {
	TIME_RE,
	DATE_RE,
	durationMin,
	vnDateTime,
	dateKeyVN,
	addDays,
	weekdayOf,
	instanceOf,
	shiftIdsForDay,
	periodOn,
	checkOptions,
	lateMin,
	earlyMin,
	validateShift,
	normalizePatternDays,
};
