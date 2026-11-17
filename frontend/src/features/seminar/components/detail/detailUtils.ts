import type { Seminar, SeminarParticipant } from '../../types/seminar.type';

// Làm tròn 2 chữ số kiểu thập phân (khớp ROUND của SQL và utils/seminarTest.scaledScore ở backend)
const round2 = (n: number) => Number(`${Math.round(Number(`${n.toFixed(9)}e2`))}e-2`);

/** Điểm tối đa của bài người này đã làm — bài cũ chưa có điểm từng câu: tổng số câu */
const rawMax = (p: SeminarParticipant) => p.test_max_score ?? p.test_total;

/**
 * Điểm bài kiểm tra ĐÃ quy về thang của hội nghị (test_score_scale): điểm thô ÷ điểm tối đa
 * của bài × thang. Chưa đặt thang = điểm thô như cũ. Bài nộp trước khi có điểm từng câu:
 * mỗi câu đúng 1 điểm. Khớp utils/seminarTest.participantScore ở backend.
 */
export const testScore = (s: Seminar, p: SeminarParticipant): number | null => {
	const raw = p.test_score ?? p.test_correct;
	if (raw == null) return null;
	const max = Number(rawMax(p));
	if (!s.test_score_scale || !(max > 0)) return round2(Number(raw));
	return round2((Number(raw) * Number(s.test_score_scale)) / max);
};
/** Mẫu số khi hiện "điểm / tối đa": thang của hội nghị nếu đặt, không thì điểm tối đa của bài */
export const testMax = (s: Seminar, p: SeminarParticipant) =>
	s.test_score_scale != null ? Number(s.test_score_scale) : rawMax(p);
export const testPassed = (s: Seminar, p: SeminarParticipant) =>
	s.test_pass_score == null || (testScore(s, p) ?? -1) >= s.test_pass_score;

// Người tự đăng ký qua QR (có vé) phải điểm danh + nộp bài kiểm tra (nếu có, và đạt
// điểm đạt nếu đặt) mới được cấp CME — khớp CME_ELIGIBLE_SQL ở backend seminarParticipantService.
export const cmeEligible = (p: SeminarParticipant, s: Seminar) =>
	!p.ticket_code || (!!p.checked_in_at && (!s.test_questions || (!!p.test_submitted_at && testPassed(s, p))));

/** Lý do chưa đủ điều kiện cấp CME (null = đủ / không áp dụng) — hiện trong drawer người tham dự. */
export const cmeBlockReason = (p: SeminarParticipant, s: Seminar): string | null => {
	if (!p.ticket_code || cmeEligible(p, s)) return null;
	if (!p.checked_in_at) return 'Tự đăng ký qua QR nhưng chưa điểm danh';
	if (!p.test_submitted_at) return 'Chưa nộp bài kiểm tra';
	return 'Bài kiểm tra chưa đạt điểm đạt';
};

export const fmtDate = (s: string | null | undefined) => {
	if (!s) return '';
	const d = new Date(s);
	return Number.isNaN(d.getTime())
		? s
		: d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const withTime = (date: string | null, time: string | null) => [time, fmtDate(date)].filter(Boolean).join(' ');
export const timeRange = (a?: string | null, b?: string | null) =>
	a && b ? `${a} – ${b}` : a ? `từ ${a}` : b ? `đến ${b}` : '';

// "08:00 05/06/2026 – 17:00 06/06/2026"; không có ngày thì dùng chuỗi nhập tay
export const seminarWhen = (s: Seminar) => {
	const from = withTime(s.start_date, s.start_time);
	const to = withTime(s.end_date || (s.end_time ? s.start_date : null), s.end_time);
	const sameDay = !s.end_date || s.end_date === s.start_date;
	const range =
		sameDay && s.start_time && s.end_time
			? `${s.start_time} – ${s.end_time} ${fmtDate(s.start_date)}`
			: [from, to && to !== from ? to : null].filter(Boolean).join(' – ');
	return range || s.date_text || '';
};

// Khung giờ làm bài kiểm tra — ngày mở trống = ngày kết thúc (hoặc bắt đầu), ngày dừng
// tiếp nhận trống = ngày mở; khớp backend testWindow()
export const testWhen = (s: Seminar) => {
	if (!s.test_start_time && !s.test_end_time) return '';
	const day = s.test_date || s.end_date || s.start_date;
	const endDay = s.test_end_date || day;
	if (s.test_end_time && endDay && endDay.slice(0, 10) !== day?.slice(0, 10))
		return [withTime(s.test_start_time ? day : null, s.test_start_time), withTime(endDay, s.test_end_time)]
			.filter(Boolean)
			.join(' – ');
	return `${timeRange(s.test_start_time, s.test_end_time)}${day ? ` · ${fmtDate(day)}` : ''}`;
};

export const parseTestQuestions = (s: Seminar): { points?: number }[] => {
	try {
		const list = JSON.parse(s.test_questions || '[]');
		return Array.isArray(list) ? list : [];
	} catch {
		return [];
	}
};

export const fullName = (p: SeminarParticipant) => `${p.title_prefix ? `${p.title_prefix} ` : ''}${p.full_name}`;

/** Khoa/phòng hoặc đơn vị — dòng phụ dưới họ tên */
export const unitOf = (p: SeminarParticipant) =>
	p.user_department_name || p.department_raw || p.organization || '';

/** Số liệu tổng hợp trên danh sách người tham dự — dùng ở nhiều tab */
export interface DetailCounts {
	total: number;
	registered: number;
	checkedIn: number;
	submitted: number;
	testing: number;
	passed: number;
	cmeIssued: number;
	cmeSigned: number;
	/** Chưa có số CME và đủ điều kiện cấp */
	cmeReady: number;
	/** Chưa có số CME, chưa đủ điều kiện */
	cmeBlocked: number;
}

export const computeCounts = (s: Seminar, list: SeminarParticipant[]): DetailCounts => {
	const c: DetailCounts = {
		total: list.length,
		registered: 0,
		checkedIn: 0,
		submitted: 0,
		testing: 0,
		passed: 0,
		cmeIssued: 0,
		cmeSigned: 0,
		cmeReady: 0,
		cmeBlocked: 0,
	};
	for (const p of list) {
		if (p.ticket_code) c.registered++;
		if (p.checked_in_at) c.checkedIn++;
		if (p.test_submitted_at) {
			c.submitted++;
			if (testPassed(s, p)) c.passed++;
		} else if (p.test_started_at) c.testing++;
		if (p.cme_seq != null) {
			c.cmeIssued++;
			if (p.cme_status === 'signed') c.cmeSigned++;
		} else if (cmeEligible(p, s)) c.cmeReady++;
		else c.cmeBlocked++;
	}
	return c;
};
