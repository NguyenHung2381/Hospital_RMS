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

// ─── Lượt chấm từ máy chấm công vân tay ──────────────────────────────────────
// Máy không hỏi được "chấm cho ca nào" như nút điểm danh trên web ⇒ tự chọn lần ca:
//   - lần ca (ngày bắt đầu d−2…d) đang mở lúc chấm: open_at ≤ t ≤ close_at;
//   - lần ca chưa có giờ vào thì chỉ nhận tới hết ca (như web: hết ca không vào được nữa);
//   - nhiều lần ca cùng khớp ⇒ lần có giờ bắt đầu hoặc giờ kết thúc gần lượt chấm nhất
//     (12:45 giữa ca sáng 07:00–11:30 và ca chiều 13:00 ⇒ vào ca chiều).
//   Ngày không có lịch ca (điểm danh tự do) ⇒ mọi lượt trong ngày vào 1 dòng shift_id NULL.
// Giờ vào = lượt sớm nhất, giờ ra = lượt muộn nhất. Chấm lại trong REPEAT_PUNCH_MIN phút
// sau giờ vào là chấm lặp (máy chưa nhận ngay, bấm lại), không phải giờ ra.
const REPEAT_PUNCH_MIN = 5;

const groupKey = (workDate, shiftId) => `${workDate}|${shiftId ?? ''}`;

/**
 * Gán lượt chấm của 1 học viên vào các lần ca.
 * @param {{ punches: { at: Date }[], courseOn: Function, assignments: object[],
 *           shiftsById: Map<number, object>, existing?: { work_date: string, shift_id: number|null, check_in_at: Date|string }[] }} a
 * @returns {{ work_date: string, shift_id: number|null, inst: object|null, course: object, punches: object[] }[]}
 */
const assignPunches = ({ punches, courseOn, assignments, shiftsById, existing = [] }) => {
	const groups = new Map();
	const sorted = [...punches].sort((x, y) => x.at.getTime() - y.at.getTime());
	for (const p of sorted) {
		const t = p.at.getTime();
		const day0 = dateKeyVN(p.at);
		let best = null;
		let free = null;
		for (const dateKey of [addDays(day0, -2), addDays(day0, -1), day0]) {
			const course = courseOn(dateKey);
			if (!course) continue;
			const day = shiftIdsForDay(course.pattern, assignments, dateKey);
			if (!day) {
				if (dateKey === day0)
					free = { work_date: day0, shift_id: null, inst: null, course, dist: 0 };
				continue;
			}
			for (const id of new Set(day.shiftIds)) {
				const shift = shiftsById.get(id);
				if (!shift) continue;
				const inst = instanceOf(shift, dateKey);
				if (t < inst.open_at.getTime() || t > inst.close_at.getTime()) continue;
				const key = groupKey(dateKey, id);
				const hasIn =
					groups.has(key) ||
					existing.some(
						(r) =>
							groupKey(r.work_date, r.shift_id) === key && new Date(r.check_in_at).getTime() <= t,
					);
				if (!hasIn && t > inst.end_at.getTime()) continue;
				const dist = Math.min(
					Math.abs(t - inst.start_at.getTime()),
					Math.abs(t - inst.end_at.getTime()),
				);
				if (!best || dist < best.dist)
					best = { work_date: dateKey, shift_id: id, inst, course, dist };
			}
		}
		const pick = best ?? free;
		if (!pick) continue;
		const key = groupKey(pick.work_date, pick.shift_id);
		if (!groups.has(key)) {
			const { dist: _dist, ...g } = pick;
			groups.set(key, { ...g, punches: [] });
		}
		groups.get(key).punches.push(p);
	}
	return [...groups.values()];
};

/**
 * Giờ vào / ra của 1 dòng điểm danh sau khi thêm lượt chấm. Mỗi mốc mang theo nguồn của nó
 * (ip / khoảng cách khi bấm trên web, device_id khi chấm ở máy).
 * @param {{ check_in_at?: Date|string|null, check_out_at?: Date|string|null }|null} record dòng đã có
 * @param {{ at: Date, device_id?: number|null }[]} punches
 */
const mergeCheckTimes = (record, punches) => {
	const pts = [];
	if (record?.check_in_at)
		pts.push({
			at: new Date(record.check_in_at),
			ip: record.check_in_ip ?? null,
			distance_m: record.check_in_distance_m ?? null,
			device_id: record.check_in_device_id ?? null,
			wasOut: false,
		});
	if (record?.check_out_at)
		pts.push({
			at: new Date(record.check_out_at),
			ip: record.check_out_ip ?? null,
			distance_m: record.check_out_distance_m ?? null,
			device_id: record.check_out_device_id ?? null,
			wasOut: true,
		});
	for (const p of punches)
		pts.push({
			at: p.at,
			ip: null,
			distance_m: null,
			device_id: p.device_id ?? null,
			wasOut: false,
		});
	if (!pts.length) return null;
	pts.sort((a, b) => a.at.getTime() - b.at.getTime());
	const first = pts[0];
	const last = pts[pts.length - 1];
	const gap = last.at.getTime() - first.at.getTime();
	// Giờ ra đã có (vd. bấm trên web) thì giữ quy tắc "lần cuối"; còn lại chấm lặp không tính
	const out = gap > 0 && (gap >= REPEAT_PUNCH_MIN * MIN || last.wasOut) ? last : null;
	const same = (a, b) => (a ? new Date(a).getTime() : null) === (b ? b.at.getTime() : null);
	return {
		in: first,
		out,
		changed: !record || !same(record.check_in_at, first) || !same(record.check_out_at, out),
	};
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
	REPEAT_PUNCH_MIN,
	assignPunches,
	mergeCheckTimes,
	validateShift,
	normalizePatternDays,
};
