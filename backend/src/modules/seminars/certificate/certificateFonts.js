/**
 * certificateFonts.js — dùng lại font NHÚNG trong mẫu PDF để in các dòng chữ người
 * dùng sửa (tên hội nghị, ngày tháng...) cho khớp kiểu chữ của mẫu.
 *
 * Font trong mẫu là bản rút gọn (subset) Type0 / Identity-H: chỉ có glyph của
 * các ký tự đã xuất hiện trên mẫu, không có bảng cmap — nhưng PDF kèm ToUnicode
 * (CID → ký tự) và W (độ rộng từng CID). Đảo ngược ToUnicode là viết được chữ mới
 * bằng chính font đó, miễn ký tự đã có trên mẫu. Ký tự mẫu không có → bên gọi in
 * bằng font thay thế (Inter) cho riêng đoạn đó.
 */
const fs = require('fs');
const path = require('path');
const { lazyRequire } = require('../../../utils/lazyRequire');
const { UPLOADS_ROOT } = require('../../../utils/uploadPaths');
/** @type {typeof import('pdf-lib')} */
const PDFLib = lazyRequire('pdf-lib');

// "/RVFZTK+UTM-Avo" → "utmavo" (bỏ tiền tố subset, ký tự lạ)
const normFontName = (name) =>
	String(name || '')
		.replace(/^\//, '')
		.replace(/^[A-Z]{6}\+/, '')
		.toLowerCase()
		.replace(/[^a-z0-9]/g, '');

// Chuỗi hex UTF-16BE trong CMap → chuỗi JS (NFC)
const hexToText = (hex) => {
	const bytes = Buffer.from(hex.replace(/\s+/g, ''), 'hex');
	let s = '';
	for (let i = 0; i + 1 < bytes.length; i += 2) s += String.fromCharCode(bytes.readUInt16BE(i));
	return s.normalize('NFC');
};

/**
 * ToUnicode CMap → Map<ký tự, CID>. Chỉ nhận ánh xạ ra ĐÚNG 1 ký tự (ligature
 * "fi"... bỏ qua). Nhiều CID cùng 1 ký tự thì giữ CID đầu tiên.
 * @param {string} cmap
 */
const parseToUnicode = (cmap) => {
	/** @type {Map<string, number>} */
	const map = new Map();
	const put = (cid, text) => {
		if ([...text].length === 1 && !map.has(text)) map.set(text, cid);
	};
	for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
		for (const m of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
			put(parseInt(m[1], 16), hexToText(m[2]));
		}
	}
	for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
		const re = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(?:<([0-9A-Fa-f]+)>|\[([^\]]*)\])/g;
		for (const m of block[1].matchAll(re)) {
			const lo = parseInt(m[1], 16);
			const hi = parseInt(m[2], 16);
			if (hi - lo > 0xffff) continue;
			if (m[3]) {
				const base = Buffer.from(m[3], 'hex');
				for (let cid = lo; cid <= hi; cid++) {
					const b = Buffer.from(base);
					b.writeUInt16BE((b.readUInt16BE(b.length - 2) + (cid - lo)) & 0xffff, b.length - 2);
					put(cid, hexToText(b.toString('hex')));
				}
			} else {
				const items = [...m[4].matchAll(/<([0-9A-Fa-f]+)>/g)];
				items.forEach((it, i) => put(lo + i, hexToText(it[1])));
			}
		}
	}
	return map;
};

// Mảng W của CIDFont: [c [w1 w2 ...]  c1 c2 w ...] → Map<CID, độ rộng/1000 em>
const parseWidths = (W) => {
	/** @type {Map<number, number>} */
	const widths = new Map();
	if (!W) return widths;
	const { PDFArray, PDFNumber } = PDFLib;
	const items = W.asArray();
	const num = (o) => (o instanceof PDFNumber ? o.asNumber() : NaN);
	for (let i = 0; i < items.length;) {
		const first = num(items[i]);
		const next = items[i + 1];
		if (next instanceof PDFArray) {
			next.asArray().forEach((w, k) => widths.set(first + k, num(w)));
			i += 2;
		} else {
			const last = num(next);
			const w = num(items[i + 2]);
			for (let c = first; c <= last; c++) widths.set(c, w);
			i += 3;
		}
	}
	return widths;
};

/**
 * @typedef {{ name: string, ref: { objectNumber: number, generationNumber: number },
 *   map: Map<string, number>, widths: Map<number, number>, dw: number }} EmbeddedFont
 */

/**
 * Các font Type0/Identity-H có ToUnicode trong PDF, theo tên đã chuẩn hoá.
 * @param {import('pdf-lib').PDFDocument} doc
 * @returns {Map<string, EmbeddedFont>}
 */
