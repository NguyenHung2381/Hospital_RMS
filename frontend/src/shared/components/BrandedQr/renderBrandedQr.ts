import { Ecc, QrCode } from '@rc-component/qrcode/es/libs/qrcodegen';
import Logo from '@/assets/logo.png';

// Ảnh QR mang nhận diện bệnh viện (header xanh + logo, logo giữa mã, tên/ghi chú
// bên dưới) để in vào văn bản, giấy mời hoặc giữ trong máy làm vé.
// Vẽ thẳng từ ma trận QR thay vì chụp lại canvas của antd: canvas antd nhân theo
// devicePixelRatio (iPhone = 3) nên kích thước thay đổi theo máy, ảnh bị cắt/méo.

export const HOSPITAL_NAME = 'Bệnh viện Hữu Nghị Đa Khoa Nghệ An';
const HOSPITAL_SUB = 'Cổng thông tin Đào tạo';

// Bám theo --color-primary* trong styles/variables.css; ô QR dùng xanh rất đậm để
// đủ tương phản cho máy quét.
export const QR_COLORS = {
	primary: '#0a9b4a',
	dark: '#087c3b',
	ink: '#064d26',
	pale: '#e7f5ed',
	bg: '#f4faf6',
	text: '#111827',
	muted: '#6b7280',
};

const FONT = '"Be Vietnam Pro", Arial, sans-serif';
const W = 800; // đơn vị logic; ảnh xuất ra nhân SCALE
const SCALE = 2;
const PAD = 48;
const HEADER = 136;
const QUIET = 3; // vùng trắng quanh mã (tính theo ô)

export interface BrandedQrOptions {
	value: string;
	/** Dòng chữ đậm ngay dưới mã */
	title: string;
	lines?: string[];
	/** Chữ nhỏ cuối ảnh (vd link) */
	caption?: string;
}

let logoPromise: Promise<HTMLImageElement | null> | null = null;
export const loadLogo = () =>
	(logoPromise ??= new Promise((resolve) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => resolve(null);
		img.src = Logo;
	}));

const loadFonts = async () => {
	try {
		await Promise.all([document.fonts.load(`700 28px ${FONT}`), document.fonts.load(`400 20px ${FONT}`)]);
	} catch {
		/* không có font web vẫn vẽ bằng Arial */
	}
};

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}

// Ngắt dòng theo độ rộng; từ quá dài (link) thì cắt theo ký tự
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
	const out: string[] = [];
	let cur = '';
	const push = (word: string) => {
		const next = cur ? `${cur} ${word}` : word;
		if (ctx.measureText(next).width <= maxW) return void (cur = next);
		if (cur) out.push(cur);
		cur = '';
		for (const ch of word) {
			if (cur && ctx.measureText(cur + ch).width > maxW) {
				out.push(cur);
				cur = '';
			}
			cur += ch;
		}
	};
	text.split(/\s+/).filter(Boolean).forEach(push);
	if (cur) out.push(cur);
	return out;
}

// Mức sửa lỗi H (~30%) để logo che giữa mã vẫn quét được
export const encodeQr = (value: string) => QrCode.encodeText(value, Ecc.HIGH);

/** Vùng trống tròn giữa mã cho logo: bán kính ~11% cạnh mã (~4% diện tích) */
const logoRadius = (n: number) => n * 0.11;

/**
 * Vẽ mã QR (không gồm vùng trắng xung quanh) từ góc (ox, oy), mỗi ô `cell` px:
 * ô bo tròn ở các góc không có ô kề (các ô liền nhau nối thành khối mềm),
 * 3 ô định vị bo góc, logo tròn ở giữa. Dùng chung cho ảnh tải về và QR trên màn hình.
 */
