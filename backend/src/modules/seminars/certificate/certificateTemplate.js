/**
 * certificateTemplate.js — chuẩn bị mẫu giấy chứng nhận CME (PDF 1 trang thiết
 * kế sẵn, chỗ cần điền là các dãy "....."), làm 1 lần lúc tải mẫu lên:
 *
 *  1. Dò từng dãy dấu chấm + chữ đứng trước nó ("Chứng nhận", "Sinh ngày",
 *     "Vai trò:", "Bằng chữ:", "Số: ...../C33.01"...) → biết ô nào điền gì, ở đâu.
 *  2. Xoá các dãy chấm đã nhận diện. Mẫu xuất từ phần mềm thiết kế hay có thêm
 *     1 lớp chữ dạng nét vẽ (outline) nằm dưới chữ thật — xoá chữ thôi thì dấu
 *     chấm vẫn hiện, nên xoá cả nét vẽ nằm gọn trong vùng chấm. Ảnh nền giữ nguyên.
 *  3. Thu nhỏ ảnh quá lớn (mẫu thật có ảnh nền 7680px, 14MB) → mỗi file giấy
 *     chứng nhận chỉ còn ~1–2MB thay vì ~15MB.
 *
 * Kết quả (PDF đã làm sạch + toạ độ các ô) được lưu lại; lúc xuất chỉ việc viết
 * chữ vào toạ độ (certificateRender.js) — không phải dò lại cho từng người.
 *
 * mupdf là ESM có top-level await (nạp WASM) → không require() được, phải
 * import() động; chỉ nạp khi có người tải mẫu lên.
 */
const path = require('path');
const zlib = require('zlib');
const { Worker } = require('worker_threads');
const { shrinkFlateImage } = require('./flateImageShrink');
const { norm } = require('../../../utils/vietnameseText');
const { httpError } = require('../../../utils/httpError');
const logger = require('../../../config/logger');

/** @type {Promise<typeof import('mupdf')> | undefined} */
let mupdfP;
const loadMupdf = () => (mupdfP ??= import('mupdf'));

// Ô điền trên giấy — thứ tự dùng khi hiển thị
const SLOT_LABELS = {
	so: 'Số giấy (SQĐ)',
	name: 'Chứng nhận (Ông/Bà + họ tên)',
	dob: 'Sinh ngày',
	organization: 'Đơn vị công tác',
	role: 'Vai trò',
	credits: 'Quy đổi tương đương (giờ tín chỉ)',
	credits_text: 'Bằng chữ',
};
const SLOT_KEYS = Object.keys(SLOT_LABELS);

// Ảnh lớn hơn ngưỡng này (cạnh dài, px) thì thu nhỏ về đúng ngưỡng — ~220dpi
// cho ảnh nền trải hết khổ A4, in vẫn nét.
const MAX_IMAGE_SIDE = 2400;
// Ảnh không cần thu nhỏ nhưng lưu kiểu nén không mất dữ liệu quá nặng → đổi sang JPEG
const REENCODE_MIN_BYTES = 300 * 1024;
const MIN_DOTS = 3;

// Nhận diện ô theo chữ đứng trước dãy chấm (đã norm: bỏ dấu, chữ thường)
const classify = (label, after) => {
	const l = label.replace(/\s+/g, ' ').trim();
	if (/(^| )vai tro$/.test(l)) return 'role';
	if (l.includes('bang chu')) return 'credits_text';
	if (l.includes('quy doi') || (!l && /^\s*gio tin chi/.test(after))) return 'credits';
	if (/(^| )(so|so qd|so cn|so giay)$/.test(l) || /(^| )so quyet dinh$/.test(l)) return 'so';
	if (/(chung nhan|ho va ten|ho ten|cap cho)$/.test(l)) return 'name';
	if (/(sinh ngay|ngay sinh|nam sinh|ngay thang nam sinh)$/.test(l)) return 'dob';
	if (/(don vi cong tac|don vi|noi cong tac|co quan)$/.test(l)) return 'organization';
	return null;
};

const isDot = (c) => c === '.' || c === '…';

/**
 * @typedef {{ x0: number, x1: number, y0: number, y1: number }} Box  toạ độ mupdf (gốc trên-trái)
 * @typedef {{
 *   key: string, x: number, x1: number, baseline: number, size: number, textSize: number,
 *   align: 'left'|'center', serif: boolean, italic: boolean, suffix: string, color: number[],
 *   box: Box, suffixBox: Box | null,
 * }} Slot
 */

