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
//
// Kiểm chữ ký (input.signature = công tắc TRAINING_DOC_SIGNATURE_CHECK, docCheckService truyền
// vào): analyzeSignatures dùng lại Buffer + tài liệu mupdf đã mở — chữ ký số (PDF), dấu đỏ / chữ ký
// tay ở trang cuối + trang đầu, gộp theo signature/signatureRules.js. source 'trainee_document'
// (hồ sơ học viên tự nộp) CHỈ kiểm chữ ký, không đoán loại giấy tờ.
const fs = require('fs');
const crypto = require('crypto');
const { execFile } = require('child_process');
// jsqr: bản CommonJS export thẳng hàm (kèm .default) — typings chỉ khai báo default
const jsQR = require('jsqr').default;
const rules = require('./docCheckRules');
const { verifyPdfSignatures } = require('./signature/pdfSignature');
const { detectMarks } = require('./signature/visualMarks');
const sigRules = require('./signature/signatureRules');

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
const SIG_DIM = 1600; // cạnh dài khi dò dấu / chữ ký tay
// docCheckRunner dừng luồng sau 3 phút ⇒ phần chữ ký chỉ OCR khi còn đủ thời gian trước mốc này
const DEADLINE_MS = 150_000;
const SIG_OCR_MIN_LEFT_MS = 45_000;

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
 * Chạy Tesseract với ảnh PNG qua stdin, trả stdout. OMP_THREAD_LIMIT=1: mỗi lần OCR chỉ ăn
 * 1 nhân CPU.
 * @param {Uint8Array} png
 * @param {string[]} args tham số sau `stdin stdout`
 * @returns {Promise<string>}
 */
