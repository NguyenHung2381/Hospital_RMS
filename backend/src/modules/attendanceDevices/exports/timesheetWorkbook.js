// timesheetWorkbook.js — file Excel "Bảng công máy chấm công" (POST
// /api/v1/attendance-devices/timesheet/export-excel). Hàm thuần: nhận dữ liệu đã đọc sẵn
// (timesheetService.getExportData), ngày giờ đã là chuỗi giờ VN.
//   Sheet 1 "Tổng hợp": mỗi người một dòng — số ngày có chấm, tổng lượt.
//   Sheet 2 "Bảng công": mỗi người mỗi ngày — giờ vào (lượt đầu), giờ ra (lượt cuối).
//   Sheet 3 "Lượt chấm": từng lượt chấm, kết quả ghép buổi học.
const { lazyRequire } = require('../../../utils/lazyRequire');
/** @type {typeof import('exceljs')} */
const ExcelJS = lazyRequire('exceljs');
const xl = require('../../../utils/excelTemplate');
const { REPEAT_PUNCH_MIN } = require('../../../utils/attendanceShift');

const MATCH_LABEL = {
	matched: 'Đã ghép buổi học',
	pending: 'Chờ ghép',
	no_trainee: 'Không khớp học viên',
	no_session: 'Không có buổi học',
	kept_manual: 'Giữ điểm danh tay',
	locked: 'Điểm đã khóa',
};

// Kiểu xác thực theo mã firmware ZKTeco
const VERIFY_LABEL = { 0: 'Mật khẩu', 1: 'Vân tay', 2: 'Thẻ', 15: 'Khuôn mặt' };
const verifyLabel = (v) => (v === null || v === undefined ? '' : (VERIFY_LABEL[v] ?? `Kiểu ${v}`));

/** 'YYYY-MM-DD' → 'dd/mm/yyyy' */
const viDate = (s) => {
	const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
	return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};

/** 'HH:MM:SS' → 'HH:MM' */
const hhmm = (s) => String(s || '').slice(0, 5);

/** Số phút → '8 giờ 05 phút' */
const spanText = (min) => {
	if (!min || min < 1) return '';
	const h = Math.floor(min / 60);
	const m = min % 60;
	return h ? `${h} giờ ${String(m).padStart(2, '0')} phút` : `${m} phút`;
};

// Chấm lại trong vài phút sau lượt đầu = chấm lặp, chưa phải giờ ra (utils/attendanceShift)
const hasOut = (r) => r.span_minutes >= REPEAT_PUNCH_MIN;

/** "Ca sáng 07:00–11:30: vào 07:05, ra 11:31 (muộn 5 phút)" — điểm danh theo ca của 1 dòng */
const shiftText = (s) => {
	const name = s.shift_name
		? `${s.shift_name}${s.shift_start ? ` ${s.shift_start}–${s.shift_end}` : ''}`
		: 'Tự do';
	const notes = [
		s.late_min ? `muộn ${s.late_min} phút` : '',
		s.early_min ? `về sớm ${s.early_min} phút` : '',
		s.missing_out ? 'chưa chấm ra' : '',
	].filter(Boolean);
	return `${name}: vào ${s.check_in ?? '—'}${s.check_out ? `, ra ${s.check_out}` : ''}${notes.length ? ` (${notes.join(', ')})` : ''}`;
};

const fileNameOf = (from, to) =>
	from === to ? `bang-cong-${from}.xlsx` : `bang-cong-${from}-den-${to}.xlsx`;

const rangeText = (from, to) =>
	from === to ? `Ngày ${viDate(from)}` : `Từ ${viDate(from)} đến ${viDate(to)}`;

const cmpVi = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), 'vi');

/** Gộp các dòng ngày thành mỗi người một dòng */
const summarizeByPerson = (days) => {
	const map = new Map();
	for (const r of days) {
		let p = map.get(r.pin);
		if (!p) {
			p = {
				pin: r.pin,
				trainee_id: r.trainee_id,
				trainee_name: r.trainee_name,
				dates: new Set(),
				punches: 0,
				first: r.work_date,
				last: r.work_date,
			};
			map.set(r.pin, p);
		}
		p.dates.add(r.work_date);
		p.punches += r.punch_count;
		if (r.work_date < p.first) p.first = r.work_date;
		if (r.work_date > p.last) p.last = r.work_date;
	}
	return [...map.values()]
		.map(({ dates, ...p }) => ({ ...p, day_count: dates.size }))
		.sort(
			(a, b) =>
				Number(!a.trainee_name) - Number(!b.trainee_name) ||
				cmpVi(a.trainee_name, b.trainee_name) ||
				cmpVi(a.pin, b.pin),
		);
};

/**
 * @param {{ from: string, to: string, device?: string|null,
 *           days: { work_date: string, pin: string, trainee_id: string|null, trainee_name: string|null,
 *                   first_time: string, last_time: string, span_minutes: number, punch_count: number,
 *                   times: string, devices: string, courses: string|null, shifts?: object[] }[],
 *           punches: { work_date: string, punch_time: string, pin: string, trainee_id: string|null,
 *                      trainee_name: string|null, match_status: string, verify_mode: number|null,
 *                      device_name: string, course_name: string|null, session_date: string|null,
 *                      start_time: string|null }[] }} data
 */
