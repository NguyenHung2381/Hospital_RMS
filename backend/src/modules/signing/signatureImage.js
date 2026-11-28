/**
 * signatureImage.js — chuẩn hóa ảnh chữ ký tay trước khi lưu.
 *
 * Nhận PNG / JPEG / WEBP (ảnh chụp, ảnh quét, hoặc nét vẽ trên màn hình), vẽ lại bằng Skia:
 *  - nền sáng (giấy trắng) → trong suốt, giữ màu mực;
 *  - cắt sát vùng có nét, chừa lề nhỏ;
 *  - thu nhỏ còn tối đa 600×240;
 *  - xuất PNG mới — không giữ byte nào của file gốc (metadata, dữ liệu ẩn).
 * Không có nét nào ⇒ báo lỗi.
 */
const { httpError } = require('../../utils/httpError');

const path = require('path');

/** @type {typeof import('@napi-rs/canvas') | undefined} */
let skia;
// Nạp Skia ở lần dùng đầu (xem utils/seminarBadgeImage.js — binding tốn luồng + RAM)
const loadSkia = () => {
	if (!skia) {
		skia = require('@napi-rs/canvas');
		const fonts = path.join(__dirname, '../../assets/fonts');
		skia.GlobalFonts.registerFromPath(path.join(fonts, 'Inter-Regular.ttf'), 'Inter');
		skia.GlobalFonts.registerFromPath(path.join(fonts, 'Inter-Bold.ttf'), 'Inter');
	}
	return skia;
};

const MAX_INPUT_BYTES = 3 * 1024 * 1024;
const MAX_SOURCE_SIDE = 5000;
const MAX_W = 600;
const MAX_H = 240;
const PAD = 8;
// Độ sáng (0–255): ≥ WHITE coi là nền, ≤ INK là mực đậm, ở giữa mờ dần
const WHITE = 225;
const INK = 160;

const isPng = (b) => b.length > 8 && b.readUInt32BE(0) === 0x89504e47;
const isJpeg = (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
const isWebp = (b) =>
	b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP';

/**
 * Chuỗi "data:image/png;base64,..." hoặc base64 trần → Buffer ảnh.
 * @param {string} input
 */
const decodeInput = (input) => {
	const s = String(input || '').trim();
	const m = s.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/i);
	const b64 = m ? m[2] : s;
	if (!/^[A-Za-z0-9+/=\s]+$/.test(b64)) throw httpError(400, 'Ảnh chữ ký không hợp lệ.');
	const buf = Buffer.from(b64, 'base64');
	if (buf.length > MAX_INPUT_BYTES) throw httpError(400, 'Ảnh chữ ký quá lớn (tối đa 3 MB).');
	if (!isPng(buf) && !isJpeg(buf) && !isWebp(buf)) {
		throw httpError(400, 'Chỉ nhận ảnh PNG, JPG hoặc WEBP.');
	}
	return buf;
};

/**
 * @param {string} input  data URL hoặc base64 của ảnh
 * @returns {Promise<string>} PNG đã chuẩn hóa, base64 (không có tiền tố data:)
 */
const normalizeSignatureImage = async (input) => {
	const buf = decodeInput(input);
	const { loadImage, createCanvas } = loadSkia();
	let img;
	try {
		img = await loadImage(buf);
	} catch {
		throw httpError(400, 'Không đọc được ảnh chữ ký.');
	}
	if (!img.width || !img.height || img.width > MAX_SOURCE_SIDE || img.height > MAX_SOURCE_SIDE) {
		throw httpError(400, `Ảnh chữ ký phải nhỏ hơn ${MAX_SOURCE_SIDE}×${MAX_SOURCE_SIDE} điểm ảnh.`);
	}
	// Ảnh rất lớn: thu về ≤ 1600 cạnh dài trước khi xử lý từng điểm ảnh
	const pre = Math.min(1, 1600 / Math.max(img.width, img.height));
	const w = Math.max(1, Math.round(img.width * pre));
	const h = Math.max(1, Math.round(img.height * pre));
	const src = createCanvas(w, h);
	const sctx = src.getContext('2d');
	sctx.drawImage(img, 0, 0, w, h);
	const data = sctx.getImageData(0, 0, w, h);
	const px = data.data;

	let minX = w;
	let minY = h;
	let maxX = -1;
	let maxY = -1;
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const i = (y * w + x) * 4;
			const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
			// Nền sáng → trong suốt; vùng chuyển tiếp mờ dần để nét không răng cưa
			const keep = lum >= WHITE ? 0 : lum <= INK ? 1 : (WHITE - lum) / (WHITE - INK);
			const a = Math.round(px[i + 3] * keep);
			px[i + 3] = a;
			if (a > 40) {
				if (x < minX) minX = x;
				if (x > maxX) maxX = x;
				if (y < minY) minY = y;
				if (y > maxY) maxY = y;
			}
		}
	}
	if (maxX < 0) {
		throw httpError(
			400,
			'Không thấy nét chữ ký trong ảnh — dùng ảnh chữ ký mực tối trên nền sáng.',
		);
	}
	sctx.putImageData(data, 0, 0);

	const cw = maxX - minX + 1 + PAD * 2;
	const ch = maxY - minY + 1 + PAD * 2;
	const scale = Math.min(1, MAX_W / cw, MAX_H / ch);
	const out = createCanvas(
		Math.max(1, Math.round(cw * scale)),
		Math.max(1, Math.round(ch * scale)),
	);
	const octx = out.getContext('2d');
	octx.drawImage(src, minX - PAD, minY - PAD, cw, ch, 0, 0, out.width, out.height);
	return (await out.encode('png')).toString('base64');
};

