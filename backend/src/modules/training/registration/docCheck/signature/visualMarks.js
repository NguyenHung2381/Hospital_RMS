// Dò DẤU ĐỎ (con dấu tròn) và CHỮ KÝ TAY trên ảnh scan / ảnh chụp 1 trang giấy tờ.
// File THUẦN: đầu vào là điểm ảnh + (tuỳ chọn) danh sách từ OCR có toạ độ; không đọc file,
// không gọi Tesseract — docCheckAnalyzer.js (renderRgb / pixmapImage / ocrTsv) lo phần đó.
//
// Nguyên tắc như cả docCheck: chỉ CẢNH BÁO cho người duyệt, không tự từ chối; không trả chữ
// OCR. Thiếu bằng chứng (ảnh đen trắng, không có OCR...) ⇒ 'unclear', KHÔNG kết luận thiếu.
//
// Thuật toán (bộ nhớ O(số điểm ảnh), 1 lượt quét toàn ảnh + vài lượt trong vùng nhỏ):
//   1. Phân loại từng điểm ảnh: đỏ (mực dấu) / xanh (mực bút bi) / tối (mực bất kỳ) + đếm điểm
//      có màu để biết ảnh có màu không (bản photocopy / scan xám ⇒ color_available = false).
//   2. Dấu đỏ: gộp điểm đỏ theo lưới ô k×k, nối các ô gần nhau (vá nét đứt), mỗi vùng liền
//      xét kích thước so với cạnh ngắn trang (A4 rộng 21 cm, dấu 3–5 cm ⇒ ~0.14–0.24), tỉ lệ
//      gần vuông, rồi kiểm DẠNG VÀNH: dải sát mép vòng tròn phải có mực đỏ ở hầu hết các góc
//      quay, 4 góc khung (ngoài vòng tròn) phải gần trống, lòng không đặc kín. Loại được tiêu
//      đề in đỏ, gạch chân đỏ (dẹt), logo nhỏ (quá bé), khối chữ đỏ (góc khung không trống).
//   3. Chữ ký tay — có OCR: tìm dòng chức danh (GIÁM ĐỐC, KT. GIÁM ĐỐC, THỦ TRƯỞNG...; so mờ),
//      vùng xét = dưới chức danh tới dòng chữ in kế tiếp (dòng tên). Trong vùng, bỏ phần chữ
//      OCR đã nhận ra; còn mực xanh, hoặc đủ nhiều mực tối trải đủ rộng ⇒ có chữ ký.
//      Không có OCR (hoặc không thấy chức danh) ⇒ chỉ dựa vào mực xanh ở nửa dưới trang.
const { normalize, fuzzyHas } = require('../docCheckRules');

/**
 * Các ngưỡng — gom 1 chỗ để giai đoạn đo trên mẫu thật chỉnh. Tỉ lệ kích thước tính theo
 * cạnh NGẮN của ảnh (≈ khổ ngang A4) trừ khi ghi khác; lh = chiều cao dòng chức danh.
 */