const runTesseract = (png, args) =>
	new Promise((resolve, reject) => {
		const child = execFile(
			TESSERACT_BIN,
			['stdin', 'stdout', ...args],
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

/**
 * OCR 1 ảnh PNG ra chữ thường.
 * @param {Uint8Array} png
 * @param {number} [psm] chế độ tách trang của Tesseract (3 = tự động)
 * @returns {Promise<string>}
 */
const ocr = (png, psm = 3) => runTesseract(png, ['-l', 'vie', '--psm', String(psm)]);

/**
 * @typedef {{ text: string, conf: number, left: number, top: number, width: number,
 *   height: number, line: string }} OcrWord
 */

/**
 * Đọc đầu ra `tsv` của Tesseract: chỉ lấy dòng cấp từ (level 5) có chữ. `line` = khóa
 * "trang.khối.đoạn.dòng" — các từ cùng khóa nằm trên cùng 1 dòng.
 * @param {string} tsv
 * @returns {OcrWord[]}
 */
const parseTsv = (tsv) => {
	/** @type {OcrWord[]} */
	const words = [];
	for (const row of String(tsv ?? '').split(/\r?\n/)) {
		const c = row.split('\t');
		if (c.length < 12 || c[0] !== '5') continue;
		const text = c.slice(11).join('\t').trim();
		if (!text) continue;
		words.push({
			text,
			conf: Number(c[10]),
			left: Number(c[6]),
			top: Number(c[7]),
			width: Number(c[8]),
			height: Number(c[9]),
			line: `${c[1]}.${c[2]}.${c[3]}.${c[4]}`,
		});
	}
	return words;
};

/**
 * OCR 1 ảnh PNG, trả từng từ kèm toạ độ (điểm ảnh của chính ảnh đưa vào) + độ tin cậy 0–100.
 * @param {Uint8Array} png
 * @param {number} [psm]
 * @returns {Promise<OcrWord[]>}
 */
const ocrTsv = async (png, psm = 3) =>
	parseTsv(await runTesseract(png, ['-l', 'vie', '--psm', String(psm), 'tsv']));

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

/**
 * Ảnh MÀU (RGB, không kênh alpha) cả trang, cạnh dài ≈ maxDim — cho dò dấu đỏ / mực xanh
 * (signature/visualMarks.js). Người gọi tự destroy() pixmap.
 */
const renderRgb = (mupdf, page, maxDim) => {
	const s = scaleFor(page, maxDim);
	return page.toPixmap(mupdf.Matrix.scale(s, s), mupdf.ColorSpace.DeviceRGB, false, true);
};

/**
 * Pixmap mupdf ⇒ dạng ảnh mà visualMarks.detectMarks() nhận. `pixels` là view vào bộ nhớ
 * WASM — chỉ dùng trước khi pixmap bị destroy().
 */
const pixmapImage = (pix) => ({
	pixels: pix.getPixels(),
	width: pix.getWidth(),
	height: pix.getHeight(),
	channels: pix.getNumberOfComponents(), // n của MuPDF đã gồm kênh alpha (nếu có)
	stride: pix.getStride(),
});

const SIG_MIN_SIDE = 300; // ảnh dựng ra nhỏ hơn ⇒ quá ít điểm ảnh để dò dấu / chữ ký tay

/**
 * Trang không đáng dò dấu / chữ ký tay: ảnh quá nhỏ (file ảnh vài chục byte...) hoặc gần như
 * một màu (trang trắng) — dò trên đó dễ ra "thiếu dấu" / "có chữ ký" sai. Lấy mẫu thưa cho nhanh.
 * @param {ReturnType<typeof pixmapImage>} img
 */
const unfitForMarks = ({ pixels, width, height, channels, stride }) => {
	if (Math.min(width, height) < SIG_MIN_SIDE) return true;
	const step = 4;
	let n = 0;
	let sum = 0;
	let sq = 0;
	for (let y = 0; y < height; y += step) {
		for (let x = 0; x < width; x += step) {
			const i = y * stride + x * channels;
			const v = channels >= 3 ? (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3 : pixels[i];
			sum += v;
			sq += v * v;
			n++;
		}
	}
	const mean = sum / (n || 1);
	return Math.sqrt(Math.max(0, sq / (n || 1) - mean * mean)) < 6;
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

// ─── Phân tích loại giấy tờ ───────────────────────────────────────────────────
/** Lớp chữ có sẵn của 1 trang ('' nếu là ảnh). */
const pageText = (page) => {
	try {
		const st = page.toStructuredText('preserve-whitespace');
		const text = st.asText();
		st.destroy();
		return text;
	} catch {
		return '';
	}
};

/**
 * Đoán loại giấy tờ (xếp tầng lớp chữ → QR → OCR). Không destroy `doc` (người gọi giữ).
 * @returns {Promise<Record<string, any>>}
 */
const checkKind = async (mupdf, doc, { kind, identity, sha256, started, lowResImage }) => {
	const pageCount = Math.min(doc.countPages(), MAX_PAGES);
	const pageObjs = [];
	/** @type {Array<{ text: string, qr: string[], blank: boolean, lowRes: boolean }>} */
	const pages = [];
	try {
		for (let i = 0; i < pageCount; i++) {
			const page = doc.loadPage(i);
			pageObjs.push(page);
			pages.push({ text: pageText(page), qr: [], blank: false, lowRes: lowResImage });
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
	}
};

// ─── Kiểm chữ ký ───────────────────────────────────────────────────────────────
/**
 * Chữ ký số (chỉ PDF) + dấu đỏ / chữ ký tay ở trang cuối và trang đầu (nếu khác trang cuối),
 * gộp theo signatureRules. OCR (tìm chức danh người ký) chỉ khi có Tesseract và còn đủ thời gian
 * trước `deadline`. Không trả chữ đọc được. Mục bị tắt trong `config` (TRAINING_DOC_SIGNATURE_RULES)
 * thì không chạy; sig_details.ran ghi mục đã chạy.
 * @param {{ mupdf: any, doc: any, buf: Buffer, magic: string, kind: string,
 *   unit?: string | null, trust?: any, deadline: number,
 *   config?: import('./signature/signatureRules').SignatureConfig | null }} o
 * @returns {Promise<{ sig_verdict: string, sig_details: Record<string, any> }>}
 */
const analyzeSignatures = async ({
	mupdf,
	doc,
	buf,
	magic,
	kind,
	unit = null,
	trust,
	deadline,
	config = null,
}) => {
	const t0 = Date.now();
	const kc = sigRules.kindConfig(config, kind) ?? { digital: true, seal: true, hand: true };
	const opts = (config ?? sigRules.DEFAULT_SIGNATURE_CONFIG).options;
	const ran = { digital: kc.digital, seal: kc.seal, hand: kc.hand };
	const base = sigRules.SIGNATURE_REQUIREMENTS[kind]?.expect ?? undefined;
	const expect = base
		? { seal: base.seal && kc.seal, signature: base.signature && kc.hand }
		: undefined;
	const isPdf = magic === 'application/pdf';
	const digital =
		isPdf && kc.digital ? await verifyPdfSignatures(buf, trust ? { trust } : {}) : null;
	const total = doc.countPages();
	// OCR chỉ để tìm chức danh người ký ⇒ chỉ khi dò chữ ký tay và cấu hình cho dùng OCR
	const canOcr = kc.hand && opts.ocr && (await tesseractAvailable());
	let textLayer = false;
	/** @type {Array<{ page: number, result: any }>} */
	const visualPages = [];
	const pagesToScan = kc.seal || kc.hand ? (total > 0 ? [...new Set([total - 1, 0])] : []) : [];
	// Trang cuối trước (chỗ ký của văn bản), rồi trang đầu
	for (const i of pagesToScan) {
		let page = null;
		try {
			page = doc.loadPage(i);
			if (isPdf && !textLayer) textLayer = pageText(page).replace(/\s+/g, '').length >= 50;
			const pix = renderRgb(mupdf, page, SIG_DIM);
			try {
				// Trang trắng / ảnh quá nhỏ ⇒ không kết luận (null = không dò được)
				if (unfitForMarks(pixmapImage(pix))) {
					visualPages.push({ page: i + 1, result: null });
					continue;
				}
				let words = null;
				if (canOcr && deadline - Date.now() > SIG_OCR_MIN_LEFT_MS) {
					try {
						words = await ocrTsv(pix.asPNG());
					} catch {
						words = null; // OCR lỗi ⇒ dò không chữ (mực xanh)
					}
				}
				// pixmapImage lấy view bộ nhớ WASM ngay lúc dùng (sau await)
				const result = detectMarks({ ...pixmapImage(pix), words, expect });
				visualPages.push({ page: i + 1, result });
			} finally {
				pix.destroy();
			}
		} catch {
			visualPages.push({ page: i + 1, result: null });
		} finally {
			page?.destroy();
		}
	}
	visualPages.sort((a, b) => a.page - b.page);
	const out = sigRules.combine(
		kind,
		digital,
		visualPages,
		{ unit, textLayer, pageCount: total, ran },
		config,
	);
	out.sig_details.ocr = canOcr;
	out.sig_details.ms = Date.now() - t0;
	return out;
};

// ─── Phân tích ─────────────────────────────────────────────────────────────────
/**
 * @param {{
 *   filePath: string,
 *   mime?: string | null,
 *   kind: string,
 *   identity?: Record<string, string | null | undefined>,
 *   source?: 'registration' | 'trainee_document',
 *   signature?: boolean,
 *   sigConfig?: unknown,
 *   unit?: string | null,
 * }} input signature = kiểm chữ ký (công tắc TRAINING_DOC_SIGNATURE_CHECK); sigConfig = cấu hình
 *   chi tiết TRAINING_DOC_SIGNATURE_RULES (chuỗi JSON / object; thiếu ⇒ bật hết); unit = đơn vị
 *   công tác đã khai (so mờ với tổ chức người ký số)
 * @param {{ trust?: any }} [opts] bộ CA riêng (test) — mặc định src/assets/trust
 * @returns {Promise<{
 *   status: 'done' | 'skipped',
 *   reason?: string,
 *   sha256: string,
 *   verdict?: 'ok' | 'mismatch' | 'unclear' | null,
 *   detected_kind?: string | null,
 *   confidence?: number,
 *   warnings?: string[],
 *   signals?: Record<string, any>,
 *   sig_verdict?: string,
 *   sig_details?: Record<string, any>,
 * }>}
 */
const analyze = async (input, { trust } = {}) => {
	const { filePath, mime = null, kind, identity = {}, unit = null } = input;
	const source = input.source ?? 'registration';
	const started = Date.now();
	const deadline = started + DEADLINE_MS;
	const buf = await fs.promises.readFile(filePath);
	const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
	const mupdf = await loadMupdf();
	const magic = magicOf(filePath, mime);
	const sigKind = source === 'trainee_document' ? 'trainee_document' : kind;
	const config = sigRules.normalizeSignatureConfig(input.sigConfig ?? null);
	const wantSig = !!input.signature && sigRules.needsSignatureCheck(sigKind, config);
	if (source === 'trainee_document' && !wantSig)
		return { status: 'skipped', reason: 'signature_disabled', sha256 };

	let doc;
	try {
		doc = mupdf.Document.openDocument(buf, magic);
	} catch {
		// mupdf không mở được ⇒ không dò dấu; vẫn thử chữ ký số (bộ đọc PDF riêng)
		const kc = sigRules.kindConfig(config, sigKind);
		const digital =
			wantSig && kc?.digital && magic === 'application/pdf'
				? await verifyPdfSignatures(buf, trust ? { trust } : {})
				: null;
		const ran = { digital: !!kc?.digital, seal: !!kc?.seal, hand: !!kc?.hand };
		const sig = wantSig ? sigRules.combine(sigKind, digital, [], { ran }, config) : {};
		if (source === 'trainee_document') return { status: 'done', sha256, verdict: null, ...sig };
		return {
			status: 'done',
			sha256,
			verdict: 'unclear',
			detected_kind: null,
			confidence: 0,
			warnings: ['unreadable'],
			signals: { method: 'open_failed', ms: Date.now() - started },
			...sig,
		};
	}

	try {
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
		/** @type {Record<string, any>} */
		const res =
			source === 'trainee_document'
				? { status: 'done', sha256, verdict: null, signals: { method: 'signature_only' } }
				: await checkKind(mupdf, doc, { kind, identity, sha256, started, lowResImage });
		if (wantSig)
			Object.assign(
				res,
				await analyzeSignatures({
					mupdf,
					doc,
					buf,
					magic,
					kind: sigKind,
					unit,
					trust,
					deadline,
					config,
				}),
			);
		return /** @type {any} */ (res);
	} finally {
		doc.destroy();
	}
};

module.exports = {
	analyze,
	analyzeSignatures,
	tesseractAvailable,
	magicOf,
	loadMupdf,
	renderRgb,
	pixmapImage,
	ocrTsv,
	parseTsv,
};
