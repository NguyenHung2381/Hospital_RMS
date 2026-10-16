/**
 * seminarDetailExcelService.js — Xuất Excel MỘT hội thảo / hội nghị:
 *   - sheet "Thông tin"      : thời gian (kèm giờ), địa điểm, khung giờ bài test...
 *   - sheet "Người tham dự"  : cột đầu trùng file mẫu nhập (seminarImportService)
 *                              → sửa rồi nhập lại được; thêm cột điểm danh,
 *                              bài test, CME.
 *   - sheet "Bài học"        : chương trình hội nghị (seminars.agenda).
 * parts = ['participants', 'agenda'] để chỉ xuất một phần (sheet "Thông tin" luôn có).
 */
const ExcelJS = require('exceljs');
const seminarService = require('./seminarService');
const xl = require('../utils/excelTemplate');
const { parseAgenda, testWindow } = require('../utils/seminarSchedule');

const EVENT_TYPE_LABELS = {
	conference: 'Hội nghị',
	sci_seminar: 'Hội thảo khoa học',
	intl_seminar: 'Hội thảo quốc tế',
	sci_conference: 'Hội nghị khoa học',
	training: 'Tập huấn',
	other: 'Khác',
};
const SCOPE_LABELS = { external: 'Đơn vị ngoài tổ chức', hosted: 'Bệnh viện tổ chức' };
const PARTICIPATION_LABELS = {
	attendee: 'Đại biểu',
	speaker: 'Báo cáo viên',
	chair: 'Chủ tọa',
	organizer: 'Ban tổ chức',
	trainee: 'Học viên',
};
const SOURCE_LABELS = { internal: 'Nội viện', external: 'Ngoại viện' };
const GENDER_LABELS = { male: 'Nam', female: 'Nữ', other: 'Khác' };
const CME_STATUS_LABELS = { none: 'Chưa cấp', pending: 'Chờ cấp', issued: 'Đã cấp', signed: 'Đã ký nhận' };

const pad2 = (n) => String(n).padStart(2, '0');
// DATE từ mssql là 00:00 UTC → định dạng theo UTC; chuỗi 'YYYY-MM-DD' cũng parse thành UTC
const fmtDate = (d) => {
	if (!d) return '';
	const x = d instanceof Date ? d : new Date(d);
	if (Number.isNaN(x.getTime())) return '';
	return `${pad2(x.getUTCDate())}/${pad2(x.getUTCMonth() + 1)}/${x.getUTCFullYear()}`;
};
// DATETIME (GETDATE() của server) — hiển thị đúng như lưu
const fmtDateTime = (d) => {
	if (!d) return '';
	const x = d instanceof Date ? d : new Date(d);
	if (Number.isNaN(x.getTime())) return '';
	return `${pad2(x.getUTCHours())}:${pad2(x.getUTCMinutes())} ${fmtDate(x)}`;
};
const withTime = (date, time) => [time, fmtDate(date)].filter(Boolean).join(' ');
const timeRange = (a, b) => (a && b ? `${a} – ${b}` : a ? `từ ${a}` : b ? `đến ${b}` : '');

const seminarWhen = (s) => {
	const from = withTime(s.start_date, s.start_time);
	const to = withTime(s.end_date || (s.end_time ? s.start_date : null), s.end_time);
	const range = [from, to && to !== from ? to : null].filter(Boolean).join(' – ');
	return range || s.date_text || '';
};