const readEmbeddedFonts = (doc) => {
	const { PDFDict, PDFName, PDFArray, PDFRawStream, PDFNumber, decodePDFRawStream } = PDFLib;
	/** @type {Map<string, EmbeddedFont>} */
	const fonts = new Map();
	const get = (dict, key) => dict.get(PDFName.of(key));
	for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
		if (!(obj instanceof PDFDict)) continue;
		if (String(get(obj, 'Type')) !== '/Font' || String(get(obj, 'Subtype')) !== '/Type0') continue;
		if (!/Identity-H/.test(String(get(obj, 'Encoding')))) continue;
		try {
			const tu = doc.context.lookup(get(obj, 'ToUnicode'));
			if (!(tu instanceof PDFRawStream)) continue;
			const cmap = Buffer.from(decodePDFRawStream(tu).decode()).toString('latin1');
			const descArr = doc.context.lookup(get(obj, 'DescendantFonts'), PDFArray);
			const desc = doc.context.lookup(descArr.get(0), PDFDict);
			const W = doc.context.lookup(get(desc, 'W'));
			const dwObj = doc.context.lookup(get(desc, 'DW'));
			const name = normFontName(String(get(obj, 'BaseFont')));
			if (!name || fonts.has(name)) continue;
			fonts.set(name, {
				name,
				ref: { objectNumber: ref.objectNumber, generationNumber: ref.generationNumber },
				map: parseToUnicode(cmap),
				widths: parseWidths(W instanceof PDFArray ? W : null),
				dw: dwObj instanceof PDFNumber ? dwObj.asNumber() : 1000,
			});
		} catch {
			// font hỏng / thiếu bảng — bỏ qua, bên gọi dùng font thay thế
		}
	}
	return fonts;
};

/**
 * Ký tự từng font nhúng có — lưu vào template.json để giao diện báo ký tự thiếu.
 * @param {Buffer} pdf
 * @returns {Promise<Record<string, string>>}
 */
const fontCharsets = async (pdf) => {
	const doc = await PDFLib.PDFDocument.load(pdf);
	return Object.fromEntries(
		[...readEmbeddedFonts(doc)].map(([name, f]) => [name, [...f.map.keys()].join('')]),
	);
};

// ─── Font đầy đủ đặt sẵn ─────────────────────────────────────────────────────
// Có file font đầy đủ (vd "UTM Avo.ttf") trong thư mục này thì dòng sửa in TOÀN BỘ
// bằng font đó (không còn ký tự thiếu). Tên file khớp tên font sau khi chuẩn hoá:
// "UTM Avo.ttf" ↔ UTM-Avo, "UTMAvoBold.ttf" ↔ UTMAvoBold. Font thương mại → không
// kèm theo mã nguồn, quản trị tự đặt vào (volume uploads hoặc thư mục cấu hình).
const FULL_FONT_DIR =
	process.env.CERTIFICATE_FONTS_DIR || path.join(UPLOADS_ROOT, 'certificate-fonts');
let fullFontsCache = null;
let fullFontsAt = 0;
/** @returns {Map<string, string>} tên chuẩn hoá → đường dẫn file */
const fullFonts = () => {
	if (fullFontsCache && Date.now() - fullFontsAt < 60_000) return fullFontsCache;
	const map = new Map();
	try {
		for (const f of fs.readdirSync(FULL_FONT_DIR)) {
			if (/\.(ttf|otf)$/i.test(f))
				map.set(normFontName(path.parse(f).name), path.join(FULL_FONT_DIR, f));
		}
	} catch {
		// chưa có thư mục — không dùng font đầy đủ
	}
	fullFontsCache = map;
	fullFontsAt = Date.now();
	return map;
};
const hasFullFont = (normName) => fullFonts().has(normName);
const fullFontPath = (normName) => fullFonts().get(normName);

/**
 * Chia chữ thành các đoạn: in được bằng font nhúng / phải dùng font thay thế.
 * Khoảng trắng đi theo đoạn đứng trước (không tạo đoạn lẻ chỉ có dấu cách).
 * @param {string} text
 * @param {EmbeddedFont | undefined} font
 * @returns {{ text: string, embedded: boolean }[]}
 */
const splitRuns = (text, font) => {
	const chars = [...text.normalize('NFC')];
	if (!font) return [{ text: chars.join(''), embedded: false }];
	/** @type {{ text: string, embedded: boolean }[]} */
	const runs = [];
	for (const c of chars) {
		const has = font.map.has(c);
		const last = runs[runs.length - 1];
		if (last && (last.embedded === has || (c === ' ' && !has))) last.text += c;
		else runs.push({ text: c, embedded: has });
	}
	return runs;
};

/** Độ rộng (pt) của đoạn chữ in bằng font nhúng. */
const embeddedWidth = (font, text, size) =>
	[...text].reduce((w, c) => {
		const cid = font.map.get(c);
		return w + ((cid != null ? (font.widths.get(cid) ?? font.dw) : font.dw) * size) / 1000;
	}, 0);

/** Chuỗi CID hex 4 chữ số (Identity-H) cho toán tử Tj. */
const toCidHex = (font, text) =>
	[...text].map((c) => (font.map.get(c) ?? 0).toString(16).padStart(4, '0')).join('');

module.exports = {
	readEmbeddedFonts,
	splitRuns,
	embeddedWidth,
	toCidHex,
	fontCharsets,
	hasFullFont,
	fullFontPath,
	normFontName,
	_test: { parseToUnicode, hexToText },
};
