// Đọc 1 file hồ sơ (PDF / JPG / PNG) và đoán loại giấy tờ — xếp tầng, cái rẻ chạy trước, đủ
// kết luận thì dừng:
//   1. Lớp chữ có sẵn của PDF (PDF xuất từ Word / máy scan có OCR) — vài mili-giây.
//   2. Mã QR (CCCD gắn chip / thẻ Căn cước) — vài chục mili-giây, dữ liệu chính xác.
//   3. OCR Tesseract tiếng Việt: phần đầu trang (tiêu đề) trước, chưa đủ mới OCR cả trang,
//      chữ vẫn không đọc được thì thử xoay ảnh (ảnh chụp điện thoại bị nằm ngang / lộn ngược).
// CCCD luôn OCR cả trang để kiểm đủ 2 mặt và đối chiếu họ tên / số CCCD.
//
// Chạy trong worker thread (docCheckRunner.js): mupdf (WASM) và jsQR chạy đồng bộ, để ở luồng
// chính sẽ chặn API. Tesseract là tiến trình con (binary hệ thống, Dockerfile cài sẵn); máy
// không có Tesseract thì chỉ dùng tầng 1–2, cần OCR mà không có ⇒ status 'skipped'.
//
// KHÔNG trả / lưu chữ đọc được hay nội dung QR (dữ liệu cá nhân) — chỉ kết luận + cờ đúng/sai.
const fs = require('fs');
const crypto = require('crypto');
const { execFile } = require('child_process');
// jsqr: bản CommonJS export thẳng hàm (kèm .default) — typings chỉ khai báo default
const jsQR = require('jsqr').default;
const rules = require('./docCheckRules');

/** @type {Promise<typeof import('mupdf')> | undefined} */
let mupdfP;
// mupdf là ESM có top-level await (nạp WASM) ⇒ phải import() động
const loadMupdf = () => (mupdfP ??= import('mupdf'));

const TESSERACT_BIN = process.env.TESSERACT_BIN || 'tesseract';
const MAX_PAGES = 2;
const QR_DIM = 1600; // cạnh dài khi dò QR
const OCR_DIM = 2000; // cạnh dài khi OCR cả trang
const HEADER_FRACTION = 0.35; // phần đầu trang chứa tiêu đề
const MIN_IMAGE_SIDE = 500; // ảnh nhỏ hơn ⇒ cảnh báo độ phân giải thấp
const OCR_TIMEOUT_MS = 60_000;

/** @type {Promise<boolean> | undefined} */
let tessP;
/** Có Tesseract + gói tiếng Việt không (kiểm 1 lần / tiến trình). */
const tesseractAvailable = () =>
	(tessP ??= new Promise((resolve) => {
		execFile(TESSERACT_BIN, ['--list-langs'], { timeout: 10_000 }, (err, stdout, stderr) =>
			resolve(!err && /\bvie\b/.test(`${stdout}${stderr}`)),
		);
	}));

/**
 * OCR 1 ảnh PNG qua stdin. OMP_THREAD_LIMIT=1: mỗi lần OCR chỉ ăn 1 nhân CPU.
 * @param {Uint8Array} png
 * @param {number} [psm] chế độ tách trang của Tesseract (3 = tự động)
 * @returns {Promise<string>}
 */
const ocr = (png, psm = 3) =>
	new Promise((resolve, reject) => {
		const child = execFile(
			TESSERACT_BIN,
			['stdin', 'stdout', '-l', 'vie', '--psm', String(psm)],
			{
				timeout: OCR_TIMEOUT_MS,
				maxBuffer: 4 * 1024 * 1024,
				encoding: 'utf8',
				env: { ...process.env, OMP_THREAD_LIMIT: '1' },
			},
			(err, stdout) => (err ? reject(err) : resolve(stdout)),
		);
		child.stdin?.on('error', () => {}); // tesseract chết sớm ⇒ lỗi báo ở callback
		child.stdin?.end(Buffer.from(png));
	});

const MAGIC = {
	'.pdf': 'application/pdf',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.png': 'image/png',
};
const magicOf = (filePath, mime) => {
	const ext =
		String(filePath)
			.toLowerCase()
			.match(/\.[a-z0-9]+$/)?.[0] ?? '';
	return MAGIC[ext] || mime || 'application/pdf';
};