const THRESHOLDS = Object.freeze({
	// Điểm ảnh đỏ (mực dấu đỏ / hồng cánh sen); loại cam / vàng qua g - b.
	red: { minR: 120, minRminusG: 60, minRminusB: 30, maxGminusB: 40 },
	// Mực xanh / tím bút bi; loại xanh nhạt in sẵn qua độ sáng.
	blue: { minB: 70, minBminusR: 35, minBminusG: 15, maxLum: 200 },
	darkLum: 130, // độ sáng < ngưỡng (và không đỏ) ⇒ mực tối
	// Ảnh "có màu": đủ điểm màu rõ (chroma ≥ 40, không quá tối), HOẶC nền giấy ngả màu (scan
	// màu thật hiếm khi trắng trung tính tuyệt đối).
	color: { chroma: 40, minMax: 100, minFrac: 4e-4, minPx: 30, tintChroma: 12, tintFrac: 0.1 },
	grid: { target: 400, cellMinFrac: 0.06, bridge: 2 }, // lưới gộp điểm đỏ
	seal: {
		minD: 0.1, // đường kính / cạnh ngắn (A4: 2.1 cm)
		maxD: 0.32, // (A4: 6.7 cm)
		minAspect: 0.75, // cạnh khung ngắn / dài
		ringIn: 0.8, // dải vành: bán kính tương đối [ringIn, ringOut]
		ringOut: 1.08,
		sectors: 24,
		sectorMinDensity: 0.08, // tỉ lệ điểm đỏ trong 1 ô quạt của dải vành để tính là "có nét"
		minCoverage: 0.6, // tỉ lệ ô quạt có nét
		cornerFrom: 1.18, // phần khung ngoài vòng tròn (góc)
		maxCornerRatio: 0.4, // mật độ góc / mật độ vành
		maxCornerDensity: 0.06,
		innerR: 0.55, // lòng dấu
		maxInnerDensity: 0.7, // lòng đặc hơn ⇒ hình tròn tô kín (logo), không phải dấu
	},
	sig: {
		maxExtraWords: 5, // dòng chức danh dài hơn cụm + 5 từ ⇒ câu văn, bỏ
		minTitleY: 0.3, // chức danh ở 30% đầu trang (vd "GIÁM ĐỐC BỆNH VIỆN" dưới tên văn bản) ⇒ bỏ
		wordConf: 65, // từ OCR "chắc chắn" (đã nhận ra là chữ)
		minGapLh: 1.5, // dòng chữ kế tiếp gần hơn ⇒ chức danh nằm trong đoạn văn, bỏ
		maxDepthLh: 7, // không thấy dòng tên ⇒ xét tối đa 7 lh dưới chức danh
		halfWidthTitle: 0.75, // nửa bề ngang vùng xét = max(0.75 × rộng chức danh, 0.15 × W)
		halfWidthPage: 0.15,
		blueLh2: 0.6, // ≥ 0.6·lh² điểm mực xanh ⇒ có chữ ký
		inkLh2: 1.2, // hoặc ≥ 1.2·lh² điểm mực tối...
		inkSpanLh: 1.5, // ...trải ngang ≥ 1.5·lh
	},
	inkOnly: { fromY: 0.5, blueFrac: 3e-4, minSpanW: 0.05 }, // không có OCR: nửa dưới trang
});

// Chức danh người ký — viết có dấu cho dễ đọc, chuẩn hoá lúc nạp; cụm dài xét trước.
const TITLE_PHRASES = [
	'PHÓ GIÁM ĐỐC',
	'GIÁM ĐỐC', // gồm cả KT. / TL. / Q. GIÁM ĐỐC
	'PHÓ HIỆU TRƯỞNG',
	'HIỆU TRƯỞNG',
	'THỦ TRƯỞNG',
	'TRƯỞNG KHOA',
	'TRƯỞNG PHÒNG',
	'VIỆN TRƯỞNG',
	'CHỦ TỊCH',
	'NGƯỜI ĐỀ NGHỊ',
	'NGƯỜI LÀM ĐƠN',
]
	.map(normalize)
	.sort((a, b) => b.length - a.length);

const RED = 1;
const BLUE = 2;
const DARK = 4;
const INK = BLUE | DARK;

// ─── 1. Phân loại điểm ảnh ───────────────────────────────────────────────────────
/**
 * @param {Image} img
 * @returns {{ mask: Uint8Array, colorful: number, tint: number, red: number, blue: number }}
 */