const unionQuads = (quads) => {
	const xs = quads.flatMap((q) => [q[0], q[2], q[4], q[6]]);
	const ys = quads.flatMap((q) => [q[1], q[3], q[5], q[7]]);
	return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
};

// Đọc các dòng chữ của trang kèm toạ độ từng ký tự
const readLines = (page) => {
	/** @type {{ bbox: number[], chars: { c: string, origin: number[], size: number, quad: number[], font: string, color: number[] }[] }[]} */
	const lines = [];
	let cur = null;
	page.toStructuredText('preserve-whitespace').walk({
		beginLine(bbox) {
			cur = { bbox, chars: [] };
			lines.push(cur);
		},
		onChar(c, origin, font, size, quad, color) {
			cur?.chars.push({ c, origin, size, quad, font: font.getName(), color: toRgb(color) });
		},
	});
	return lines.filter((l) => l.chars.length);
};

// Màu ký tự (theo không gian màu của chữ: Gray / RGB / CMYK, 0–1) → [r, g, b]
const toRgb = (color) => {
	const c = Array.isArray(color) ? color : [];
	if (c.length === 1) return [c[0], c[0], c[0]];
	if (c.length === 3) return c.slice();
	if (c.length === 4) return [0, 1, 2].map((i) => (1 - c[i]) * (1 - c[3]));
	return [0, 0, 0];
};

// Chữ đứng ngay bên trái trên cùng hàng (nhãn tách khối, vd "Chứng nhận    : .....")
const labelOnRow = (lines, line, x0) => {
	const y = line.chars[0].origin[1];
	let best = null;
	for (const other of lines) {
		if (other === line) continue;
		const oy = other.chars[0].origin[1];
		if (Math.abs(oy - y) > 3 || other.bbox[2] > x0 + 1) continue;
		if (!best || other.bbox[2] > best.bbox[2]) best = other;
	}
	return best ? best.chars.map((c) => c.c).join('') : '';
};

// Tìm các dãy chấm trên trang và gán ô
const findSlots = (lines) => {
	/** @type {Record<string, Slot>} */
	const slots = {};
	/** @type {string[]} */
	const unknown = [];
	for (const line of lines) {
		const { chars } = line;
		let i = 0;
		while (i < chars.length) {
			if (!isDot(chars[i].c)) {
				i++;
				continue;
			}
			let j = i;
			while (j < chars.length && isDot(chars[j].c)) j++;
			const run = chars.slice(i, j);
			const dotCount = run.reduce((n, ch) => n + (ch.c === '…' ? 3 : 1), 0);
			if (dotCount >= MIN_DOTS) {
				const before = chars
					.slice(0, i)
					.map((c) => c.c)
					.join('');
				// Phần sau dãy chấm tới hết dòng / tới cụm khoảng trắng lớn
				const afterChars = chars.slice(j);
				const after = afterChars.map((c) => c.c).join('');
				let label = norm(before.replace(/^\s*\d+[.)]\s*/, ''));
				// Nhãn nằm ở khối khác cùng hàng ("Chứng nhận" ... ": .....")
				if (!label) label = norm(labelOnRow(lines, line, run[0].quad[0]));
				// classify() so khớp phần CUỐI nhãn — dòng "1. Hình thức: ... Vai trò: ....." vẫn ra role
				const key = classify(label, norm(after));
				const box = unionQuads(run.map((c) => c.quad));
				const first = run[0];
				if (key && !slots[key]) {
					// "Số: ...../C33.01": số giấy dài hơn dãy chấm → viết lại phần đuôi ngay sau số
					const suffixChars =
						key === 'so'
							? afterChars.slice(0, afterChars.findIndex((c) => /\s/.test(c.c)) >>> 0)
							: [];
					const suffix = suffixChars.map((c) => c.c).join('');
					slots[key] = {
						key,
						x: first.origin[0],
						x1: box.x1,
						baseline: first.origin[1],
						size: Math.round(first.size * 10) / 10,
						// Cỡ chữ in ra (người dùng chỉnh được): tên / số giấy theo cỡ dãy chấm, ô khác
						// tối đa 12,5 (dãy chấm trên mẫu hay to hơn nhãn)
						textSize:
							key === 'name' || key === 'so'
								? Math.round(first.size * 10) / 10
								: Math.min(Math.round(first.size * 10) / 10, 12.5),
						// Ô giữa câu ("...... giờ tín chỉ") → căn giữa; ô cuối dòng → căn trái
						align: key !== 'so' && after.trim() ? 'center' : 'left',
						serif: /times|roman|serif|georgia|garamond/i.test(first.font),
						italic: /italic|oblique/i.test(first.font),
						// Chữ điền vào cùng màu dãy chấm trên mẫu (xanh như nhãn "Chứng nhận", đen ở dòng "Số")
						color: first.color.map((v) => Math.round(v * 1000) / 1000),
						suffix,
						box,
						suffixBox: suffixChars.length ? unionQuads(suffixChars.map((c) => c.quad)) : null,
					};
				} else if (!key) {
					unknown.push((before + '…').trim().slice(-40));
				}
			}
			i = j;
		}
	}
	return { slots, unknown };
};

