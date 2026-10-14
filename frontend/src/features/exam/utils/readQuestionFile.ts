import type { SourceLine } from './parseQuestions';

/** Đọc file .docx / .pdf ngay trên trình duyệt thành các dòng văn bản (không upload file lên server). */
export async function readQuestionFile(file: File): Promise<SourceLine[]> {
	const name = file.name.toLowerCase();
	if (name.endsWith('.docx')) return readDocx(await file.arrayBuffer());
	if (name.endsWith('.pdf')) return readPdf(await file.arrayBuffer());
	if (name.endsWith('.doc')) throw new Error('File .doc (Word 97-2003) chưa hỗ trợ — hãy mở bằng Word và "Lưu thành" .docx');
	throw new Error('Chỉ hỗ trợ file .docx hoặc .pdf');
}

async function readDocx(arrayBuffer: ArrayBuffer): Promise<SourceLine[]> {
	const { default: mammoth } = await import('mammoth');
	// Giữ in đậm (strong) + gạch chân (u) để nhận ra đáp án được tô trong Word
	const { value: html } = await mammoth.convertToHtml({ arrayBuffer }, { styleMap: ['u => u'] });
	const doc = new DOMParser().parseFromString(html, 'text/html');
	const lines: SourceLine[] = [];
	visitBlocks(doc.body, lines);
	return lines;
}

// Phần tử khối mammoth sinh ra — đọc riêng, không gộp vào dòng của phần tử cha
const BLOCK_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'TABLE']);

function visitBlocks(el: Element, out: SourceLine[]) {
	for (const child of el.children) {
		const tag = child.tagName;
		if (tag === 'TABLE') out.push(...tableLines(child as HTMLTableElement));
		else if (tag === 'P' || /^H[1-6]$/.test(tag)) out.push(...inlineLines(child, tag !== 'P'));
		else if (tag === 'LI') {
			out.push(...inlineLines(child, false)); // chữ của mục, rồi tới danh sách con bên trong
			visitBlocks(child, out);
		} else visitBlocks(child, out);
	}
}

// Nội dung inline của 1 khối → các dòng (tách ở <br>), giữ in đậm/gạch chân và hình
function inlineLines(el: Element, heading: boolean): SourceLine[] {
	const lines: SourceLine[] = [];
	let cur: SourceLine & { marks: boolean[]; images: string[] } = { text: '', marks: [], images: [] };
	const push = () => {
		const { text, marks, images } = cur;
		lines.push({ text, marks, ...(images.length && { images }), ...(heading && { heading }) });
		cur = { text: '', marks: [], images: [] };
	};
	const walk = (node: Node) => {
		for (const n of node.childNodes) {
			if (n.nodeType === Node.TEXT_NODE) {
				const t = n.textContent ?? '';
				const marked = !!n.parentElement?.closest('strong, b, u');
				cur.text += t;
				for (let i = 0; i < t.length; i++) cur.marks.push(marked);
			} else if (n instanceof Element) {
				if (BLOCK_TAGS.has(n.tagName)) continue; // khối con — visitBlocks đọc riêng
				if (n.tagName === 'BR') push();
				else if (n.tagName === 'IMG') {
					// mammoth nhúng hình dạng data URI. Chỉ giữ loại server nhận (EMF/WMF... bỏ qua)
					const src = n.getAttribute('src') ?? '';
					if (/^data:image\/(png|jpeg|gif|webp);base64,/.test(src)) cur.images.push(src);
				} else walk(n);
			}
		}
	};
	walk(el);
	push();
	return lines;
}

/**
 * Bảng Word → mỗi hàng 1 dòng "| ô | ô |" (hàng tiêu đề kèm dòng "|---|"), để
 * giữ nguyên bảng trong nội dung câu hỏi — QuestionText hiển thị lại thành bảng.
 * Bảng 1 cột (Word hay dùng làm khung viền) → đọc như đoạn văn thường.
 */
function tableLines(table: HTMLTableElement): SourceLine[] {
	const rows = [...table.rows];
	if (rows.every((r) => r.cells.length <= 1)) {
		const out: SourceLine[] = [];
		for (const r of rows) for (const c of r.cells) visitBlocks(c, out);
		return out;
	}
	const out: SourceLine[] = [];
	const images: string[] = [];
	rows.forEach((r, ri) => {
		const cells = [...r.cells].map((c) => {
			const inner: SourceLine[] = [];
			visitBlocks(c, inner);
			if (!inner.length) inner.push(...inlineLines(c, false)); // ô không có <p>
			for (const l of inner) if (l.images) images.push(...l.images);
			return inner
				.map((l) => l.text.trim())
				.filter(Boolean)
				.join(' ')
				.replace(/\|/g, '\\|');
		});
		if (cells.every((c) => !c)) return;
		out.push({ text: `| ${cells.join(' | ')} |` });
		const isHead = r.parentElement?.tagName === 'THEAD' || [...r.cells].every((c) => c.tagName === 'TH');
		if (ri === 0 && isHead) out.push({ text: `|${cells.map(() => '---').join('|')}|` });
	});
	// Hình trong ô bảng → gắn vào dòng đầu bảng (thành hình minh hoạ của câu)
	if (images.length) out.unshift({ text: '', images });
	return out;
}

/** data URI (hình trích từ Word) → File để tải lên. Không dùng fetch(data:) — CSP connect-src chặn. */
export function dataUrlToFile(dataUrl: string, baseName: string): File {
	const [head, b64] = dataUrl.split(',');
	const type = /^data:([^;]+)/.exec(head)?.[1] ?? 'image/png';
	const bin = atob(b64);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	const ext = type === 'image/jpeg' ? 'jpg' : type.split('/')[1];
	return new File([bytes], `${baseName}.${ext}`, { type });
}

async function readPdf(data: ArrayBuffer): Promise<SourceLine[]> {
	const pdfjs = await import('pdfjs-dist');
	// ?worker: Vite đóng gói worker thành .js cùng origin (hợp CSP worker-src 'self', không lo MIME .mjs)
	const { default: PdfWorker } = await import('pdfjs-dist/build/pdf.worker.min.mjs?worker');
	pdfjs.GlobalWorkerOptions.workerPort ??= new PdfWorker();
	const pdf = await pdfjs.getDocument({ data }).promise;
	const lines: SourceLine[] = [];
	for (let p = 1; p <= pdf.numPages; p++) {
		const content = await (await pdf.getPage(p)).getTextContent();
		let cur = '';
		let lastY: number | null = null;
		for (const item of content.items) {
			if (!('str' in item)) continue;
			const y = item.transform[5];
			// Sang dòng mới khi toạ độ y đổi (PDF không phải lúc nào cũng có hasEOL)
			if (lastY != null && Math.abs(y - lastY) > 2 && cur.trim()) {
				lines.push({ text: cur });
				cur = '';
			}
			cur += item.str;
			lastY = y;
			if (item.hasEOL) {
				lines.push({ text: cur });
				cur = '';
			}
		}
		if (cur.trim()) lines.push({ text: cur });
	}
	return lines;
}