const classify = ({ pixels, width: w, height: h, channels = 4, stride }) => {
	const T = THRESHOLDS;
	const st = stride ?? w * channels;
	const mask = new Uint8Array(w * h);
	const gray = channels < 3;
	let colorful = 0;
	let tint = 0;
	let red = 0;
	let blue = 0;
	for (let y = 0; y < h; y++) {
		let i = y * st;
		let o = y * w;
		for (let x = 0; x < w; x++, i += channels, o++) {
			const r = pixels[i];
			const g = gray ? r : pixels[i + 1];
			const b = gray ? r : pixels[i + 2];
			const max = r > g ? (r > b ? r : b) : g > b ? g : b;
			const min = r < g ? (r < b ? r : b) : g < b ? g : b;
			const chroma = max - min;
			if (chroma >= T.color.tintChroma) {
				tint++;
				if (chroma >= T.color.chroma && max >= T.color.minMax) colorful++;
			}
			const lum = (r * 77 + g * 150 + b * 29) >> 8;
			let m = 0;
			if (
				r >= T.red.minR &&
				r - g >= T.red.minRminusG &&
				r - b >= T.red.minRminusB &&
				g - b <= T.red.maxGminusB
			) {
				m = RED;
				red++;
			} else {
				if (
					b >= T.blue.minB &&
					b - r >= T.blue.minBminusR &&
					b - g >= T.blue.minBminusG &&
					lum <= T.blue.maxLum
				) {
					m = BLUE;
					blue++;
				}
				if (lum < T.darkLum) m |= DARK;
			}
			mask[o] = m;
		}
	}
	return { mask, colorful, tint, red, blue };
};

// ─── 2. Dấu đỏ ───────────────────────────────────────────────────────────────────
/**
 * Vùng đỏ liền nhau trên lưới ô k×k (ô có ≥ cellMinFrac điểm đỏ), nối ô cách nhau ≤ bridge ô.
 * @returns {Array<{ x0: number, y0: number, x1: number, y1: number }>} khung điểm ảnh (x1, y1 loại trừ)
 */
const redRegions = (mask, w, h) => {
	const G = THRESHOLDS.grid;
	const k = Math.max(1, Math.ceil(Math.max(w, h) / G.target));
	const gw = Math.ceil(w / k);
	const gh = Math.ceil(h / k);
	const counts = new Uint16Array(gw * gh);
	for (let y = 0; y < h; y++) {
		const row = y * w;
		const crow = ((y / k) | 0) * gw;
		for (let x = 0; x < w; x++) if (mask[row + x] & RED) counts[crow + ((x / k) | 0)]++;
	}
	const minCount = Math.max(1, Math.floor(k * k * G.cellMinFrac));
	const label = new Int32Array(gw * gh); // 0 = chưa xét
	const queue = new Int32Array(gw * gh);
	const regions = [];
	let next = 0;
	for (let c0 = 0; c0 < counts.length; c0++) {
		if (counts[c0] < minCount || label[c0]) continue;
		next++;
		let head = 0;
		let tail = 0;
		queue[tail++] = c0;
		label[c0] = next;
		let gx0 = gw;
		let gy0 = gh;
		let gx1 = -1;
		let gy1 = -1;
		while (head < tail) {
			const c = queue[head++];
			const cx = c % gw;
			const cy = (c / gw) | 0;
			if (cx < gx0) gx0 = cx;
			if (cx > gx1) gx1 = cx;
			if (cy < gy0) gy0 = cy;
			if (cy > gy1) gy1 = cy;
			for (let dy = -G.bridge; dy <= G.bridge; dy++) {
				const ny = cy + dy;
				if (ny < 0 || ny >= gh) continue;
				for (let dx = -G.bridge; dx <= G.bridge; dx++) {
					const nx = cx + dx;
					if (nx < 0 || nx >= gw) continue;
					const n = ny * gw + nx;
					if (!label[n] && counts[n] >= minCount) {
						label[n] = next;
						queue[tail++] = n;
					}
				}
			}
		}
		regions.push({
			x0: gx0 * k,
			y0: gy0 * k,
			x1: Math.min(w, (gx1 + 1) * k),
			y1: Math.min(h, (gy1 + 1) * k),
		});
	}
	return regions;
};

