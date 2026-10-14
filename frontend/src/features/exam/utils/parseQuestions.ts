/**
 * Tách câu hỏi từ văn bản đề thi (đã trích từ Word/PDF) theo mẫu thường gặp:
 *
 *   Câu 1: Nội dung câu hỏi (2 điểm)      ← "Câu 1." / "Câu 1)" / "1." / "1)" đều được
 *   A. Phương án   B. Phương án             ← nhiều phương án trên 1 dòng cũng được
 *   *C. Phương án đúng                     ← dấu * đánh dấu đáp án (tuỳ chọn)
 *   D. Phương án
 *   Đáp án: C                              ← tuỳ chọn
 *
 * Đáp án lấy theo thứ tự ưu tiên: dòng "Đáp án: X" → bảng đáp án cuối file
 * ("ĐÁP ÁN" rồi "1-A 2.C 3B ...") → dấu * → phương án duy nhất in đậm/gạch chân (Word).
 * Câu không có phương án nào = câu tự luận.
 * Hình trong file Word (nằm giữa "Câu N" và câu kế tiếp) → hình minh hoạ của câu N.
 * Bảng trong file Word → các dòng "| ô | ô |" giữ trong nội dung câu (QuestionText hiển thị thành bảng).
 * Tiêu đề / "Phần II ..." kết thúc câu đang đọc; "Hướng dẫn chấm", "Lời giải"... (bản giáo
 * viên) bị bỏ tới câu kế tiếp — không lọt vào đề thí sinh nhìn thấy.
 */

export interface SourceLine {
	text: string;
	/** Ký tự thứ i có in đậm/gạch chân không (chỉ có với Word). */
	marks?: boolean[];
	/** Hình nằm trong đoạn này — data URI (chỉ có với Word). */
	images?: string[];
	/** Đoạn là tiêu đề (Heading) trong Word */
	heading?: boolean;
}

export interface ParsedQuestion {
	number: number | null;
	question_text: string;
	question_type: 'single_choice' | 'essay';
	options: string[];
	correctIndex: number | null;
	points: number | null;
	/** Hình đầu tiên của câu (data URI) — mỗi câu chỉ giữ 1 hình minh hoạ */
	image: string | null;
}

interface Draft {
	number: number | null;
	text: string[];
	options: { text: string; starred: boolean; emphasized: boolean }[];
	answerLetter: string | null;
	points: number | null;
	images: string[];
}

const QUESTION_RE = /^(?:câu|cau|question)\s*(\d+)\s*[:.)\-–]?\s*(.*)$/i;
const NUMBERED_RE = /^(\d{1,3})\s*[.)]\s+(.*)$/;
const OPTION_START_RE = /^\*?\s*[A-H]\s*[.)]\s*/;
const OPTION_SPLIT_RE = /(?:^|\s)(\*?)\s*([A-H])\s*[.)]/g; // không nuốt khoảng trắng sau — để dành cho nhãn kế tiếp
const ANSWER_RE = /^(?:đáp\s*án|dap\s*an|answer)(?:\s*đúng)?\s*[:：-]?\s*\(?([A-H])\)?(?:\s|[.)]|$)/i;
const KEY_HEADING_RE = /^(?:bảng\s+|bang\s+)?(?:đáp\s*án|dap\s*an|answer\s*key)\s*:?\s*$/i;
const KEY_PAIR_RE = /(\d{1,3})\s*[-.:)]?\s*([A-H])\b/gi;
const POINTS_RE = /\(\s*(\d+(?:[.,]\d+)?)\s*(?:điểm|đ|diem)\s*\)/i;
const SECTION_RE = /^(?:phần|phan|part)\s+(?:[IVX]+|\d+)\b/i;
const GUIDE_RE = /^(?:hướng\s+dẫn\s+chấm|huong\s+dan\s+cham|lời\s+giải|loi\s+giai|thang\s+điểm|barem|gợi\s+ý\s+(?:đáp\s+án|lời\s+giải))/i;
const TABLE_ROW_RE = /^\|.*\|$/;

const letterIndex = (l: string) => l.toUpperCase().charCodeAt(0) - 65;

function isEmphasized(marks: boolean[] | undefined, text: string, start: number, end: number) {
	if (!marks) return false;
	let total = 0;
	let marked = 0;
	for (let i = start; i < end; i++) {
		if (/\s/.test(text[i])) continue;
		total++;
		if (marks[i]) marked++;
	}
	return total > 0 && marked / total >= 0.8;
}

function parenDepth(text: string, end: number) {
	let depth = 0;
	for (let i = 0; i < end; i++) {
		if (text[i] === '(') depth++;
		else if (text[i] === ')' && depth > 0) depth--;
	}
	return depth;
}

function splitOptions(line: SourceLine) {
	const { text, marks } = line;
	// Chỉ nhận nhãn nối tiếp (A → B → C) — "Vitamin C." giữa câu không bị tách thành phương án
	const hits: RegExpMatchArray[] = [];
	for (const m of text.matchAll(OPTION_SPLIT_RE)) {
		// Nằm trong ngoặc — "Y = (A + B) · C": "B)" là biến, không phải nhãn phương án
		if (parenDepth(text, m.index!) > 0) continue;
		const prev = hits[hits.length - 1];
		if (!prev ? m.index === 0 : letterIndex(m[2]) === letterIndex(prev[2]) + 1) hits.push(m);
	}
	return hits.map((m, i) => {
		const start = m.index! + m[0].length;
		const end = i + 1 < hits.length ? hits[i + 1].index! : text.length;
		return {
			text: text.slice(start, end).trim(),
			starred: m[1] === '*',
			// Tính cả nhãn "B." — nhiều người chỉ in đậm chữ cái của đáp án đúng
			emphasized: isEmphasized(marks, text, m.index!, end),
		};
	});
}

