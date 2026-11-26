/**
 * tuitionReceiptPdf.js — phiếu thu học phí (PDF, A5 ngang) cho khoản đã xác nhận.
 * Phiếu thu NỘI BỘ của hệ thống quản lý đào tạo — không thay hóa đơn điện tử.
 * Font Inter đóng kèm (src/assets/fonts) — đủ dấu tiếng Việt.
 */
const fs = require('fs');
const path = require('path');
const { lazyRequire } = require('../../../utils/lazyRequire');

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

// ─── Số tiền bằng chữ ────────────────────────────────────────────────────────
const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
const UNITS = ['', 'nghìn', 'triệu', 'tỷ'];

// 1 nhóm 3 chữ số. full = nhóm không đứng đầu (phải đọc "không trăm", "linh")
const readTriple = (n, full) => {
	const h = Math.floor(n / 100);
	const t = Math.floor((n % 100) / 10);
	const u = n % 10;
	const out = [];
	if (h || full) out.push(DIGITS[h], 'trăm');
	if (t > 1) out.push(DIGITS[t], 'mươi');
	else if (t === 1) out.push('mười');
	else if (u && (h || full)) out.push('linh');
	if (u) {
		if (u === 1 && t > 1) out.push('mốt');
		else if (u === 5 && t > 0) out.push('lăm');
		else if (u === 4 && t > 1) out.push('tư');
		else out.push(DIGITS[u]);
	}
	return out.join(' ');
};

/** 1500000 ⇒ "Một triệu năm trăm nghìn đồng" (đến hàng nghìn tỷ). */
const vndInWords = (amount) => {
	let n = Math.round(Math.abs(Number(amount) || 0));
	if (n === 0) return 'Không đồng';
	const groups = [];
	while (n > 0) {
		groups.push(n % 1000);
		n = Math.floor(n / 1000);
	}
	const parts = [];
	for (let i = groups.length - 1; i >= 0; i--) {
		const g = groups[i];
		if (!g) {
			// "tỷ" vẫn phải đọc khi nhóm tỷ = 0 nhưng còn nhóm nghìn tỷ phía trước
			if (i % 3 === 0 && i > 0 && parts.length) parts.push('tỷ');
			continue;
		}
		parts.push(readTriple(g, i < groups.length - 1));
		const unit = i === 0 ? '' : i % 3 === 0 ? 'tỷ' : UNITS[i % 3];
		if (unit) parts.push(unit);
	}
	const s = `${parts.join(' ').replace(/\s+/g, ' ').trim()} đồng`;
	return s.charAt(0).toUpperCase() + s.slice(1);
};

// ─── Vẽ phiếu ────────────────────────────────────────────────────────────────
const fmtMoney = (n) => `${Number(n).toLocaleString('vi-VN')} đồng`;
const pad2 = (n) => String(n).padStart(2, '0');
const toDate = (v) => (v instanceof Date ? v : v ? new Date(v) : null);
const dmy = (v) => {
	const d = toDate(v);
	if (!d || Number.isNaN(d.getTime())) return '';
	// Cột date / timestamp không múi giờ: đọc theo thành phần UTC như các nơi khác
	return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
};

/**
 * @param {Record<string, any>} r  tuitionService.receiptData
 * @param {{ hospital: string, unit: string }} org
 * @returns {Promise<Buffer>}
 */