/** Thu khung về sát điểm đỏ thật bên trong. */
const tightenRed = (mask, w, r) => {
	let x0 = r.x1;
	let y0 = r.y1;
	let x1 = r.x0 - 1;
	let y1 = r.y0 - 1;
	for (let y = r.y0; y < r.y1; y++) {
		const row = y * w;
		for (let x = r.x0; x < r.x1; x++) {
			if (!(mask[row + x] & RED)) continue;
			if (x < x0) x0 = x;
			if (x > x1) x1 = x;
			if (y < y0) y0 = y;
			if (y > y1) y1 = y;
		}
	}
	return x1 < x0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
};

/** Khung có dạng con dấu tròn (vành) không. */
const isSealRing = (mask, w, b) => {
	const S = THRESHOLDS.seal;
	const cx = (b.x0 + b.x1) / 2;
	const cy = (b.y0 + b.y1) / 2;
	const R = (b.x1 - b.x0 + (b.y1 - b.y0)) / 4;
	const ringTot = new Uint32Array(S.sectors);
	const ringRed = new Uint32Array(S.sectors);
	let cornerTot = 0;
	let cornerRed = 0;
	let innerTot = 0;
	let innerRed = 0;
	const in2 = S.ringIn * S.ringIn;
	const out2 = S.ringOut * S.ringOut;
	const corner2 = S.cornerFrom * S.cornerFrom;
	const inner2 = S.innerR * S.innerR;
	const sectorScale = S.sectors / (2 * Math.PI);
	for (let y = b.y0; y < b.y1; y++) {
		const dy = (y + 0.5 - cy) / R;
		const row = y * w;
		for (let x = b.x0; x < b.x1; x++) {
			const dx = (x + 0.5 - cx) / R;
			const d2 = dx * dx + dy * dy;
			const isRed = mask[row + x] & RED ? 1 : 0;
			if (d2 >= in2 && d2 <= out2) {
				const s = Math.min(S.sectors - 1, ((Math.atan2(dy, dx) + Math.PI) * sectorScale) | 0);
				ringTot[s]++;
				ringRed[s] += isRed;
			} else if (d2 >= corner2) {
				cornerTot++;
				cornerRed += isRed;
			} else if (d2 <= inner2) {
				innerTot++;
				innerRed += isRed;
			}
		}
	}
	let covered = 0;
	let rTot = 0;
	let rRed = 0;
	for (let s = 0; s < S.sectors; s++) {
		rTot += ringTot[s];
		rRed += ringRed[s];
		if (ringTot[s] && ringRed[s] / ringTot[s] >= S.sectorMinDensity) covered++;
	}
	const ringDensity = rTot ? rRed / rTot : 0;
	const cornerDensity = cornerTot ? cornerRed / cornerTot : 0;
	const innerDensity = innerTot ? innerRed / innerTot : 0;
	return (
		covered / S.sectors >= S.minCoverage &&
		cornerDensity <= S.maxCornerDensity &&
		cornerDensity <= ringDensity * S.maxCornerRatio &&
		innerDensity <= S.maxInnerDensity
	);
};

const findSeals = (mask, w, h) => {
	const S = THRESHOLDS.seal;
	const short = Math.min(w, h);
	const boxes = [];
	for (const r of redRegions(mask, w, h)) {
		// lọc thô bằng khung lưới (rẻ) trước khi quét điểm ảnh
		const rw = r.x1 - r.x0;
		const rh = r.y1 - r.y0;
		if (Math.max(rw, rh) < S.minD * short * 0.9) continue;
		const b = tightenRed(mask, w, r);
		if (!b) continue;
		const bw = b.x1 - b.x0;
		const bh = b.y1 - b.y0;
		const d = (bw + bh) / 2;
		if (d < S.minD * short || d > S.maxD * short) continue;
		if (Math.min(bw, bh) / Math.max(bw, bh) < S.minAspect) continue;
		if (!isSealRing(mask, w, b)) continue;
		boxes.push({ x: b.x0, y: b.y0, w: bw, h: bh });
	}
	return boxes;
};

