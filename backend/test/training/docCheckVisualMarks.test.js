// Dò dấu đỏ + chữ ký tay (docCheck/signature/visualMarks.js) trên trang vẽ bằng @napi-rs/canvas.
// Danh sách từ OCR được giả lập từ chính chỗ vẽ chữ (toạ độ + độ tin cậy) nên phần lớn test
// không cần Tesseract; test OCR thật bỏ qua khi máy không có Tesseract + gói tiếng Việt.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createCanvas } = require('@napi-rs/canvas');
const {
	detectMarks,
} = require('../../src/modules/training/registration/docCheck/signature/visualMarks');
const analyzer = require('../../src/modules/training/registration/docCheck/docCheckAnalyzer');

const A4_W = 1240; // A4 ở 150 dpi
const A4_H = 1754;
const FONT = 'Arial, "DejaVu Sans", sans-serif';

/**
 * Vẽ 1 trang Quyết định giả lập.
 * @param {{ seal?: boolean, signature?: boolean, redTitle?: boolean, bw?: boolean,
 *   scale?: number, sigInk?: string }} [o]
 */
const drawPage = (o = {}) => {
	const s = o.scale ?? 1;
	const W = Math.round(A4_W * s);
	const H = Math.round(A4_H * s);
	const canvas = createCanvas(W, H);
	const ctx = canvas.getContext('2d');
	ctx.scale(s, s);
	ctx.fillStyle = '#faf5e8'; // giấy scan màu hơi ngả vàng
	ctx.fillRect(0, 0, A4_W, A4_H);
	ctx.textBaseline = 'alphabetic';

	const words = [];
	let lineNo = 0;
	/** Viết 1 dòng chữ và ghi lại từ OCR giả lập (toạ độ ảnh đã scale). */
	const text = (
		str,
		x,
		y,
		size,
		{ bold = false, color = '#111', align = 'left', conf = 92 } = {},
	) => {
		ctx.font = `${bold ? 'bold ' : ''}${size}px ${FONT}`;
		ctx.fillStyle = color;
		const total = ctx.measureText(str).width;
		let cx = align === 'center' ? x - total / 2 : x;
		ctx.fillText(str, cx, y);
		const line = `1.1.1.${++lineNo}`;
		for (const wd of str.split(' ')) {
			const ww = ctx.measureText(wd).width;
			words.push({
				text: wd,
				conf,
				left: Math.round(cx * s),
				top: Math.round((y - size * 0.85) * s),
				width: Math.round(ww * s),
				height: Math.round(size * s),
				line,
			});
			cx += ww + ctx.measureText(' ').width;
		}
	};

	text('BỆNH VIỆN ĐA KHOA TỈNH', 250, 100, 24, { bold: true, align: 'center' });
	text('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', 880, 100, 24, { bold: true, align: 'center' });
	text('Độc lập - Tự do - Hạnh phúc', 880, 135, 24, { align: 'center' });
	if (o.redTitle) {
		text('QUYẾT ĐỊNH', 620, 300, 44, { bold: true, color: '#d0202a', align: 'center' });
		ctx.fillStyle = '#d0202a';
		ctx.fillRect(420, 312, 400, 4); // gạch chân đỏ
		ctx.strokeStyle = '#d0202a';
		ctx.lineWidth = 5;
		ctx.beginPath();
		ctx.arc(110, 90, 32, 0, Math.PI * 2); // logo nhỏ dạng vành đỏ
		ctx.stroke();
	} else {
		text('QUYẾT ĐỊNH', 620, 300, 44, { bold: true, align: 'center' });
	}
	text('GIÁM ĐỐC BỆNH VIỆN ĐA KHOA TỈNH', 620, 350, 26, { bold: true, align: 'center' });
	const body = [
		'Căn cứ Luật Viên chức ngày 15 tháng 11 năm 2010;',
		'Căn cứ Nghị định số 101/2017/NĐ-CP về đào tạo, bồi dưỡng cán bộ;',
		'Theo đề nghị của Trưởng phòng Tổ chức cán bộ,',
		'Điều 1. Cử bà Nguyễn Văn An, viên chức khoa Nội, tham gia khóa học',
		'đào tạo liên tục tại Bệnh viện từ ngày 01/12/2026 đến ngày 30/12/2026.',
		'Điều 2. Kinh phí đào tạo do đơn vị chi trả theo quy định hiện hành.',
		'Điều 3. Quyết định có hiệu lực kể từ ngày ký.',
		'Thủ trưởng các đơn vị liên quan chịu trách nhiệm thi hành.',
		'Trưởng khoa Nội và bà Nguyễn Văn An chịu trách nhiệm thi hành quyết định này.',
	];
	body.forEach((l, i) => text(l, 120, 420 + i * 38, 26));

	text('Nơi nhận:', 100, 1050, 24, { bold: true });
	text('- Như Điều 3;', 100, 1085, 22);
	text('- Lưu: VT, TCCB.', 100, 1115, 22);
	text('KT. GIÁM ĐỐC', 900, 1050, 28, { bold: true, align: 'center' });
	text('PHÓ GIÁM ĐỐC', 900, 1090, 28, { bold: true, align: 'center' });

	if (o.signature !== false) {
		ctx.strokeStyle = o.sigInk ?? '#1e3a9e';
		ctx.lineWidth = 4;
		ctx.lineCap = 'round';
		ctx.beginPath();
		ctx.moveTo(800, 1230);
		ctx.bezierCurveTo(830, 1120, 870, 1130, 860, 1220);
		ctx.bezierCurveTo(850, 1280, 900, 1150, 940, 1180);
		ctx.bezierCurveTo(980, 1210, 960, 1250, 1010, 1190);
		ctx.moveTo(790, 1250);
		ctx.bezierCurveTo(880, 1235, 960, 1240, 1030, 1225);
		ctx.stroke();
	}
	if (o.seal) {
		ctx.strokeStyle = '#d42a35';
		ctx.fillStyle = '#d42a35';
		ctx.lineWidth = 6;
		ctx.beginPath();
		ctx.arc(780, 1180, 118, 0, Math.PI * 2);
		ctx.stroke();
		ctx.lineWidth = 3;
		ctx.beginPath();
		ctx.arc(780, 1180, 80, 0, Math.PI * 2);
		ctx.stroke();
		ctx.font = `bold 16px ${FONT}`;
		// chữ chạy quanh vành
		const label = 'BỆNH VIỆN ĐA KHOA TỈNH * SỞ Y TẾ * ';
		for (let i = 0; i < label.length; i++) {
			const a = (i / label.length) * Math.PI * 2;
			ctx.save();
			ctx.translate(780 + Math.cos(a) * 98, 1180 + Math.sin(a) * 98);
			ctx.rotate(a + Math.PI / 2);
			ctx.fillText(label[i], -5, 6);
			ctx.restore();
		}
		ctx.font = `bold 20px ${FONT}`;
		ctx.fillText('BỆNH VIỆN', 728, 1186);
	}
	text('Nguyễn Văn An', 900, 1330, 28, { bold: true, align: 'center' });

	const img = ctx.getImageData(0, 0, W, H);
	const pixels = img.data;
	if (o.bw) {
		for (let i = 0; i < pixels.length; i += 4) {
			const v = Math.round(pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114);
			pixels[i] = pixels[i + 1] = pixels[i + 2] = v;
		}
		ctx.putImageData(img, 0, 0);
	}
	return { canvas, image: { pixels, width: W, height: H, channels: 4 }, words };
};

