// Chuẩn hóa ảnh chữ ký tay (signing/signatureImage.js) và cách hiện khung chữ ký (displayOf).
const test = require('node:test');
const assert = require('node:assert/strict');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { normalizeSignatureImage } = require('../../src/modules/signing/signatureImage');
const { displayOf } = require('../../src/modules/signing/signingService');
const client = require('../../src/modules/signing/vinHsmClient');

// "Ảnh chụp" chữ ký: nền giấy trắng 1200×800, nét mực xanh đậm ở giữa
const photo = async (mime = 'image/png', ink = true) => {
	const c = createCanvas(1200, 800);
	const g = c.getContext('2d');
	g.fillStyle = '#fbfbf8';
	g.fillRect(0, 0, 1200, 800);
	if (ink) {
		g.strokeStyle = '#1a2a6c';
		g.lineWidth = 10;
		g.beginPath();
		g.moveTo(400, 420);
		g.bezierCurveTo(480, 300, 560, 520, 640, 380);
		g.lineTo(780, 450);
		g.stroke();
	}
	const buf = await c.encode(mime === 'image/jpeg' ? 'jpeg' : 'png');
	return `data:${mime};base64,${buf.toString('base64')}`;
};

test('nền giấy → trong suốt, cắt sát nét, giữ màu mực, xuất PNG', async () => {
	const b64 = await normalizeSignatureImage(await photo());
	const out = Buffer.from(b64, 'base64');
	assert.equal(out.readUInt32BE(0), 0x89504e47);
	const img = await loadImage(out);
	// nét rộng ~400 + lề, cao < 200 ⇒ đã cắt khỏi khổ 1200×800
	assert.ok(img.width < 460 && img.width > 380, `width ${img.width}`);
	assert.ok(img.height < 200 && img.height > 60, `height ${img.height}`);
	const g = createCanvas(img.width, img.height).getContext('2d');
	g.drawImage(img, 0, 0);
	const px = g.getImageData(0, 0, img.width, img.height).data;
	assert.equal(px[3], 0, 'góc ảnh (nền) phải trong suốt');
	let inkPx = 0;
	for (let i = 0; i < px.length; i += 4) {
		if (px[i + 3] > 200) {
			inkPx++;
			assert.ok(px[i + 2] > px[i], 'giữ màu mực xanh');
		}
	}
	assert.ok(inkPx > 500);
});

test('ảnh JPEG cũng nhận', async () => {
	const b64 = await normalizeSignatureImage(await photo('image/jpeg'));
	assert.ok(Buffer.from(b64, 'base64').length > 100);
});

test('ảnh trắng trơn ⇒ 400', async () => {
	await assert.rejects(
		normalizeSignatureImage(await photo('image/png', false)),
		(e) => /Không thấy nét/.test(e.message) && e.statusCode === 400,
	);
});

test('không phải ảnh ⇒ 400', async () => {
	const pdf = `data:image/png;base64,${Buffer.from('%PDF-1.7 giả').toString('base64')}`;
	await assert.rejects(normalizeSignatureImage(pdf), (e) => e.statusCode === 400);
	await assert.rejects(normalizeSignatureImage('khong-phai-base64!!'), (e) => e.statusCode === 400);
});

test('displayOf: có ảnh ⇒ kiểu "chỉ ảnh", ảnh đúng tỉ lệ khung; chức vụ vẽ dưới nét ký', async () => {
	const img = await normalizeSignatureImage(await photo());
	const box = { width: 220, height: 70 };
	const only = await displayOf({ signatureImage: img, signatureShowText: false }, box);
	assert.equal(only.type, client.PDF_SIGNATURE_TYPE.IMAGE);
	const fitted = await loadImage(Buffer.from(only.imageBase64, 'base64'));
	assert.equal(fitted.width / fitted.height, 220 / 70, 'ảnh gửi đi cùng tỉ lệ khung');

	const inkRows = async (b64) => {
		const t = await loadImage(Buffer.from(b64, 'base64'));
		const g = createCanvas(t.width, t.height).getContext('2d');
		g.drawImage(t, 0, 0);
		const px = g.getImageData(0, 0, t.width, t.height).data;
		const rows = [];
		for (let y = 0; y < t.height; y++) {
			let n = 0;
			for (let x = 0; x < t.width; x++) if (px[(y * t.width + x) * 4 + 3] > 100) n++;
			rows.push(n);
		}
		return rows;
	};
	const withCap = await displayOf(
		{ signatureImage: img, signatureShowText: true, signatureCaption: 'Trưởng phòng Quản lý NCKH' },
		box,
	);
	assert.equal(withCap.type, client.PDF_SIGNATURE_TYPE.IMAGE, 'không dùng chữ của VIN-HSM');
	const a = await inkRows(only.imageBase64);
	const b = await inkRows(withCap.imageBase64);
	const lastInk = (rows) => rows.findLastIndex((n) => n > 0);
	// Có chức vụ: có nét ở gần đáy khung (dòng chữ), ảnh không chức vụ thì đáy trống hơn
	assert.ok(lastInk(b) > lastInk(a), 'dòng chức vụ nằm dưới nét ký');
	const bottom = b.slice(Math.round(b.length * 0.75)).reduce((x, y) => x + y, 0);
	assert.ok(bottom > 50, 'có chữ ở phần dưới khung');

	// Bật nhưng không có chức vụ ⇒ như chỉ ảnh
	const noCap = await displayOf(
		{ signatureImage: img, signatureShowText: true, signatureCaption: null },
		box,
	);
	assert.equal(noCap.imageBase64, only.imageBase64);

	const text = await displayOf({ signatureImage: null }, box);
	assert.equal(text.type, client.PDF_SIGNATURE_TYPE.TEXT);
	assert.equal(text.imageBase64, undefined);
});
