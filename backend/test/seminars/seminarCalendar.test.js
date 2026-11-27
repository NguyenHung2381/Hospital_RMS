// File lịch .ics của vé hội nghị (utils/seminarCalendar): giờ VN → UTC, cả ngày,
// thiếu giờ kết thúc, thoát ký tự, gập dòng, UID không chứa mã vé.
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSeminarIcs, seminarSpan } = require('../../src/utils/seminarCalendar');

const opts = {
	code: 'abc123secretcode',
	holder: 'BS. Nguyễn Văn A',
	ticketUrl: 'https://rms.example/hoi-nghi/ve/abc123secretcode',
	now: new Date('2026-11-27T01:02:03.456Z'),
};
const lines = (ics) => ics.replace(/\r\n /g, '').split('\r\n');

test('chưa có ngày tổ chức → không có lịch', () => {
	assert.equal(buildSeminarIcs({ title: 'X', date_text: 'Quý 1' }, opts), null);
});

test('có giờ: quy giờ Việt Nam sang UTC, kèm 2 lời nhắc', () => {
	const ics = buildSeminarIcs(
		{
			title: 'Hội nghị Tim mạch',
			location: 'Hội trường A',
			start_date: '2026-12-05',
			start_time: '07:30',
			end_time: '11:30',
		},
		opts,
	);
	const l = lines(ics);
	assert.ok(l.includes('DTSTART:20261205T003000Z'));
	assert.ok(l.includes('DTEND:20261205T043000Z'));
	assert.ok(l.includes('DTSTAMP:20261127T010203Z'));
	assert.ok(l.includes('LOCATION:Hội trường A'));
	assert.ok(l.includes(`URL:${opts.ticketUrl}`));
	assert.equal(l.filter((x) => x === 'BEGIN:VALARM').length, 2);
	assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
});

test('DATE kiểu Date của mssql (00:00 UTC) không lệch ngày', () => {
	const span = seminarSpan({ start_date: new Date('2026-12-05T00:00:00Z'), start_time: '08:00' });
	assert.equal(span.start.toISOString(), '2026-12-05T01:00:00.000Z');
	// 1 ngày, không có giờ kết thúc ⇒ 2 tiếng
	assert.equal(span.end.toISOString(), '2026-12-05T03:00:00.000Z');
});

test('nhiều ngày không giờ kết thúc ⇒ 17:00 ngày cuối', () => {
	const span = seminarSpan({
		start_date: '2026-12-05',
		end_date: '2026-12-06',
		start_time: '08:00',
	});
	assert.equal(span.end.toISOString(), '2026-12-06T10:00:00.000Z');
});

test('không có giờ ⇒ sự kiện cả ngày, DTEND là ngày sau ngày cuối', () => {
	const l = lines(
		buildSeminarIcs({ title: 'X', start_date: '2026-12-31', end_date: '2027-01-01' }, opts),
	);
	assert.ok(l.includes('DTSTART;VALUE=DATE:20261231'));
	assert.ok(l.includes('DTEND;VALUE=DATE:20270102'));
	assert.equal(l.filter((x) => x === 'BEGIN:VALARM').length, 1);
});

test('thoát ; , \\ xuống dòng; gập dòng ≤ 75 byte; UID không lộ mã vé', () => {
	const ics = buildSeminarIcs(
		{
			title: `Hội thảo; chuyên đề, "A\\B"\n${'Điều trị đột quỵ cấp '.repeat(6)}`,
			start_date: '2026-12-05',
		},
		opts,
	);
	for (const raw of ics.split('\r\n')) assert.ok(Buffer.byteLength(raw) <= 75, raw);
	const summary = lines(ics).find((x) => x.startsWith('SUMMARY:'));
	assert.ok(summary.startsWith('SUMMARY:Hội thảo\\; chuyên đề\\, "A\\\\B"\\nĐiều trị'));
	const uid = lines(ics).find((x) => x.startsWith('UID:'));
	assert.ok(!uid.includes(opts.code));
	assert.equal(
		uid,
		lines(buildSeminarIcs({ title: 'Y', start_date: '2027-01-01' }, opts)).find((x) =>
			x.startsWith('UID:'),
		),
	);
});
