// Luật nhận diện loại giấy tờ hồ sơ đăng ký khóa ĐTLT từ chữ đọc được (lớp chữ của PDF hoặc
// OCR) + mã QR + vùng MRZ. File THUẦN (không đọc file, không CSDL) — docCheckAnalyzer.js gọi
// sau khi đã có chữ; test gọi thẳng.
//
// Nguyên tắc: chỉ CẢNH BÁO cho người duyệt, không tự từ chối. OCR đọc sai dấu / sai chữ là
// chuyện thường ⇒ mọi so khớp đều trên chữ đã bỏ dấu, viết hoa, và cho phép sai vài ký tự.

// ─── Chuẩn hóa ──────────────────────────────────────────────────────────────────
/**
 * Bỏ dấu, viết hoa, đ → D, ký tự lạ → khoảng trắng. Giữ '<' (MRZ), « ‹ (OCR đọc nhầm '<') → '<'.
 * @param {string} s
 */
const normalize = (s) =>
	String(s ?? '')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[đĐ]/g, 'D')
		.toUpperCase()
		.replace(/[«‹]/g, '<')
		.replace(/[^A-Z0-9<]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

/** Chỉ còn chữ + số (so số hiệu văn bằng, số CCCD bất kể khoảng trắng / gạch). */
const alnum = (s) => normalize(s).replace(/[^A-Z0-9]/g, '');

const levenshtein = (a, b) => {
	if (a === b) return 0;
	if (!a.length) return b.length;
	if (!b.length) return a.length;
	let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i++) {
		const cur = [i];
		for (let j = 1; j <= b.length; j++) {
			cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
		}
		prev = cur;
	}
	return prev[b.length];
};

/**
 * Cụm từ (đã chuẩn hóa) có xuất hiện trong chữ (đã chuẩn hóa) không — cho phép sai ~20% ký tự
 * (OCR đọc nhầm). So theo cửa sổ cùng số từ với cụm cần tìm.
 * @param {string} text normalize()
 * @param {string[]} words normalize() của văn bản, tách theo khoảng trắng
 * @param {string} phrase normalize()
 */
const fuzzyHas = (text, words, phrase) => {
	if (!phrase) return false;
	if (` ${text} `.includes(` ${phrase} `)) return true;
	const n = phrase.split(' ').length;
	const maxDist = Math.floor(phrase.length * 0.2);
	if (maxDist === 0) return false;
	for (let i = 0; i + n <= words.length; i++) {
		const win = words.slice(i, i + n).join(' ');
		if (Math.abs(win.length - phrase.length) > maxDist) continue;
		if (levenshtein(win, phrase) <= maxDist) return true;
	}
	return false;
};

// ─── Dấu hiệu từng loại ─────────────────────────────────────────────────────────
// strong: tiêu đề / cụm chỉ loại đó có (3 điểm); weak: cụm thường gặp trong loại đó (1 điểm).
// Viết có dấu cho dễ đọc — chuẩn hóa lúc nạp.
const RAW_SIGNS = {
	national_id: {
		strong: [
			'căn cước công dân',
			'citizen identity card',
			'identity card',
			'số định danh cá nhân',
			'personal identification number',
		],
		// 'căn cước' đứng riêng (tiêu đề thẻ mẫu 2024) chỉ là dấu hiệu yếu: quyết định / đơn từ
		// hay nhắc "số căn cước"; thẻ 2024 đã có 'identity card' + 'số định danh cá nhân'.
		weak: [
			'căn cước',
			'ngày sinh',
			'giới tính',
			'quốc tịch',
			'quê quán',
			'nơi thường trú',
			'nơi cư trú',
			'nơi đăng ký khai sinh',
			'có giá trị đến',
			'đặc điểm nhân dạng',
			'date of birth',
			'nationality',
			'place of origin',
			'date of expiry',
		],
	},
	degree: {
		strong: [
			'bằng tốt nghiệp',
			'bằng cử nhân',
			'bằng bác sĩ',
			'bằng bác sỹ',
			'bằng dược sĩ',
			'bằng kỹ sư',
			'bằng thạc sĩ',
			'bằng tiến sĩ',
			'bằng chuyên khoa',
			'the degree of',
			'bachelor',
		],
		weak: [
			'hiệu trưởng',
			'số hiệu',
			'số vào sổ',
			'số vào sổ cấp bằng',
			'xếp loại',
			'tốt nghiệp',
			'chính quy',
			'hình thức đào tạo',
			'trường đại học',
			'cao đẳng',
			'university',
			'rector',
			'diploma',
		],
	},
	license: {
		strong: ['chứng chỉ hành nghề', 'giấy phép hành nghề', 'phạm vi hoạt động chuyên môn'],
		weak: [
			'khám bệnh chữa bệnh',
			'sở y tế',
			'bộ y tế',
			'văn bằng chuyên môn',
			'giám đốc sở',
			'chức danh chuyên môn',
			'hành nghề',
		],
	},
	decision: {
		strong: ['quyết định', 'công văn', 'về việc cử'],
		weak: [
			'cử đi học',
			'cử cán bộ',
			'cử viên chức',
			'điều 1',
			'điều 2',
			'nơi nhận',
			'căn cứ',
			'theo đề nghị',
			'chịu trách nhiệm thi hành',
			'thủ trưởng',
			'khóa học',
			'đào tạo',
		],
	},
	proposal_approved: {
		strong: ['tờ trình', 'phân tích nhu cầu đào tạo'],
		weak: [
			'kính gửi',
			'ban giám đốc',
			'đề nghị',
			'phê duyệt',
			'nhu cầu đào tạo',
			'cử cán bộ',
			'khóa học',
		],
	},
};