// ─── 3. Chữ ký tay ───────────────────────────────────────────────────────────────
const isConfident = (wd) =>
	wd.conf >= THRESHOLDS.sig.wordConf && /[A-Z]{2}/.test(normalize(wd.text));

/** Gom từ OCR theo dòng; mỗi dòng: danh sách từ (trái → phải) + token đã chuẩn hoá. */
const groupLines = (words) => {
	/** @type {Map<string, OcrWord[]>} */
	const map = new Map();
	for (const wd of words) {
		if (!wd || !(wd.width > 0) || !(wd.height > 0)) continue;
		const key = String(wd.line ?? `${wd.top}`);
		if (!map.has(key)) map.set(key, []);
		map.get(key).push(wd);
	}
	return [...map.values()].map((ws) => {
		ws.sort((a, b) => a.left - b.left);
		/** @type {Array<{ tok: string, wd: OcrWord }>} */
		const toks = [];
		for (const wd of ws)
			for (const tok of normalize(wd.text).split(' ')) if (tok) toks.push({ tok, wd });
		return { words: ws, toks };
	});
};

/** Khung bao các từ. */
const unionBox = (ws) => {
	let x0 = Infinity;
	let y0 = Infinity;
	let x1 = -Infinity;
	let y1 = -Infinity;
	for (const wd of ws) {
		x0 = Math.min(x0, wd.left);
		y0 = Math.min(y0, wd.top);
		x1 = Math.max(x1, wd.left + wd.width);
		y1 = Math.max(y1, wd.top + wd.height);
	}
	return { x0, y0, x1, y1 };
};

/** Dòng có chứa chức danh (dòng ngắn) ⇒ khung các từ của cụm chức danh, không thì null. */
const titleBoxOf = (line) => {
	const toks = line.toks.map((t) => t.tok);
	for (const phrase of TITLE_PHRASES) {
		const n = phrase.split(' ').length;
		if (toks.length > n + THRESHOLDS.sig.maxExtraWords) continue;
		for (let i = 0; i + n <= toks.length; i++) {
			const win = toks.slice(i, i + n);
			if (fuzzyHas(win.join(' '), win, phrase)) {
				return unionBox([...new Set(line.toks.slice(i, i + n).map((t) => t.wd))]);
			}
		}
	}
	return null;
};

/**
 * Đếm mực trong vùng [x0,x1)×[y0,y1), bỏ điểm nằm trong khung từ OCR đã nhận ra.
 * @returns {{ blue: number, ink: number, span: number }}
 */
const inkIn = (mask, w, reg, excludeWords) => {
	const rw = reg.x1 - reg.x0;
	const rh = reg.y1 - reg.y0;
	if (rw <= 0 || rh <= 0) return { blue: 0, ink: 0, span: 0 };
	const skip = new Uint8Array(rw * rh);
	for (const wd of excludeWords) {
		const ax = Math.max(reg.x0, Math.floor(wd.left));
		const bx = Math.min(reg.x1, Math.ceil(wd.left + wd.width));
		const ay = Math.max(reg.y0, Math.floor(wd.top));
		const by = Math.min(reg.y1, Math.ceil(wd.top + wd.height));
		if (ax >= bx) continue; // ngoài vùng theo chiều ngang (fill() với chỉ số âm sẽ tính từ cuối mảng)
		for (let y = ay; y < by; y++)
			skip.fill(1, (y - reg.y0) * rw + ax - reg.x0, (y - reg.y0) * rw + bx - reg.x0);
	}
	let blue = 0;
	let ink = 0;
	let minX = Infinity;
	let maxX = -Infinity;
	for (let y = reg.y0; y < reg.y1; y++) {
		const row = y * w;
		const srow = (y - reg.y0) * rw - reg.x0;
		for (let x = reg.x0; x < reg.x1; x++) {
			const m = mask[row + x];
			if (!(m & INK) || skip[srow + x]) continue;
			ink++;
			if (m & BLUE) blue++;
			if (x < minX) minX = x;
			if (x > maxX) maxX = x;
		}
	}
	return { blue, ink, span: ink ? maxX - minX + 1 : 0 };
};