export function drawQrCode(
	ctx: CanvasRenderingContext2D,
	qr: QrCode,
	ox: number,
	oy: number,
	cell: number,
	logo: HTMLImageElement | null,
) {
	const n = qr.size;
	const mid = n / 2;
	const R = logoRadius(n);
	const dark = (x: number, y: number) => x >= 0 && y >= 0 && x < n && y < n && qr.getModule(x, y);
	const inFinder = (x: number, y: number) =>
		(x < 8 || x >= n - 8) && (y < 8 || y >= n - 8) && !(x >= n - 8 && y >= n - 8);
	const inLogo = (x: number, y: number) => Math.hypot(x + 0.5 - mid, y + 0.5 - mid) < R + 0.6;

	// Ô dữ liệu: gom vào 1 path rồi tô một lần để không lộ đường nối giữa các ô
	const r = cell / 2;
	ctx.beginPath();
	for (let y = 0; y < n; y++)
		for (let x = 0; x < n; x++) {
			if (!dark(x, y) || inFinder(x, y) || inLogo(x, y)) continue;
			const u = dark(x, y - 1);
			const d = dark(x, y + 1);
			const l = dark(x - 1, y);
			const rt = dark(x + 1, y);
			const px = ox + x * cell;
			const py = oy + y * cell;
			const tl = !u && !l ? r : 0;
			const tr = !u && !rt ? r : 0;
			const br = !d && !rt ? r : 0;
			const bl = !d && !l ? r : 0;
			ctx.moveTo(px + tl, py);
			ctx.lineTo(px + cell - tr, py);
			if (tr) ctx.arcTo(px + cell, py, px + cell, py + tr, tr);
			ctx.lineTo(px + cell, py + cell - br);
			if (br) ctx.arcTo(px + cell, py + cell, px + cell - br, py + cell, br);
			ctx.lineTo(px + bl, py + cell);
			if (bl) ctx.arcTo(px, py + cell, px, py + cell - bl, bl);
			ctx.lineTo(px, py + tl);
			if (tl) ctx.arcTo(px, py, px + tl, py, tl);
			ctx.closePath();
		}
	ctx.fillStyle = QR_COLORS.ink;
	ctx.fill();

	// 3 ô định vị bo tròn
	for (const [fx, fy] of [
		[0, 0],
		[n - 7, 0],
		[0, n - 7],
	]) {
		const px = ox + fx * cell;
		const py = oy + fy * cell;
		roundRect(ctx, px, py, cell * 7, cell * 7, cell * 2.4);
		ctx.fillStyle = QR_COLORS.dark;
		ctx.fill();
		roundRect(ctx, px + cell, py + cell, cell * 5, cell * 5, cell * 1.6);
		ctx.fillStyle = '#fff';
		ctx.fill();
		roundRect(ctx, px + cell * 2, py + cell * 2, cell * 3, cell * 3, cell * 1.2);
		ctx.fillStyle = QR_COLORS.ink;
		ctx.fill();
	}

	// Logo cắt tròn + viền xanh
	const cx = ox + mid * cell;
	const cy = oy + mid * cell;
	const lr = R * cell;
	ctx.beginPath();
	ctx.arc(cx, cy, lr, 0, Math.PI * 2);
	ctx.fillStyle = '#fff';
	ctx.fill();
	ctx.lineWidth = Math.max(1.5, cell * 0.35);
	ctx.strokeStyle = QR_COLORS.primary;
	ctx.stroke();
	if (logo) {
		const ir = lr - Math.max(1.5, cell * 0.35) / 2 - cell * 0.25;
		ctx.save();
		ctx.beginPath();
		ctx.arc(cx, cy, ir, 0, Math.PI * 2);
		ctx.clip();
		// Logo là huy hiệu tròn trên nền trong suốt — vừa khít đường kính vòng cắt
		const ls = ir * 2;
		ctx.imageSmoothingQuality = 'high';
		ctx.drawImage(logo, cx - ls / 2, cy - ls / 2, ls, ls);
		ctx.restore();
	}
}

/** Chỉ mã QR (logo giữa + vùng trắng tối thiểu để quét) — để chèn vào văn bản/giấy mời */
export async function renderPlainQr(value: string, size = 1024) {
	const logo = await loadLogo();
	const qr = encodeQr(value);
	const cell = Math.max(4, Math.floor(size / (qr.size + QUIET * 2)));
	const px = cell * (qr.size + QUIET * 2);
	const canvas = document.createElement('canvas');
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Trình duyệt không hỗ trợ canvas');
	canvas.width = px;
	canvas.height = px;
	ctx.fillStyle = '#fff';
	ctx.fillRect(0, 0, px, px);
	drawQrCode(ctx, qr, QUIET * cell, QUIET * cell, cell, logo);
	return canvas;
}

