import type { Seminar, SeminarParticipant, SeminarTest, SeminarTestResult } from '../../types/seminar.type';

// Làm tròn 2 chữ số kiểu thập phân (khớp ROUND của SQL và utils/seminarTest.scaledScore ở backend)
const round2 = (n: number) => Number(`${Math.round(Number(`${n.toFixed(9)}e2`))}e-2`);

// ─── Đề kiểm tra (nhiều đề / hội nghị) ───────────────────────────────────────

/** Đề đã soạn câu hỏi — đề trống không hiện trên vé, không tính điều kiện CME */
export const activeTests = (s: Seminar): SeminarTest[] => (s.tests ?? []).filter((t) => !!t.test_questions);

/** Bài làm của người này cho đề `t` (chưa làm = undefined) */
export const resultOf = (p: SeminarParticipant, t: SeminarTest): SeminarTestResult | undefined =>
	p.test_results?.find((r) => r.test_id === t.id);

/** Điểm tối đa của bài người này đã làm — bài cũ chưa có điểm từng câu: tổng số câu */
const rawMax = (r: SeminarTestResult) => r.test_max_score ?? r.test_total;

/**
 * Điểm bài kiểm tra ĐÃ quy về thang của đề (test_score_scale): điểm thô ÷ điểm tối đa
 * của bài × thang. Chưa đặt thang = điểm thô như cũ. Bài nộp trước khi có điểm từng câu:
 * mỗi câu đúng 1 điểm. Khớp utils/seminarTest.participantScore ở backend.
 */
export const testScore = (t: SeminarTest, r: SeminarTestResult): number | null => {
	const raw = r.test_score ?? r.test_correct;
	if (raw == null) return null;
	const max = Number(rawMax(r));
	if (!t.test_score_scale || !(max > 0)) return round2(Number(raw));
	return round2((Number(raw) * Number(t.test_score_scale)) / max);
};
/** Mẫu số khi hiện "điểm / tối đa": thang của đề nếu đặt, không thì điểm tối đa của bài */
export const testMax = (t: SeminarTest, r: SeminarTestResult) =>
	t.test_score_scale != null ? Number(t.test_score_scale) : rawMax(r);
export const testPassed = (t: SeminarTest, r: SeminarTestResult) =>
	t.test_pass_score == null || (testScore(t, r) ?? -1) >= t.test_pass_score;

/** Đã nộp và đạt (điểm đạt nếu đặt) đề `t` */
const testCleared = (p: SeminarParticipant, t: SeminarTest) => {
	const r = resultOf(p, t);
	return !!r?.test_submitted_at && testPassed(t, r);
};

/**
 * Dòng do chính người tham dự tạo: tự đăng ký qua QR (có vé) hoặc tự đăng ký tập huấn trên
 * cổng (created_by = user_id). Khớp SELF_CREATED_SQL ở backend seminarParticipantService.
 * Dòng ban tổ chức thêm / nhập Excel thì không (BTC chịu trách nhiệm, không cần điểm danh).
 */
export const selfCreated = (p: SeminarParticipant) =>
	!!p.ticket_code || (!!p.user_id && !!p.created_by && p.created_by === p.user_id);

/** Bài nộp qua QR chung của đề mà đề không cho tính CME với kiểu nộp này */
const qrNotCounted = (p: SeminarParticipant, t: SeminarTest) =>
	resultOf(p, t)?.via === 'qr' && !t.qr_counts_for_cme;

// Người tự đăng ký phải điểm danh + nộp (và đạt điểm đạt nếu đặt) mọi đề kiểm tra tính
// điều kiện CME mới được cấp CME — khớp CME_ELIGIBLE_SQL ở backend seminarCmeService
// (bài nộp qua QR chung chỉ tính khi đề bật qr_counts_for_cme).
const cmeCleared = (p: SeminarParticipant, t: SeminarTest) => testCleared(p, t) && !qrNotCounted(p, t);
export const cmeEligible = (p: SeminarParticipant, s: Seminar) =>
	!selfCreated(p) ||
	(!!p.checked_in_at && activeTests(s).every((t) => !t.counts_for_cme || cmeCleared(p, t)));

/** Lý do chưa đủ điều kiện cấp CME (null = đủ / không áp dụng) — hiện trong drawer người tham dự. */
export const cmeBlockReason = (p: SeminarParticipant, s: Seminar): string | null => {
	if (!selfCreated(p) || cmeEligible(p, s)) return null;
	if (!p.checked_in_at)
		return p.ticket_code ? 'Tự đăng ký qua QR nhưng chưa điểm danh' : 'Tự đăng ký trên cổng nhưng chưa điểm danh';
	const t = activeTests(s).find((x) => x.counts_for_cme && !cmeCleared(p, x));
	if (!t) return null;
	if (testCleared(p, t)) return `"${t.title}" nộp qua QR chung — đề không tính CME cho kiểu nộp này`;
	return resultOf(p, t)?.test_submitted_at ? `"${t.title}" chưa đạt điểm đạt` : `Chưa nộp "${t.title}"`;
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

// Khung giờ làm 1 đề — ngày mở trống = ngày kết thúc (hoặc bắt đầu) hội nghị, ngày dừng
// tiếp nhận trống = ngày mở; khớp backend testWindow()
export const testWhen = (t: SeminarTest, s: Seminar) => {
	if (!t.test_start_time && !t.test_end_time) return '';
	const day = t.test_date || s.end_date || s.start_date;
	const endDay = t.test_end_date || day;
	if (t.test_end_time && endDay && endDay.slice(0, 10) !== day?.slice(0, 10))
		return [withTime(t.test_start_time ? day : null, t.test_start_time), withTime(endDay, t.test_end_time)]
			.filter(Boolean)
			.join(' – ');
	return `${timeRange(t.test_start_time, t.test_end_time)}${day ? ` · ${fmtDate(day)}` : ''}`;
};

export const parseTestQuestions = (t: SeminarTest): { points?: number }[] => {
	try {
		const list = JSON.parse(t.test_questions || '[]');
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
	/** Đã nộp đủ mọi đề kiểm tra (đã soạn câu hỏi) */
	submitted: number;
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
		cmeIssued: 0,
		cmeSigned: 0,
		cmeReady: 0,
		cmeBlocked: 0,
	};
	const tests = activeTests(s);
	for (const p of list) {
		if (p.ticket_code) c.registered++;
		if (p.checked_in_at) c.checkedIn++;
		if (tests.length && tests.every((t) => !!resultOf(p, t)?.test_submitted_at)) c.submitted++;
		if (p.cme_seq != null) {
			c.cmeIssued++;
			if (p.cme_status === 'signed') c.cmeSigned++;
		} else if (cmeEligible(p, s)) c.cmeReady++;
		else c.cmeBlocked++;
	}
	return c;
};