export function parseQuestions(lines: SourceLine[]): ParsedQuestion[] {
	const drafts: Draft[] = [];
	const key = new Map<number, string>();
	let cur: Draft | null = null;
	let inKey = false;
	let inGuide = false; // đang trong "Hướng dẫn chấm" của câu hiện tại
	let lastWasOption = false;

	for (const raw of lines) {
		const text = raw.text.replace(/\s+/g, ' ').trim();
		// Hình thuộc câu đang đọc (hình trước "Câu 1" / trong bảng đáp án / hướng dẫn chấm thì bỏ)
		if (raw.images?.length && cur && !inKey && !inGuide) cur.images.push(...raw.images);
		if (!text) continue;
		// Giữ marks khớp với text đã chuẩn hoá khoảng trắng: chỉ trim đầu dòng là đủ lệch,
		// nên dựng lại marks theo text mới khi độ dài khác
		const line: SourceLine =
			raw.marks && text !== raw.text ? { text, marks: remapMarks(raw.text, raw.marks) } : { text, marks: raw.marks };

		if (KEY_HEADING_RE.test(text)) {
			inKey = true;
			continue;
		}
		if (inKey) {
			// Bảng đáp án dạng bảng Word: "| 1 | A |" → "1 A"
			for (const m of text.replace(/\|/g, ' ').matchAll(KEY_PAIR_RE)) key.set(Number(m[1]), m[2].toUpperCase());
			continue;
		}

		const q = QUESTION_RE.exec(text) ?? NUMBERED_RE.exec(text);
		if (q) {
			inGuide = false;
			cur = { number: Number(q[1]), text: [], options: [], answerLetter: null, points: null, images: [] };
			// Hình cùng đoạn với dòng "Câu N" — đã gắn nhầm vào câu trước ở trên
			if (raw.images?.length) {
				const prev = drafts[drafts.length - 1];
				if (prev) prev.images.splice(-raw.images.length);
				cur.images.push(...raw.images);
			}
			drafts.push(cur);
			if (q[2]) cur.text.push(q[2]);
			lastWasOption = false;
			continue;
		}
		// Tiêu đề / "Phần II – Tự luận" → hết câu đang đọc (không dính vào phương án cuối)
		if (raw.heading || SECTION_RE.test(text)) {
			cur = null;
			inGuide = false;
			continue;
		}
		if (!cur) continue; // tiêu đề / thông tin đầu đề trước câu 1
		if (GUIDE_RE.test(text)) inGuide = true;
		if (inGuide) continue;

		// Hàng bảng luôn thuộc nội dung câu hỏi
		if (TABLE_ROW_RE.test(text)) {
			cur.text.push(text);
			continue;
		}

		const ans = ANSWER_RE.exec(text);
		if (ans) {
			cur.answerLetter = ans[1].toUpperCase();
			continue;
		}
		if (OPTION_START_RE.test(text)) {
			cur.options.push(...splitOptions(line));
			lastWasOption = true;
			continue;
		}
		// Dòng nối tiếp (nội dung bị xuống dòng)
		if (lastWasOption && cur.options.length) cur.options[cur.options.length - 1].text += ` ${text}`;
		else cur.text.push(text);
	}

	return drafts.map((d) => {
		let questionText = d.text.join('\n').trim();
		let points = d.points;
		const pm = POINTS_RE.exec(questionText);
		if (pm) {
			points = Number(pm[1].replace(',', '.'));
			// "Câu 11 (3,0 điểm). Nội dung" → bỏ dấu câu còn sót ở đầu
			questionText = questionText.replace(POINTS_RE, '').replace(/^[\s.:)\-–]+/, '').trim();
		}
		const options = d.options.map((o) => o.text).filter(Boolean);
		const letter = d.answerLetter ?? (d.number != null ? key.get(d.number) : undefined);
		let correctIndex: number | null = letter ? letterIndex(letter) : null;
		if (correctIndex == null) {
			const starred = d.options.findIndex((o) => o.starred);
			if (starred >= 0) correctIndex = starred;
		}
		if (correctIndex == null) {
			const emph = d.options.flatMap((o, i) => (o.emphasized ? [i] : []));
			if (emph.length === 1) correctIndex = emph[0];
		}
		if (correctIndex != null && (correctIndex < 0 || correctIndex >= options.length)) correctIndex = null;
		return {
			number: d.number,
			question_text: questionText,
			question_type: options.length ? 'single_choice' : 'essay',
			options,
			correctIndex,
			points,
			image: d.images[0] ?? null,
		};
	});
}

// Gộp khoảng trắng + trim làm lệch vị trí ký tự → ánh xạ lại marks theo text mới
function remapMarks(orig: string, marks: boolean[]) {
	const out: boolean[] = [];
	let prevSpace = true; // bỏ khoảng trắng đầu dòng
	for (let i = 0; i < orig.length; i++) {
		const sp = /\s/.test(orig[i]);
		if (sp && prevSpace) continue;
		out.push(sp ? false : marks[i]);
		prevSpace = sp;
	}
	if (out.length && prevSpace) out.pop(); // khoảng trắng cuối dòng
	return out;
}