/** Có OCR: xét vùng dưới từng dòng chức danh. */
const signatureByOcr = (mask, w, h, words) => {
	const T = THRESHOLDS.sig;
	const lines = groupLines(words);
	const confident = words.filter((wd) => wd && wd.width > 0 && wd.height > 0 && isConfident(wd));
	let titleFound = false;
	for (const line of lines) {
		const t = titleBoxOf(line);
		if (!t || t.y0 < T.minTitleY * h) continue;
		const lh = t.y1 - t.y0;
		const cx = (t.x0 + t.x1) / 2;
		const half = Math.max((t.x1 - t.x0) * T.halfWidthTitle, w * T.halfWidthPage);
		const x0 = Math.max(0, Math.floor(cx - half));
		const x1 = Math.min(w, Math.ceil(cx + half));
		// dòng chữ in kế tiếp bên dưới (≥ 2 từ chắc chắn, hoặc 1 từ ≥ 4 chữ cái)
		/** @type {Map<string, OcrWord[]>} */
		const below = new Map();
		for (const wd of confident) {
			const mx = wd.left + wd.width / 2;
			if (mx < x0 || mx > x1 || wd.top < t.y1 + 0.3 * lh) continue;
			const key = String(wd.line ?? `${wd.top}`);
			if (!below.has(key)) below.set(key, []);
			below.get(key).push(wd);
		}
		let nextTop = Infinity;
		let nextLine = null;
		for (const [key, ws] of below) {
			const ok = ws.length >= 2 || normalize(ws[0].text).replace(/[^A-Z]/g, '').length >= 4;
			if (!ok) continue;
			const top = Math.min(...ws.map((wd) => wd.top));
			if (top < nextTop) {
				nextTop = top;
				nextLine = key;
			}
		}
		if (nextLine !== null) {
			const nl = lines.find((l) => String(l.words[0].line ?? `${l.words[0].top}`) === nextLine);
			if (nl && titleBoxOf(nl)) continue; // chức danh 2 dòng (KT. GIÁM ĐỐC / PHÓ GIÁM ĐỐC) ⇒ xét dòng dưới
			if (nextTop - t.y1 < T.minGapLh * lh) continue; // chức danh nằm giữa đoạn văn
		}
		titleFound = true;
		const reg = {
			x0,
			x1,
			y0: Math.min(h, Math.ceil(t.y1 + 0.25 * lh)),
			y1: Math.min(
				h,
				Math.floor(Number.isFinite(nextTop) ? nextTop - 0.15 * lh : t.y1 + T.maxDepthLh * lh),
			),
		};
		const c = inkIn(mask, w, reg, confident);
		const lh2 = lh * lh;
		if (c.blue >= T.blueLh2 * lh2 || (c.ink >= T.inkLh2 * lh2 && c.span >= T.inkSpanLh * lh)) {
			return { found: true, titleFound: true };
		}
	}
	return { found: false, titleFound };
};

/** Không có OCR: mực xanh ở nửa dưới trang. */
const signatureByBlueInk = (mask, w, h) => {
	const T = THRESHOLDS.inkOnly;
	let blue = 0;
	let minX = Infinity;
	let maxX = -Infinity;
	for (let y = Math.floor(h * T.fromY); y < h; y++) {
		const row = y * w;
		for (let x = 0; x < w; x++) {
			if (!(mask[row + x] & BLUE)) continue;
			blue++;
			if (x < minX) minX = x;
			if (x > maxX) maxX = x;
		}
	}
	return blue >= T.blueFrac * w * h && maxX - minX + 1 >= T.minSpanW * w;
};