const run = (o, { ocr = true, ...extra } = {}) => {
	const { image, words } = drawPage(o);
	return detectMarks({ ...image, words: ocr ? words : null, ...extra });
};

test('trang đủ dấu đỏ + chữ ký xanh (có OCR) ⇒ marks_ok', () => {
	const r = run({ seal: true });
	assert.equal(r.verdict, 'marks_ok');
	assert.equal(r.color_available, true);
	assert.equal(r.seal.found, true);
	assert.equal(r.seal.count, 1);
	const b = r.seal.boxes[0];
	assert.ok(Math.abs(b.x + b.w / 2 - 780) < 10 && Math.abs(b.y + b.h / 2 - 1180) < 10);
	assert.ok(b.w > 220 && b.w < 260);
	assert.deepEqual(r.hand_signature, {
		found: true,
		near_title: true,
		title_found: true,
		method: 'ocr',
	});
	assert.ok(!('text' in r) && !JSON.stringify(r).includes('GIÁM'), 'không trả chữ OCR');
});

test('không có OCR ⇒ chữ ký dựa vào mực xanh nửa dưới trang', () => {
	const r = run({ seal: true }, { ocr: false });
	assert.equal(r.verdict, 'marks_ok');
	assert.equal(r.seal.found, true);
	assert.deepEqual(r.hand_signature, {
		found: true,
		near_title: false,
		title_found: false,
		method: 'ink_only',
	});
});

