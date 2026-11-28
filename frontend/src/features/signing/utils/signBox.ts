// Khung chữ ký trên trang PDF (Ký tài liệu)

/** Khung chữ ký trên trang — đơn vị pt, gốc trên-trái của trang (viewport scale 1 của pdf.js) */
export interface SignBox {
	page: number;
	left: number;
	top: number;
	width: number;
	height: number;
}

export const MIN_BOX_WIDTH = 90;
export const MAX_RENDER_WIDTH = 860;

/** Giữ khung nằm trong trang */
export const clampBox = (b: SignBox, page: { width: number; height: number }): SignBox => {
	const width = Math.min(Math.max(b.width, MIN_BOX_WIDTH), page.width);
	const height = Math.min(b.height * (width / b.width), page.height);
	return {
		...b,
		width,
		height,
		left: Math.min(Math.max(b.left, 0), page.width - width),
		top: Math.min(Math.max(b.top, 0), page.height - height),
	};
};
