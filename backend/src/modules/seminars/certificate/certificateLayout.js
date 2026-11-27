/**
 * certificateLayout.js — chỉnh tay vị trí các ô trên mẫu giấy chứng nhận.
 *
 * Ô dò tự động (certificateTemplate.findSlots) lưu nhiều chi tiết nội bộ; màn
 * chỉnh vị trí chỉ làm việc với dạng gọn: khung ngang [x0, x1], đường chân chữ
 * (baseline), cỡ chữ, căn lề, ẩn/hiện. Toạ độ theo điểm PDF, gốc trên-trái trang.
 *   - căn trái: chữ bắt đầu tại x0 (x1 chỉ để hiển thị khung)
 *   - căn giữa: chữ nằm giữa [x0, x1]
 */
const { httpError } = require('../../../utils/httpError');
const { SLOT_KEYS } = require('./certificateTemplate');
const { norm } = require('../../../utils/vietnameseText');

// Ô in đậm — dùng chung cho bản in (certificateRender) và màn chỉnh
const BOLD_KEYS = new Set(['name', 'credits']);
const MIN_SIZE = 6;
const MAX_SIZE = 40;
const MIN_WIDTH = 10;
const FALLBACK_COLOR = [0x04 / 255, 0x92 / 255, 0x40 / 255];

const round1 = (v) => Math.round(v * 10) / 10;
const toHex = (rgb) =>
	'#' +
	(Array.isArray(rgb) && rgb.length === 3 ? rgb : FALLBACK_COLOR)
		.map((v) =>
			Math.round(Math.min(1, Math.max(0, v)) * 255)
				.toString(16)
				.padStart(2, '0'),
		)
		.join('');

// '#2e3192' → [r, g, b] (0–1); sai định dạng → null
const fromHex = (hex) => {
	const m = /^#([0-9a-f]{6})$/i.exec(String(hex ?? ''));
	if (!m) return null;
	const n = parseInt(m[1], 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round((v / 255) * 1000) / 1000);
};

// Kiểu chữ có chân: `font` do người dùng chọn; ô lưu trước đó chỉ ô Số dùng Times (tự dò)
const isSerif = (key, s) => (s.font ? s.font === 'serif' : key === 'so' && !!s.serif);
const isBold = (key, s) => s.bold ?? BOLD_KEYS.has(key);

/** Ô lưu trong template.json → dạng màn chỉnh. */
const toEditable = (key, s) => {
	const center = s.align === 'center';
	const x0 = center ? s.box.x0 : s.x;
	return {
		x0: round1(x0),
		x1: round1(Math.max(center ? s.box.x1 : s.x1, x0 + MIN_WIDTH)),
		baseline: round1(s.baseline),
		size: round1(s.textSize ?? s.size),
		align: center ? 'center' : 'left',
		hidden: !!s.hidden,
		color: toHex(s.color),
		bold: isBold(key, s),
		italic: !!s.italic,
		suffix: s.suffix || '',
		serif: isSerif(key, s),
	};
};

const MAX_SUFFIX = 80;
// Kiểu chữ người dùng chọn (màu, đậm, nghiêng, có chân) — trường không gửi thì giữ nguyên
const styleEdits = (e, what) => {
	const out = {};
	if (e.color !== undefined) {
		const c = fromHex(e.color);
		if (!c) throw httpError(400, `Màu chữ của ${what} không hợp lệ.`);
		out.color = c;
	}
	for (const k of ['bold', 'italic', 'serif']) if (e[k] !== undefined) out[k] = !!e[k];
	return out;
};

// Ô mẫu không có (vd thiếu dãy chấm) mà người dùng thêm vào: giữa trang, cùng màu ô khác
const newSlot = (key, page, slots) => {
	const ref = Object.values(slots)[0];
	const x0 = page.width * 0.35;
	const baseline = page.height * 0.5;
	const size = 12;
	return {
		key,
		x: x0,
		x1: x0 + 180,
		baseline,
		size,
		textSize: size,
		align: 'left',
		serif: false,
		italic: false,
		color: ref?.color || FALLBACK_COLOR,
		suffix: '',
		box: { x0, x1: x0 + 180, y0: baseline - size, y1: baseline + size * 0.3 },
		suffixBox: null,
		added: true,
	};
};

const num = (v, name, min, max) => {
	const n = Number(v);
	if (!Number.isFinite(n) || n < min || n > max) {
		throw httpError(
			400,
			`Giá trị ${name} không hợp lệ (cần trong khoảng ${round1(min)}–${round1(max)}).`,
		);
	}
	return round1(n);
};

