/**
 * seminarSchedule.js — Giờ hội nghị, khung giờ bài test cuối buổi và chương
 * trình (bài học / bài báo cáo) của hội nghị.
 *
 * Giờ lưu 'HH:mm' (VARCHAR(5)), ngày là DATE; quy đổi theo giờ Việt Nam (UTC+7,
 * không đổi giờ mùa hè) — không phụ thuộc múi giờ của server.
 */
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VN_OFFSET_MS = 7 * 3600 * 1000;

const badRequest = (msg) => Object.assign(new Error(msg), { statusCode: 400 });

// DATE từ mssql là 00:00 UTC → lấy phần ngày theo UTC; chuỗi 'YYYY-MM-DD...' giữ nguyên.
const dateKey = (d) => {
	if (!d) return null;
	if (typeof d === 'string' && DATE_RE.test(d.slice(0, 10))) return d.slice(0, 10);
	const x = d instanceof Date ? d : new Date(d);
	return Number.isNaN(x.getTime()) ? null : x.toISOString().slice(0, 10);
};

const vnTodayKey = (now = Date.now()) => new Date(now + VN_OFFSET_MS).toISOString().slice(0, 10);
const vnDateTime = (key, hhmm) => new Date(Date.parse(`${key}T${hhmm}:00Z`) - VN_OFFSET_MS);

/** '' / null → null; sai định dạng → lỗi 400 (label để báo lỗi dễ hiểu). */
const normalizeTime = (v, label) => {
	if (v === undefined) return undefined;
	if (v === null || String(v).trim() === '') return null;
	const s = String(v).trim().slice(0, 5);
	if (!TIME_RE.test(s)) throw badRequest(`${label} phải có dạng giờ:phút (HH:mm).`);
	return s;
};

/**
 * Khung giờ làm bài test: { date, start, end } (Date) hoặc null khi chưa đặt giờ.
 * Ngày làm bài mặc định = ngày kết thúc (hoặc ngày bắt đầu) của hội nghị;
 * không có ngày nào thì áp dụng cho hôm nay.
 */
const testWindow = (s, now = Date.now()) => {
	if (!s?.test_start_time && !s?.test_end_time) return null;
	const key = dateKey(s.test_date) || dateKey(s.end_date) || dateKey(s.start_date) || vnTodayKey(now);
	return {
		date: key,
		start: s.test_start_time ? vnDateTime(key, s.test_start_time) : null,
		end: s.test_end_time ? vnDateTime(key, s.test_end_time) : null,
	};
};

/**
 * Trạng thái bài test lúc `now`:
 *   'off'       — ban tổ chức chưa bật bài test
 *   'scheduled' — đã bật, chưa tới giờ mở
 *   'open'      — đang làm được
 *   'closed'    — đã quá giờ kết thúc
 */
const testState = (s, now = Date.now()) => {
	if (!s?.test_open) return 'off';
	const w = testWindow(s, now);
	if (w?.start && now < w.start.getTime()) return 'scheduled';
	if (w?.end && now > w.end.getTime()) return 'closed';
	return 'open';
};

// Chương trình hội nghị: [{ title, speaker?, date?, start_time?, end_time?, note? }]
const str = (v, max) => {
	const s = String(v ?? '').trim();
	return s ? s.slice(0, max) : undefined;
};
const normalizeAgenda = (raw) => {
	if (raw === null || raw === '') return null;
	if (!Array.isArray(raw)) throw badRequest('Danh sách bài học không hợp lệ.');
	const out = raw.map((x, i) => {
		const n = `Bài ${i + 1}`;
		const title = str(x?.title, 500);
		if (!title) throw badRequest(`${n}: chưa nhập tên bài.`);
		const date = str(x?.date, 10);
		if (date && !DATE_RE.test(date)) throw badRequest(`${n}: ngày không hợp lệ.`);
		const start_time = normalizeTime(x?.start_time, `${n}: giờ bắt đầu`) || undefined;
		const end_time = normalizeTime(x?.end_time, `${n}: giờ kết thúc`) || undefined;
		if (start_time && end_time && end_time < start_time)
			throw badRequest(`${n}: giờ kết thúc phải sau giờ bắt đầu.`);
		return JSON.parse(
			JSON.stringify({ title, speaker: str(x?.speaker, 255), date, start_time, end_time, note: str(x?.note, 500) }),
		);
	});
	return out.length ? JSON.stringify(out) : null;
};

const parseAgenda = (json) => {
	try {
		const list = JSON.parse(json || '[]');
		return Array.isArray(list) ? list : [];
	} catch {
		return [];
	}
};

module.exports = { TIME_RE, dateKey, normalizeTime, testWindow, testState, normalizeAgenda, parseAgenda };
