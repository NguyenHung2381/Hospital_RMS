/**
 * seminarTest.js — Chấm bài test cuối buổi hội nghị: điểm từng câu, trộn đề theo
 * từng vé, hạn nộp của mỗi lượt làm (thời gian làm bài + giờ dừng tiếp nhận).
 */
const crypto = require('crypto');
const { testWindow } = require('./seminarSchedule');

// Cho trễ một chút sau hạn để bài tự nộp lúc hết giờ (mạng chậm) vẫn được nhận
const SUBMIT_GRACE_MS = 30 * 1000;

const roundScore = (n) => Math.round(n * 100) / 100;
/** Điểm của câu — câu cũ chưa đặt điểm tính 1 */
const questionPoints = (q) => {
	const p = Number(q?.points);
	return Number.isFinite(p) && p > 0 ? p : 1;
};
const maxScore = (questions) => roundScore(questions.reduce((s, q) => s + questionPoints(q), 0));

// mulberry32, hạt giống từ sha256 — cùng mã vé luôn ra cùng một thứ tự
const rng = (seed) => {
	let a = crypto.createHash('sha256').update(String(seed)).digest().readUInt32LE(0);
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};
const shuffled = (n, rand) => {
	const a = [...Array(n).keys()];
	for (let i = n - 1; i > 0; i--) {
		const j = Math.floor(rand() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
};

/**
 * Thứ tự đề của 1 vé: [{ q: chỉ số câu gốc, options: [chỉ số phương án gốc] }]
 * theo thứ tự hiển thị. Cố định theo mã vé nên tải lại trang vẫn giữ thứ tự, không cần lưu.
 */
const testOrder = (questions, seed, { shuffleQuestions = false, shuffleOptions = false } = {}) => {
	const rand = rng(seed);
	const qOrder = shuffleQuestions ? shuffled(questions.length, rand) : [...questions.keys()];
	return qOrder.map((q) => ({
		q,
		options: shuffleOptions
			? shuffled(questions[q].options.length, rand)
			: [...questions[q].options.keys()],
	}));
};

/** Đề gửi cho người làm theo thứ tự của vé — không bao giờ kèm đáp án đúng */
const publicQuestions = (questions, order) =>
	order.map(({ q, options }) => {
		const x = questions[q];
		return {
			q: x.q,
			image: x.image || null,
			options: options.map((o) => x.options[o]),
			points: questionPoints(x),
		};
	});

/**
 * Chấm bài: `answers` theo thứ tự hiển thị (null = bỏ trống, tính 0 điểm).
 * `picked`: đáp án quy về chỉ số gốc, xếp theo câu gốc — để lưu và đối chiếu.
 */
const gradeTest = (questions, order, answers) => {
	const picked = new Array(questions.length).fill(null);
	order.forEach(({ q, options }, i) => {
		const a = answers[i];
		if (Number.isInteger(a) && a >= 0 && a < options.length) picked[q] = options[a];
	});
	let correct = 0;
	let score = 0;
	questions.forEach((x, i) => {
		if (picked[i] !== x.answer) return;
		correct++;
		score += questionPoints(x);
	});
	return {
		picked,
		correct,
		total: questions.length,
		score: roundScore(score),
		max_score: maxScore(questions),
	};
};

/**
 * Hạn nộp (ms) = sớm hơn giữa (lúc bắt đầu + thời gian làm bài) và giờ dừng tiếp nhận;
 * null = không giới hạn. elapsedSec: số giây kể từ lúc bấm "Bắt đầu" (null = chưa bắt đầu),
 * tính bằng DATEDIFF ở SQL để không phụ thuộc múi giờ.
 */
const attemptDeadline = (s, elapsedSec, now = Date.now()) => {
	const ends = [];
	const end = testWindow(s, now)?.end;
	if (end) ends.push(end.getTime());
	if (s?.test_duration_minutes && elapsedSec != null)
		ends.push(now + (s.test_duration_minutes * 60 - elapsedSec) * 1000);
	return ends.length ? Math.min(...ends) : null;
};

/**
 * Quy điểm thô (tổng điểm các câu đúng) sang thang điểm của hội nghị — vd thang 10:
 * 7/9 điểm → 7.78. Chưa đặt thang (test_score_scale NULL) hoặc không biết điểm tối đa
 * của bài thì giữ điểm thô (cách cũ). Khớp SCALED_SCORE_SQL bên dưới.
 */
const scaledScore = (s, raw, rawMax) => {
	if (raw == null) return null;
	const scale = s?.test_score_scale == null ? null : Number(s.test_score_scale);
	const max = Number(rawMax);
	if (!scale || !(max > 0)) return roundScore(Number(raw));
	// Làm tròn 2 chữ số kiểu thập phân như ROUND của SQL: toFixed(9) bỏ sai số dấu phẩy động,
	// dịch dấu phẩy bằng số mũ chuỗi (1.005 → "1.005e2" = 100.5 → 101) thay vì nhân 100
	const x = ((Number(raw) * scale) / max).toFixed(9);
	return Number(`${Math.round(Number(`${x}e2`))}e-2`);
};

/** Điểm tối đa để hiển thị "điểm / tối đa": thang của hội nghị nếu đặt, không thì điểm tối đa của bài */
const scaleMax = (s, rawMax) => (s?.test_score_scale != null ? Number(s.test_score_scale) : rawMax);

/** Điểm đã quy đổi của 1 người tham dự — bài nộp trước khi có điểm từng câu: mỗi câu đúng 1 điểm */
const participantScore = (s, p) =>
	scaledScore(s, p.test_score ?? p.test_correct, p.test_max_score ?? p.test_total);

/**
 * Bản SQL của participantScore (p = seminar_participants, s = seminars) — dùng trong điều
 * kiện cấp CME. Phép chia trên NUMERIC rồi ROUND 2 chữ số, khớp scaledScore.
 */
const SCALED_SCORE_SQL = `CASE
    WHEN s.test_score_scale IS NULL OR COALESCE(p.test_max_score, p.test_total, 0) <= 0
      THEN COALESCE(p.test_score, p.test_correct)
    ELSE ROUND(COALESCE(p.test_score, p.test_correct) * s.test_score_scale
      / COALESCE(p.test_max_score, p.test_total), 2)
  END`;

/** Đạt điểm tối thiểu để được cấp CME (chưa đặt điểm đạt = nộp bài là đạt). `score` là điểm ĐÃ quy đổi. */
const isPassed = (s, score) =>
	s?.test_pass_score == null || (score != null && Number(score) >= Number(s.test_pass_score));

module.exports = {
	SUBMIT_GRACE_MS,
	questionPoints,
	maxScore,
	testOrder,
	publicQuestions,
	gradeTest,
	attemptDeadline,
	scaledScore,
	scaleMax,
	participantScore,
	SCALED_SCORE_SQL,
	isPassed,
};
