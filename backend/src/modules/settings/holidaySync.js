/**
 * holidaySync.js — đồng bộ ngày nghỉ lễ từ lịch iCal công khai (mặc định: "Ngày lễ ở Việt Nam" của
 * Google), để bắt các quyết định riêng từng năm mà quy tắc tự tính (utils/vnHolidays.js) không biết:
 * hoán đổi ngày làm việc, ngày liền kề Quốc khánh, ngày lễ mới.
 *
 * Dữ liệu tải về CHỈ là gợi ý: so với danh sách đang dùng (tự tính + ô "Thêm / bỏ ngày nghỉ") rồi
 * hiện ở trang cấu hình thành "Thêm ngày X" / "Bỏ ngày Y"; admin bấm chấp nhận (ghi vào ô thêm/bỏ)
 * và Lưu mới có hiệu lực. Nguồn ngoài sai hay bị sửa cũng không tự làm lệch lịch học.
 *
 * Bản tải gần nhất lưu ở system_settings, khóa nội bộ HOLIDAY_SYNC_KEY (không nằm trong whitelist
 * nên không sửa được qua PUT, không hiện ở GET /system-settings).
 */
const crypto = require('crypto');
const { getPool } = require('../../config/db');
const systemSettingService = require('./systemSettingService');
const notificationService = require('../notifications/notificationService');
const { holidayCalendar } = require('../../utils/classDates');
const dedupe = require('../../jobs/dedupe');
const { todayKeyVN } = require('../../utils/vnDate');
const logger = require('../../config/logger');

const DEFAULT_ICS_URL =
	'https://calendar.google.com/calendar/ical/vi.vietnamese%23holiday%40group.v.calendar.google.com/public/basic.ics';
const HOLIDAY_SYNC_KEY = 'TRAINING_HOLIDAYS_SYNC_DATA';
const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 15000;

const icsUrl = async () =>
	(await systemSettingService.getValue('TRAINING_HOLIDAYS_ICS_URL'))?.trim() || DEFAULT_ICS_URL;

// ── Đọc iCal ──
// Google đánh dấu ngày KHÔNG được nghỉ bằng mô tả "Ngày lễ kỷ niệm" (14/2, 20/10…) — bỏ qua.
const OBSERVANCE = /kỷ niệm|observance/i;
const pad = (n) => String(n).padStart(2, '0');
const ymd = (s) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
const unescapeText = (s) => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');

/**
 * @param {string} text nội dung .ics
 * @returns {{ date: string, name: string }[]} ngày nghỉ (sự kiện cả ngày, không phải ngày kỷ niệm), sắp theo ngày
 */
const parseIcs = (text) => {
	const unfolded = String(text).replace(/\r?\n[ \t]/g, '');
	const byDate = new Map();
	for (const block of unfolded.split('BEGIN:VEVENT').slice(1)) {
		const body = block.split('END:VEVENT')[0];
		const prop = (name) =>
			body.match(new RegExp(`^${name}(?:;[^:\\r\\n]*)?:(.*)$`, 'm'))?.[1]?.trim();
		const start = prop('DTSTART');
		if (!start || !/^\d{8}$/.test(start)) continue; // chỉ nhận sự kiện cả ngày (VALUE=DATE)
		const desc = unescapeText(prop('DESCRIPTION') ?? '').split('\n')[0];
		if (OBSERVANCE.test(desc)) continue;
		const name = unescapeText(prop('SUMMARY') ?? '').slice(0, 120) || 'Ngày lễ';
		const end = prop('DTEND');
		const from = new Date(`${ymd(start)}T00:00:00Z`);
		// DTEND của sự kiện cả ngày là ngày SAU ngày cuối; thiếu thì coi như 1 ngày. Chặn tối đa 14 ngày.
		const to =
			end && /^\d{8}$/.test(end)
				? new Date(`${ymd(end)}T00:00:00Z`)
				: new Date(from.getTime() + 86400000);
		for (let d = from, n = 0; d < to && n < 14; d = new Date(d.getTime() + 86400000), n++) {
			const s = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
			byDate.set(s, byDate.has(s) ? `${byDate.get(s)}; ${name}` : name);
		}
	}
	return [...byDate].sort(([a], [b]) => a.localeCompare(b)).map(([date, name]) => ({ date, name }));
};

