/**
 * rotationPlanner.js — phần tính toán THUẦN (không đụng DB) cho vòng thực hành
 * GPHN: xếp lịch nối tiếp các vòng, tìm điểm bất thường để cảnh báo (không chặn),
 * rút mẫu vòng từ sổ cũ và xếp so le khoa / NHD theo tải (xem practiceAutoService).
 */
const { parseDuration, formatDuration, toDays } = require('../../../utils/trainingDuration');
const { norm } = require('../../../utils/vietnameseText');

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
	// Bước nửa tháng: sổ hay ghi "1,5 tháng"
	for (let m = 2; m <= 72; m++)
		if (endOf(start, m / 2, 'month') === last) return formatDuration(m / 2, 'month');
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

// Sổ ghi tên khoa không có chữ "Khoa": "Cấp cứu", "Nội tim mạch 2"
const shortDept = (name) => String(name ?? '').replace(/^\s*khoa\s+/i, '');

/**
 * Nhãn lĩnh vực in lên giấy (cột TH n) — bản JS của công thức IFS trong sổ:
 * Cấp cứu/Chống độc/Hồi sức → "về Hồi sức cấp cứu"; Ngoại/Phẫu thuật/Chấn thương/Bỏng
 * → "lĩnh vực Ngoại khoa"; Nội/Đột quỵ/Nhiệt đới/Huyết học/Thần kinh/Miễn dịch → "lĩnh
 * vực Nội khoa"; Nhi → Nhi khoa; Sản → Sản phụ khoa; chuyên khoa lẻ → "về <tên khoa>".
 */
const practiceFieldLabel = (deptName) => {
	const name = shortDept(deptName).trim();
	const n = norm(name);
	if (!n) return '';
	if (/cap cuu|chong doc|hoi suc/.test(n)) return 'về Hồi sức cấp cứu';
	if (/ngoai|phau thuat|chan thuong|bong/.test(n)) return 'lĩnh vực Ngoại khoa';
	if (/noi|dot quy|nhiet doi|huyet hoc|than kinh|mien dich/.test(n)) return 'lĩnh vực Nội khoa';
	if (/\bnhi\b/.test(n)) return 'lĩnh vực Nhi khoa';
	if (/san/.test(n)) return 'lĩnh vực Sản phụ khoa';
	if (/tai mui hong|rang ham mat|\bmat\b|da lieu|y hoc co truyen|phuc hoi chuc nang/.test(n))
		return `về ${name}`;
	return 'Khác';
};

// Khoa → tên vòng theo cùng nhóm của TH n; chuyên khoa lẻ gom chung 1 vòng.
const roundKey = (deptName) => {
	const label = practiceFieldLabel(deptName);
	if (label === 'về Hồi sức cấp cứu') return 'Hồi sức cấp cứu';
	if (label.startsWith('lĩnh vực ')) return label.replace(/^lĩnh vực /, '');
	if (label.startsWith('về ')) return 'Chuyên khoa khác';
	return shortDept(deptName).trim() || 'Khác';
};

const mode = (values) => {
	const count = new Map();
	for (const v of values) if (v != null) count.set(v, (count.get(v) ?? 0) + 1);
	let best = null;
	for (const [v, n] of count) if (best == null || n > count.get(best)) best = v;
	return best;
};

/**
 * Rút mẫu vòng của 1 chương trình từ các hồ sơ đã có (sổ cũ đã nhập).
 * records: [{ rotations: [{ department_id, department_name, start_date, end_date, duration_text }] }]
 * programDays: thời lượng chương trình quy ra ngày — ưu tiên kiểu hồ sơ đi đủ thời gian
 * (sổ ghi dần, nhiều hồ sơ mới có 1–2 khoa).
 * Trả [{ title, duration_text, allow_split, department_ids }] theo thứ tự thường gặp; null nếu không có dữ liệu.
 */
const deriveTemplate = (records, programDays) => {
	const shapes = [];
	for (const rec of records) {
		const groups = new Map(); // key → { key, rows, pos }
		rec.rotations.forEach((r, i) => {
			if (!r.department_id) return;
			const key = roundKey(r.department_name);
			if (!groups.has(key)) groups.set(key, { key, rows: [], pos: i });
			groups.get(key).rows.push(r);
		});
		if (!groups.size) continue;
		let total = 0;
		for (const g of groups.values()) {
			// 1 khoa: tin chữ thời lượng của sổ; vòng nhiều khoa: tính từ ngày đầu → ngày cuối
			const own = g.rows.length === 1 ? parseDuration(g.rows[0].duration_text) : null;
			if (own) {
				g.duration_text = formatDuration(own.value, own.unit);
				g.days = toDays(own.value, own.unit);
			} else if (g.rows.every((r) => r.start_date && r.end_date)) {
				const s = g.rows.map((r) => dayStr(r.start_date)).sort()[0];
				const e = g.rows
					.map((r) => dayStr(r.end_date))
					.sort()
					.at(-1);
				g.duration_text = describeSpan(s, e);
				g.days = daysBetween(s, e) + 1;
			}
			total += g.days ?? 0;
		}
		const sig = [...groups.values()]
			.map((g) => `${g.key}×${g.rows.length}`)
			.sort()
			.join('|');
		shapes.push({ sig, total, groups: [...groups.values()] });
	}
	if (!shapes.length) return null;

	const full = shapes.filter(
		(s) => programDays && Math.abs(s.total - programDays) <= programDays * 0.15,
	);
	const sig = mode((full.length ? full : shapes).map((s) => s.sig));
	const chosen = shapes.filter((s) => s.sig === sig);

	// Khoa từng vòng: mọi khoa cùng nhóm từng gặp trong chương trình, hay gặp xếp trước
	const deptCount = new Map(); // key → Map(dept → số lần)
	for (const s of shapes)
		for (const g of s.groups)
			for (const r of g.rows) {
				const m = deptCount.get(g.key) ?? new Map();
				m.set(r.department_id, (m.get(r.department_id) ?? 0) + 1);
				deptCount.set(g.key, m);
			}

	return chosen[0].groups
		.map((g0) => {
			const all = chosen.map((s) => s.groups.find((g) => g.key === g0.key));
			const n = g0.rows.length;
			const depts = [...deptCount.get(g0.key)].sort((a, b) => b[1] - a[1]).map(([id]) => id);
			const ids = n > 1 ? depts.slice(0, n) : depts;
			const only = ids.length === 1 && n === 1 ? g0.rows[0].department_name : null;
			return {
				title: only ? shortDept(only).trim() : g0.key,
				duration_text: mode(all.map((g) => g.duration_text)),
				allow_split: n > 1,
				department_ids: ids,
				pos: all.reduce((sum, g) => sum + g.pos, 0) / all.length,
			};
		})
		.sort((a, b) => a.pos - b.pos)
		.map(({ pos: _pos, ...round }) => round);
};