// ─── Xoá dãy chấm ───────────────────────────────────────────────────────────
const redact = (mupdf, page, boxes, { textPad, artPad, text }) => {
	for (const b of boxes) {
		const annot = page.createAnnotation('Redact');
		annot.setRect([b.x0 + textPad[0], b.y0 - artPad, b.x1 + textPad[1], b.y1 + artPad]);
	}
	page.applyRedactions(
		false,
		mupdf.PDFPage.REDACT_IMAGE_NONE,
		mupdf.PDFPage.REDACT_LINE_ART_REMOVE_IF_COVERED,
		text ? mupdf.PDFPage.REDACT_TEXT_REMOVE : mupdf.PDFPage.REDACT_TEXT_NONE,
	);
};

// ─── Thu nhỏ / nén lại ảnh ──────────────────────────────────────────────────
const shrinkImages = async (mupdf, doc) => {
	const n = doc.countObjects();
	// SMask (độ trong suốt) của ảnh khác: thu nhỏ theo nhưng giữ nén không mất dữ liệu
	const masks = new Set();
	const images = [];
	for (let i = 1; i < n; i++) {
		// Thao tác stream phải qua tham chiếu gián tiếp (pdf_is_stream trên dict đã resolve luôn false)
		const obj = doc.newIndirect(i);
		if (!obj.isStream() || obj.get('Subtype').toString() !== '/Image') continue;
		if (obj.get('ImageMask').valueOf() === true) continue;
		const sm = obj.get('SMask');
		if (sm.isIndirect()) masks.add(sm.asIndirect());
		images.push({ i, obj });
	}
	for (const { i, obj } of images) {
		const w = obj.get('Width').asNumber();
		const h = obj.get('Height').asNumber();
		// Độ dài lấy từ /Length — readRawStream() chép cả stream vào bộ nhớ WASM
		const len = obj.get('Length');
		const before = len.isNumber() ? len.asNumber() : 0;
		const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(w, h));
		const isMask = masks.has(i);
		const filter = obj.get('Filter').toString();
		if (scale === 1 && (isMask || before < REENCODE_MIN_BYTES || filter.includes('DCTDecode'))) {
			continue;
		}
		const nw = Math.max(1, Math.round(w * scale));
		const nh = Math.max(1, Math.round(h * scale));
		const samples = (await streamShrink(obj, w, h, nw, nh)) || smallShrink(mupdf, doc, obj, nw, nh);
		if (!samples) continue; // định dạng không hỗ trợ / quá lớn để giải nén cả ảnh — để nguyên
		const gray = samples.length === nw * nh;
		obj.delete('DecodeParms');
		obj.delete('Decode');
		obj.put('Width', nw);
		obj.put('Height', nh);
		obj.put('BitsPerComponent', 8);
		obj.put('ColorSpace', doc.newName(gray ? 'DeviceGray' : 'DeviceRGB'));
		if (isMask) {
			obj.writeRawStream(zlib.deflateSync(samples));
			obj.put('Filter', doc.newName('FlateDecode'));
		} else {
			const cs = gray ? mupdf.ColorSpace.DeviceGray : mupdf.ColorSpace.DeviceRGB;
			const pix = new mupdf.Pixmap(cs, [0, 0, nw, nh], false);
			pix.getPixels().set(samples); // view vào bộ nhớ WASM — ghi ngay, không giữ lại
			obj.writeRawStream(pix.asJPEG(85));
			pix.destroy();
			obj.put('Filter', doc.newName('DCTDecode'));
		}
	}
};