/**
 * Áp các ô chỉnh tay vào bộ ô đang lưu. Ô không gửi lên giữ nguyên.
 * @param {{ page: { width: number, height: number }, slots: Record<string, any> }} meta
 * @param {Record<string, any>} edits  { [key]: { x0, x1, baseline, size, align, hidden } }
 * @returns {Record<string, any>} bộ ô mới
 */
const applyEdits = (meta, edits) => {
	if (!edits || typeof edits !== 'object' || Array.isArray(edits)) {
		throw httpError(400, 'Dữ liệu vị trí không hợp lệ.');
	}
	const { width, height } = meta.page;
	const slots = structuredClone(meta.slots);
	for (const [key, e] of Object.entries(edits)) {
		if (!SLOT_KEYS.includes(key)) throw httpError(400, `Ô "${key}" không tồn tại.`);
		if (!e || typeof e !== 'object') throw httpError(400, `Dữ liệu ô "${key}" không hợp lệ.`);
		const x0 = num(e.x0, 'x0', 0, width - MIN_WIDTH);
		const x1 = num(e.x1, 'x1', x0 + MIN_WIDTH, width);
		const size = num(e.size, 'cỡ chữ', MIN_SIZE, MAX_SIZE);
		const baseline = num(e.baseline, 'vị trí dọc', size * 0.5, height);
		const align = e.align === 'center' ? 'center' : 'left';
		const s = slots[key] || newSlot(key, meta.page, slots);
		const { serif, ...style } = styleEdits(e, `ô "${key}"`);
		if (e.suffix !== undefined) {
			// Chữ in liền sau giá trị (vd "/GCN/2024" sau số giấy) — giữ dấu cách đầu
			const suffix = String(e.suffix ?? '').replace(/\s+/g, ' ');
			if (suffix.length > MAX_SUFFIX) {
				throw httpError(400, `Chữ in kèm dài quá ${MAX_SUFFIX} ký tự.`);
			}
			s.suffix = suffix.trim() ? suffix : '';
		}
		Object.assign(s, {
			x: x0,
			x1,
			baseline,
			textSize: size,
			align,
			hidden: !!e.hidden,
			box: { ...s.box, x0, x1, y0: baseline - size, y1: baseline + size * 0.3 },
			...style,
			...(serif !== undefined ? { font: serif ? 'serif' : 'sans' } : {}),
			edited: true,
		});
		slots[key] = s;
	}
	return slots;
};

// ─── Chữ in sẵn trên mẫu (tên hội nghị, ngày tháng...) ───────────────────────
const MAX_TEXT = 300;

/** Dòng chữ của mẫu (+ bản sửa nếu có) → dạng màn chỉnh. */
const textEditable = (t, o) => ({
	id: t.id,
	original: t.text,
	text: o ? o.text : t.text,
	x0: o ? o.x0 : t.x0,
	x1: o ? o.x1 : Math.max(t.x1, t.x0 + MIN_WIDTH),
	baseline: o ? o.baseline : t.baseline,
	size: o ? o.size : t.size,
	align: o ? o.align : t.align,
	color: toHex(o?.color ?? t.color),
	bold: o?.bold ?? !!t.bold,
	italic: o?.italic ?? !!t.italic,
	// Mẫu nét vẽ thường là giấy hành chính chữ Times → mặc định có chân
	serif: o?.serif ?? !!t.vector,
	// Dòng chữ dạng nét vẽ: không đọc được chữ — giao diện hiện ảnh cắt từ khung gốc
	vector: !!t.vector,
	box: { x0: t.x0, y0: t.y0, x1: t.x1, y1: t.y1 },
	// Vị trí gốc — để "Trả về chữ gốc" ngay trên màn chỉnh
	base: {
		x0: t.x0,
		x1: Math.max(t.x1, t.x0 + MIN_WIDTH),
		baseline: t.baseline,
		size: t.size,
		align: t.align,
	},
	edited: !!o,
});

/**
 * Bản sửa các dòng chữ: chỉ những dòng gửi lên là bị thay (dòng gốc bị xoá khỏi
 * mẫu, bản in viết dòng mới). Chữ rỗng = xoá hẳn dòng đó.
 * @param {{ page: { width: number, height: number }, texts?: any[] }} meta
 * @param {Record<string, any>} edits  { [id]: { text, x0, x1, baseline, size, align } }
 * @returns {Record<string, { text: string, x0: number, x1: number, baseline: number, size: number, align: 'left'|'center' }>}
 */