test('bản đen trắng ⇒ color_available false, dấu không kết luận, verdict unclear', () => {
	const r = run({ seal: true, bw: true });
	assert.equal(r.color_available, false);
	assert.equal(r.seal.found, null);
	assert.equal(r.verdict, 'unclear');
	// có OCR thì vẫn thấy nét mực dưới chức danh
	assert.equal(r.hand_signature.found, true);
	assert.equal(r.hand_signature.method, 'ocr');

	const r2 = run({ seal: true, bw: true }, { ocr: false });
	assert.equal(r2.verdict, 'unclear');
	assert.equal(r2.seal.found, null);
	assert.equal(r2.hand_signature.found, false); // không mực xanh, không OCR ⇒ không biết
});

test('bản đen trắng của trang KHÔNG dấu, không chữ ký ⇒ vẫn unclear, không kết luận thiếu', () => {
	const r = run({ seal: false, signature: false, bw: true }, { ocr: false });
	assert.equal(r.verdict, 'unclear');
	assert.equal(r.color_available, false);
});

test('trang không dấu, không chữ ký ⇒ marks_missing', () => {
	const r = run({ seal: false, signature: false });
	assert.equal(r.color_available, true);
	assert.equal(r.verdict, 'marks_missing');
	assert.equal(r.seal.found, false);
	assert.equal(r.seal.count, 0);
	// chức danh trong câu văn (Thủ trưởng..., Trưởng khoa..., GIÁM ĐỐC BỆNH VIỆN ở đầu) không
	// làm nhận nhầm; chức danh ở khối ký có thấy nhưng vùng ký trống
	assert.deepEqual(r.hand_signature, {
		found: false,
		near_title: false,
		title_found: true,
		method: 'ocr',
	});
});

test('OCR không đọc được khối chức danh ⇒ không kết luận thiếu chữ ký (lùi về mực xanh)', () => {
	const { image, words } = drawPage({ seal: true, signature: false });
	// bỏ 2 dòng chức danh ở khối ký; chỉ còn "GIÁM ĐỐC BỆNH VIỆN..." ở đầu trang
	const rest = words.filter((wd) => !(wd.top > 1000 && wd.top < 1100 && wd.left > 700));
	const r = detectMarks({ ...image, words: rest });
	assert.equal(r.hand_signature.method, 'ink_only');
	assert.equal(r.hand_signature.title_found, false);
	assert.equal(r.hand_signature.found, false);
	assert.equal(r.verdict, 'unclear');
});

test('tiêu đề đỏ + gạch chân đỏ + logo nhỏ nhưng không có dấu ⇒ không nhận nhầm là dấu', () => {
	const r = run({ redTitle: true, seal: false });
	assert.equal(r.color_available, true);
	assert.ok(r.signals.red_px > 2000, 'trang có nhiều điểm đỏ');
	assert.equal(r.seal.found, false);
	assert.equal(r.hand_signature.found, true);
	assert.equal(r.verdict, 'marks_missing');
	// giấy tờ không cần dấu (vd đơn đề nghị) ⇒ chỉ xét chữ ký
	assert.equal(
		run({ redTitle: true, seal: false }, { expect: { seal: false } }).verdict,
		'marks_ok',
	);
});