// Dòng chức vụ dưới chữ ký: cỡ chữ (pt) lớn nhất / nhỏ nhất, tối đa 2 dòng
const CAPTION_MAX_PT = 9;
const CAPTION_MIN_PT = 6.5;
const CAPTION_COLOR = '#1a2a35';

/**
 * Ngắt `text` thành ≤ 2 dòng vừa `maxW`, giảm cỡ chữ dần tới khi vừa.
 * @param {any} ctx  CanvasRenderingContext2D của Skia
 * @param {string} text
 * @param {number} maxW
 * @param {number} k  điểm ảnh / pt
 */
const layoutCaption = (ctx, text, maxW, k) => {
	const words = text.split(/\s+/).filter(Boolean);
	for (let pt = CAPTION_MAX_PT; pt >= CAPTION_MIN_PT; pt -= 0.5) {
		ctx.font = `bold ${pt * k}px Inter`;
		const lines = [];
		let line = '';
		for (const w of words) {
			const next = line ? `${line} ${w}` : w;
			if (line && ctx.measureText(next).width > maxW) {
				lines.push(line);
				line = w;
			} else line = next;
		}
		lines.push(line);
		if (lines.length <= 2 && lines.every((l) => ctx.measureText(l).width <= maxW)) {
			return { pt, lines };
		}
	}
	// Quá dài: cỡ nhỏ nhất, cắt dòng 2 bằng dấu …
	ctx.font = `bold ${CAPTION_MIN_PT * k}px Inter`;
	const lines = [];
	let line = '';
	for (const w of words) {
		const next = line ? `${line} ${w}` : w;
		if (line && ctx.measureText(next).width > maxW) {
			lines.push(line);
			line = w;
		} else line = next;
	}
	lines.push(line);
	let second = lines.slice(1).join(' ');
	while (second && ctx.measureText(`${second}…`).width > maxW) second = second.slice(0, -1);
	return { pt: CAPTION_MIN_PT, lines: [lines[0], ...(second ? [`${second.trimEnd()}…`] : [])] };
};

/**
 * Ảnh gửi VIN-HSM cho khung chữ ký số: chữ ký tay (PNG base64 đã chuẩn hóa) đặt đúng tỉ lệ
 * khung — VIN-HSM kéo giãn ảnh cho đầy khung — và, nếu có `caption`, dòng chức vụ căn giữa
 * ngay BÊN DƯỚI nét ký (vẽ vào ảnh, vì chữ của VIN-HSM chỉ in được ở mép trên khung).
 * @param {string} b64
 * @param {{ width: number, height: number, caption?: string|null }} box  đơn vị pt
 * @returns {Promise<string>} PNG base64
 */
const fitSignatureImage = async (b64, { width, height, caption = null }) => {
	const { loadImage, createCanvas } = loadSkia();
	const img = await loadImage(Buffer.from(b64, 'base64'));
	const k = 4; // 4 điểm ảnh / pt — nét và chữ vẫn mịn khi in
	const c = createCanvas(Math.round(width * k), Math.round(height * k));
	const ctx = c.getContext('2d');
	const pad = 2 * k;
	const text = String(caption ?? '').trim();
	let captionH = 0;
	/** @type {{ pt: number, lines: string[] } | null} */
	let cap = null;
	if (text) {
		cap = layoutCaption(ctx, text, c.width - pad * 2, k);
		captionH = cap.lines.length * cap.pt * 1.25 * k + 2 * k;
	}
	const aw = c.width - pad * 2;
	const ah = c.height - pad * 2 - captionH;
	const s = Math.min(aw / img.width, ah / img.height);
	const w = img.width * s;
	const h = img.height * s;
	// Chữ ký sát dòng chức vụ (căn đáy vùng ảnh) như ký tay trên giấy
	const top = cap ? pad + (ah - h) : pad + (ah - h) / 2;
	ctx.drawImage(img, (c.width - w) / 2, top, w, h);
	if (cap) {
		ctx.font = `bold ${cap.pt * k}px Inter`;
		ctx.fillStyle = CAPTION_COLOR;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'top';
		let y = top + h + 2 * k;
		for (const l of cap.lines) {
			ctx.fillText(l, c.width / 2, y);
			y += cap.pt * 1.25 * k;
		}
	}
	return (await c.encode('png')).toString('base64');
};

module.exports = { normalizeSignatureImage, fitSignatureImage, decodeInput };
