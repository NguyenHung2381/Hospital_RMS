/**
 * Ảnh PNG thẻ đại biểu hội nghị (đính kèm email đăng ký) — cùng bố cục với
 * mailService.renderSeminarBadgeEmail để người tham dự lưu/in được.
 * Font Be Vietnam Pro đóng kèm (assets/fonts, OFL) vì image alpine không có
 * font hỗ trợ tiếng Việt.
 */
const path = require('path');
const QRCode = require('qrcode');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

const ASSETS = path.join(__dirname, '../assets');
GlobalFonts.registerFromPath(path.join(ASSETS, 'fonts/BeVietnamPro_400Regular.ttf'), 'BVP');
GlobalFonts.registerFromPath(path.join(ASSETS, 'fonts/BeVietnamPro_700Bold.ttf'), 'BVP');

const C = {
	primary: '#0a9b4a',
	dark: '#087c3b',
	ink: '#064d26',
	pale: '#e7f5ed',
	line: '#d1e7da',
	text: '#111827',
	muted: '#6b7280',
};
const W = 600; // đơn vị logic; ảnh xuất ×SCALE
const SCALE = 2;
const PAD = 40;
const HEADER = 200;
const QR = 300;

const font = (size, bold) => `${bold ? 700 : 400} ${size}px BVP`;

// Ngắt dòng theo từ, tối đa maxLines (dòng cuối thêm "…" nếu bị cắt)
const wrap = (ctx, text, f, maxW, maxLines) => {
	ctx.font = f;
	const lines = [];
	let cur = '';
	for (const w of String(text || '')
		.split(/\s+/)
		.filter(Boolean)) {
		const next = cur ? `${cur} ${w}` : w;
		if (cur && ctx.measureText(next).width > maxW) {
			lines.push(cur);
			cur = w;
		} else cur = next;
	}
	if (cur) lines.push(cur);
	if (lines.length > maxLines) {
		lines.length = maxLines;
		let last = lines[maxLines - 1];
		while (last && ctx.measureText(`${last}…`).width > maxW) last = last.slice(0, -1);
		lines[maxLines - 1] = `${last}…`;
	}
	return lines;
};

const renderSeminarBadgePng = async ({
	holder,
	organization,
	seminarTitle,
	when,
	location,
	ticketUrl,
	code,
}) => {
	const measure = createCanvas(1, 1).getContext('2d');
	const maxW = W - PAD * 2;
	const blocks = [
		// [lines, font, color, lineHeight, gapAfter]
		[wrap(measure, seminarTitle, font(24, true), maxW, 3), font(24, true), C.dark, 32, 8],
		[
			wrap(measure, [when, location].filter(Boolean).join(' · '), font(17), maxW, 2),
			font(17),
			C.muted,
			26,
			0,
		],
	];
	const nameLines = wrap(measure, holder, font(32, true), maxW, 2);
	const orgLines = wrap(measure, organization, font(19), maxW, 2);
	const infoH = blocks.reduce((h, [l, , , lh, gap]) => h + l.length * lh + gap, 0);
	const H =
		HEADER +
		28 +
		infoH +
		24 +
		QR +
		34 +
		28 +
		nameLines.length * 42 +
		orgLines.length * 28 +
		46 +
		PAD;

	const canvas = createCanvas(W * SCALE, H * SCALE);
	const ctx = canvas.getContext('2d');
	ctx.scale(SCALE, SCALE);
	ctx.textAlign = 'center';
	ctx.textBaseline = 'top';

	// Thẻ bo góc; nửa trên xanh
	ctx.beginPath();
	ctx.roundRect(0, 0, W, H, 28);
	ctx.clip();
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(0, 0, W, H);
	ctx.fillStyle = C.primary;
	ctx.fillRect(0, 0, W, HEADER);

	const logo = await loadImage(path.join(ASSETS, 'mail-logo.png'));
	ctx.fillStyle = '#ffffff';
	ctx.beginPath();
	ctx.arc(W / 2, 64, 40, 0, Math.PI * 2);
	ctx.fill();
	ctx.drawImage(logo, W / 2 - 34, 30, 68, 68);
	ctx.font = font(16);
	ctx.fillText('Bệnh viện Hữu Nghị Đa Khoa Nghệ An', W / 2, 118);
	ctx.font = font(34, true);
	ctx.letterSpacing = '6px';
	ctx.fillText('THẺ ĐẠI BIỂU', W / 2 + 3, 146); // +3: bù khoảng giãn sau ký tự cuối
	ctx.letterSpacing = '0px';

	let y = HEADER + 28;
	for (const [lines, f, color, lh, gap] of blocks) {
		ctx.font = f;
		ctx.fillStyle = color;
		for (const l of lines) {
			ctx.fillText(l, W / 2, y);
			y += lh;
		}
		y += gap;
	}

	// QR vẽ thẳng từ ma trận (sắc nét ở mọi tỉ lệ)
	y += 24;
	const qr = QRCode.create(ticketUrl, { errorCorrectionLevel: 'M' }).modules;
	const cell = QR / qr.size;
	ctx.fillStyle = C.ink;
	for (let r = 0; r < qr.size; r++)
		for (let c = 0; c < qr.size; c++)
			if (qr.get(r, c)) ctx.fillRect((W - QR) / 2 + c * cell, y + r * cell, cell + 0.3, cell + 0.3);
	y += QR + 8;
	ctx.font = font(13);
	ctx.fillStyle = '#9ca3af';
	ctx.fillText(code.slice(0, 8).toUpperCase(), W / 2, y);
	y += 26;

	ctx.strokeStyle = C.line;
	ctx.setLineDash([8, 6]);
	ctx.beginPath();
	ctx.moveTo(PAD, y);
	ctx.lineTo(W - PAD, y);
	ctx.stroke();
	ctx.setLineDash([]);
	y += 28;

	ctx.font = font(32, true);
	ctx.fillStyle = C.text;
	for (const l of nameLines) {
		ctx.fillText(l, W / 2, y);
		y += 42;
	}
	ctx.font = font(19);
	ctx.fillStyle = '#4b5563';
	for (const l of orgLines) {
		ctx.fillText(l, W / 2, y);
		y += 28;
	}

	y += 14;
	ctx.font = font(15, true);
	const pillW = ctx.measureText('ĐẠI BIỂU').width + 36;
	ctx.fillStyle = C.pale;
	ctx.beginPath();
	ctx.roundRect((W - pillW) / 2, y, pillW, 32, 16);
	ctx.fill();
	ctx.fillStyle = C.dark;
	ctx.fillText('ĐẠI BIỂU', W / 2, y + 7);

	return canvas.encode('png');
};

module.exports = { renderSeminarBadgePng };
