// Đồng bộ ngày nghỉ lễ từ lịch iCal: đọc đúng định dạng lịch Google (bỏ "Ngày lễ kỷ niệm"), so với
// lịch đang dùng ra gợi ý Thêm / Bỏ, lỗi tải thì giữ bản cũ, job chỉ báo mỗi bộ gợi ý 1 lần.
const test = require('node:test');
const assert = require('node:assert/strict');

// ── Giả lập cấu hình + thông báo + chống gửi trùng (không cần DB) ──
const store = new Map();
const svc = require('../../src/modules/settings/systemSettingService');
svc.getValue = async (k, fb) => (store.has(k) && store.get(k) !== '' ? store.get(k) : fb);
svc.setInternal = async (k, v) => store.set(k, v);
const db = require('../../src/config/db');
db.getPool = async () => ({
	request: () => ({ query: async () => ({ recordset: [{ id: 'NV1' }, { id: 'NV2' }] }) }),
});
const pushed = [];
require('../../src/modules/notifications/notificationService').push = async (...a) =>
	pushed.push(a);
const seen = new Set();
require('../../src/jobs/dedupe').markOnce = async (job, key) =>
	seen.has(key) ? false : (seen.add(key), true);

const hs = require('../../src/modules/settings/holidaySync');

// Mẫu theo đúng định dạng lịch "Ngày lễ ở Việt Nam" của Google (dòng gập, mô tả phân loại)
const ev = (start, end, summary, desc = 'Ngày lễ') =>
	`BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:${start}\r\nDTEND;VALUE=DATE:${end}\r\nUID:${start}@google.com\r\nDESCRIPTION:${desc}\r\nSUMMARY:${summary}\r\nEND:VEVENT\r\n`;
const ICS =
	'BEGIN:VCALENDAR\r\nVERSION:2.0\r\n' +
	ev('20260101', '20260102', 'Tết dương lịch') +
	ev('20260102', '20260103', 'Tết dương lịch') + // hoán đổi — quy tắc tự tính không biết
	ev(
		'20260214',
		'20260215',
		'Lễ tình nhân',
		'Ngày lễ kỷ niệm\\nĐể ẩn các ngày lễ kỷ niệm\\, hãy chuyển\r\n  đến phần Cài đặt',
	) +
	ev('20260216', '20260221', 'Tết Nguyên Đán') + // sự kiện nhiều ngày
	ev('20260426', '20260427', 'Giỗ tổ Hùng Vương') +
	ev('20260427', '20260428', 'ngày nghỉ Giỗ tổ Hùng Vương') +
	ev('20260430', '20260501', 'Ngày giải phóng') +
	ev('20260501', '20260502', 'Ngày Quốc tế Lao động') +
	ev('20260831', '20260901', 'Quốc khánh (ngày lễ bổ sung)') +
	ev('20260901', '20260902', 'Quốc khánh (ngày lễ bổ sung)') +
	ev('20260902', '20260903', 'Quốc khánh') +
	ev('20261124', '20261125', 'Ngày Văn hoá Việt Nam') +
	'END:VCALENDAR\r\n';

const okFetch =
	(body = ICS) =>
	async () =>
		new Response(body, { status: 200 });

test('đọc lịch: bỏ ngày kỷ niệm, trải sự kiện nhiều ngày, sắp theo ngày', () => {
	const days = hs.parseIcs(ICS);
	const dates = days.map((d) => d.date);
	assert.ok(!dates.includes('2026-02-14')); // Lễ tình nhân không được nghỉ
	assert.deepEqual(
		dates.filter((d) => d.startsWith('2026-02')),
		['2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20'],
	);
	assert.deepEqual(dates, [...dates].sort());
	assert.equal(days.find((d) => d.date === '2026-11-24').name, 'Ngày Văn hoá Việt Nam');
});

test('gợi ý: thêm ngày nguồn có mà lịch đang dùng thiếu, bỏ ngày tự tính mà nguồn không có', () => {
	const synced = { days: hs.parseIcs(ICS) };
	const sug = hs.suggestionsFor(synced, { text: '', auto: true }, [2026], '2026-01-01');
	const add = sug.filter((s) => s.action === 'add').map((s) => s.date);
	const remove = sug.filter((s) => s.action === 'remove').map((s) => s.date);
	assert.deepEqual(add, ['2026-01-02', '2026-08-31', '2026-09-01', '2026-11-24']);
	assert.deepEqual(remove, ['2026-09-03']); // tự tính đoán 3/9, lịch nguồn là 31/8–1/9
});