const SIGNS = Object.fromEntries(
	Object.entries(RAW_SIGNS).map(([kind, s]) => [
		kind,
		{ strong: s.strong.map(normalize), weak: s.weak.map(normalize) },
	]),
);

/** Loại có luật nhận diện — loại khác (dossier, đơn đã ký cũ) không kiểm. */
const CHECKABLE_KINDS = Object.keys(SIGNS);

// Mặt trước / sau CCCD. Vị trí QR khác nhau giữa các mẫu (CCCD gắn chip 2021: mặt trước; thẻ
// Căn cước 2024: mặt sau) nên KHÔNG dùng QR để đoán mặt.
const FRONT_SIGNS = [
	'cộng hòa xã hội chủ nghĩa việt nam',
	'căn cước công dân',
	'căn cước',
	'họ và tên',
	'họ chữ đệm và tên',
	'full name',
	'ngày sinh',
	'date of birth',
	'giới tính',
].map(normalize);
const BACK_SIGNS = [
	'đặc điểm nhân dạng',
	'ngón trỏ trái',
	'ngón trỏ phải',
	'cục trưởng cục cảnh sát',
	'nơi đăng ký khai sinh',
	'nơi cư trú',
	'bộ công an',
].map(normalize);

// ─── QR + MRZ ──────────────────────────────────────────────────────────────────
/**
 * Bóc dữ liệu QR của CCCD: chuỗi các trường ngăn bằng '|' (CCCD gắn chip 2021:
 * số CCCD|số CMND cũ|họ tên|ngày sinh|giới tính|nơi thường trú|ngày cấp). Thẻ mẫu mới có thể
 * khác thứ tự ⇒ chỉ lấy trường 12 chữ số đầu tiên + trường giống họ tên đầu tiên.
 * @param {string | null | undefined} data
 * @returns {{ id: string, name: string | null } | null} null = không phải QR CCCD
 */
const parseCccdQr = (data) => {
	if (!data || !data.includes('|')) return null;
	const parts = data.split('|').map((p) => p.trim());
	const id = parts.find((p) => /^\d{12}$/.test(p));
	if (!id) return null;
	const name = parts.find((p) => /\p{L}/u.test(p) && !/\d/.test(p) && p.includes(' ')) ?? null;
	return { id, name };
};

/** Có vùng MRZ (dòng `IDVNM...<<<` mặt sau CCCD gắn chip / thẻ Căn cước) không. */
const hasMrz = (text) => /I[DO0]VNM/.test(text) || /<{4,}/.test(text) || /(<\s?){5,}/.test(text);

// ─── Chấm điểm + kết luận ──────────────────────────────────────────────────────
/** Đủ chữ đọc được để tin vào kết luận (ảnh mờ / OCR rác ⇒ không đủ). */
const isReadable = (words) => words.filter((w) => /^[A-Z]{2,8}$/.test(w)).length >= 12;

/**
 * Điểm từng loại.
 * @param {string} text normalize()
 * @param {string[]} words
 * @param {{ qrCccd?: boolean, mrz?: boolean, degreeNumber?: boolean }} extra
 */
const scoreKinds = (text, words, extra = {}) => {
	const scores = {};
	for (const [kind, { strong, weak }] of Object.entries(SIGNS)) {
		let s = 0;
		for (const p of strong) if (fuzzyHas(text, words, p)) s += 3;
		for (const p of weak) if (fuzzyHas(text, words, p)) s += 1;
		scores[kind] = s;
	}
	if (extra.qrCccd) scores.national_id += 6;
	if (extra.mrz) scores.national_id += 4;
	if (extra.degreeNumber) scores.degree += 2;
	return scores;
};

/**
 * Họ tên đã khai có trong chữ đọc được không (cho phép sai ~20% ký tự).
 * @param {string} text normalize()
 * @param {string[]} words
 * @param {string | null | undefined} fullName
 * @returns {boolean | null} null = không có họ tên để so
 */
const nameFound = (text, words, fullName) => {
	const n = normalize(fullName);
	if (!n || n.split(' ').length < 2) return null;
	return fuzzyHas(text, words, n);
};

/**
 * Kết luận từ điểm.
 * @param {string} expected loại đang nộp
 * @param {Record<string, number>} scores
 * @param {boolean} readable
 * @returns {{ verdict: 'ok' | 'mismatch' | 'unclear', detected_kind: string | null, confidence: number }}
 */
