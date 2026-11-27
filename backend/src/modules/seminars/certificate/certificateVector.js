/**
 * certificateVector.js — mẫu giấy chứng nhận KHÔNG có lớp chữ.
 *
 * File xuất từ CorelDRAW / Illustrator hay "chuyển chữ thành nét vẽ": trang không
 * còn ký tự nào, mỗi chữ là vài đường viền tô đặc. Không đọc được nội dung, nhưng:
 *   - gom các đường viền nhỏ cùng màu thành từng DÒNG → người dùng chọn dòng / đoạn
 *     cần thay ở màn chỉnh mẫu (readVectorTexts);
 *   - xoá một vùng = dán đè miếng vá là ảnh của chính vùng đó vẽ lại KHÔNG có các
 *     hình tô đặc (chữ), chỉ còn nền (dải màu, ảnh, hình mờ trong suốt) → liền nền
 *     (applyPatches).
 * Các hàm nhận module mupdf đã nạp (certificateTemplate.loadMupdf, chạy trong worker).
 */
const OPAQUE = 0.99;
// Hình tô đặc chiếm quá 1/4 trang là nền (khung, mảng màu), không phải chữ
const MAX_GLYPH_PAGE_FRACTION = 0.25;
const MAX_GLYPH_H = 45;
const MAX_GLYPH_W = 60;
// 2 đường viền cách nhau theo chiều dọc ≤ khoảng này coi là cùng dòng (dấu tiếng Việt tách rời chữ)
const ROW_GAP = 2.5;
// Khoảng trống ngang lớn hơn → 2 khối chữ khác nhau trên cùng hàng (vd 2 cột tiêu đề)
const SEGMENT_GAP = 22;
// Độ phân giải miếng vá (in vẫn nét, file không quá nặng)
const PATCH_DPI = 300;

const r1 = (v) => Math.round(v * 10) / 10;
const areaOf = (b) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);

/**
 * Thiết bị chuyển tiếp mọi lệnh vẽ sang `target`, bỏ các hình "chữ": tô / viền
 * đặc (không trong suốt) và không quá lớn → chỉ còn nền.
 */
const backgroundDevice = (mupdf, target, pageArea) => {
	const isGlyph = (bounds, alpha) =>
		alpha >= OPAQUE && areaOf(bounds) <= pageArea * MAX_GLYPH_PAGE_FRACTION;
	// mupdf.js (1.28) bọc Shade / Image trong callback mà KHÔNG giữ tham chiếu (khác
	// Path, ColorSpace...) nhưng vẫn gắn bộ huỷ khi GC → nhả 2 lần, hỏng bộ nhớ WASM.
	// Dùng xong thì gỡ bộ huỷ: đối tượng là của mupdf, không phải của ta.
	const borrowed = (obj, fn) => {
		try {
			fn();
		} finally {
			obj?.constructor?._finalizer?.unregister(obj);
		}
	};
	return new mupdf.Device({
		fillPath(p, evenOdd, ctm, cs, color, alpha) {
			if (!isGlyph(p.getBounds(null, ctm), alpha))
				target.fillPath(p, evenOdd, ctm, cs, color, alpha);
		},
		strokePath(p, stroke, ctm, cs, color, alpha) {
			if (!isGlyph(p.getBounds(stroke, ctm), alpha)) {
				target.strokePath(p, stroke, ctm, cs, color, alpha);
			}
		},
		clipPath: (p, evenOdd, ctm) => target.clipPath(p, evenOdd, ctm),
		clipStrokePath: (p, stroke, ctm) => target.clipStrokePath(p, stroke, ctm),
		fillText(t, ctm, cs, color, alpha) {
			if (alpha < OPAQUE) target.fillText(t, ctm, cs, color, alpha);
		},
		strokeText(t, stroke, ctm, cs, color, alpha) {
			if (alpha < OPAQUE) target.strokeText(t, stroke, ctm, cs, color, alpha);
		},
		clipText: (t, ctm) => target.clipText(t, ctm),
		clipStrokeText: (t, stroke, ctm) => target.clipStrokeText(t, stroke, ctm),
		ignoreText: (t, ctm) => target.ignoreText(t, ctm),
		fillShade: (sh, ctm, alpha) => borrowed(sh, () => target.fillShade(sh, ctm, alpha)),
		fillImage: (img, ctm, alpha) => borrowed(img, () => target.fillImage(img, ctm, alpha)),
		fillImageMask: (img, ctm, cs, color, alpha) =>
			borrowed(img, () => target.fillImageMask(img, ctm, cs, color, alpha)),
		clipImageMask: (img, ctm) => borrowed(img, () => target.clipImageMask(img, ctm)),
		popClip: () => target.popClip(),
		beginMask: (area, lum, cs, color) => target.beginMask(area, lum, cs, color),
		endMask: () => target.endMask(),
		beginGroup: (area, cs, isolated, knockout, blend, alpha) =>
			target.beginGroup(area, cs, isolated, knockout, blend, alpha),
		endGroup: () => target.endGroup(),
		beginTile: (area, view, xstep, ystep, ctm, id, docId) =>
			target.beginTile(area, view, xstep, ystep, ctm, id, docId),
		endTile: () => target.endTile(),
		beginLayer: (name) => target.beginLayer(name),
		endLayer: () => target.endLayer(),
	});
};

