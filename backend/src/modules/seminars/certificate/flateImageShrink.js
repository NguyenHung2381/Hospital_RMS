/**
 * flateImageShrink.js — thu nhỏ ảnh PDF nén Flate (8 bit/kênh) mà KHÔNG giải nén
 * cả ảnh vào bộ nhớ: giải nén dạng luồng bằng zlib của Node, gộp từng hàng gốc
 * vào hàng đích theo trung bình vùng (box filter).
 *
 * Lý do: ảnh nền mẫu thật 7680×4320 RGB = ~100MB khi giải nén; để mupdf (WASM)
 * giải nén thì bộ nhớ WASM phình lên ~400MB và không trả lại — vượt giới hạn
 * container backend. Cách này chỉ tốn vài MB ngoài ảnh đích.
 *
 * Hỗ trợ Predictor 1 (không) và PNG 10–15; loại khác (TIFF 2...) trả null để bên
 * gọi bỏ qua ảnh đó.
 */
const zlib = require('zlib');

const SLICE = 256 * 1024;

const paeth = (a, b, c) => {
	const p = a + b - c;
	const pa = Math.abs(p - a);
	const pb = Math.abs(p - b);
	const pc = Math.abs(p - c);
	return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

// Bỏ bộ lọc PNG của 1 hàng tại chỗ (cur), prev = hàng trước đã giải
const unfilterPng = (type, cur, prev, bpp) => {
	const n = cur.length;
	switch (type) {
		case 0:
			return;
		case 1:
			for (let i = bpp; i < n; i++) cur[i] = (cur[i] + cur[i - bpp]) & 255;
			return;
		case 2:
			for (let i = 0; i < n; i++) cur[i] = (cur[i] + prev[i]) & 255;
			return;
		case 3:
			for (let i = 0; i < n; i++)
				cur[i] = (cur[i] + (((i >= bpp ? cur[i - bpp] : 0) + prev[i]) >> 1)) & 255;
			return;
		case 4:
			for (let i = 0; i < n; i++) {
				cur[i] =
					(cur[i] + paeth(i >= bpp ? cur[i - bpp] : 0, prev[i], i >= bpp ? prev[i - bpp] : 0)) &
					255;
			}
			return;
		default:
			throw new Error(`Bộ lọc PNG không hợp lệ: ${type}`);
	}
};

/**
 * @param {Uint8Array} raw  dữ liệu stream đã nén Flate (chưa giải)
 * @param {{ w: number, h: number, ncomp: number, predictor?: number, nw: number, nh: number }} o
 * @returns {Promise<Uint8Array | null>}  nw*nh*ncomp mẫu, hoặc null nếu không hỗ trợ
 */
const shrinkFlateImage = async (raw, { w, h, ncomp, predictor = 1, nw, nh }) => {
	const png = predictor >= 10;
	if (!png && predictor !== 1) return null;
	const rowLen = w * ncomp;
	const stride = rowLen + (png ? 1 : 0);

	// Cột gốc → cột đích, số cột gốc gộp vào mỗi cột đích
	const tx = new Uint32Array(w);
	const colCount = new Uint32Array(nw);
	for (let x = 0; x < w; x++) {
		tx[x] = Math.min(nw - 1, Math.floor((x * nw) / w));
		colCount[tx[x]]++;
	}
	const out = new Uint8Array(nw * nh * ncomp);
	const acc = new Float64Array(nw * ncomp);
	let curTy = 0;
	let rowsInTy = 0;
	const flush = () => {
		if (!rowsInTy) return;
		const base = curTy * nw * ncomp;
		for (let t = 0; t < nw; t++) {
			const div = colCount[t] * rowsInTy;
			for (let c = 0; c < ncomp; c++) {
				const i = t * ncomp + c;
				out[base + i] = Math.round(acc[i] / div);
			}
		}
		acc.fill(0);
		rowsInTy = 0;
	};

	let prev = new Uint8Array(rowLen);
	let cur = new Uint8Array(rowLen);
	const pending = new Uint8Array(stride);
	let filled = 0;
	let y = 0;
	const takeRow = () => {
		let src = pending;
		if (png) {
			cur.set(pending.subarray(1));
			unfilterPng(pending[0], cur, prev, ncomp);
			src = cur;
		}
		const ty = Math.min(nh - 1, Math.floor((y * nh) / h));
		if (ty !== curTy) {
			flush();
			curTy = ty;
		}
		for (let x = 0, s = 0; x < w; x++) {
			const d = tx[x] * ncomp;
			for (let c = 0; c < ncomp; c++) acc[d + c] += src[s++];
		}
		rowsInTy++;
		if (png) [prev, cur] = [cur, prev];
		y++;
	};

	const consume = (chunk) => {
		let off = 0;
		while (off < chunk.length && y < h) {
			const n = Math.min(stride - filled, chunk.length - off);
			pending.set(chunk.subarray(off, off + n), filled);
			filled += n;
			off += n;
			if (filled === stride) {
				takeRow();
				filled = 0;
			}
		}
	};
	// Nạp từng lát nhỏ + xử lý ĐỒNG BỘ trong 'data': nạp cả stream 1 lần thì zlib
	// giải nén dồn ra trước khi kịp đọc (đo được +70MB với ảnh nền mẫu thật).
	try {
		await new Promise((resolve, reject) => {
			const inf = zlib.createInflate({ chunkSize: SLICE });
			inf.on('data', consume);
			inf.on('end', resolve);
			inf.on('error', reject);
			let pos = 0;
			const pump = () => {
				while (pos < raw.length) {
					const slice = raw.subarray(pos, (pos += SLICE));
					if (!inf.write(slice)) return void inf.once('drain', pump);
				}
				inf.end();
			};
			pump();
		});
	} catch (err) {
		// Stream hỏng/cụt ở cuối: giữ phần đã đọc được, còn thiếu quá nhiều thì bỏ
		if (y < h * 0.9) throw err;
	}
	flush();
	// Ảnh cụt vài hàng cuối → lặp hàng đích cuối cùng có dữ liệu
	const lastTy = Math.min(nh - 1, Math.floor((Math.max(y - 1, 0) * nh) / h));
	const rowBytes = nw * ncomp;
	for (let t = lastTy + 1; t < nh; t++)
		out.copyWithin(t * rowBytes, lastTy * rowBytes, (lastTy + 1) * rowBytes);
	return out;
};

module.exports = { shrinkFlateImage };