// ── Tải ──
const fetchIcs = async (url) => {
	let u;
	try {
		u = new URL(url);
	} catch {
		throw new Error('Địa chỉ lịch không hợp lệ');
	}
	if (u.protocol !== 'https:') throw new Error('Địa chỉ lịch phải là https://');
	const res = await fetch(u, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'follow' });
	if (!res.ok) throw new Error(`Máy chủ lịch trả lỗi ${res.status}`);
	if (Number(res.headers.get('content-length')) > MAX_BYTES) throw new Error('File lịch quá lớn');
	const text = await res.text();
	if (text.length > MAX_BYTES) throw new Error('File lịch quá lớn');
	if (!text.includes('BEGIN:VCALENDAR')) throw new Error('Địa chỉ không trả về lịch iCal (.ics)');
	return text;
};

// ── Lưu / đọc bản đồng bộ ──
/** @returns {Promise<{ source: string, fetched_at: string|null, days: {date:string,name:string}[], error?: string, error_at?: string } | null>} */
const getSynced = async () => {
	const raw = await systemSettingService.getValue(HOLIDAY_SYNC_KEY, '');
	if (!raw) return null;
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
};

/** Tải ngay. Lỗi thì giữ bản cũ, ghi kèm lỗi để trang cấu hình hiện. */
const sync = async () => {
	const source = await icsUrl();
	const prev = await getSynced();
	let data;
	try {
		const days = parseIcs(await fetchIcs(source));
		if (!days.length) throw new Error('Lịch không có ngày nghỉ nào');
		data = { source, fetched_at: new Date().toISOString(), days };
	} catch (err) {
		const msg =
			err?.name === 'TimeoutError'
				? 'Quá thời gian chờ máy chủ lịch (máy chủ có ra được Internet?)'
				: err?.message || 'Lỗi không rõ';
		data = {
			source,
			fetched_at: prev?.source === source ? prev.fetched_at : null,
			days: prev?.source === source ? prev.days : [],
			error: msg,
			error_at: new Date().toISOString(),
		};
	}
	await systemSettingService.setInternal(HOLIDAY_SYNC_KEY, JSON.stringify(data));
	return data;
};

/**
 * Khác biệt giữa lịch đồng bộ và lịch đang dùng (chỉ ngày làm việc T2–T6, từ hôm nay trở đi, và
 * chỉ trong các năm lịch nguồn có dữ liệu):
 *   add    — nguồn có nghỉ, lịch đang dùng không nghỉ
 *   remove — lịch tự tính có nghỉ, nguồn không nghỉ (ngày nhập tay không đề xuất bỏ — đó là ý admin)
 * @param {{ days: {date:string,name:string}[] } | null} synced
 * @param {{ text: string, auto: boolean }} current
 * @param {number[]} years
 */
const suggestionsFor = (synced, current, years, today = todayKeyVN()) => {
	if (!synced?.days?.length) return [];
	const src = new Map(synced.days.map((d) => [d.date, d.name]));
	const covered = new Set(synced.days.map((d) => +d.date.slice(0, 4)));
	const cal = holidayCalendar(current);
	const out = [];
	for (const year of years) {
		if (!covered.has(year)) continue;
		const names = new Map(cal.list(year).map((x) => [x.date, x.name]));
		for (
			let d = new Date(Date.UTC(year, 0, 1));
			d.getUTCFullYear() === year;
			d = new Date(d.getTime() + 86400000)
		) {
			const dow = d.getUTCDay();
			const s = d.toISOString().slice(0, 10);
			if (dow === 0 || dow === 6 || s < today) continue;
			const on = cal.isHoliday(s);
			if (src.has(s) && !on) out.push({ date: s, action: 'add', name: src.get(s) });
			else if (!src.has(s) && on && !cal.isManual(s))
				out.push({ date: s, action: 'remove', name: names.get(s) ?? 'Ngày nghỉ tự tính' });
		}
	}
	return out;
};

const currentSettings = async () => ({
	text: (await systemSettingService.getValue('TRAINING_HOLIDAYS', '')) ?? '',
	auto: (await systemSettingService.getValue('TRAINING_HOLIDAYS_AUTO', 'true')) !== 'false',
});

