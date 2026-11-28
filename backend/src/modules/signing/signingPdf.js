/**
 * signingPdf.js — dựng PDF 1 trang A4 dạng "phiếu" (tiêu đề, các dòng nhãn: giá trị, đoạn
 * văn) có chừa sẵn khung chữ ký số ở góc dưới phải. Trả kèm tọa độ khung (pt, gốc dưới-trái)
 * để VIN-HSM đặt chữ ký đúng chỗ. Dùng cho phiếu phê duyệt đề tài và bản ký thử.
 * Font Inter đóng kèm (src/assets/fonts) — đủ dấu tiếng Việt.
 */
const fs = require('fs');
const path = require('path');
const { lazyRequire } = require('../../utils/lazyRequire');

/** @type {typeof import('pdf-lib')} */
const PDFLib = lazyRequire('pdf-lib');
/** @type {any} */
const fontkit = lazyRequire('@pdf-lib/fontkit');

const FONT_DIR = path.join(__dirname, '../../assets/fonts');
/** @type {{ regular: Buffer, bold: Buffer } | undefined} */
let fontBytes;
const fonts = () =>
	(fontBytes ??= {
		regular: fs.readFileSync(path.join(FONT_DIR, 'Inter-Regular.ttf')),
		bold: fs.readFileSync(path.join(FONT_DIR, 'Inter-Bold.ttf')),
	});

const HOSPITAL = 'BỆNH VIỆN HỮU NGHỊ ĐA KHOA NGHỆ AN';
const W = 595.28;
const H = 841.89;
const M = 56;
// Khung chữ ký số (VIN-HSM vẽ chữ "Ký bởi..." vào đây)
const SIG_BOX = Object.freeze({ width: 220, height: 70 });

/**
 * @param {{ unit?: string, title: string, subtitle?: string, fields?: [string, string][],
 *   paragraphs?: { heading?: string, text: string }[], signRole: string, signName: string,
 *   placeDate: string, docTitle?: string }} d
 * @returns {Promise<{ pdf: Buffer, box: { page: number, x: number, y: number, width: number, height: number } }>}
 */
const renderSheet = async (d) => {
	const { PDFDocument, rgb } = PDFLib;
	const doc = await PDFDocument.create();
	doc.registerFontkit(fontkit);
	const f = fonts();
	const regular = await doc.embedFont(f.regular, { subset: true });
	const bold = await doc.embedFont(f.bold, { subset: true });
	doc.setTitle(d.docTitle || d.title);
	doc.setAuthor('Bệnh viện Hữu nghị Đa khoa Nghệ An');
	doc.setCreator('Hospital RMS');

	const page = doc.addPage([W, H]);
	const ink = rgb(0.1, 0.12, 0.14);
	const muted = rgb(0.38, 0.42, 0.47);
	const width = (s, font, size) => font.widthOfTextAtSize(String(s), size);
	const text = (s, x, y, { font = regular, size = 11, color = ink } = {}) =>
		page.drawText(String(s), { x, y, size, font, color });
	const center = (s, y, opts = {}) => {
		const font = opts.font ?? regular;
		const size = opts.size ?? 11;
		text(s, (W - width(s, font, size)) / 2, y, opts);
	};
	// Ngắt dòng theo bề rộng; trả các dòng
	const wrap = (s, font, size, max) => {
		const out = [];
		for (const para of String(s ?? '').split(/\r?\n/)) {
			let line = '';
			for (const w of para.split(/\s+/).filter(Boolean)) {
				const next = line ? `${line} ${w}` : w;
				if (line && width(next, font, size) > max) {
					out.push(line);
					line = w;
				} else line = next;
			}
			out.push(line);
		}
		return out;
	};

	let y = H - M;
	text(HOSPITAL, M, y, { font: bold, size: 10 });
	if (d.unit) text(d.unit, M, y - 14, { size: 10, color: muted });
	const nat = 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM';
	text(nat, W - M - width(nat, bold, 10), y, { font: bold, size: 10 });
	const motto = 'Độc lập - Tự do - Hạnh phúc';
	text(motto, W - M - width(motto, bold, 10.5) - 22, y - 14, { font: bold, size: 10.5 });

	y -= 70;
	center(d.title.toUpperCase(), y, { font: bold, size: 15 });
	if (d.subtitle) {
		y -= 20;
		center(d.subtitle, y, { size: 11, color: muted });
	}
	y -= 36;

	const labelW = 150;
	for (const [label, value] of d.fields ?? []) {
		text(`${label}:`, M, y, { size: 11, color: muted });
		const lines = wrap(value || '—', regular, 11, W - 2 * M - labelW);
		for (const [i, line] of lines.entries()) {
			text(line, M + labelW, y - i * 15, { size: 11 });
		}
		y -= lines.length * 15 + 7;
	}

	for (const p of d.paragraphs ?? []) {
		y -= 8;
		if (p.heading) {
			text(p.heading, M, y, { font: bold, size: 11 });
			y -= 17;
		}
		// Giữ đoạn văn không đè lên khu chữ ký
		const lines = wrap(p.text, regular, 11, W - 2 * M);
		for (const line of lines) {
			if (y < M + SIG_BOX.height + 90) {
				text('…', M, y, { size: 11, color: muted });
				y -= 15;
				break;
			}
			text(line, M, y, { size: 11 });
			y -= 15;
		}
	}

	// Khối ký: ngày tháng, chức danh, khung chữ ký số, họ tên
	const blockW = SIG_BOX.width;
	const bx = W - M - blockW;
	const by = M + 40;
	const cx = (s, yy, opts = {}) => {
		const font = opts.font ?? regular;
		const size = opts.size ?? 11;
		text(s, bx + (blockW - width(s, font, size)) / 2, yy, opts);
	};
	cx(d.placeDate, by + SIG_BOX.height + 46, { size: 10.5, color: muted });
	cx(d.signRole.toUpperCase(), by + SIG_BOX.height + 28, { font: bold, size: 11 });
	cx('(Ký số)', by + SIG_BOX.height + 14, { size: 9.5, color: muted });
	page.drawRectangle({
		x: bx,
		y: by,
		width: SIG_BOX.width,
		height: SIG_BOX.height,
		borderColor: rgb(0.8, 0.82, 0.85),
		borderWidth: 0.6,
		borderDashArray: [3, 3],
	});
	cx(d.signName, by - 18, { font: bold, size: 11 });

	const pdf = Buffer.from(await doc.save({ useObjectStreams: false }));
	return { pdf, box: { page: 1, x: bx, y: by, ...SIG_BOX } };
};

const pad2 = (n) => String(n).padStart(2, '0');
/** "Nghệ An, ngày 27 tháng 11 năm 2026" theo giờ VN @param {Date} [now] */
const placeDateVN = (now = new Date()) => {
	const d = new Date(now.getTime() + 7 * 3600 * 1000);
	return `Nghệ An, ngày ${pad2(d.getUTCDate())} tháng ${pad2(d.getUTCMonth() + 1)} năm ${d.getUTCFullYear()}`;
};
/** "27/11/2026 14:05" theo giờ VN @param {Date} [now] */
const stampVN = (now = new Date()) => {
	const d = new Date(now.getTime() + 7 * 3600 * 1000);
	return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
};

module.exports = { renderSheet, placeDateVN, stampVN, SIG_BOX };