// Số kênh màu: DeviceRGB/DeviceGray hoặc ICCBased N=1/3; còn lại (CMYK, Indexed, Lab...) → 0
const colorComps = (cs) => {
	if (cs.isName()) return { DeviceRGB: 3, DeviceGray: 1 }[cs.asName()] || 0;
	if (cs.isArray() && cs.get(0).isName() && cs.get(0).asName() === 'ICCBased') {
		const n = cs.get(1).get('N').asNumber();
		return n === 1 || n === 3 ? n : 0;
	}
	return 0;
};

// Ảnh Flate 8 bit RGB/Gray (dạng phổ biến nhất của file thiết kế): giải nén dạng
// luồng ngoài WASM — xem flateImageShrink.js. Trả mẫu nw*nh*ncomp hoặc null.
const streamShrink = async (obj, w, h, nw, nh) => {
	const filter = obj.get('Filter');
	const f = filter.isArray() && filter.length === 1 ? filter.get(0) : filter;
	if (!f.isName() || f.asName() !== 'FlateDecode') return null;
	if (obj.get('BitsPerComponent').asNumber() !== 8 || !obj.get('Decode').isNull()) return null;
	const ncomp = colorComps(obj.get('ColorSpace'));
	if (!ncomp) return null;
	let dp = obj.get('DecodeParms');
	if (dp.isArray()) dp = dp.get(0);
	const num = (key, def) =>
		dp.isDictionary() && dp.get(key).isNumber() ? dp.get(key).asNumber() : def;
	const predictor = num('Predictor', 1);
	if (
		predictor >= 10 &&
		(num('Colors', 1) !== ncomp || num('BitsPerComponent', 8) !== 8 || num('Columns', 1) !== w)
	) {
		return null;
	}
	const rawBuf = obj.readRawStream();
	const raw = Buffer.from(rawBuf.asUint8Array()); // chép ra trước khi WASM cấp phát thêm
	rawBuf.destroy();
	return shrinkFlateImage(raw, { w, h, ncomp, predictor, nw, nh });
};

// Ảnh định dạng khác (JPEG, CMYK...): để mupdf giải nén — chỉ khi đủ nhỏ
const SMALL_DECODE_PIXELS = 4_000_000;
const smallShrink = (mupdf, doc, obj, nw, nh) => {
	const w = obj.get('Width').asNumber();
	const h = obj.get('Height').asNumber();
	if (w * h > SMALL_DECODE_PIXELS) return null;
	let pix;
	const swap = (next) => {
		if (next !== pix) pix?.destroy();
		pix = next;
	};
	try {
		const img = doc.loadImage(obj);
		swap(img.toPixmap());
		img.destroy();
		const gray = pix.getNumberOfComponents() - pix.getAlpha() === 1;
		if (pix.getAlpha() || !gray || pix.getColorSpace()?.getType() !== (gray ? 'Gray' : 'RGB')) {
			swap(
				pix.convertToColorSpace(
					gray ? mupdf.ColorSpace.DeviceGray : mupdf.ColorSpace.DeviceRGB,
					false,
				),
			);
		}
		if (nw !== w || nh !== h) {
			const corners = [
				[0, 0],
				[w, 0],
				[w, h],
				[0, h],
			];
			swap(pix.warp(corners, nw, nh));
		}
		return Uint8Array.from(pix.getPixels().subarray(0, nw * nh * (gray ? 1 : 3)));
	} catch {
		return null; // JBIG2, JPX hỏng... — để nguyên
	} finally {
		pix?.destroy();
	}
};

/**
 * @typedef {{ pdf: Buffer, page: { width: number, height: number },
 *   slots: Record<string, Slot>, unknown: string[], missing: string[], preview: Buffer, texts: TemplateText[] }} PreparedTemplate
 */

/**
 * Chạy trực tiếp trong tiến trình hiện tại — chỉ dùng trong worker (xem prepareTemplate).
 * @param {Buffer | Uint8Array} buffer  file PDF mẫu người dùng tải lên
 * @returns {Promise<PreparedTemplate>}
 */