/** Số dòng trong `busy` cùng `key` có khoảng ngày giao [s, e]. */
const overlapCount = (busy, key, field, s, e) => {
	let n = 0;
	for (const b of busy) if (b[field] === key && b.start_date <= e && b.end_date >= s) n++;
	return n;
};

/**
 * Xếp so le 1 hồ sơ: thử xoay vòng thứ tự các vòng (vòng chia nhiều khoa đi liền
 * một khối), mỗi kiểu tính lịch nối tiếp, mỗi dòng chọn khoa (trong khoa được
 * phép) đang có ít học viên nhất trong khoảng ngày đó; lấy kiểu tổng tải thấp nhất.
 * rows: [{ id, lesson_id, duration_text, department_id }] theo thứ tự mẫu;
 * lessons: Map(lesson_id → { duration_value, duration_unit, allow_split, department_ids });
 * busy: [{ department_id, start_date, end_date }] vòng của học viên khác.
 * firstLessonId: học viên phải vào vòng này trước (VD học khoa khác rồi mới sang Cấp cứu) —
 * chỉ thử các kiểu bắt đầu bằng vòng đó; không có trong hồ sơ thì bỏ qua.
 * Trả [{ id, start_date, end_date, department_id }] theo thứ tự mới.
 */
const arrangeRotations = (rows, lessons, startDate, busy, firstLessonId = null) => {
	const blocks = [];
	for (const r of rows) {
		const last = blocks.at(-1);
		if (last && r.lesson_id && last[0].lesson_id === r.lesson_id) last.push(r);
		else blocks.push([r]);
	}
	const pinned = firstLessonId && blocks.some((b) => b[0].lesson_id === firstLessonId);
	let best = null;
	for (let shift = 0; shift < Math.max(blocks.length, 1); shift++) {
		if (pinned && blocks[shift][0].lesson_id !== firstLessonId) continue;
		const ordered = [...blocks.slice(shift), ...blocks.slice(0, shift)].flat();
		const plan = planSchedule(ordered, lessons, startDate);
		if (plan.length < ordered.length) return null; // thiếu thời lượng — không xếp được
		let cost = 0;
		const out = plan.map((p, i) => {
			const r = ordered[i];
			const allowed = r.department_id
				? [r.department_id]
				: (lessons.get(r.lesson_id)?.department_ids ?? []);
			let pick = null;
			let load = Infinity;
			for (const d of allowed) {
				const n = overlapCount(busy, d, 'department_id', p.start_date, p.end_date);
				if (n < load) [pick, load] = [d, n];
			}
			cost += pick ? load : 0;
			return { ...p, department_id: pick };
		});
		if (!best || cost < best.cost) best = { cost, out };
	}
	return best?.out ?? [];
};

/** NHD đang kèm ít học viên nhất trong [s, e]; hoà thì theo thứ tự `candidates`. */
const pickMentor = (candidates, busy, s, e) => {
	let pick = null;
	let load = Infinity;
	for (const id of candidates) {
		const n = overlapCount(busy, id, 'mentor_user_id', s, e);
		if (n < load) [pick, load] = [id, n];
	}
	return pick;
};

// "Tại khoa Cấp cứu" / "Tại các khoa: Cấp cứu, Nội tim mạch 2, Chuyên khoa khác" —
// vòng chia nhiều khoa ghi gọn bằng tên vòng như sổ.
const practiceLocation = (rows) => {
	const names = [];
	for (const r of rows) {
		const name = r.allow_split ? r.round_title : shortDept(r.department_name).trim();
		if (name && !names.includes(name)) names.push(name);
	}
	if (!names.length) return null;
	return names.length === 1 ? `Tại khoa ${names[0]}` : `Tại các khoa: ${names.join(', ')}`;
};

module.exports = {
	endOf,
	planSchedule,
	describeSpan,
	findWarnings,
	daysBetween,
	dayStr,
	shortDept,
	practiceFieldLabel,
	roundKey,
	deriveTemplate,
	arrangeRotations,
	pickMentor,
	practiceLocation,
};