const applyTextEdits = (meta, edits) => {
	if (!edits || typeof edits !== 'object' || Array.isArray(edits)) {
		throw httpError(400, 'Dữ liệu chữ trên mẫu không hợp lệ.');
	}
	const { width, height } = meta.page;
	const ids = new Set((meta.texts || []).map((t) => t.id));
	const out = {};
	for (const [id, e] of Object.entries(edits)) {
		if (!ids.has(id)) throw httpError(400, `Dòng chữ "${id}" không có trên mẫu.`);
		if (!e || typeof e !== 'object') throw httpError(400, `Dữ liệu dòng "${id}" không hợp lệ.`);
		const text = String(e.text ?? '')
			.replace(/\s+/g, ' ')
			.trim();
		if (text.length > MAX_TEXT) throw httpError(400, `Dòng chữ dài quá ${MAX_TEXT} ký tự.`);
		const x0 = num(e.x0, 'x0', 0, width - MIN_WIDTH);
		const size = num(e.size, 'cỡ chữ', MIN_SIZE, MAX_SIZE);
		out[id] = {
			text,
			x0,
			x1: num(e.x1, 'x1', x0 + MIN_WIDTH, width),
			baseline: num(e.baseline, 'vị trí dọc', size * 0.5, height),
			size,
			align: e.align === 'center' ? 'center' : 'left',
			...styleEdits(e, `dòng "${id}"`),
		};
	}
	return out;
};

// ─── Thông tin hội nghị trên giấy (sửa nhanh, không cần tìm dòng) ─────────────
const INFO_FIELDS = [
	{ key: 'content', label: 'Nội dung / chủ đề' },
	{ key: 'organizer', label: 'Đơn vị / cá nhân chịu trách nhiệm' },
	{ key: 'time', label: 'Thời gian' },
	{ key: 'sign_date', label: 'Địa điểm, ngày ký' },
];
const SIGN_DATE = /,\s*ngày\s+\d{1,2}\s+tháng\s+\d{1,2}\s+năm\s+\d{4}/i;

/**
 * Tìm dòng chữ ứng với từng thông tin trên mẫu chuẩn giấy chứng nhận CME:
 *   - content / organizer: dòng NGAY DƯỚI nhãn "2. Nội dung/ chủ đề:" / "3. Đơn vị/ cá
 *     nhân chịu trách nhiệm:" (nhãn giữ nguyên, chỉ sửa dòng giá trị)
 *   - time: dòng "4. Thời gian: ..." — chỉ sửa phần sau dấu ":" (prefix giữ nguyên)
 *   - sign_date: dòng "<địa điểm>, ngày .. tháng .. năm ...."
 * @param {any[]} texts  meta.texts (đã sắp theo baseline)
 * @returns {Record<string, { id: string, prefix: string }>}
 */
const findInfoLines = (texts = []) => {
	const out = {};
	const nextBelow = (label) =>
		texts.find(
			(t) =>
				t.baseline > label.baseline + 2 &&
				t.baseline - label.baseline < label.size * 3 &&
				Math.abs(t.x0 - label.x0) < 20 &&
				!/^\d+\s*[.)]/.test(t.text),
		);
	for (const t of texts) {
		const n = norm(t.text);
		if (!out.content && /^\d*\s*noi dung( chu de)?$/.test(n)) {
			const v = nextBelow(t);
			if (v) out.content = { id: v.id, prefix: '' };
		} else if (!out.organizer && /don vi( ca nhan)? chiu trach nhiem$/.test(n)) {
			const v = nextBelow(t);
			if (v) out.organizer = { id: v.id, prefix: '' };
		} else if (!out.time && /^\d*\s*thoi gian( |$)/.test(n) && t.text.includes(':')) {
			out.time = { id: t.id, prefix: t.text.slice(0, t.text.indexOf(':') + 1) + ' ' };
		} else if (!out.sign_date && SIGN_DATE.test(t.text)) {
			out.sign_date = { id: t.id, prefix: '' };
		}
	}
	return out;
};

module.exports = {
	INFO_FIELDS,
	findInfoLines,
	applyEdits,
	toEditable,
	applyTextEdits,
	textEditable,
	isSerif,
	isBold,
	BOLD_KEYS,
	_test: { toHex, fromHex, newSlot },
};