const prepareTemplateCore = async (buffer) => {
	const mupdf = await loadMupdf();
	let doc;
	try {
		doc = mupdf.Document.openDocument(buffer, 'application/pdf').asPDF();
	} catch {
		doc = null;
	}
	if (!doc) throw httpError(400, 'Không đọc được file PDF mẫu.');
	try {
		if (doc.needsPassword()) throw httpError(400, 'File PDF mẫu đang đặt mật khẩu.');
		if (doc.countPages() !== 1) {
			throw httpError(
				400,
				`Mẫu giấy chứng nhận phải có đúng 1 trang (file có ${doc.countPages()} trang).`,
			);
		}
		const page = /** @type {import('mupdf').PDFPage} */ (doc.loadPage(0));
		const [bx0, by0, bx1, by1] = page.getBounds();
		const { slots, unknown } = findSlots(readLines(page));
		const found = Object.values(slots);
		if (!found.length) {
			throw httpError(
				400,
				'Không tìm thấy chỗ điền nào trong mẫu. Các ô cần điền phải là dãy dấu chấm "....." đặt sau nhãn (Chứng nhận, Sinh ngày, Đơn vị công tác, Vai trò, Quy đổi tương đương, Bằng chữ, Số).',
			);
		}
		// Lượt 1: xoá chữ (dấu chấm + đuôi "/C33.01" sẽ viết lại) — thu hẹp 0,4pt mỗi
		// bên để không ăn sang ký tự liền kề ("Số:" và "/").
		const textBoxes = found.flatMap((s) => [s.box, ...(s.suffixBox ? [s.suffixBox] : [])]);
		redact(mupdf, page, textBoxes, { textPad: [0.4, -0.4], artPad: 0, text: true });
		// Lượt 2: chỉ nét vẽ (lớp outline trùng bên dưới), vùng nới rộng — nét vẽ phải
		// nằm GỌN trong vùng mới bị xoá nên không đụng chữ bên cạnh.
		redact(mupdf, page, textBoxes, { textPad: [-2.5, 2.5], artPad: 1, text: false });
		await shrinkImages(mupdf, doc);
		// File xuất từ Illustrator nhúng kèm bản .ai gốc (PieceInfo/AIPrivateData, mẫu
		// thật ~11MB) để mở lại chỉnh sửa — không cần khi in; garbage=compact dọn object mồ côi.
		page.getObject().delete('PieceInfo');
		doc.getTrailer().get('Root').delete('PieceInfo');
		const pdf = Buffer.from(doc.saveToBuffer('garbage=compact,compress').asUint8Array());
		return {
			pdf,
			preview: await renderPreviewCore(pdf),
			texts: await extractTextsCore(pdf),
			page: { width: bx1 - bx0, height: by1 - by0 },
			slots,
			unknown,
			missing: SLOT_KEYS.filter((k) => !slots[k]),
		};
	} finally {
		doc.destroy?.();
	}
};

// Ảnh JPEG của mẫu ĐÃ làm sạch — nền cho màn chỉnh vị trí các ô (rộng ~PREVIEW_PX)
const PREVIEW_PX = 1240;
/** @param {Buffer | Uint8Array} pdf */
const renderPreviewCore = async (pdf) => {
	const mupdf = await loadMupdf();
	const doc = mupdf.Document.openDocument(pdf, 'application/pdf');
	try {
		const page = doc.loadPage(0);
		const [x0, , x1] = page.getBounds();
		const z = PREVIEW_PX / (x1 - x0);
		const pix = page.toPixmap(mupdf.Matrix.scale(z, z), mupdf.ColorSpace.DeviceRGB, false, true);
		const jpeg = Buffer.from(pix.asJPEG(82));
		pix.destroy();
		return jpeg;
	} finally {
		doc.destroy?.();
	}
};

// ─── Chữ in sẵn trên mẫu (tên hội nghị, ngày tháng...) ───────────────────────
/**
 * @typedef {{ id: string, text: string, x0: number, y0: number, x1: number, y1: number,
 *   baseline: number, size: number, color: number[], font: string, bold: boolean, italic: boolean,
 *   outline: { width: number, color: number[] } | null,
 *   align: 'left' | 'center' }} TemplateText
 */
const r1 = (v) => Math.round(v * 10) / 10;

// Các nét vẽ mảnh (≤ 1,5pt) trên trang: tâm + độ dày + màu — để nhận lớp viền chữ
const readThinStrokes = (mupdf, page) => {
	/** @type {{ cx: number, cy: number, w: number, color: number[] }[]} */
	const out = [];
	const dev = new mupdf.Device({
		strokePath(path, stroke, ctm, _cs, color) {
			const scale = Math.sqrt(Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2])) || 1;
			const w = stroke.getLineWidth() * scale;
			if (!(w > 0 && w <= 1.5)) return;
			const [x0, y0, x1, y1] = path.getBounds(stroke, ctm);
			out.push({ cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w, color: toRgb(Array.from(color)) });
		},
	});
	try {
		page.run(dev, mupdf.Matrix.identity);
		dev.close();
	} finally {
		dev.destroy?.();
	}
	return out;
};