// ─── Sheet thông tin ─────────────────────────────────────────────────────────
const addInfoSheet = (wb, s, agendaCount) => {
	const ws = wb.addWorksheet('Thông tin');
	ws.columns = [{ width: 28 }, { width: 70 }];
	ws.mergeCells(1, 1, 1, 2);
	ws.getCell(1, 1).value = s.title;
	ws.getCell(1, 1).font = { bold: true, size: 14 };
	ws.getCell(1, 1).alignment = { wrapText: true };
	ws.getRow(1).height = 36;

	const w = testWindow(s);
	const questionCount = parseAgenda(s.test_questions).length; // cũng là mảng JSON
	const participants = s.participants || [];
	const rows = [
		['Hình thức', EVENT_TYPE_LABELS[s.event_type] ?? s.event_type_raw ?? ''],
		['Phạm vi', SCOPE_LABELS[s.scope] ?? ''],
		['Thời gian', seminarWhen(s)],
		['Thời gian bắt đầu', withTime(s.start_date, s.start_time)],
		['Thời gian kết thúc', withTime(s.end_date || (s.end_time ? s.start_date : null), s.end_time)],
		['Địa điểm', s.location ?? ''],
		['Chủ tọa', s.host_chair ?? ''],
		['Báo cáo viên', s.speakers ?? ''],
		['Người điều phối', s.coordinator ?? ''],
		['Cấp CME', s.grants_cme ? `Có${s.cme_default_credits ? ` · ${s.cme_default_credits} tín chỉ` : ''}` : 'Không'],
		[
			'Bài test cuối buổi',
			questionCount
				? [
						`${questionCount} câu`,
						w ? `làm bài ${timeRange(s.test_start_time, s.test_end_time)} ngày ${fmtDate(w.date)}` : null,
						s.test_open ? 'đang bật' : 'chưa bật',
					]
						.filter(Boolean)
						.join(' · ')
				: 'Không có',
		],
		['Số người tham dự (danh sách)', participants.length],
		['Đã điểm danh', participants.filter((p) => p.checked_in_at).length],
		['Đã nộp bài test', participants.filter((p) => p.test_submitted_at).length],
		['Đã cấp CME', participants.filter((p) => p.cme_seq != null).length],
		['Số bài học', agendaCount],
		['Ghi chú', s.notes ?? ''],
		['Ngày xuất', fmtDate(new Date())],
	];
	rows.forEach(([k, v]) => {
		const row = ws.addRow([k, v]);
		row.getCell(1).font = { bold: true };
		row.eachCell((c) => {
			c.border = xl.border;
			c.alignment = { vertical: 'top', wrapText: true, horizontal: 'left' };
		});
	});
};

// ─── Sheet người tham dự ─────────────────────────────────────────────────────
const participantColumns = (s) => {
	const hosted = s.scope === 'hosted';
	return [
		// Trùng TEMPLATE_COLUMNS của seminarImportService → nhập lại được
		{ key: 'stt', header: 'STT', width: 5 },
		{ key: 'title_prefix', header: 'Ông/Bà', width: 8 },
		{ key: 'full_name', header: 'Họ và tên', width: 26 },
		{ key: 'dob', header: 'Ngày sinh', width: 12 },
		{ key: 'gender', header: 'Giới tính', width: 9 },
		{ key: 'organization', header: 'Đơn vị công tác', width: 26 },
		{ key: 'department_raw', header: 'Khoa/phòng', width: 18 },
		{ key: 'staff_number', header: 'MNV', width: 8 },
		{ key: 'qualification_raw', header: 'TĐCM', width: 10 },
		{ key: 'participation_type', header: 'Vai trò', width: 14 },
		{ key: 'source', header: 'Nguồn', width: 11 },
		{ key: 'is_foreign', header: 'Quốc tịch', width: 11 },
		{ key: 'cme_credits', header: 'Số tín chỉ', width: 9 },
		{ key: 'notes', header: 'Ghi chú', width: 22 },
		// Cột bổ sung (chỉ để xem — file nhập bỏ qua)
		{ key: 'phone', header: 'Điện thoại', width: 13 },
		{ key: 'email', header: 'Email', width: 24 },
		...(hosted
			? [
					{ key: 'checked_in_at', header: 'Điểm danh lúc', width: 17 },
					...(s.test_questions
						? [
								{ key: 'test_score', header: 'Bài test (đúng/tổng)', width: 12 },
								{ key: 'test_submitted_at', header: 'Nộp bài lúc', width: 17 },
							]
						: []),
				]
			: []),
		...(s.grants_cme
			? [
					{ key: 'cme_certificate_no', header: 'SQĐ CME', width: 9 },
					{ key: 'cme_year', header: 'Năm CME', width: 8 },
					{ key: 'cme_status', header: 'Trạng thái CME', width: 13 },
				]
			: []),
	];
};