export async function renderBrandedQr({ value, title, lines = [], caption }: BrandedQrOptions) {
	const [logo] = await Promise.all([loadLogo(), loadFonts()]);
	const qr = encodeQr(value);
	const n = qr.size;
	const cell = Math.max(4, Math.floor(500 / (n + QUIET * 2)));
	const box = (n + QUIET * 2) * cell;

	const canvas = document.createElement('canvas');
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Trình duyệt không hỗ trợ canvas');

	// Đo chữ trước để tính chiều cao ảnh
	const textW = W - PAD * 2;
	const blocks: { text: string; font: string; color: string; line: number }[] = [];
	const addBlock = (text: string, font: string, color: string, line: number) => {
		ctx.font = font;
		wrap(ctx, text, textW).forEach((t) => blocks.push({ text: t, font, color, line }));
	};
	addBlock(title, `700 30px ${FONT}`, QR_COLORS.text, 42);
	lines.filter(Boolean).forEach((l) => addBlock(l, `400 22px ${FONT}`, '#374151', 32));
	const captionStart = blocks.length;
	if (caption) addBlock(caption, `400 16px ${FONT}`, QR_COLORS.muted, 24);
	const textH = blocks.reduce((s, b) => s + b.line, 0) + (caption ? 12 : 0);

	const boxY = HEADER + 40;
	const H = boxY + box + 32 + textH + PAD;
	canvas.width = W * SCALE;
	canvas.height = H * SCALE;
	ctx.scale(SCALE, SCALE);

	// Nền + header
	ctx.fillStyle = QR_COLORS.bg;
	ctx.fillRect(0, 0, W, H);
	const grad = ctx.createLinearGradient(0, 0, W, HEADER);
	grad.addColorStop(0, QR_COLORS.primary);
	grad.addColorStop(1, QR_COLORS.dark);
	ctx.fillStyle = grad;
	ctx.fillRect(0, 0, W, HEADER);
	ctx.fillStyle = QR_COLORS.dark;
	ctx.fillRect(0, H - 8, W, 8);

	const LOGO = 92;
	const logoCy = HEADER / 2;
	ctx.fillStyle = '#fff';
	ctx.beginPath();
	ctx.arc(PAD + LOGO / 2, logoCy, LOGO / 2, 0, Math.PI * 2);
	ctx.fill();
	if (logo) ctx.drawImage(logo, PAD + 6, logoCy - LOGO / 2 + 6, LOGO - 12, LOGO - 12);

	const tx = PAD + LOGO + 22;
	const tMax = W - tx - PAD;
	const name = HOSPITAL_NAME.toUpperCase();
	let size = 28;
	do ctx.font = `700 ${size}px ${FONT}`;
	while (ctx.measureText(name).width > tMax && --size > 16);
	ctx.fillStyle = '#fff';
	ctx.textAlign = 'left';
	ctx.textBaseline = 'alphabetic';
	ctx.fillText(name, tx, logoCy - 4);
	ctx.font = `400 20px ${FONT}`;
	ctx.fillStyle = 'rgba(255,255,255,0.88)';
	ctx.fillText(HOSPITAL_SUB, tx, logoCy + 28);

	// Khung QR
	const bx = (W - box) / 2;
	ctx.save();
	ctx.shadowColor = 'rgba(6, 77, 38, 0.12)';
	ctx.shadowBlur = 24;
	ctx.shadowOffsetY = 6;
	roundRect(ctx, bx - 12, boxY - 12, box + 24, box + 24, 24);
	ctx.fillStyle = '#fff';
	ctx.fill();
	ctx.restore();
	roundRect(ctx, bx - 12, boxY - 12, box + 24, box + 24, 24);
	ctx.strokeStyle = QR_COLORS.pale;
	ctx.lineWidth = 3;
	ctx.stroke();

	drawQrCode(ctx, qr, bx + QUIET * cell, boxY + QUIET * cell, cell, logo);

	// Chữ dưới mã
	ctx.textAlign = 'center';
	ctx.textBaseline = 'top';
	let y = boxY + box + 32;
	blocks.forEach((b, i) => {
		if (i === captionStart && caption) y += 12;
		ctx.font = b.font;
		ctx.fillStyle = b.color;
		ctx.fillText(b.text, W / 2, y);
		y += b.line;
	});

	return canvas;
}
