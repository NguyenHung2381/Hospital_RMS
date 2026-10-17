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

/** Đạt điểm tối thiểu để được cấp CME (chưa đặt điểm đạt = nộp bài là đạt) */
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
	isPassed,
};