/** Đường viền con (mỗi lệnh moveTo) của các hình tô đặc nhỏ: khung + khoá màu. */
const readGlyphContours = (mupdf, page) => {
	const [px0, py0, px1, py1] = page.getBounds();
	const pageArea = (px1 - px0) * (py1 - py0);
	/** @type {{ x0: number, y0: number, x1: number, y1: number, key: string }[]} */
	const out = [];
	const dev = new mupdf.Device({
		fillPath(p, _eo, ctm, _cs, color, alpha) {
			if (alpha < OPAQUE || areaOf(p.getBounds(null, ctm)) > pageArea * MAX_GLYPH_PAGE_FRACTION)
				return;
			const key = Array.from(color)
				.map((v) => v.toFixed(2))
				.join(',');
			let cur = null;
			const add = (x, y) => {
				if (!cur) return;
				const px = x * ctm[0] + y * ctm[2] + ctm[4];
				const py = x * ctm[1] + y * ctm[3] + ctm[5];
				if (px < cur.x0) cur.x0 = px;
				if (px > cur.x1) cur.x1 = px;
				if (py < cur.y0) cur.y0 = py;
				if (py > cur.y1) cur.y1 = py;
			};
			p.walk({
				moveTo(x, y) {
					const px = x * ctm[0] + y * ctm[2] + ctm[4];
					const py = x * ctm[1] + y * ctm[3] + ctm[5];
					cur = { x0: px, y0: py, x1: px, y1: py, key };
					out.push(cur);
				},
				lineTo: add,
				curveTo(a, b, c, d, e, f) {
					add(a, b);
					add(c, d);
					add(e, f);
				},
			});
		},
	});
	try {
		page.run(dev, mupdf.Matrix.identity);
		dev.close();
	} finally {
		dev.destroy?.();
	}
	return out.filter(
		(g) => g.y1 - g.y0 > 0.3 && g.y1 - g.y0 < MAX_GLYPH_H && g.x1 - g.x0 < MAX_GLYPH_W,
	);
};

/**
 * Gom đường viền thành dòng chữ: cùng màu, chồng / sát nhau theo chiều dọc; trong
 * 1 hàng, khoảng trống ngang lớn tách thành khối riêng.
 * @returns {{ x0: number, y0: number, x1: number, y1: number, baseline: number, size: number, n: number }[]}
 */
const groupGlyphLines = (contours) => {
	const sorted = [...contours].sort((a, b) => a.y0 - b.y0);
	/** @type {{ key: string, y0: number, y1: number, items: typeof contours }[]} */
	const rows = [];
	for (const g of sorted) {
		const row = rows.find((r) => r.key === g.key && g.y0 < r.y1 + ROW_GAP && g.y1 > r.y0 - ROW_GAP);
		if (row) {
			row.y0 = Math.min(row.y0, g.y0);
			row.y1 = Math.max(row.y1, g.y1);
			row.items.push(g);
		} else rows.push({ key: g.key, y0: g.y0, y1: g.y1, items: [g] });
	}
	const lines = [];
	for (const row of rows) {
		// Khung / hoa văn trang trí xếp thành cột cao → không phải dòng chữ
		if (row.y1 - row.y0 > MAX_GLYPH_H) continue;
		const items = row.items.sort((a, b) => a.x0 - b.x0);
		/** @type {(typeof items)[]} */
		const segs = [];
		let right = -Infinity;
		for (const g of items) {
			if (segs.length && g.x0 - right < SEGMENT_GAP) segs[segs.length - 1].push(g);
			else segs.push([g]);
			right = segs[segs.length - 1].length === 1 ? g.x1 : Math.max(right, g.x1);
		}
		for (const seg of segs) {
			if (seg.length < 2) continue;
			const x0 = Math.min(...seg.map((g) => g.x0));
			const x1 = Math.max(...seg.map((g) => g.x1));
			const y0 = Math.min(...seg.map((g) => g.y0));
			const y1 = Math.max(...seg.map((g) => g.y1));
			// Chân chữ: đáy chung của nhiều đường viền nhất (bỏ dấu, phần thò xuống g/y/p)
			const votes = new Map();
			for (const g of seg) {
				const k = Math.round(g.y1 * 2) / 2;
				votes.set(k, (votes.get(k) || 0) + (g.x1 - g.x0));
			}
			const baseline = [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0];
			// Cỡ chữ ≈ chiều cao chữ cao nhất đứng trên chân chữ (h, l, chữ hoa ~0,7 em)
			const tall = Math.max(
				...seg.filter((g) => Math.abs(g.y1 - baseline) < 1).map((g) => g.y1 - g.y0),
			);
			const size = Math.min(tall / 0.7, (y1 - y0) / 1.05);
			lines.push({ x0, y0, x1, y1, baseline, size, n: seg.length });
		}
	}
	return lines;
};