const decide = (expected, scores, readable) => {
	const mine = scores[expected] ?? 0;
	let best = null;
	for (const [k, s] of Object.entries(scores)) {
		if (k !== expected && s >= 3 && (!best || s > best.s)) best = { k, s };
	}
	// Loại khác áp đảo rõ ⇒ nộp nhầm (vd nộp quyết định vào ô CCCD — quyết định có nhắc số CCCD)
	if (best && best.s >= mine + 3)
		return { verdict: 'mismatch', detected_kind: best.k, confidence: Math.min(100, best.s * 10) };
	if (mine >= 3)
		return { verdict: 'ok', detected_kind: expected, confidence: Math.min(100, mine * 12) };
	// Đọc được chữ mà không thấy dấu hiệu nào của loại này ⇒ nhiều khả năng sai file
	if (readable) return { verdict: 'mismatch', detected_kind: best?.k ?? null, confidence: 40 };
	return { verdict: 'unclear', detected_kind: null, confidence: 0 };
};

/**
 * Đánh giá 1 file từ những gì đã đọc được.
 * @param {{
 *   kind: string,
 *   pages: Array<{ text: string, qr?: string[], blank?: boolean, lowRes?: boolean }>,
 *   identity?: { full_name?: string | null, national_id?: string | null,
 *                degree_number?: string | null, degree_registry_number?: string | null },
 *   method?: string,
 * }} input
 */
const evaluate = ({ kind, pages, identity = {}, method = null }) => {
	const text = normalize(pages.map((p) => p.text ?? '').join('\n'));
	const words = text ? text.split(' ') : [];
	const qrs = pages.flatMap((p) => p.qr ?? []);
	const qrCccd = qrs.map(parseCccdQr).find(Boolean) ?? null;
	const mrz = hasMrz(text);
	const digits = text.replace(/(\d)\s+(?=\d)/g, '$1');
	const declaredId = alnum(identity.national_id);
	const degreeNumbers = [identity.degree_number, identity.degree_registry_number]
		.map(alnum)
		.filter((s) => s.length >= 5);
	const compact = text.replace(/\s+/g, '');
	const degreeNumber = degreeNumbers.some((d) => compact.includes(d));
	const readable = isReadable(words) || !!qrCccd;

	const scores = scoreKinds(text, words, { qrCccd: !!qrCccd, mrz, degreeNumber });
	const result = decide(kind, scores, readable);

	const warnings = [];
	if (pages.length && pages.every((p) => p.blank)) warnings.push('blank');
	else if (pages.some((p) => p.lowRes)) warnings.push('low_resolution');

	const name = nameFound(text, words, identity.full_name);
	const qrName = qrCccd?.name ? normalize(qrCccd.name) === normalize(identity.full_name) : null;
	const signals = {
		method,
		readable,
		qr_cccd: !!qrCccd,
		mrz,
		name_found: name === null ? null : name || qrName === true,
		id_found: declaredId.length === 12 ? digits.includes(declaredId) : null,
		id_match: qrCccd && declaredId ? qrCccd.id === declaredId : null,
		degree_number_found: degreeNumbers.length ? degreeNumber : null,
		scores,
	};

	if (result.verdict === 'ok' && kind === 'national_id') {
		if (signals.id_match === false) warnings.push('id_mismatch');
		const front = FRONT_SIGNS.filter((p) => fuzzyHas(text, words, p)).length >= 2;
		const back = mrz || BACK_SIGNS.some((p) => fuzzyHas(text, words, p));
		// Chỉ kết luận thiếu mặt khi đọc được chữ — ảnh mờ thì không đoán
		if (isReadable(words)) {
			if (!front) warnings.push('cccd_missing_front');
			if (!back) warnings.push('cccd_missing_back');
		}
	}
	if (
		result.verdict === 'ok' &&
		['national_id', 'degree', 'license'].includes(kind) &&
		isReadable(words) &&
		signals.name_found === false
	)
		warnings.push('name_not_found');

	return { ...result, warnings, signals };
};

// ─── Lời nhắn cho người xem ─────────────────────────────────────────────────────
const WARNING_MESSAGES = {
	blank: 'File có vẻ là trang trắng.',
	low_resolution: 'Ảnh có độ phân giải thấp, có thể khó đọc.',
	duplicate: 'File trùng với file đã nộp cho loại hồ sơ khác của đơn này.',
	id_mismatch: 'Số CCCD trong mã QR khác số CCCD đã khai.',
	cccd_missing_front: 'Có thể thiếu mặt trước CCCD.',
	cccd_missing_back: 'Có thể thiếu mặt sau CCCD.',
	name_not_found: 'Không thấy họ tên người đăng ký trong file.',
};

module.exports = {
	normalize,
	fuzzyHas,
	parseCccdQr,
	isReadable,
	decide,
	evaluate,
	CHECKABLE_KINDS,
	WARNING_MESSAGES,
};
