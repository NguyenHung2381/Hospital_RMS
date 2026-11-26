import type { CalendarSession } from '../types/classSchedule.type';

/*
 * Xuất buổi học ra tệp lịch .ics (RFC 5545) để học viên thêm vào Google Calendar /
 * lịch điện thoại. Giờ Việt Nam cố định UTC+7 (không đổi giờ mùa hè) nên đổi thẳng
 * sang UTC, khỏi cần khối VTIMEZONE. Buổi chưa xếp giờ ⇒ sự kiện cả ngày.
 */

const VN_OFFSET_HOURS = 7;
const pad = (n: number) => String(n).padStart(2, '0');

// Chuỗi văn bản trong ICS: thoát \ ; , và xuống dòng
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// Dòng dài hơn 75 byte (UTF-8 — chữ có dấu chiếm 2–3 byte) gập thành nhiều dòng,
// dòng sau bắt đầu bằng 1 dấu cách; không cắt giữa 1 ký tự.
const utf8Len = (ch: string) => new TextEncoder().encode(ch).length;
const fold = (line: string) => {
	const out: string[] = [];
	let cur = '';
	let bytes = 0;
	for (const ch of line) {
		const n = utf8Len(ch);
		if (bytes + n > 74) {
			out.push(cur);
			cur = ' ';
			bytes = 1;
		}
		cur += ch;
		bytes += n;
	}
	out.push(cur);
	return out.join('\r\n');
};

const ymd = (date: string) => date.slice(0, 10).replace(/-/g, '');

/** "2026-12-01" + "07:30" (giờ VN) ⇒ "20261201T003000Z" */
export const vnTimeToUtc = (date: string, time: string) => {
	const [y, m, d] = date.slice(0, 10).split('-').map(Number);
	const [hh, mm] = time.split(':').map(Number);
	const t = new Date(Date.UTC(y, m - 1, d, hh - VN_OFFSET_HOURS, mm));
	return `${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}T${pad(t.getUTCHours())}${pad(t.getUTCMinutes())}00Z`;
};

const nextDay = (date: string) => {
	const [y, m, d] = date.slice(0, 10).split('-').map(Number);
	const t = new Date(Date.UTC(y, m - 1, d + 1));
	return `${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}`;
};

const ATTENDANCE_LABEL = { present: 'Có mặt', late: 'Muộn', absent: 'Vắng' } as const;

const eventLines = (s: CalendarSession, stamp: string): string[] => {
	const when =
		s.start_time && /^\d{1,2}:\d{2}/.test(s.start_time)
			? [
					`DTSTART:${vnTimeToUtc(s.session_date, s.start_time)}`,
					`DTEND:${vnTimeToUtc(s.session_date, s.end_time && /^\d{1,2}:\d{2}/.test(s.end_time) ? s.end_time : s.start_time)}`,
				]
			: [`DTSTART;VALUE=DATE:${ymd(s.session_date)}`, `DTEND;VALUE=DATE:${nextDay(s.session_date)}`];
	const desc = [
		`Khóa học: ${s.course_name}`,
		s.subject_name && `Bài học: ${s.subject_name}`,
		s.lecturer_name && `Giảng viên: ${s.lecturer_name}`,
		s.attendance_status && `Điểm danh: ${ATTENDANCE_LABEL[s.attendance_status]}`,
	].filter(Boolean) as string[];
	return [
		'BEGIN:VEVENT',
		`UID:${s.id}@rms`,
		`DTSTAMP:${stamp}`,
		...when,
		`SUMMARY:${esc(s.subject_name || s.course_name)}`,
		...(s.room ? [`LOCATION:${esc(s.room)}`] : []),
		`DESCRIPTION:${esc(desc.join('\n'))}`,
		'END:VEVENT',
	];
};

/** Nội dung tệp .ics cho danh sách buổi học (CRLF theo chuẩn). */
export function buildSessionsIcs(sessions: CalendarSession[], calName = 'Lịch học'): string {
	const now = new Date();
	const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//Hospital RMS//Lich hoc//VI',
		'CALSCALE:GREGORIAN',
		'METHOD:PUBLISH',
		`X-WR-CALNAME:${esc(calName)}`,
		...sessions.flatMap((s) => eventLines(s, stamp)),
		'END:VCALENDAR',
	];
	return `${lines.map(fold).join('\r\n')}\r\n`;
}