/**
 * Các dòng chữ của mẫu ĐÃ làm sạch (không còn dãy chấm) — người dùng sửa được ở
 * màn chỉnh vị trí. Dòng nằm giữa trang (±4pt) coi là căn giữa.
 * @param {Buffer | Uint8Array} pdf
 * @returns {Promise<TemplateText[]>}
 */
const extractTextsCore = async (pdf) => {
	const mupdf = await loadMupdf();
	const doc = mupdf.Document.openDocument(pdf, 'application/pdf');
	try {
		const page = doc.loadPage(0);
		const [px0, , px1] = page.getBounds();
		const mid = (px1 - px0) / 2;
		const strokes = readThinStrokes(mupdf, page);
		return readLines(page)
			.map((l) => {
				const chars = l.chars.filter((c) => c.c.trim());
				if (chars.length < 2) return null;
				const box = unionQuads(chars.map((c) => c.quad));
				const first = chars[0];
				const center = Math.abs((box.x0 + box.x1) / 2 - mid) < 4;
				// Lớp viền mảnh cùng màu vẽ chồng lên chữ (mẫu thiết kế hay dùng để chữ dày
				// hơn) — dòng sửa phải vẽ viền y vậy mới cùng độ đậm với dòng gốc
				const inside = strokes.filter(
					(st) =>
						st.cx >= box.x0 - 1 &&
						st.cx <= box.x1 + 1 &&
						st.cy >= box.y0 - 1 &&
						st.cy <= box.y1 + 1,
				);
				const outline =
					inside.length >= Math.max(3, chars.length * 0.3)
						? {
								width:
									r1(inside.map((x) => x.w).sort((a, b) => a - b)[inside.length >> 1] * 100) / 100,
								color: inside[0].color,
							}
						: null;
				return {
					outline,
					text: l.chars
						.map((c) => c.c)
						.join('')
						.replace(/\s+/g, ' ')
						.trim(),
					x0: r1(box.x0),
					y0: r1(box.y0),
					x1: r1(box.x1),
					y1: r1(box.y1),
					baseline: r1(first.origin[1]),
					size: r1(first.size),
					color: first.color.map((v) => Math.round(v * 1000) / 1000),
					// Font gốc của dòng — bản in dòng đã sửa dùng lại font nhúng này
					font: first.font,
					bold: /bold|black|heavy|semibold/i.test(first.font),
					italic: /italic|oblique/i.test(first.font),
					align: /** @type {'left' | 'center'} */ (center ? 'center' : 'left'),
				};
			})
			.filter(Boolean)
			.sort((a, b) => a.baseline - b.baseline || a.x0 - b.x0)
			.map((t, i) => ({ id: `t${i + 1}`, ...t }));
	} finally {
		doc.destroy?.();
	}
};

/**
 * Xoá các dòng chữ người dùng đã sửa khỏi bản gốc (chữ + lớp nét vẽ trùng bên dưới,
 * như với dãy chấm) → mẫu mới + ảnh nền mới. Dòng mới do bản in viết vào.
 * @param {Buffer | Uint8Array} basePdf
 * @param {{ x0: number, y0: number, x1: number, y1: number }[]} boxes
 */
const removeTextsCore = async (basePdf, boxes) => {
	const mupdf = await loadMupdf();
	const doc = mupdf.Document.openDocument(basePdf, 'application/pdf').asPDF();
	try {
		if (boxes.length) {
			const page = /** @type {import('mupdf').PDFPage} */ (doc.loadPage(0));
			redact(mupdf, page, boxes, { textPad: [-0.5, 0.5], artPad: 0.5, text: true });
			// Lớp outline trùng bên dưới: đuôi chữ g/y/p thò xuống quá khung chữ → nới
			// phía dưới nhiều hơn (dòng kế tiếp cách ~24pt nên không bị xoá nhầm)
			const art = boxes.map((b) => ({ x0: b.x0, x1: b.x1, y0: b.y0 - 1, y1: b.y1 + 3 }));
			redact(mupdf, page, art, { textPad: [-2.5, 2.5], artPad: 1.5, text: false });
		}
		const pdf = Buffer.from(doc.saveToBuffer('garbage=compact,compress').asUint8Array());
		return { pdf, preview: await renderPreviewCore(pdf) };
	} finally {
		doc.destroy?.();
	}
};