test('gợi ý: bỏ qua ngày đã qua, năm nguồn không có dữ liệu, không đề xuất bỏ ngày nhập tay', () => {
	const synced = { days: hs.parseIcs(ICS) };
	assert.deepEqual(
		hs.suggestionsFor(synced, { text: '', auto: true }, [2026], '2026-10-01').map((s) => s.date),
		['2026-11-24'],
	);
	assert.deepEqual(hs.suggestionsFor(synced, { text: '', auto: true }, [2027], '2026-01-01'), []);
	// Đã chấp nhận hết ⇒ hết gợi ý; 03/09 nhập tay thì không bị đề xuất bỏ
	const accepted = '02/01/2026, 31/08/2026, 01/09/2026, 24/11, 03/09/2026';
	assert.deepEqual(
		hs.suggestionsFor(synced, { text: accepted, auto: true }, [2026], '2026-01-01'),
		[],
	);
});

test('sync: tải được thì lưu bản mới; lỗi thì giữ bản cũ kèm lỗi', async () => {
	store.clear();
	global.fetch = okFetch();
	const ok = await hs.sync();
	assert.equal(ok.error, undefined);
	assert.equal(ok.source, hs.DEFAULT_ICS_URL);
	assert.ok(ok.days.length > 10);

	global.fetch = async () => {
		throw Object.assign(new Error('timeout'), { name: 'TimeoutError' });
	};
	const bad = await hs.sync();
	assert.match(bad.error, /Internet/);
	assert.equal(bad.days.length, ok.days.length); // giữ bản cũ
	assert.equal(bad.fetched_at, ok.fetched_at);
	assert.deepEqual((await hs.getSynced()).days, ok.days);

	global.fetch = okFetch('<html>không phải lịch</html>');
	assert.match((await hs.sync()).error, /iCal/);
});

test('sync: địa chỉ không phải https bị từ chối, không gọi ra ngoài', async () => {
	store.clear();
	store.set('TRAINING_HOLIDAYS_ICS_URL', 'http://lich.noibo/vn.ics');
	let called = false;
	global.fetch = async () => ((called = true), new Response(ICS));
	assert.match((await hs.sync()).error, /https/);
	assert.equal(called, false);
	store.delete('TRAINING_HOLIDAYS_ICS_URL');
});

test('validateSetting: chỉ nhận địa chỉ https', () => {
	assert.equal(hs.validateSetting('TRAINING_HOLIDAYS_ICS_URL', ''), null);
	assert.equal(hs.validateSetting('TRAINING_HOLIDAYS_ICS_URL', 'https://lich.bv.vn/vn.ics'), null);
	assert.match(hs.validateSetting('TRAINING_HOLIDAYS_ICS_URL', 'ftp://x') ?? '', /https/);
	assert.match(
		hs.validateSetting('TRAINING_HOLIDAYS_ICS_URL', 'không phải url') ?? '',
		/không hợp lệ/,
	);
	assert.equal(hs.validateSetting('SMTP_HOST', 'bất kỳ'), null);
});

test('job: công tắc tắt ⇒ không tải; bật ⇒ báo quản trị đúng 1 lần cho mỗi bộ gợi ý', async () => {
	store.clear();
	pushed.length = 0;
	let calls = 0;
	// Lịch nguồn có 1 ngày nghỉ thêm ở năm sau (luôn là ngày tương lai, không phụ thuộc hôm nay)
	const next = new Date().getUTCFullYear() + 1;
	const body = `BEGIN:VCALENDAR\r\n${ev(`${next}0615`, `${next}0616`, 'Ngày nghỉ thử')}${ev(`${next}0616`, `${next}0617`, 'Ngày nghỉ thử')}END:VCALENDAR\r\n`;
	global.fetch = async () => (calls++, new Response(body));
	await hs.runJob();
	assert.equal(calls, 0);

	store.set('TRAINING_HOLIDAYS_SYNC', 'true');
	store.set('TRAINING_HOLIDAYS_AUTO', 'false'); // chỉ so ngày nhập tay — gợi ý gọn, dễ kiểm
	await hs.runJob();
	await hs.runJob(); // cùng bộ gợi ý ⇒ không báo lại
	assert.equal(calls, 2);
	assert.equal(pushed.length, 1);
	const [type, title, users, opts] = pushed[0];
	assert.equal(type, 'holiday_sync');
	assert.match(title, /điểm khác cần xem lại/);
	assert.deepEqual(users, ['NV1', 'NV2']);
	assert.match(opts.message, /Thêm 15\/06/);
	assert.match(opts.message, /Thêm 16\/06/);
	assert.match(opts.message, /Cấu hình hệ thống → Đào tạo → Ngày nghỉ lễ/);
});
