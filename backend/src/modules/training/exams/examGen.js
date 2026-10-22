/**
 * examGen.js — phần quyết định của việc sinh đề, hàm thuần (không DB) để test.
 *   - seededRandom: cùng hạt giống ⇒ cùng thứ tự (vào lại bài đang làm vẫn y nguyên).
 *   - drawQuestions: bốc N câu ngẫu nhiên, ưu tiên câu học viên chưa gặp (thi lại);
 *     thiếu câu mới thì lấy thêm câu đã gặp.
 *   - theoryScore: điểm lý thuyết = trung bình có trọng số các bài (TN, TL).
 */

// FNV-1a 32 bit → mulberry32
const hash = (s) => {
	let h = 2166136261;
	for (const ch of String(s)) {
		h ^= ch.codePointAt(0);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
};
const seededRandom = (seed) => {
	let a = hash(seed);
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};

const shuffle = (list, rand = Math.random) => {
	const a = [...list];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(rand() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
};

/**
 * @param {string[]} ids  câu trong ngân hàng
 * @param {number} n
 * @param {Set<string>} [seen] câu đã gặp ở lần trước
 * @returns {string[]|null} null = ngân hàng không đủ n câu
 */
const drawQuestions = (ids, n, seen = new Set(), rand = Math.random) => {
	if (n <= 0) return [];
	if (ids.length < n) return null;
	const fresh = shuffle(
		ids.filter((id) => !seen.has(id)),
		rand,
	);
	const old = shuffle(
		ids.filter((id) => seen.has(id)),
		rand,
	);
	return [...fresh, ...old].slice(0, n);
};

const round1 = (n) => Math.round(n * 10) / 10;

/** parts: [{ score10, weight }] — weight null/0 = chia đều. Thiếu điểm bài nào ⇒ null. */
const theoryScore = (parts) => {
	if (!parts.length || parts.some((p) => p.score10 == null)) return null;
	const w = parts.map((p) => (Number(p.weight) > 0 ? Number(p.weight) : null));
	const weights = w.every((x) => x == null) ? parts.map(() => 1) : w.map((x) => x ?? 0);
	const total = weights.reduce((s, x) => s + x, 0);
	if (!total) return null;
	return round1(parts.reduce((s, p, i) => s + Number(p.score10) * weights[i], 0) / total);
};

module.exports = { seededRandom, shuffle, drawQuestions, theoryScore };
