/**
 * certificateVectorMeta.js — phần dữ liệu mẫu (template.json) riêng cho mẫu chữ nét vẽ
 * (meta.vector): vùng cần xoá chữ cũ, tự đặt ô / nhận dòng hội nghị, form "Thông tin
 * trên giấy". Hàm thuần trên meta — seminarCertificateService lo đọc / ghi file.
 */
const { httpError } = require('../../../utils/httpError');
const { applyEdits, textEditable, INFO_FIELDS } = require('./certificateLayout');
const { guessVectorFields } = require('./certificateVector');

// ─── Vùng phải xoá chữ cũ ──────────────────────────────────
// Chữ là hình vẽ nên không xoá theo dòng được — xoá đúng vùng: đoạn dòng đã sửa
// ([x0, x1] của bản sửa, cao theo khung dòng gốc) và chỗ đặt mỗi ô đang in.
const ERASE_PAD = 1.2;
const ASCENT = 0.969; // khớp khung hiển thị ở màn chỉnh mẫu (số đo font Inter)
const r1 = (v) => Math.round(v * 10) / 10;

/** @returns {{ x0: number, y0: number, x1: number, y1: number }[]} */
const eraseRects = (meta) => {
	if (!meta.vector) return [];
	const lines = meta.texts || [];
	const rects = [];
	for (const [id, o] of Object.entries(meta.text_overrides || {})) {
		const t = lines.find((x) => x.id === id);
		if (t)
			rects.push({ x0: o.x0 - 0.5, x1: o.x1 + 0.5, y0: t.y0 - ERASE_PAD, y1: t.y1 + ERASE_PAD });
	}
	for (const s of Object.values(meta.slots || {})) {
		if (s.hidden) continue;
		const x0 = s.align === 'center' ? s.box.x0 : s.x;
		const x1 = s.align === 'center' ? s.box.x1 : s.x1;
		const size = s.textSize ?? s.size;
		// Ô đặt đè lên 1 dòng chữ mẫu → xoá theo chiều cao dòng đó (đủ dấu, chân chữ)
		const line = lines.find(
			(t) => s.baseline >= t.y0 && s.baseline <= t.y1 + size * 0.3 && x0 < t.x1 && x1 > t.x0,
		);
		rects.push(
			line
				? { x0: x0 - 0.5, x1: x1 + 0.5, y0: line.y0 - ERASE_PAD, y1: line.y1 + ERASE_PAD }
				: { x0, x1, y0: s.baseline - ASCENT * size, y1: s.baseline + 0.3 * size },
		);
	}
	return rects.map((r) => ({ x0: r1(r.x0), y0: r1(r.y0), x1: r1(r.x1), y1: r1(r.y1) }));
};
const rectsSig = (meta) => JSON.stringify(eraseRects(meta));

// ─── Mẫu nét vẽ: tự nhận các chỗ cần sửa (certificateVector.guessVectorFields) ─
// Tăng khi đổi cách nhận → mẫu đã lưu được nhận lại 1 lần lúc mở
const VECTOR_GUESS_VERSION = 1;
const applyVectorGuess = (meta, { keepSlots }) => {
	const guess = guessVectorFields(meta.texts || []);
	const auto = applyEdits({ page: meta.page, slots: {} }, guess.slots);
	for (const s of Object.values(auto)) delete s.edited;
	meta.auto_slots = auto;
	if (!keepSlots) meta.slots = structuredClone(auto);
	// Đoạn giá trị của các dòng hội nghị — form "Thông tin trên giấy"
	meta.vector_info = guess.info;
	meta.vector_guess = VECTOR_GUESS_VERSION;
};

// Mẫu nét vẽ: không đọc được chữ gốc → giá trị = chữ đã thay (rỗng = giữ như mẫu)
// box + image_url: giao diện cắt ảnh đoạn chữ đang có trên mẫu để người dùng biết ô nào thay gì
const vectorInfoOf = (meta, imageUrl) =>
	INFO_FIELDS.map(({ key, label }) => {
		const f = meta.vector_info?.[key];
		const t = f && (meta.texts || []).find((x) => x.id === f.id);
		if (!t) return { key, label, found: false, value: '', original: '', prefix: '' };
		const value = meta.text_overrides?.[t.id]?.text ?? '';
		return {
			key,
			label,
			found: true,
			value,
			original: '',
			prefix: '',
			charset: null,
			box: { x0: f.x0, y0: t.y0, x1: f.x1, y1: t.y1 },
			image_url: imageUrl,
			page: meta.page,
		};
	});

/**
 * Dòng hội nghị trên màn chỉnh mẫu: gắn nhãn ("Chủ đề"...) và mặc định khoanh đúng đoạn
 * giá trị sau dấu ":" (dòng chưa sửa) — sửa là thay đúng đoạn đó, nhãn giữ nguyên.
 * @param {any} t  dòng trong meta.texts
 * @param {any} e  dạng màn chỉnh của dòng (textEditable)
 */
const vectorTextHints = (meta, t, e) => {
	const hit = Object.entries(meta.vector_info || {}).find(([, f]) => f.id === t.id);
	if (!hit) return e;
	const [key, f] = hit;
	const def = { x0: f.x0, x1: f.x1, size: f.size };
	// Địa điểm, ngày ký: in nghiêng, không đậm (thể thức văn bản hành chính)
	const style = key === 'sign_date' ? { bold: false, italic: true } : {};
	return {
		...e,
		info_label: INFO_FIELDS.find((x) => x.key === key)?.label,
		base: { ...e.base, ...def },
		...(e.edited ? {} : { ...def, ...style }),
	};
};

/**
 * Sửa nhanh dòng hội nghị → bản sửa dòng (ghi vào `edits`). Rỗng = giữ chữ trên mẫu.
 * @param {Record<string, string>} values
 * @param {Record<string, any>} edits  toàn bộ bản sửa dòng hiện có (bị sửa tại chỗ)
 */
const vectorInfoEdits = (meta, values, edits) => {
	for (const [key, raw] of Object.entries(values || {})) {
		const f = meta.vector_info?.[key];
		const t = f && meta.texts.find((x) => x.id === f.id);
		if (!t) throw httpError(400, `Không tìm thấy dòng "${key}" trên mẫu.`);
		const text = String(raw ?? '')
			.replace(/\s+/g, ' ')
			.trim();
		if (!text) {
			delete edits[t.id]; // để trống = giữ chữ trên mẫu
			continue;
		}
		const prev = edits[t.id];
		// Lần đầu: thay đúng đoạn sau nhãn, cùng màu / độ đậm của dòng; ngày ký in nghiêng
		edits[t.id] = prev
			? { ...prev, text }
			: {
					text,
					x0: f.x0,
					x1: f.x1,
					baseline: t.baseline,
					size: f.size,
					align: 'left',
					color: textEditable(t).color,
					bold: key === 'sign_date' ? false : !!t.bold,
					italic: key === 'sign_date',
					serif: true,
				};
	}
};

module.exports = {
	VECTOR_GUESS_VERSION,
	eraseRects,
	rectsSig,
	applyVectorGuess,
	vectorInfoOf,
	vectorInfoEdits,
	vectorTextHints,
};
