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
	const blocks = [...doc.body.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6')].filter(
		(el) => !el.querySelector('p, li'), // li chứa p → lấy p bên trong, tránh trùng
	);
	return blocks.map((el) => {
		let text = '';
		const marks: boolean[] = [];
		const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
		for (let n = walker.nextNode(); n; n = walker.nextNode()) {
			const t = n.textContent ?? '';
			const marked = !!n.parentElement?.closest('strong, b, u');
			text += t;
			for (let i = 0; i < t.length; i++) marks.push(marked);
		}
		return { text, marks };
	});
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
