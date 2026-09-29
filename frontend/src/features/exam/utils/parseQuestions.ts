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
 */

export interface SourceLine {
	text: string;
	/** Ký tự thứ i có in đậm/gạch chân không (chỉ có với Word). */
	marks?: boolean[];
}

export interface ParsedQuestion {
	number: number | null;
	question_text: string;
	question_type: 'single_choice' | 'essay';
	options: string[];
	correctIndex: number | null;
	points: number | null;
}

interface Draft {
	number: number | null;
	text: string[];
	options: { text: string; starred: boolean; emphasized: boolean }[];
	answerLetter: string | null;
	points: number | null;
}

const QUESTION_RE = /^(?:câu|cau|question)\s*(\d+)\s*[:.)\-–]?\s*(.*)$/i;
const NUMBERED_RE = /^(\d{1,3})\s*[.)]\s+(.*)$/;
const OPTION_START_RE = /^\*?\s*[A-H]\s*[.)]\s*/;
const OPTION_SPLIT_RE = /(?:^|\s)(\*?)\s*([A-H])\s*[.)]/g; // không nuốt khoảng trắng sau — để dành cho nhãn kế tiếp
const ANSWER_RE = /^(?:đáp\s*án|dap\s*an|answer)(?:\s*đúng)?\s*[:：-]?\s*\(?([A-H])\)?(?:\s|[.)]|$)/i;
const KEY_HEADING_RE = /^(?:bảng\s+|bang\s+)?(?:đáp\s*án|dap\s*an|answer\s*key)\s*:?\s*$/i;
const KEY_PAIR_RE = /(\d{1,3})\s*[-.:)]?\s*([A-H])\b/gi;
const POINTS_RE = /\(\s*(\d+(?:[.,]\d+)?)\s*(?:điểm|đ|diem)\s*\)/i;

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

function splitOptions(line: SourceLine) {
	const { text, marks } = line;
	// Chỉ nhận nhãn nối tiếp (A → B → C) — "Vitamin C." giữa câu không bị tách thành phương án
	const hits: RegExpMatchArray[] = [];
	for (const m of text.matchAll(OPTION_SPLIT_RE)) {
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
	let lastWasOption = false;

	for (const raw of lines) {
		const text = raw.text.replace(/\s+/g, ' ').trim();
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
			for (const m of text.matchAll(KEY_PAIR_RE)) key.set(Number(m[1]), m[2].toUpperCase());
			continue;
		}

		const q = QUESTION_RE.exec(text) ?? NUMBERED_RE.exec(text);
		if (q) {
			cur = { number: Number(q[1]), text: [], options: [], answerLetter: null, points: null };
			drafts.push(cur);
			if (q[2]) cur.text.push(q[2]);
			lastWasOption = false;
			continue;
		}
		if (!cur) continue; // tiêu đề / thông tin đầu đề trước câu 1

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
			questionText = questionText.replace(POINTS_RE, '').trim();
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
