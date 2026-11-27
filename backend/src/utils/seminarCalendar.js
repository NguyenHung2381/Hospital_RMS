/**
 * seminarCalendar.js — Sự kiện lịch (.ics, RFC 5545) của 1 vé hội nghị.
 *
 * Mở link trả `text/calendar` trên điện thoại: iOS Safari hiện ngay bảng "Thêm vào
 * Lịch", Android tải file về rồi mở bằng Google Calendar / Lịch Samsung. Cũng đính kèm
 * vào thư thẻ đại biểu (Gmail, Mail của iOS hiện nút thêm vào lịch).
 *
 * Giờ ghi theo UTC (hậu tố Z) quy từ giờ Việt Nam — khỏi khai báo VTIMEZONE.
 */
const crypto = require('crypto');
const { dateKey, vnDateTime } = require('./seminarSchedule');

const HOUR_MS = 3600 * 1000;

// TEXT trong iCalendar: thoát \ ; , và xuống dòng
const text = (s) =>
	String(s ?? '')
		.replace(/\\/g, '\\\\')
		.replace(/\r?\n/g, '\\n')
		.replace(/[;,]/g, (c) => `\\${c}`);

// Gập dòng dài quá 75 byte UTF-8; dòng nối bắt đầu bằng 1 dấu cách (tính vào 75 byte)
const fold = (line) => {
	const parts = [];
	let cur = '';
	let bytes = 0;
	for (const ch of line) {
		const b = Buffer.byteLength(ch);
		if (bytes + b > (parts.length ? 74 : 75)) {
			parts.push(cur);
			cur = '';
			bytes = 0;
		}
		cur += ch;
		bytes += b;
	}
	parts.push(cur);
	return parts.join('\r\n ');
};

const utcStamp = (d) =>
	d
		.toISOString()
		.replace(/[-:]/g, '')
		.replace(/\.\d{3}/, '');
const dayStamp = (key) => key.replace(/-/g, '');
const nextDay = (key) =>
	new Date(Date.parse(`${key}T00:00:00Z`) + 24 * HOUR_MS).toISOString().slice(0, 10);

/**
 * @typedef {object} SeminarWhen
 * @property {string | Date | null} [start_date]
 * @property {string | Date | null} [end_date]
 * @property {string | null} [start_time] 'HH:mm' giờ Việt Nam
 * @property {string | null} [end_time]
 */

/**
 * Khoảng thời gian của hội nghị: { allDay, start, end } — start/end là 'YYYY-MM-DD'
 * (allDay, end KHÔNG gồm) hoặc Date. null khi chưa có ngày tổ chức (chỉ có date_text).
 */
/** @param {SeminarWhen} s */
const seminarSpan = (s) => {
	const startKey = dateKey(s.start_date);
	if (!startKey) return null;
	const endKey = dateKey(s.end_date) || startKey;
	if (!s.start_time) return { allDay: true, start: startKey, end: nextDay(endKey) };
	const start = vnDateTime(startKey, s.start_time);
	// Không có giờ kết thúc: 1 ngày ⇒ 2 tiếng; nhiều ngày ⇒ hết giờ hành chính ngày cuối
	let end = s.end_time
		? vnDateTime(endKey, s.end_time)
		: endKey === startKey
			? new Date(start.getTime() + 2 * HOUR_MS)
			: vnDateTime(endKey, '17:00');
	if (end <= start) end = new Date(start.getTime() + HOUR_MS);
	return { allDay: false, start, end };
};

const alarm = (trigger, description) => [
	'BEGIN:VALARM',
	'ACTION:DISPLAY',
	`TRIGGER:${trigger}`,
	`DESCRIPTION:${text(description)}`,
	'END:VALARM',
];

/**
 * Nội dung file .ics, hoặc null khi hội nghị chưa có ngày.
 * @param {SeminarWhen & { title: string, location?: string | null }} seminar
 * @param {{ code: string, holder?: string, ticketUrl: string, now?: Date }} opts
 */
const buildSeminarIcs = (seminar, { code, holder, ticketUrl, now = new Date() }) => {
	const span = seminarSpan(seminar);
	if (!span) return null;
	// UID không lộ mã vé (mã vé là khóa mở vé); cùng vé luôn ra cùng UID ⇒ thêm lại thì cập nhật
	const uid = `${crypto.createHash('sha256').update(String(code)).digest('hex').slice(0, 32)}@seminar.rms`;
	const description = [
		holder ? `Đại biểu: ${holder}` : null,
		'Mở vé để đưa mã QR cho ban tổ chức quét điểm danh và làm bài kiểm tra:',
		ticketUrl,
	]
		.filter(Boolean)
		.join('\n');
	const reminders = span.allDay
		? alarm('-PT15H', `Ngày mai: ${seminar.title}`) // 9:00 sáng hôm trước
		: [
				...alarm('-P1D', `Ngày mai: ${seminar.title}`),
				...alarm('-PT1H', `Sắp bắt đầu: ${seminar.title}`),
			];
	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//BV Huu nghi Da khoa Nghe An//RMS//VI',
		'CALSCALE:GREGORIAN',
		'METHOD:PUBLISH',
		'BEGIN:VEVENT',
		`UID:${uid}`,
		`DTSTAMP:${utcStamp(now)}`,
		span.allDay ? `DTSTART;VALUE=DATE:${dayStamp(span.start)}` : `DTSTART:${utcStamp(span.start)}`,
		span.allDay ? `DTEND;VALUE=DATE:${dayStamp(span.end)}` : `DTEND:${utcStamp(span.end)}`,
		`SUMMARY:${text(seminar.title)}`,
		seminar.location ? `LOCATION:${text(seminar.location)}` : null,
		`DESCRIPTION:${text(description)}`,
		`URL:${ticketUrl}`,
		...reminders,
		'END:VEVENT',
		'END:VCALENDAR',
	].filter(Boolean);
	return `${lines.map(fold).join('\r\n')}\r\n`;
};

module.exports = { buildSeminarIcs, seminarSpan };