// ─── Tổng hợp ────────────────────────────────────────────────────────────────────
/**
 * @typedef {{ text: string, conf: number, left: number, top: number, width: number,
 *   height: number, line?: string | number }} OcrWord
 * @typedef {{ pixels: ArrayLike<number>, width: number, height: number, channels?: number,
 *   stride?: number }} Image
 * channels: 4 = RGBA (canvas getImageData), 3 = RGB (pixmap mupdf), 1 = xám. stride: số byte
 * mỗi hàng (mặc định width × channels).
 */

/**
 * Dò dấu đỏ + chữ ký tay trên 1 trang.
 * @param {Image & { words?: OcrWord[] | null, expect?: { seal?: boolean, signature?: boolean } }} input
 *   words: từ OCR (ocrTsv) TRÊN CHÍNH ẢNH NÀY (cùng hệ toạ độ). expect: giấy tờ này cần dấu /
 *   chữ ký không (mặc định cần cả hai) — chỉ ảnh hưởng verdict.
 * @returns {{
 *   verdict: 'marks_ok' | 'marks_missing' | 'unclear',
 *   color_available: boolean,
 *   seal: { found: boolean | null, count: number, boxes: Array<{ x: number, y: number, w: number, h: number }> },
 *   hand_signature: { found: boolean, near_title: boolean, title_found: boolean, method: 'ocr' | 'ink_only' },
 *   signals: { ms: number, red_px: number, blue_px: number, colorful_px: number },
 * }}
 */
const detectMarks = (input) => {
	const started = Date.now();
	const { width: w, height: h, words = null, expect = {} } = input;
	if (!(w > 0) || !(h > 0) || !input.pixels) throw new TypeError('detectMarks: ảnh không hợp lệ');
	const C = THRESHOLDS.color;
	const { mask, colorful, tint, red, blue } = classify(input);
	const n = w * h;
	const colorAvailable = colorful >= Math.max(C.minPx, C.minFrac * n) || tint >= C.tintFrac * n;

	const boxes = colorAvailable ? findSeals(mask, w, h) : [];
	const seal = { found: colorAvailable ? boxes.length > 0 : null, count: boxes.length, boxes };

	/** @type {{ found: boolean, near_title: boolean, title_found: boolean, method: 'ocr' | 'ink_only' }} */
	let hand = { found: false, near_title: false, title_found: false, method: 'ink_only' };
	if (Array.isArray(words) && words.length) {
		const r = signatureByOcr(mask, w, h, words);
		if (r.titleFound)
			hand = { found: r.found, near_title: r.found, title_found: true, method: 'ocr' };
	}
	if (hand.method === 'ink_only') hand.found = signatureByBlueInk(mask, w, h);

	// Từng loại dấu: có / thiếu / không kết luận được
	const sealState = seal.found === null ? 'unknown' : seal.found ? 'present' : 'absent';
	// Thiếu chữ ký chỉ kết luận khi đã thấy chức danh và vùng ký trống; dựa mực xanh mà không
	// thấy thì có thể là chữ ký mực đen ⇒ không kết luận.
	const sigState = hand.found ? 'present' : hand.method === 'ocr' ? 'absent' : 'unknown';
	const states = [];
	if (expect.seal !== false) states.push(sealState);
	if (expect.signature !== false) states.push(sigState);
	const verdict = states.includes('absent')
		? 'marks_missing'
		: states.includes('unknown')
			? 'unclear'
			: 'marks_ok';

	return {
		verdict,
		color_available: colorAvailable,
		seal,
		hand_signature: hand,
		signals: { ms: Date.now() - started, red_px: red, blue_px: blue, colorful_px: colorful },
	};
};

module.exports = { detectMarks, THRESHOLDS, TITLE_PHRASES };