test('tiêu đề đỏ + có dấu ⇒ chỉ đếm đúng 1 dấu', () => {
	const r = run({ redTitle: true, seal: true });
	assert.equal(r.seal.count, 1);
	assert.equal(r.verdict, 'marks_ok');
});

test('có dấu, chữ ký mực đen: có OCR ⇒ thấy; không OCR ⇒ chưa kết luận chữ ký', () => {
	const r = run({ seal: true, sigInk: '#151515' });
	assert.equal(r.hand_signature.found, true);
	assert.equal(r.verdict, 'marks_ok');
	const r2 = run({ seal: true, sigInk: '#151515' }, { ocr: false });
	assert.equal(r2.hand_signature.found, false);
	assert.equal(r2.verdict, 'unclear');
});

test('ảnh 1414×2000 chạy dưới 2 giây', () => {
	const { image, words } = drawPage({ seal: true, redTitle: true, scale: 2000 / A4_H });
	const t0 = Date.now();
	const r = detectMarks({ ...image, words });
	const ms = Date.now() - t0;
	assert.equal(r.verdict, 'marks_ok');
	assert.ok(ms < 2000, `mất ${ms} ms`);
});

test('ảnh không hợp lệ ⇒ TypeError', () => {
	assert.throws(() => detectMarks({ pixels: new Uint8Array(0), width: 0, height: 0 }), TypeError);
});

test('renderRgb + pixmapImage (mupdf, RGB 3 kênh) ⇒ detectMarks dò được dấu', async () => {
	const { canvas } = drawPage({ seal: true });
	const png = canvas.toBuffer('image/png');
	const mupdf = await analyzer.loadMupdf();
	const doc = mupdf.Document.openDocument(png, 'image/png');
	const page = doc.loadPage(0);
	const pix = analyzer.renderRgb(mupdf, page, 1600);
	try {
		const img = analyzer.pixmapImage(pix);
		assert.equal(img.channels, 3);
		assert.equal(Math.max(img.width, img.height), 1600);
		const r = detectMarks(img);
		assert.equal(r.color_available, true);
		assert.equal(r.seal.count, 1);
		assert.equal(r.hand_signature.found, true);
	} finally {
		pix.destroy();
		page.destroy();
		doc.destroy();
	}
});

test('parseTsv: lấy từ cấp 5 có chữ, khóa dòng, số', () => {
	const tsv = [
		'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
		'1\t1\t0\t0\t0\t0\t0\t0\t1240\t1754\t-1\t',
		'4\t1\t2\t1\t1\t0\t820\t1030\t160\t30\t-1\t',
		'5\t1\t2\t1\t1\t1\t820\t1030\t40\t30\t91.5\tKT.',
		'5\t1\t2\t1\t1\t2\t870\t1030\t70\t30\t88\tGIÁM',
		'5\t1\t2\t1\t1\t3\t950\t1030\t50\t30\t12\t ',
		'',
	].join('\n');
	assert.deepEqual(analyzer.parseTsv(tsv), [
		{ text: 'KT.', conf: 91.5, left: 820, top: 1030, width: 40, height: 30, line: '1.2.1.1' },
		{ text: 'GIÁM', conf: 88, left: 870, top: 1030, width: 70, height: 30, line: '1.2.1.1' },
	]);
	assert.deepEqual(analyzer.parseTsv(''), []);
});

test('OCR thật (Tesseract) + detectMarks', async (t) => {
	if (!(await analyzer.tesseractAvailable())) return t.skip('máy không có Tesseract + gói vie');
	const { canvas, image } = drawPage({ seal: true });
	const words = await analyzer.ocrTsv(canvas.toBuffer('image/png'));
	assert.ok(words.length > 20);
	assert.ok(words.every((w) => typeof w.conf === 'number' && typeof w.line === 'string'));
	const r = detectMarks({ ...image, words });
	assert.equal(r.seal.found, true);
	assert.equal(r.hand_signature.found, true);
	assert.equal(r.verdict, 'marks_ok');
});