/**
 * Ngày nghỉ lễ ĐANG ÁP DỤNG của 1 năm (tự tính + nhập tay, trừ ngày bị bỏ) — để các lịch học
 * tô ngày lễ. Ngày nhập tay trùng ngày của lịch đồng bộ thì lấy tên ở đó.
 * @param {number} year
 * @returns {Promise<{ date: string, name: string, compensatory: boolean }[]>}
 */
const effectiveHolidays = async (year) => {
	const [current, synced] = await Promise.all([currentSettings(), getSynced()]);
	const syncedName = new Map((synced?.days ?? []).map((d) => [d.date, d.name]));
	return holidayCalendar(current)
		.list(year)
		.filter((d) => !d.removed)
		.map((d) => ({
			date: d.date,
			name: d.source === 'manual' ? (syncedName.get(d.date) ?? 'Ngày nghỉ') : d.name,
			compensatory: !!d.compensatory,
		}));
};

/** Người nhận thông báo: superuser + vai trò có quyền system_settings:manage. */
const settingAdmins = async () => {
	const pool = await getPool();
	const r = await pool.request().query(`
		SELECT DISTINCT u.id FROM users u
		JOIN roles r ON r.id = u.role_id
		LEFT JOIN role_permissions rp ON rp.role_id = u.role_id
		LEFT JOIN permissions p ON p.id = rp.permission_id
		WHERE u.is_active = 'true'
		  AND (r.is_superuser = 'true' OR CONCAT(p.resource, ':', p.action) = 'system_settings:manage')`);
	return r.recordset.map((x) => x.id);
};

const fmt = (s) => `${s.slice(8)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;

/**
 * Job hằng tuần: công tắc TRAINING_HOLIDAYS_SYNC bật ⇒ tải lịch, có gợi ý MỚI (khác lần đã báo) thì
 * gửi thông báo cho quản trị cấu hình. Mỗi bộ gợi ý chỉ báo 1 lần (job_execution_log).
 */
const runJob = async () => {
	if ((await systemSettingService.getValue('TRAINING_HOLIDAYS_SYNC', 'false')) !== 'true') return;
	const data = await sync();
	if (data.error) {
		logger.warn(`[holiday-sync] ${data.error}`);
		return;
	}
	const year = +todayKeyVN().slice(0, 4);
	const sug = suggestionsFor(data, await currentSettings(), [year, year + 1]);
	if (!sug.length) return;
	const sig = crypto
		.createHash('sha1')
		.update(sug.map((s) => `${s.action}${s.date}`).join(','))
		.digest('hex');
	if (!(await dedupe.markOnce('holiday_sync', sig))) return;
	const lines = sug
		.slice(0, 8)
		.map((s) => `${s.action === 'add' ? 'Thêm' : 'Bỏ'} ${fmt(s.date)} — ${s.name}`);
	await notificationService.push(
		'holiday_sync',
		`Lịch nghỉ lễ có ${sug.length} điểm khác cần xem lại`,
		await settingAdmins(),
		{
			message: `${lines.join('\n')}${sug.length > 8 ? `\n… và ${sug.length - 8} ngày khác` : ''}\nXem và chấp nhận ở Cấu hình hệ thống → Đào tạo → Ngày nghỉ lễ.`,
			refType: 'system_settings',
		},
	);
};

// Kiểm tra khi admin lưu cấu hình (settingRules.js) — null = hợp lệ
const validateSetting = (key, value) => {
	if (key !== 'TRAINING_HOLIDAYS_ICS_URL' || value === null || value === '') return null;
	if (value.length > 500) return 'Địa chỉ quá dài';
	try {
		return new URL(value.trim()).protocol === 'https:'
			? null
			: 'Địa chỉ lịch phải bắt đầu bằng https://';
	} catch {
		return 'Địa chỉ không hợp lệ';
	}
};

module.exports = {
	DEFAULT_ICS_URL,
	HOLIDAY_SYNC_KEY,
	parseIcs,
	getSynced,
	sync,
	suggestionsFor,
	effectiveHolidays,
	runJob,
	validateSetting,
};
