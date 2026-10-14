import styles from './QuestionImage.module.css';

/**
 * Nội dung câu hỏi dạng văn bản thuần, có thể chứa bảng viết kiểu Markdown
 * (mỗi dòng "| ô | ô |", dòng "|---|---|" ngăn cách hàng tiêu đề) — bảng trích
 * từ file Word khi nhập câu hỏi được lưu theo dạng này. Không có bảng → trả
 * nguyên chuỗi, hiển thị y như trước.
 */
export function QuestionText({ text }: { text: string }) {
	const segments = splitTables(text);
	if (!segments.some((s) => typeof s !== 'string')) return text;
	return (
		<>
			{segments.map((s, i) =>
				typeof s === 'string' ? (
					<span
						key={i}
						className={styles.textPart}
					>
						{s}
					</span>
				) : (
					<div
						key={i}
						className={styles.tableWrap}
					>
						<table className={styles.table}>
							{s.head && (
								<thead>
									<tr>
										{s.head.map((c, j) => (
											<th key={j}>{c}</th>
										))}
									</tr>
								</thead>
							)}
							<tbody>
								{s.rows.map((r, ri) => (
									<tr key={ri}>
										{r.map((c, j) => (
											<td key={j}>{c}</td>
										))}
									</tr>
								))}
							</tbody>
						</table>
					</div>
				),
			)}
		</>
	);
}

interface TableSegment {
	head: string[] | null;
	rows: string[][];
}

const TABLE_LINE_RE = /^\s*\|.*\|\s*$/;
const SEPARATOR_RE = /^\s*\|(?:\s*:?-{3,}:?\s*\|)+\s*$/;

// "| a | b\|c |" → ["a", "b|c"] — "\|" là dấu | nằm trong ô
const cells = (line: string) =>
	line
		.trim()
		.slice(1, -1)
		.split(/(?<!\\)\|/)
		.map((c) => c.trim().replace(/\\\|/g, '|'));

function splitTables(text: string): (string | TableSegment)[] {
	const out: (string | TableSegment)[] = [];
	const lines = text.split('\n');
	let buf: string[] = [];
	const flushText = () => {
		const s = buf.join('\n').replace(/^\n+|\n+$/g, '');
		if (s) out.push(s);
		buf = [];
	};
	for (let i = 0; i < lines.length; ) {
		if (!TABLE_LINE_RE.test(lines[i]) || SEPARATOR_RE.test(lines[i])) {
			buf.push(lines[i++]);
			continue;
		}
		const rows: string[][] = [];
		let head: string[] | null = null;
		for (; i < lines.length && TABLE_LINE_RE.test(lines[i]); i++) {
			if (SEPARATOR_RE.test(lines[i])) {
				if (rows.length === 1 && !head) head = rows.pop()!;
				continue;
			}
			rows.push(cells(lines[i]));
		}
		flushText();
		out.push({ head, rows });
	}
	flushText();
	return out;
}