const buildTimesheetWorkbook = ({ from, to, device = null, days = [], punches = [] }) => {
	const wb = new ExcelJS.Workbook();
	const scope = [rangeText(from, to), device ? `Máy: ${device}` : 'Tất cả máy'];

	// ── Tổng hợp theo người
	const people = summarizeByPerson(days);
	const wsSum = xl.buildSheet(wb, {
		sheetName: 'Tổng hợp',
		title: 'TỔNG HỢP CHẤM CÔNG',
		subtitle: [...scope, `${people.length} người`].join(' · '),
		columns: [
			{ key: 'stt', header: 'STT', width: 6 },
			{ key: 'trainee_id', header: 'Mã học viên', width: 14 },
			{ key: 'trainee_name', header: 'Họ và tên', width: 28 },
			{ key: 'pin', header: 'Mã trên máy', width: 13 },
			{ key: 'day_count', header: 'Số ngày có chấm', width: 12 },
			{ key: 'punches', header: 'Tổng lượt chấm', width: 12 },
			{ key: 'first', header: 'Ngày đầu', width: 12 },
			{ key: 'last', header: 'Ngày cuối', width: 12 },
		],
	});
	people.forEach((p, i) =>
		wsSum.addRow({
			stt: i + 1,
			trainee_id: p.trainee_id ?? '',
			trainee_name: p.trainee_name ?? 'Không khớp học viên',
			pin: p.pin,
			day_count: p.day_count,
			punches: p.punches,
			first: viDate(p.first),
			last: viDate(p.last),
		}),
	);
	xl.styleBody(wsSum);

	// ── Bảng công theo ngày (cũ → mới, trong ngày theo tên)
	const byDay = [...days].sort(
		(a, b) =>
			cmpVi(a.work_date, b.work_date) ||
			Number(!a.trainee_name) - Number(!b.trainee_name) ||
			cmpVi(a.trainee_name, b.trainee_name) ||
			cmpVi(a.pin, b.pin),
	);
	const wsDay = xl.buildSheet(wb, {
		sheetName: 'Bảng công',
		title: 'BẢNG CÔNG MÁY CHẤM CÔNG',
		subtitle: [...scope, `${byDay.length} dòng (mỗi người mỗi ngày)`].join(' · '),
		columns: [
			{ key: 'stt', header: 'STT', width: 6 },
			{ key: 'date', header: 'Ngày', width: 12 },
			{ key: 'trainee_id', header: 'Mã học viên', width: 14 },
			{ key: 'trainee_name', header: 'Họ và tên', width: 28 },
			{ key: 'pin', header: 'Mã trên máy', width: 13 },
			{ key: 'in', header: 'Giờ vào (lượt đầu)', width: 12 },
			{ key: 'out', header: 'Giờ ra (lượt cuối)', width: 12 },
			{ key: 'span', header: 'Khoảng vào – ra', width: 16 },
			{ key: 'shifts', header: 'Điểm danh theo ca', width: 40 },
			{ key: 'count', header: 'Số lượt', width: 9 },
			{ key: 'times', header: 'Các giờ chấm', width: 30 },
			{ key: 'courses', header: 'Khóa học (đã ghép)', width: 30 },
			{ key: 'devices', header: 'Máy', width: 18 },
		],
	});
	byDay.forEach((r, i) =>
		wsDay.addRow({
			stt: i + 1,
			date: viDate(r.work_date),
			trainee_id: r.trainee_id ?? '',
			trainee_name: r.trainee_name ?? 'Không khớp học viên',
			pin: r.pin,
			in: hhmm(r.first_time),
			// Chấm 1 lần (hoặc chỉ chấm lặp) trong ngày ⇒ chưa có giờ ra
			out: hasOut(r) ? hhmm(r.last_time) : '',
			span: hasOut(r) ? spanText(r.span_minutes) : '',
			shifts: (r.shifts ?? []).map(shiftText).join('\n'),
			count: r.punch_count,
			times: r.times,
			courses: r.courses ?? '',
			devices: r.devices,
		}),
	);
	xl.styleBody(wsDay);

	// ── Từng lượt chấm
	const wsPunch = xl.buildSheet(wb, {
		sheetName: 'Lượt chấm',
		title: 'CHI TIẾT LƯỢT CHẤM',
		subtitle: [...scope, `${punches.length} lượt`].join(' · '),
		columns: [
			{ key: 'stt', header: 'STT', width: 6 },
			{ key: 'date', header: 'Ngày', width: 12 },
			{ key: 'time', header: 'Giờ chấm', width: 10 },
			{ key: 'trainee_id', header: 'Mã học viên', width: 14 },
			{ key: 'trainee_name', header: 'Họ và tên', width: 28 },
			{ key: 'pin', header: 'Mã trên máy', width: 13 },
			{ key: 'verify', header: 'Xác thực', width: 11 },
			{ key: 'device', header: 'Máy', width: 18 },
			{ key: 'match', header: 'Kết quả ghép', width: 20 },
			{ key: 'session', header: 'Buổi học', width: 36 },
		],
	});
	punches.forEach((p, i) =>
		wsPunch.addRow({
			stt: i + 1,
			date: viDate(p.work_date),
			time: p.punch_time,
			trainee_id: p.trainee_id ?? '',
			trainee_name: p.trainee_name ?? '',
			pin: p.pin,
			verify: verifyLabel(p.verify_mode),
			device: p.device_name,
			match: MATCH_LABEL[p.match_status] ?? p.match_status,
			session: p.course_name
				? `${p.course_name} · ${viDate(p.session_date)}${p.start_time ? ` ${hhmm(p.start_time)}` : ''}`
				: '',
		}),
	);
	xl.styleBody(wsPunch);

	return wb;
};

module.exports = {
	buildTimesheetWorkbook,
	summarizeByPerson,
	fileNameOf,
	shiftText,
	viDate,
	spanText,
	verifyLabel,
};