// ─── Chạy trong worker thread ────────────────────────────────────────────────
// Bộ nhớ WASM của mupdf chỉ tăng không giảm: xử lý mẫu thật (ảnh nền 7680px)
// đẩy RSS lên ~400MB và giữ nguyên tới khi tiến trình chết — trong container
// backend 640MB là đủ làm sập. Worker riêng cho mỗi lần xử lý, xong thì thoát →
// trả lại toàn bộ. Xếp hàng từng mẫu một để 2 người tải cùng lúc không cộng dồn.
const WORKER_FILE = path.join(__dirname, 'certificateTemplateWorker.js');
const WORKER_TIMEOUT_MS = 120_000;
let queue = Promise.resolve();

// Kết quả qua structured clone: Buffer thành Uint8Array → đổi lại Buffer
const toBuffers = (r) => {
	if (r instanceof Uint8Array) return Buffer.from(r);
	if (!r || Array.isArray(r) || typeof r !== 'object') return r;
	const out = { ...r };
	for (const k of ['pdf', 'preview']) if (out[k]) out[k] = Buffer.from(out[k]);
	return out;
};

/**
 * @typedef {'prepare' | 'preview' | 'texts' | 'removeTexts'} WorkerMode
 * @param {WorkerMode} mode
 * @param {Buffer} buffer
 * @param {any} [extra]  removeTexts: danh sách khung cần xoá
 * @returns {Promise<any>}
 */
const runInWorker = (mode, buffer, extra) =>
	new Promise((resolve, reject) => {
		const worker = new Worker(WORKER_FILE, { workerData: { mode, buffer, extra } });
		const timer = setTimeout(() => {
			worker.terminate();
			reject(httpError(422, 'Xử lý file mẫu quá lâu — file có thể quá phức tạp hoặc hỏng.'));
		}, WORKER_TIMEOUT_MS);
		worker.once('message', (msg) => {
			clearTimeout(timer);
			if (msg.error?.detail) logger.error(`[certificate] Lỗi xử lý mẫu PDF: ${msg.error.detail}`);
			if (msg.error) reject(httpError(msg.error.statusCode || 500, msg.error.message));
			else resolve(toBuffers(msg.result));
		});
		worker.once('error', (err) => {
			clearTimeout(timer);
			reject(err);
		});
		worker.once('exit', (code) => {
			clearTimeout(timer);
			if (code !== 0) reject(new Error(`Worker xử lý mẫu thoát với mã ${code}`));
		});
	});

/**
 * Xếp hàng chạy trong worker thread riêng (từng việc một).
 * @param {WorkerMode} mode
 * @param {Buffer} buffer
 * @param {any} [extra]
 * @returns {Promise<any>}
 */
const enqueue = (mode, buffer, extra) => {
	const run = queue.then(() => runInWorker(mode, buffer, extra));
	queue = run.catch(() => {});
	return run;
};
/** Làm sạch + dò ô + ảnh xem trước + các dòng chữ. @type {(buffer: Buffer) => Promise<PreparedTemplate>} */
const prepareTemplate = (buffer) => enqueue('prepare', buffer);
/** Ảnh nền cho mẫu đã lưu từ trước khi có màn chỉnh vị trí. @type {(pdf: Buffer) => Promise<Buffer>} */
const renderPreview = (pdf) => enqueue('preview', pdf);
/** Dòng chữ của mẫu đã lưu từ trước khi sửa được chữ. @type {(pdf: Buffer) => Promise<TemplateText[]>} */
const extractTexts = (pdf) => enqueue('texts', pdf);
/** @type {(basePdf: Buffer, boxes: { x0: number, y0: number, x1: number, y1: number }[]) => Promise<{ pdf: Buffer, preview: Buffer }>} */
const removeTexts = (basePdf, boxes) => enqueue('removeTexts', basePdf, boxes);

module.exports = {
	prepareTemplate,
	prepareTemplateCore,
	renderPreview,
	renderPreviewCore,
	extractTexts,
	extractTextsCore,
	removeTexts,
	removeTextsCore,
	SLOT_LABELS,
	SLOT_KEYS,
	_test: { classify, findSlots },
};
