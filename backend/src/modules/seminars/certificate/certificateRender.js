/**
 * certificateRender.js — viết thông tin từng người vào mẫu giấy chứng nhận CME
 * đã chuẩn bị (certificateTemplate.prepareTemplate) → 1 file PDF / người.
 *
 * Font: Inter đóng kèm (assets/fonts, OFL) — cùng font với ảnh thẻ đại biểu, đủ
 * dấu tiếng Việt và có sẵn trong image alpine. Font gốc của mẫu (vd UTM Avo) chỉ
 * được nhúng dạng rút gọn (thiếu chữ, không có bảng mã) nên không dùng lại được.
 * Ô có chữ nghiêng trên mẫu (Bằng chữ) → nghiêng Inter bằng phép xiên.
 */
const fs = require('fs');
const path = require('path');
const { lazyRequire } = require('../../../utils/lazyRequire');
const { BOLD_KEYS } = require('./certificateLayout');
const {
	readEmbeddedFonts,
	splitRuns,
	embeddedWidth,
	toCidHex,
	normFontName,
	fullFontPath,
} = require('./certificateFonts');

/** @type {Map<string, Buffer>} */
const fullFontBytes = new Map();
/** @type {typeof import('pdf-lib')} */
const PDFLib = lazyRequire('pdf-lib');
/** @type {any} */
const fontkit = lazyRequire('@pdf-lib/fontkit');

const FONT_DIR = path.join(__dirname, '../../../assets/fonts');
/** @type {{ regular: Buffer, bold: Buffer } | undefined} */
let fontBytes;
const fonts = () =>
	(fontBytes ??= {
		regular: fs.readFileSync(path.join(FONT_DIR, 'Inter-Regular.ttf')),
		bold: fs.readFileSync(path.join(FONT_DIR, 'Inter-Bold.ttf')),
	});

// Màu chữ điền vào = màu dãy chấm của ô trên mẫu (slot.color). Mẫu lưu trước khi
// có slot.color thì dùng xanh lá của nhãn trên mẫu chuẩn.
const FALLBACK_RGB = [0x04 / 255, 0x92 / 255, 0x40 / 255];
// Cỡ chữ tối đa cho các ô thường (dãy chấm trên mẫu hay to hơn nhãn)
const MAX_FIELD_SIZE = 12.5;
const MIN_SIZE = 7;
const RIGHT_MARGIN = 40;

// ─── Số → chữ (giờ tín chỉ) ─────────────────────────────────────────────────
const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

// 0..999 → chữ (đủ cho số tín chỉ)
const below1000 = (n) => {
	const h = Math.floor(n / 100);
	const t = Math.floor((n % 100) / 10);
	const u = n % 10;
	const parts = [];
	if (h) parts.push(DIGITS[h], 'trăm');
	if (t > 1) parts.push(DIGITS[t], 'mươi');
	else if (t === 1) parts.push('mười');
	else if (h && u) parts.push('lẻ');
	if (u) {
		if (u === 1 && t > 1) parts.push('mốt');
		else if (u === 5 && t > 0) parts.push('lăm');
		else if (u === 4 && t > 1) parts.push('tư');
		else parts.push(DIGITS[u]);
	}
	return parts.join(' ') || DIGITS[0];
};

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** 3 → "Ba"; 1.5 → "Một phẩy năm"; 12 → "Mười hai" */
const creditsInWords = (n) => {
	if (n == null || !Number.isFinite(Number(n))) return '';
	const [int, dec] = String(Math.round(Number(n) * 100) / 100).split('.');
	let s = below1000(Number(int) % 1000);
	if (dec) s += ' phẩy ' + [...dec].map((d) => DIGITS[+d]).join(' ');
	return capitalize(s);
};

/** 3 → "3"; 1.5 → "1,5" */
const formatCredits = (n) =>
	n == null || !Number.isFinite(Number(n))
		? ''
		: String(Math.round(Number(n) * 100) / 100).replace('.', ',');

/**
 * Giá trị từng ô từ dữ liệu 1 người.
 * @param {{ so?: string|null, title_prefix?: string|null, full_name: string, dob?: string|null,
 *   organization?: string|null, role?: string|null, credits?: number|null }} p
 */
