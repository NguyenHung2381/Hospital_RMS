// Dò chỗ ký trong PDF từ lớp chữ (pdf.js getTextContent): dòng ngắn chứa chức danh người ký
// ("Giám đốc", "Người phê duyệt", "Trưởng khoa"...) ⇒ đề xuất đặt khung chữ ký ngay bên dưới.
// Tọa độ trả về theo "viewport scale 1" của pdf.js: đơn vị pt, gốc trên-trái, đã xoay theo trang.
import type { PDFPageProxy } from 'pdfjs-dist';

export interface SignAnchor {
	page: number;
	/** Dòng chữ tìm thấy (để hiện cho người dùng chọn) */
	label: string;
	/** Tâm ngang và mép dưới của chỗ đặt khung, viewport pt */
	centerX: number;
	belowY: number;
}

// So khớp không dấu, chữ thường
const fold = (s: string) =>
	s
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/đ/g, 'd')
		.replace(/Đ/g, 'D')
		.toLowerCase()
		.replace(/\s+/g, ' ')
		.trim();

// Chức danh / vai trò người ký thường đứng đầu khối ký
const KEYWORDS = [
	'nguoi phe duyet',
	'nguoi duyet',
	'pho giam doc',
	'giam doc',
	'truong khoa',
	'pho truong khoa',
	'truong phong',
	'pho truong phong',
	'truong ban',
	'chu tich',
	'thu ky',
	'nguoi ky',
	'nguoi lam don',
	'nguoi de nghi',
	'nguoi lap',
	'nguoi viet',
	'chu nhiem',
	'thu truong',
	'xac nhan cua',
	'dai dien',
	'nguoi huong dan',
	'nguoi hoc',
];
// Dòng hướng dẫn dưới chức danh: "(Ký, ghi rõ họ tên)" — đặt khung dưới dòng này
const HINT_LINE = /\(?\s*ky\b.*(ho ten|ghi ro|dong dau)/;
// Khối ký chỉ có vài chữ; dòng dài là câu văn có nhắc tới chức danh
const MAX_LINE_CHARS = 48;

interface Line {
	text: string;
	x0: number;
	x1: number;
	/** Đường chân chữ (viewport) */
	y: number;
	size: number;
}

const linesOf = async (page: PDFPageProxy): Promise<Line[]> => {
	const vp = page.getViewport({ scale: 1 });
	const content = await page.getTextContent();
	const lines: Line[] = [];
	for (const item of content.items) {
		if (!('str' in item) || !item.str.trim()) continue;
		const [a, b, , , e, f] = item.transform as number[];
		const size = Math.hypot(a, b) || 10;
		const [x0, y0] = vp.convertToViewportPoint(e, f);
		const [x1] = vp.convertToViewportPoint(e + item.width, f);
		const left = Math.min(x0, x1);
		const right = Math.max(x0, x1);
		// Cùng đường chân chữ (lệch < 3pt) và sát nhau theo chiều ngang ⇒ cùng 1 dòng
		const same = lines.find((l) => Math.abs(l.y - y0) < 3 && left - l.x1 < size * 2.5 && l.x0 - right < size * 2.5);
		if (same) {
			same.text = left < same.x0 ? `${item.str}${same.text}` : `${same.text}${item.str}`;
			same.x0 = Math.min(same.x0, left);
			same.x1 = Math.max(same.x1, right);
		} else {
			lines.push({ text: item.str, x0: left, x1: right, y: y0, size });
		}
	}
	return lines;
};

/** Mọi chỗ ký tìm được trong tài liệu, theo thứ tự trang / từ trên xuống. */
export async function findSignAnchors(pages: PDFPageProxy[]): Promise<SignAnchor[]> {
	const out: SignAnchor[] = [];
	for (const [i, page] of pages.entries()) {
		const lines = (await linesOf(page)).sort((p, q) => p.y - q.y);
		for (const line of lines) {
			const t = fold(line.text);
			if (t.length > MAX_LINE_CHARS || !KEYWORDS.some((k) => t.includes(k))) continue;
			// Dòng "(Ký, ghi rõ họ tên)" ngay bên dưới, cùng cột ⇒ đặt khung dưới dòng đó
			const hint = lines.find(
				(l) =>
					l.y > line.y &&
					l.y - line.y < line.size * 3 &&
					HINT_LINE.test(fold(l.text)) &&
					Math.abs((l.x0 + l.x1) / 2 - (line.x0 + line.x1) / 2) < 80,
			);
			const base = hint ?? line;
			out.push({
				page: i + 1,
				label: line.text.replace(/\s+/g, ' ').trim(),
				centerX: (line.x0 + line.x1) / 2,
				belowY: base.y + base.size * 0.6,
			});
		}
	}
	return out;
}