// ─── Dựng ảnh ──────────────────────────────────────────────────────────────────
const scaleFor = (page, maxDim) => {
	const [x0, y0, x1, y1] = page.getBounds();
	return Math.min(maxDim / Math.max(x1 - x0, y1 - y0, 1), 4);
};

/** Ảnh xám cả trang, cạnh dài ≈ maxDim, xoay `rotate` độ. */
const renderGray = (mupdf, page, maxDim, rotate = 0) => {
	const s = scaleFor(page, maxDim);
	let m = mupdf.Matrix.scale(s, s);
	if (rotate) m = mupdf.Matrix.concat(m, mupdf.Matrix.rotate(rotate));
	return page.toPixmap(m, mupdf.ColorSpace.DeviceGray, false, true);
};

/** Ảnh xám phần đầu trang (tiêu đề). */
const renderHeader = (mupdf, page, maxDim) => {
	const [x0, y0, x1, y1] = page.getBounds();
	const s = scaleFor(page, maxDim);
	const w = Math.ceil((x1 - x0) * s);
	const h = Math.ceil((y1 - y0) * s * HEADER_FRACTION);
	const pix = new mupdf.Pixmap(mupdf.ColorSpace.DeviceGray, [0, 0, w, h], false);
	pix.clear(255);
	const m = mupdf.Matrix.concat(mupdf.Matrix.translate(-x0, -y0), mupdf.Matrix.scale(s, s));
	const dev = new mupdf.DrawDevice(m, pix);
	try {
		page.run(dev, mupdf.Matrix.identity);
	} finally {
		dev.close();
		dev.destroy();
	}
	return pix;
};

/** Pixmap xám ⇒ RGBA cho jsQR + độ lệch chuẩn độ sáng (≈ 0 ⇒ trang trắng). */
const grayStats = (pix) => {
	const w = pix.getWidth();
	const h = pix.getHeight();
	const stride = pix.getStride();
	const px = pix.getPixels();
	const rgba = new Uint8ClampedArray(w * h * 4);
	let sum = 0;
	let sq = 0;
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const v = px[y * stride + x];
			const i = (y * w + x) * 4;
			rgba[i] = rgba[i + 1] = rgba[i + 2] = v;
			rgba[i + 3] = 255;
			sum += v;
			sq += v * v;
		}
	}
	const n = w * h || 1;
	const mean = sum / n;
	return { rgba, w, h, std: Math.sqrt(Math.max(0, sq / n - mean * mean)) };
};

const decodeQr = ({ rgba, w, h }) => {
	try {
		return jsQR(rgba, w, h, { inversionAttempts: 'attemptBoth' })?.data ?? null;
	} catch {
		return null;
	}
};

const withPix = (pix, fn) => {
	try {
		return fn(pix);
	} finally {
		pix.destroy();
	}
};

// ─── Phân tích ─────────────────────────────────────────────────────────────────
/**
 * @param {{
 *   filePath: string,
 *   mime?: string | null,
 *   kind: string,
 *   identity?: Record<string, string | null | undefined>,
 * }} input
 * @returns {Promise<{
 *   status: 'done' | 'skipped',
 *   reason?: string,
 *   sha256: string,
 *   verdict?: 'ok' | 'mismatch' | 'unclear',
 *   detected_kind?: string | null,
 *   confidence?: number,
 *   warnings?: string[],
 *   signals?: Record<string, any>,
 * }>}
 */