// Ảnh RGB của trang (đầy đủ / chỉ nền) ở tỉ lệ z — để lấy màu chữ
const renderRgb = (mupdf, page, z, backgroundOnly) => {
	const [x0, y0, x1, y1] = page.getBounds();
	const bbox = [Math.floor(x0 * z), Math.floor(y0 * z), Math.ceil(x1 * z), Math.ceil(y1 * z)];
	const pix = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, bbox, false);
	pix.clear(255);
	const draw = new mupdf.DrawDevice(mupdf.Matrix.scale(z, z), pix);
	const dev = backgroundOnly ? backgroundDevice(mupdf, draw, (x1 - x0) * (y1 - y0)) : draw;
	try {
		page.run(dev, mupdf.Matrix.identity);
		dev.close();
		if (dev !== draw) draw.close();
	} finally {
		// Huỷ thiết bị TRƯỚC pixmap (thiết bị vẽ giữ tham chiếu tới pixmap)
		if (dev !== draw) dev.destroy?.();
		draw.destroy?.();
	}
	return pix;
};

/**
 * Màu chữ của từng dòng: so ảnh đầy đủ với ảnh chỉ nền, điểm ảnh khác nhiều nhất là
 * chữ → trung bình màu các điểm đó (màu đã qua quản lý màu, khớp với mắt nhìn).
 */
const sampleLineColors = (mupdf, page, lines) => {
	const z = 2;
	const full = renderRgb(mupdf, page, z, false);
	const bg = renderRgb(mupdf, page, z, true);
	try {
		const w = full.getWidth();
		const h = full.getHeight();
		const stride = full.getStride();
		const a = full.getPixels();
		const b = bg.getPixels();
		return lines.map((l) => {
			/** @type {[number, number][]} */
			const px = [];
			for (let y = Math.max(0, Math.floor(l.y0 * z)); y < Math.min(h, Math.ceil(l.y1 * z)); y++) {
				for (let x = Math.max(0, Math.floor(l.x0 * z)); x < Math.min(w, Math.ceil(l.x1 * z)); x++) {
					const i = y * stride + x * 3;
					const d =
						Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
					if (d > 60) px.push([d, i]);
				}
			}
			if (!px.length) return [0, 0, 0];
			px.sort((p, q) => q[0] - p[0]);
			const top = px.slice(0, Math.max(1, Math.round(px.length * 0.3)));
			const sum = [0, 0, 0];
			for (const [, i] of top) for (let k = 0; k < 3; k++) sum[k] += a[i + k];
			return sum.map((v) => Math.round((v / top.length / 255) * 1000) / 1000);
		});
	} finally {
		full.destroy();
		bg.destroy();
	}
};

/**
 * Dòng chữ dạng nét vẽ của trang (dùng khi trang không có lớp chữ). Cùng dạng với
 * TemplateText nhưng `text` rỗng (không đọc được) và `vector: true`.
 * @returns {import('./certificateTemplate').TemplateText[]}
 */
const readVectorTexts = (mupdf, page) => {
	const [px0, , px1] = page.getBounds();
	const mid = (px1 - px0) / 2;
	const lines = groupGlyphLines(readGlyphContours(mupdf, page));
	const colors = lines.length ? sampleLineColors(mupdf, page, lines) : [];
	return lines
		.map((l, i) => ({
			vector: true,
			outline: null,
			text: '',
			x0: r1(l.x0),
			y0: r1(l.y0),
			x1: r1(l.x1),
			y1: r1(l.y1),
			baseline: r1(l.baseline),
			size: r1(l.size),
			color: colors[i],
			font: '',
			bold: false,
			italic: false,
			align: /** @type {'left' | 'center'} */ (
				Math.abs((l.x0 + l.x1) / 2 - mid) < 4 ? 'center' : 'left'
			),
		}))
		.sort((a, b) => a.baseline - b.baseline || a.x0 - b.x0)
		.map((t, i) => ({ id: `v${i + 1}`, ...t }));
};

