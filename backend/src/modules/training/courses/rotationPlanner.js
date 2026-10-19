/**
 * rotationPlanner.js — phần tính toán THUẦN (không đụng DB) cho vòng thực hành
 * GPHN: xếp lịch nối tiếp các vòng và tìm điểm bất thường để cảnh báo. Chỉ
 * cảnh báo, không chặn — quyết định cuối cùng là của phòng Đào tạo.
 */
const { parseDuration, formatDuration } = require('../../../utils/trainingDuration');

const DAY_MS = 86400000;
// Ngày 'YYYY-MM-DD' từ chuỗi hoặc Date (driver mssql trả cột DATE thành Date UTC).
const dayStr = (v) => {
	if (!v) return null;
	return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
};
const toDate = (v) => new Date(`${dayStr(v)}T00:00:00Z`);
const ymd = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * DAY_MS);
const daysBetween = (a, b) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / DAY_MS);

const addMonths = (d, n) => {
	const r = new Date(d);
	const day = r.getUTCDate();
	r.setUTCDate(1);
	r.setUTCMonth(r.getUTCMonth() + n);
	const last = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
	r.setUTCDate(Math.min(day, last));
	return r;
};

/**
 * Ngày kết thúc của 1 khoảng bắt đầu từ `start` kéo dài value×unit (tính cả ngày đầu):
 * 16/06 + 3 tháng → 15/09; 1,5 tháng = 1 tháng + 15 ngày; tuần/ngày cộng thẳng.
 */
const endOf = (start, value, unit) => {
	const s = toDate(start);
	if (unit === 'month') {
		const whole = Math.floor(value);
		const extraDays = Math.round((value - whole) * 30);
		return ymd(addDays(addDays(addMonths(s, whole), extraDays), -1));
	}
	const days = Math.max(1, Math.round(value * (unit === 'week' ? 7 : 1)));
	return ymd(addDays(s, days - 1));
};

/**
 * Xếp lịch nối tiếp: vòng đầu bắt đầu từ startDate, vòng sau bắt đầu ngay ngày
 * kế tiếp vòng trước. Thời lượng mỗi dòng: duration_text của dòng → thời lượng
 * vòng (lesson); vòng chia nhiều khoa (allow_split) chưa ghi thời lượng riêng
 * thì chia đều thời lượng vòng cho số khoa (mốc chia làm tròn theo ngày, khoa
 * cuối kết thúc đúng ngày cuối của vòng).
 * rows: [{ id, lesson_id, duration_text }] theo thứ tự seq;
 * lessons: Map(lesson_id → { duration_value, duration_unit, allow_split }).
 * Trả [{ id, start_date, end_date }] — dòng không xác định được thời lượng thì dừng.
 */
const planSchedule = (rows, lessons, startDate) => {
	const segmentsOf = new Map();
	for (const r of rows) {
		if (parseDuration(r.duration_text)) continue; // dòng có thời lượng riêng không tham gia chia đều
		segmentsOf.set(r.lesson_id, (segmentsOf.get(r.lesson_id) ?? 0) + 1);
	}
	const spans = new Map(); // lesson_id → { start, days, n, idx } của vòng đang chia

	const out = [];
	let cursor = dayStr(startDate);
	for (const r of rows) {
		const lesson = lessons.get(r.lesson_id);
		const own = parseDuration(r.duration_text);
		let end;
		if (own) {
			end = endOf(cursor, own.value, own.unit);
		} else if (lesson?.duration_value && lesson?.duration_unit) {
			const n = lesson.allow_split ? segmentsOf.get(r.lesson_id) : 1;
			let span = spans.get(r.lesson_id);
			if (!span) {
				const fullEnd = endOf(cursor, Number(lesson.duration_value), lesson.duration_unit);
				span = { start: cursor, days: daysBetween(cursor, fullEnd) + 1, n, idx: 0 };
				spans.set(r.lesson_id, span);
			}
			span.idx += 1;
			const offset = Math.max(
				Math.round((span.idx * span.days) / span.n),
				daysBetween(span.start, cursor) + 1,
			);
			end = ymd(addDays(toDate(span.start), offset - 1));
		} else break;
		out.push({ id: r.id, start_date: cursor, end_date: end });
		cursor = ymd(addDays(toDate(end), 1));
	}
	return out;
};

// "16/06/2025 → 15/09/2025" ⇒ "03 tháng" / "1,5 tuần" / "10 ngày" — chữ in lên giấy tờ.
const describeSpan = (start, end) => {
	if (!start || !end) return null;
	const last = dayStr(end);
	for (let m = 1; m <= 36; m++)
		if (endOf(start, m, 'month') === last) return formatDuration(m, 'month');
	const days = daysBetween(start, end) + 1;
	// Sổ thực hành ghi "1.5 tuần" cho khoảng 10–11 ngày ⇒ làm tròn theo nửa tuần, lệch ≤ 1 ngày.
	const halfWeeks = Math.round(days / 3.5);
	if (halfWeeks >= 2 && Math.abs(days - halfWeeks * 3.5) <= 1)
		return formatDuration(halfWeeks / 2, 'week');
	return formatDuration(days, 'day');
};

/**
 * Cảnh báo theo từng dòng. ctx: { enrollment: {start_date, end_date},
 * allowedDepartments: Map(lesson_id → string[]), mentorLoad: Map(row id → số học
 * viên khác NHD đang kèm cùng thời gian), maxLoad }.
 * Trả Map(row id → string[]).
 */
const findWarnings = (rows, ctx) => {
	const out = new Map(rows.map((r) => [r.id, []]));
	const day = dayStr;
	for (const r of rows) {
		const w = out.get(r.id);
		const allowed = ctx.allowedDepartments?.get(r.lesson_id) ?? [];
		if (r.department_id && allowed.length && !allowed.includes(r.department_id))
			w.push('Khoa không nằm trong danh sách khoa của vòng.');
		if (r.mentor_user_id && !r.mentor_license_no) w.push('Người hướng dẫn chưa có số CCHN.');
		const s = day(r.start_date);
		const e = day(r.end_date);
		const es = day(ctx.enrollment?.start_date);
		const ee = day(ctx.enrollment?.end_date);
		if ((s && es && s < es) || (e && ee && e > ee))
			w.push('Nằm ngoài thời gian thực hành của hồ sơ.');
		const load = ctx.mentorLoad?.get(r.id) ?? 0;
		if (r.mentor_user_id && ctx.maxLoad && load + 1 > ctx.maxLoad)
			w.push(`Người hướng dẫn đang kèm ${load + 1} học viên cùng lúc (tối đa ${ctx.maxLoad}).`);
	}
	// Chồng ngày giữa các vòng của cùng hồ sơ (bỏ qua dòng chưa có ngày)
	const dated = rows.filter((r) => r.start_date && r.end_date);
	for (let i = 0; i < dated.length; i++)
		for (let j = i + 1; j < dated.length; j++) {
			const a = dated[i];
			const b = dated[j];
			if (day(a.start_date) <= day(b.end_date) && day(b.start_date) <= day(a.end_date)) {
				out
					.get(a.id)
					.push(
						`Trùng ngày với vòng ${b.department_name || b.round_title || ''}.`.replace(' .', '.'),
					);
				out
					.get(b.id)
					.push(
						`Trùng ngày với vòng ${a.department_name || a.round_title || ''}.`.replace(' .', '.'),
					);
			}
		}
	return out;
};

module.exports = { endOf, planSchedule, describeSpan, findWarnings, daysBetween };