const analyze = async ({ filePath, mime = null, kind, identity = {} }) => {
	const started = Date.now();
	const buf = await fs.promises.readFile(filePath);
	const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
	const mupdf = await loadMupdf();
	const magic = magicOf(filePath, mime);

	let doc;
	try {
		doc = mupdf.Document.openDocument(buf, magic);
	} catch {
		return {
			status: 'done',
			sha256,
			verdict: 'unclear',
			detected_kind: null,
			confidence: 0,
			warnings: ['unreadable'],
			signals: { method: 'open_failed', ms: Date.now() - started },
		};
	}

	let lowResImage = false;
	if (magic.startsWith('image/')) {
		try {
			const img = new mupdf.Image(buf);
			lowResImage = Math.min(img.getWidth(), img.getHeight()) < MIN_IMAGE_SIDE;
			img.destroy();
		} catch {
			/* không đọc được kích thước ⇒ bỏ qua cảnh báo */
		}
	}

	const pageCount = Math.min(doc.countPages(), MAX_PAGES);
	const pageObjs = [];
	/** @type {Array<{ text: string, qr: string[], blank: boolean, lowRes: boolean }>} */
	const pages = [];
	try {
		for (let i = 0; i < pageCount; i++) {
			const page = doc.loadPage(i);
			pageObjs.push(page);
			let text = '';
			try {
				const st = page.toStructuredText('preserve-whitespace');
				text = st.asText();
				st.destroy();
			} catch {
				/* ảnh không có lớp chữ */
			}
			pages.push({ text, qr: [], blank: false, lowRes: lowResImage });
		}

		const done = (method, extra = {}) => ({
			status: /** @type {const} */ ('done'),
			sha256,
			...rules.evaluate({ kind, pages, identity, method }),
			...extra,
		});
		const finish = (res) => {
			res.signals = { ...res.signals, pages: pageCount, ms: Date.now() - started };
			return res;
		};

		// Tầng 1: lớp chữ PDF — đủ kết luận (trừ CCCD: vẫn cần QR + 2 mặt) thì dừng
		let res = done('pdf_text');
		if (res.verdict === 'ok' && kind !== 'national_id') return finish(res);

		// Tầng 2: dựng ảnh xám — dò QR + trang trắng
		for (let i = 0; i < pageCount; i++) {
			withPix(renderGray(mupdf, pageObjs[i], QR_DIM), (pix) => {
				const stats = grayStats(pix);
				pages[i].blank = stats.std < 6;
				const qr = decodeQr(stats);
				if (qr) pages[i].qr.push(qr);
			});
		}
		res = done(pages.some((p) => p.qr.length) ? 'qr' : 'pdf_text');
		if (res.verdict === 'ok' && kind !== 'national_id') return finish(res);
		if (pages.every((p) => p.blank)) return finish(res);
		// Lớp chữ PDF đã đọc được cả trang ⇒ OCR không thêm gì
		if (rules.isReadable(rules.normalize(pages.map((p) => p.text).join(' ')).split(' ')))
			return finish(res);

		// Tầng 3: OCR
		if (!(await tesseractAvailable())) {
			// QR đã cho thấy là CCCD (đúng hoặc nộp nhầm ô) ⇒ vẫn kết luận được
			if (res.signals?.qr_cccd) return finish(res);
			return { status: 'skipped', reason: 'ocr_unavailable', sha256 };
		}
		const layerText = pages.map((p) => p.text);
		const setOcr = (i, t) => {
			pages[i].text = `${layerText[i]}\n${t}`;
		};

		if (kind !== 'national_id') {
			const t = await ocr(withPix(renderHeader(mupdf, pageObjs[0], OCR_DIM), (p) => p.asPNG()));
			setOcr(0, t);
			res = done('ocr_header');
			if (res.verdict === 'ok') return finish(res);
		}

		for (let i = 0; i < pageCount; i++) {
			if (pages[i].blank) continue;
			setOcr(i, await ocr(withPix(renderGray(mupdf, pageObjs[i], OCR_DIM), (p) => p.asPNG())));
		}
		res = done('ocr_page');
		if (res.signals?.readable) return finish(res);

		// Chữ không đọc được ⇒ có thể ảnh bị xoay: thử 90°, 270°, 180° với trang đầu
		for (const deg of [90, 270, 180]) {
			const t = await ocr(withPix(renderGray(mupdf, pageObjs[0], OCR_DIM, deg), (p) => p.asPNG()));
			const words = rules.normalize(t).split(' ');
			if (rules.isReadable(words)) {
				setOcr(0, t);
				return finish(done('ocr_rotated', {}));
			}
		}
		return finish(res);
	} finally {
		for (const p of pageObjs) p.destroy();
		doc.destroy();
	}
};

module.exports = { analyze, tesseractAvailable, magicOf };