const addParticipantSheet = (wb, s) => {
	const columns = participantColumns(s);
	const list = s.participants || [];
	const ws = xl.buildSheet(wb, {
		sheetName: 'Người tham dự',
		title: 'DANH SÁCH NGƯỜI THAM DỰ',
		subtitle: [s.title, seminarWhen(s), `${list.length} người`].filter(Boolean).join(' · '),
		columns,
	});
	list.forEach((p, i) => {
		ws.addRow({
			stt: i + 1,
			title_prefix: p.title_prefix ?? '',
			full_name: p.full_name,
			dob: p.dob ? fmtDate(p.dob) : (p.dob_text ?? ''),
			gender: GENDER_LABELS[p.gender] ?? p.gender ?? '',
			organization: p.organization ?? '',
			department_raw: p.department_raw || p.user_department_name || '',
			staff_number: p.staff_number ?? p.user_staff_number ?? '',
			qualification_raw: p.qualification_raw ?? '',
			participation_type: PARTICIPATION_LABELS[p.participation_type] ?? '',
			source: SOURCE_LABELS[p.source] ?? '',
			is_foreign: p.is_foreign ? 'Nước ngoài' : '',
			cme_credits: p.cme_credits ?? '',
			notes: p.notes ?? '',
			phone: p.phone ?? '',
			email: p.email ?? '',
			checked_in_at: fmtDateTime(p.checked_in_at),
			test_score: p.test_submitted_at ? `${p.test_correct}/${p.test_total}` : '',
			test_submitted_at: fmtDateTime(p.test_submitted_at),
			cme_certificate_no: p.cme_certificate_no ?? '',
			cme_year: p.cme_year ?? '',
			cme_status: CME_STATUS_LABELS[p.cme_status] ?? '',
		});
	});
	xl.styleBody(ws);
};

// ─── Sheet bài học ───────────────────────────────────────────────────────────
const AGENDA_COLUMNS = [
	{ key: 'stt', header: 'STT', width: 5 },
	{ key: 'date', header: 'Ngày', width: 12 },
	{ key: 'time', header: 'Thời gian', width: 14 },
	{ key: 'title', header: 'Tên bài học / bài báo cáo', width: 50 },
	{ key: 'speaker', header: 'Báo cáo viên', width: 28 },
	{ key: 'note', header: 'Ghi chú', width: 28 },
];

const addAgendaSheet = (wb, s, agenda) => {
	const ws = xl.buildSheet(wb, {
		sheetName: 'Bài học',
		title: 'CHƯƠNG TRÌNH — DANH SÁCH BÀI HỌC',
		subtitle: [s.title, seminarWhen(s), `${agenda.length} bài`].filter(Boolean).join(' · '),
		columns: AGENDA_COLUMNS,
	});
	agenda.forEach((a, i) => {
		ws.addRow({
			stt: i + 1,
			date: fmtDate(a.date),
			time: timeRange(a.start_time, a.end_time),
			title: a.title,
			speaker: a.speaker ?? '',
			note: a.note ?? '',
		});
	});
	xl.styleBody(ws);
};

const PARTS = ['participants', 'agenda'];

/** Trả về null nếu không tìm thấy hội nghị. */
const exportWorkbook = async (seminarId, parts = PARTS) => {
	const s = await seminarService.getById(seminarId);
	if (!s) return null;
	const want = new Set((parts || []).filter((p) => PARTS.includes(p)));
	if (!want.size) PARTS.forEach((p) => want.add(p));
	const agenda = parseAgenda(s.agenda);

	const wb = new ExcelJS.Workbook();
	addInfoSheet(wb, s, agenda.length);
	if (want.has('participants')) addParticipantSheet(wb, s);
	if (want.has('agenda')) addAgendaSheet(wb, s, agenda);
	return { wb, seminar: s };
};

module.exports = { exportWorkbook, PARTS };