/**
 * Dán miếng vá nền lên các vùng (toạ độ mupdf, gốc trên-trái) của trang 1 của `doc`.
 * @param {typeof import('mupdf')} mupdf
 * @param {import('mupdf').PDFDocument} doc
 * @param {import('mupdf').PDFPage} page
 * @param {{ x0: number, y0: number, x1: number, y1: number }[]} rects
 */
const applyPatches = (mupdf, doc, page, rects) => {
	const pageObj = page.getObject();
	const [bx0, by0, bx1, by1] = page.getBounds();
	const pageArea = (bx1 - bx0) * (by1 - by0);
	const z = PATCH_DPI / 72;
	const inv = mupdf.Matrix.invert(page.getTransform());
	const toPdf = (x, y) => [x * inv[0] + y * inv[2] + inv[4], x * inv[1] + y * inv[3] + inv[5]];

	let res = pageObj.get('Resources');
	if (!res.isDictionary()) {
		// Mẫu chỉ có 1 trang → dùng thẳng Resources kế thừa từ nút Pages
		res = pageObj.getInheritable('Resources');
		if (!res.isDictionary()) res = doc.newDictionary();
		pageObj.put('Resources', res);
	}
	let xobjs = res.get('XObject');
	if (!xobjs.isDictionary()) {
		xobjs = doc.newDictionary();
		res.put('XObject', xobjs);
	}
	const ops = ['Q'];
	rects.forEach((r, i) => {
		/** @type {import('mupdf').Rect} */
		const bbox = [
			Math.floor(Math.max(bx0, r.x0) * z),
			Math.floor(Math.max(by0, r.y0) * z),
			Math.ceil(Math.min(bx1, r.x1) * z),
			Math.ceil(Math.min(by1, r.y1) * z),
		];
		if (bbox[2] <= bbox[0] || bbox[3] <= bbox[1]) return;
		// Vẽ bằng RGB: bộ vẽ CMYK của mupdf sai với nhóm trong suốt có chế độ hoà màu
		// (hoa văn nền ra xám). Ảnh RGB đã quản lý màu → khớp nền khi xem / in.
		const pix = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, bbox, false);
		pix.clear(255); // nền giấy trắng
		const draw = new mupdf.DrawDevice(mupdf.Matrix.scale(z, z), pix);
		const dev = backgroundDevice(mupdf, draw, pageArea);
		try {
			page.run(dev, mupdf.Matrix.identity);
			dev.close();
			draw.close();
		} finally {
			dev.destroy?.();
			draw.destroy?.();
		}
		const w = pix.getWidth();
		const h = pix.getHeight();
		const jpeg = pix.asJPEG(90);
		pix.destroy();
		const img = doc.addRawStream(jpeg, {
			Type: 'XObject',
			Subtype: 'Image',
			Width: w,
			Height: h,
			BitsPerComponent: 8,
			ColorSpace: 'DeviceRGB',
			Filter: 'DCTDecode',
		});
		let name = `CertPatch${i + 1}`;
		while (!xobjs.get(name).isNull()) name += 'x';
		xobjs.put(name, img);
		// Góc ảnh: (0,0) = dưới-trái, (1,0) = dưới-phải, (0,1) = trên-trái
		const [fx0, fy0, fx1, fy1] = bbox.map((v) => v / z);
		const p00 = toPdf(fx0, fy1);
		const p10 = toPdf(fx1, fy1);
		const p01 = toPdf(fx0, fy0);
		const m = [p10[0] - p00[0], p10[1] - p00[1], p01[0] - p00[0], p01[1] - p00[1], ...p00];
		ops.push(`q ${m.map((v) => +v.toFixed(4)).join(' ')} cm /${name} Do Q`);
	});
	// Bọc nội dung gốc trong q…Q (nội dung có thể để lại phép biến đổi) rồi vẽ miếng vá lên trên
	const contents = pageObj.get('Contents');
	const arr = doc.newArray();
	arr.push(doc.addStream('q', null));
	if (contents.isArray()) for (let k = 0; k < contents.length; k++) arr.push(contents.get(k));
	else if (!contents.isNull()) arr.push(contents);
	arr.push(doc.addStream(ops.join('\n'), null));
	pageObj.put('Contents', arr);
};

module.exports = { readVectorTexts, applyPatches, backgroundDevice, _test: { groupGlyphLines } };
