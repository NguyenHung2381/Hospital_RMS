// Mở PDF bằng pdf.js và đổi tọa độ khung chữ ký giữa màn hình (viewport scale 1: pt, gốc
// trên-trái, đã xoay theo trang) và PDF gửi VIN-HSM (pt, gốc dưới-trái).
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { SignAnchor } from './signAnchors';
import { clampBox, type SignBox } from './signBox';

/** Mở PDF (File hoặc dữ liệu đã tải) — worker cùng origin, hợp CSP worker-src 'self' */
export async function openPdf(data: File | Blob | ArrayBuffer): Promise<{ doc: PDFDocumentProxy; pages: PDFPageProxy[] }> {
	const pdfjs = await import('pdfjs-dist');
	const { default: PdfWorker } = await import('pdfjs-dist/build/pdf.worker.min.mjs?worker');
	pdfjs.GlobalWorkerOptions.workerPort ??= new PdfWorker();
	const buf = data instanceof ArrayBuffer ? data : await data.arrayBuffer();
	const doc = await pdfjs.getDocument({ data: buf }).promise;
	const pages = await Promise.all(Array.from({ length: doc.numPages }, (_, i) => doc.getPage(i + 1)));
	return { doc, pages };
}

export const pdfErrorMessage = (e: unknown, fallback = 'Không mở được file PDF') =>
	e instanceof Error && e.name === 'PasswordException'
		? 'File PDF có mật khẩu — bỏ mật khẩu rồi tải lại.'
		: e instanceof Error
			? e.message
			: fallback;

export interface PdfRect {
	page: number;
	x: number;
	y: number;
	width: number;
	height: number;
}

/** Khung trên màn hình → tọa độ PDF */
export const toPdfRect = (page: PDFPageProxy, b: SignBox): PdfRect => {
	const vp = page.getViewport({ scale: 1 });
	const [x1, y1] = vp.convertToPdfPoint(b.left, b.top);
	const [x2, y2] = vp.convertToPdfPoint(b.left + b.width, b.top + b.height);
	return {
		page: b.page,
		x: Math.round(Math.min(x1, x2) * 100) / 100,
		y: Math.round(Math.min(y1, y2) * 100) / 100,
		width: Math.round(Math.abs(x2 - x1) * 100) / 100,
		height: Math.round(Math.abs(y2 - y1) * 100) / 100,
	};
};

/** Tọa độ PDF → khung trên màn hình */
export const fromPdfRect = (page: PDFPageProxy, r: PdfRect): SignBox => {
	const vp = page.getViewport({ scale: 1 });
	const [x1, y1] = vp.convertToViewportPoint(r.x, r.y);
	const [x2, y2] = vp.convertToViewportPoint(r.x + r.width, r.y + r.height);
	return {
		page: r.page,
		left: Math.min(x1, x2),
		top: Math.min(y1, y2),
		width: Math.abs(x2 - x1),
		height: Math.abs(y2 - y1),
	};
};

/** Khung đặt ngay dưới chỗ ký tìm được */
export const boxAtAnchor = (a: SignAnchor, page: PDFPageProxy, w: number, h: number): SignBox =>
	clampBox({ page: a.page, left: a.centerX - w / 2, top: a.belowY + 4, width: w, height: h }, page.getViewport({ scale: 1 }));

/** Không tìm thấy chỗ ký: góc dưới phải trang cuối, lệch dần theo thứ tự để khung không chồng nhau */
export const defaultBox = (pages: PDFPageProxy[], w: number, h: number, nth = 0): SignBox => {
	const vp = pages[pages.length - 1].getViewport({ scale: 1 });
	const col = nth % 2;
	const row = Math.floor(nth / 2);
	return clampBox(
		{
			page: pages.length,
			left: col === 0 ? vp.width - w - 60 : 60,
			top: vp.height - h - 110 - row * (h + 40),
			width: w,
			height: h,
		},
		vp,
	);
};

// Cỡ khung (pt) — cùng tỉ lệ ~22:7 với khung chữ ký trên phiếu của hệ thống
export const BOX_SIZES = [
	{ key: 's', label: 'Nhỏ', width: 150, height: 48 },
	{ key: 'm', label: 'Vừa', width: 190, height: 60 },
	{ key: 'l', label: 'Lớn', width: 240, height: 76 },
] as const;
export const DEFAULT_BOX = BOX_SIZES[1];