const fieldValues = (p) => ({
	so: p.so || '',
	name: [p.title_prefix, p.full_name].filter(Boolean).join(' '),
	dob: p.dob || '',
	organization: p.organization || '',
	role: p.role || '',
	credits: formatCredits(p.credits),
	credits_text: creditsInWords(p.credits),
});

/**
 * Tải mẫu 1 lần, sinh PDF cho từng người.
 * @param {Buffer} templatePdf
 * @param {{ page: { width: number, height: number }, slots: Record<string, any>,
 *   texts?: any[], text_overrides?: Record<string, any> }} meta
 */
const createRenderer = async (templatePdf, meta) => {
	const { PDFDocument, StandardFonts, rgb, degrees } = PDFLib;
	const colorOf = (s) => {
		const [r, g, b] = Array.isArray(s.color) && s.color.length === 3 ? s.color : FALLBACK_RGB;
		return rgb(r, g, b);
	};
	const { regular, bold } = fonts();
	const {
		PDFHexString,
		PDFRef,
		pushGraphicsState,
		popGraphicsState,
		beginText,
		endText,
		setFillingRgbColor,
		setFontAndSize,
		setTextMatrix,
		showText,
		setStrokingRgbColor,
		setLineWidth,
		setTextRenderingMode,
		TextRenderingMode,
	} = PDFLib;
	const rgbOf = (c) =>
		Array.isArray(c) && c.length === 3
			? rgb(c[0], c[1], c[2])
			: rgb(FALLBACK_RGB[0], FALLBACK_RGB[1], FALLBACK_RGB[2]);
	// Font nhúng của mẫu — đọc 1 lần; số object giống nhau ở mọi lần load cùng bytes
	const embFonts = readEmbeddedFonts(await PDFDocument.load(templatePdf));

	/** @param {ReturnType<typeof fieldValues>} values */
	return async (values) => {
		const doc = await PDFDocument.load(templatePdf);
		doc.registerFontkit(fontkit);
		const fReg = await doc.embedFont(regular, { subset: true });
		const fBold = await doc.embedFont(bold, { subset: true });
		/** @type {import('pdf-lib').PDFFont | undefined} */
		let fTimes;
		const page = doc.getPage(0);
		// Gắn font nhúng vào Resources của trang (1 lần / font / tài liệu) → tên dùng trong Tf
		const fontKeys = new Map();
		// Font đầy đủ: nhúng (subset) 1 lần / tài liệu
		const fullEmbeds = new Map();
		const embedFull = async (file) => {
			if (!fullFontBytes.has(file)) fullFontBytes.set(file, fs.readFileSync(file));
			if (!fullEmbeds.has(file)) {
				fullEmbeds.set(file, await doc.embedFont(fullFontBytes.get(file), { subset: true }));
			}
			return fullEmbeds.get(file);
		};
		const fallbackKey = (f) => {
			if (!fontKeys.has(f)) fontKeys.set(f, page.node.newFontDictionary(f.name, f.ref));
			return fontKeys.get(f);
		};
		const fontKey = (emb) => {
			if (!fontKeys.has(emb.name)) {
				const ref = PDFRef.of(emb.ref.objectNumber, emb.ref.generationNumber);
				fontKeys.set(emb.name, page.node.newFontDictionary('CertTpl', ref));
			}
			return fontKeys.get(emb.name);
		};
		const box = page.getCropBox();
		const pageW = meta.page.width;

		for (const [key, s] of Object.entries(meta.slots)) {
			if (s.hidden) continue; // người dùng tắt ô này ở màn chỉnh vị trí
			let text = String(values[key] ?? '').trim();
			if (key === 'so' && s.suffix) text = text ? text + s.suffix : '';
			if (!text) continue;

			let font;
			if (s.serif && key === 'so') {
				// Số giấy chỉ có chữ số + đuôi ASCII → font chuẩn Times là đủ, khớp mẫu
				font = fTimes ??= await doc.embedFont(StandardFonts.TimesRoman);
			} else {
				font = BOLD_KEYS.has(key) ? fBold : fReg;
			}
			// textSize: cỡ đã chỉnh / tính lúc dò; mẫu lưu trước đó thì suy như cũ
			let size =
				s.textSize ?? (key === 'name' || key === 'so' ? s.size : Math.min(s.size, MAX_FIELD_SIZE));
			const fits = () => {
				const w = font.widthOfTextAtSize(text, size);
				if (s.align === 'center')
					return w <= Math.max(s.box.x1 - s.box.x0, pageW - RIGHT_MARGIN - s.box.x0);
				return w <= Math.max(s.x1, pageW - RIGHT_MARGIN) - s.x;
			};
			while (!fits() && size > MIN_SIZE) size -= 0.25;
			const w = font.widthOfTextAtSize(text, size);
			const x =
				s.align === 'center' ? (s.box.x0 + s.box.x1) / 2 - w / 2 : s.x + (key === 'so' ? 0 : 1);
			page.drawText(text, {
				x: box.x + x,
				y: box.y + box.height - s.baseline,
				size,
				font,
				color: colorOf(s),
				...(s.italic ? { ySkew: degrees(12) } : {}),
			});
		}

		// Dòng chữ in sẵn người dùng đã sửa (dòng gốc đã bị xoá khỏi mẫu): in bằng CHÍNH
		// font nhúng của dòng gốc (certificateFonts) cho khớp mẫu; ký tự mẫu không có thì
		// đoạn đó dùng Inter. Giữ cỡ, màu, đậm/nghiêng của dòng gốc.
		for (const [id, o] of Object.entries(meta.text_overrides || {})) {
			const t = (meta.texts || []).find((x) => x.id === id);
			if (!t || !o.text) continue;
			// Ưu tiên font ĐẦY ĐỦ đặt sẵn (in được mọi ký tự) → font nhúng của mẫu → Inter
			const fullPath = t.font ? fullFontPath(normFontName(t.font)) : null;
			const full = fullPath ? await embedFull(fullPath) : null;
			const emb = full || !t.font ? undefined : embFonts.get(normFontName(t.font));
			const fallback = full || (t.bold ? fBold : fReg);
			const runs = splitRuns(o.text, emb);
			const widthAt = (size) =>
				runs.reduce(
					(w, r) =>
						w +
						(r.embedded
							? embeddedWidth(emb, r.text, size)
							: fallback.widthOfTextAtSize(r.text, size)),
					0,
				);
			const maxW = o.align === 'center' ? pageW - 2 * RIGHT_MARGIN : pageW - RIGHT_MARGIN - o.x0;
			let size = o.size;
			while (widthAt(size) > maxW && size > MIN_SIZE) size -= 0.25;
			let x = box.x + (o.align === 'center' ? (o.x0 + o.x1) / 2 - widthAt(size) / 2 : o.x0);
			const y = box.y + box.height - o.baseline;
			const color = colorOf(t);
			// Viền mảnh cùng màu như dòng gốc (mẫu dùng để chữ dày hơn) — Tr 2 = tô + viền
			const ol = t.outline;
			const olColor = ol ? rgbOf(ol.color) : null;
			for (const r of runs) {
				const useEmb = r.embedded;
				const key = useEmb ? fontKey(emb) : fallbackKey(fallback);
				const hex = useEmb ? PDFHexString.of(toCidHex(emb, r.text)) : fallback.encodeText(r.text);
				// Inter không có bản nghiêng — xiên khi dòng gốc là chữ nghiêng
				const skew = !useEmb && !full && t.italic ? Math.tan((12 * Math.PI) / 180) : 0;
				page.pushOperators(
					pushGraphicsState(),
					beginText(),
					setFillingRgbColor(color.red, color.green, color.blue),
					...(ol
						? [
								setStrokingRgbColor(olColor.red, olColor.green, olColor.blue),
								setLineWidth(ol.width),
								setTextRenderingMode(TextRenderingMode.FillAndOutline),
							]
						: []),
					setFontAndSize(key, size),
					setTextMatrix(1, 0, skew, 1, x, y),
					showText(hex),
					endText(),
					popGraphicsState(),
				);
				x += useEmb ? embeddedWidth(emb, r.text, size) : fallback.widthOfTextAtSize(r.text, size);
			}
		}
		return Buffer.from(await doc.save());
	};
};

module.exports = { createRenderer, fieldValues, creditsInWords, formatCredits };