const renderReceipt = async (r, org) => {
	const { PDFDocument, rgb } = PDFLib;
	const doc = await PDFDocument.create();
	doc.registerFontkit(fontkit);
	const f = fonts();
	const regular = await doc.embedFont(f.regular, { subset: true });
	const bold = await doc.embedFont(f.bold, { subset: true });
	doc.setTitle(`Phiếu thu ${r.receipt_no}`);
	doc.setAuthor(org.hospital);

	const W = 595.28;
	const H = 419.53;
	const page = doc.addPage([W, H]);
	const M = 36;
	const ink = rgb(0.1, 0.12, 0.14);
	const muted = rgb(0.36, 0.4, 0.45);

	const text = (s, x, y, { font = regular, size = 10, color = ink } = {}) =>
		page.drawText(String(s), { x, y, size, font, color });
	const width = (s, font, size) => font.widthOfTextAtSize(String(s), size);
	const center = (s, y, opts = {}) => {
		const font = opts.font ?? regular;
		const size = opts.size ?? 10;
		text(s, (W - width(s, font, size)) / 2, y, opts);
	};
	// Dòng "Nhãn: giá trị" — giá trị dài thì xuống dòng trong khoảng còn lại
	let y = H - M;
	const field = (label, value, { boldValue = false } = {}) => {
		const size = 10.5;
		const lx = M;
		text(`${label}:`, lx, y, { size, color: muted });
		const vx = lx + 150;
		const max = W - M - vx;
		const font = boldValue ? bold : regular;
		const words = String(value || '—').split(/\s+/);
		let line = '';
		for (const w of words) {
			const next = line ? `${line} ${w}` : w;
			if (width(next, font, size) > max && line) {
				text(line, vx, y, { font, size });
				y -= 15;
				line = w;
			} else line = next;
		}
		text(line, vx, y, { font, size });
		y -= 19;
	};

	text(org.hospital.toUpperCase(), M, y, { font: bold, size: 9.5 });
	const no = `Số: ${r.receipt_no}`;
	text(no, W - M - width(no, bold, 10), y, { font: bold, size: 10 });
	y -= 13;
	text(org.unit, M, y, { size: 9, color: muted });
	y -= 36;
	center('PHIẾU THU HỌC PHÍ', y, { font: bold, size: 17 });
	y -= 18;
	const day = toDate(r.reviewed_at) ?? new Date();
	center(
		`Ngày ${pad2(day.getUTCDate())} tháng ${pad2(day.getUTCMonth() + 1)} năm ${day.getUTCFullYear()}`,
		y,
		{
			size: 10,
			color: muted,
		},
	);
	y -= 30;

	field(
		'Họ và tên người nộp',
		`${r.trainee_name}${r.trainee_id ? ` (mã học viên ${r.trainee_id})` : ''}`,
		{
			boldValue: true,
		},
	);
	field('Khóa học', r.course_name);
	if (r.program_name) field('Chương trình', r.program_name);
	field('Số tiền', fmtMoney(r.amount), { boldValue: true });
	field('Bằng chữ', `${vndInWords(r.amount)}.`);
	field(
		'Hình thức',
		r.method === 'cash'
			? 'Tiền mặt'
			: `Chuyển khoản${r.transfer_ref ? ` — mã giao dịch ${r.transfer_ref}` : ''}`,
	);
	field('Ngày nộp', dmy(r.paid_date));

	// Chữ ký: người xác nhận (đã xác nhận trên hệ thống)
	const sx = W - M - 170;
	const signY = Math.max(y - 4, 70);
	text('Người xác nhận', sx + (170 - width('Người xác nhận', bold, 10)) / 2, signY, {
		font: bold,
		size: 10,
	});
	const who = r.reviewer_name || '';
	text(
		'(đã xác nhận trên hệ thống)',
		sx + (170 - width('(đã xác nhận trên hệ thống)', regular, 8.5)) / 2,
		signY - 13,
		{
			size: 8.5,
			color: muted,
		},
	);
	if (who)
		text(who, sx + (170 - width(who, bold, 10.5)) / 2, signY - 44, { font: bold, size: 10.5 });

	text('Phiếu thu nội bộ do hệ thống quản lý đào tạo cấp, không thay thế hóa đơn điện tử.', M, 22, {
		size: 8,
		color: muted,
	});
	return Buffer.from(await doc.save());
};

module.exports = { vndInWords, renderReceipt };
