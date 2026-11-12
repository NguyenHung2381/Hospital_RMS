/**
 * seminarCertificateService.js — giấy chứng nhận CME theo mẫu PDF của từng hội nghị.
 *
 *  - Mẫu: ban tổ chức tải lên PDF thiết kế sẵn (có các dãy "....." để điền). Hệ
 *    thống làm sạch + dò vị trí ô 1 lần (certificate/certificateTemplate.js) rồi
 *    lưu: uploads/seminars/<id>/certificate/template.pdf + template.json.
 *  - Xuất: mỗi người 1 file PDF, gói thành ZIP ghi thẳng ra response. Danh sách
 *    lấy từ người tham dự đã được cấp số CME, hoặc từ file Excel tải lên (mẫu
 *    "Danh sách cấp CME" — cùng bộ đọc với nhập người tham dự).
 */
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { getPool } = require('../../config/db');
const { UPLOADS_ROOT, SAFE_ID } = require('../../utils/uploadPaths');
const { httpError } = require('../../utils/httpError');
const { norm } = require('../../utils/vietnameseText');
const { ZipStoreWriter } = require('../../utils/zipStoreWriter');
const {
	prepareTemplate,
	renderPreview,
	extractTexts,
	removeTexts,
	SLOT_LABELS,
	SLOT_KEYS,
} = require('./certificate/certificateTemplate');
const {
	applyEdits,
	toEditable,
	applyTextEdits,
	textEditable,
	findInfoLines,
	INFO_FIELDS,
} = require('./certificate/certificateLayout');
const { createRenderer, fieldValues } = require('./certificate/certificateRender');
const { fontCharsets, hasFullFont, normFontName } = require('./certificate/certificateFonts');
const participantService = require('./seminarParticipantService');
const importService = require('./seminarImportService');

const ROLE_LABELS = {
	attendee: 'Đại biểu',
	speaker: 'Báo cáo viên',
	chair: 'Chủ tọa',
	organizer: 'Ban tổ chức',
	trainee: 'Học viên',
};

const certDir = (seminarId) => {
	if (!SAFE_ID.test(seminarId || '')) throw httpError(400, 'Mã hội nghị không hợp lệ');
	return path.join(UPLOADS_ROOT, 'seminars', seminarId, 'certificate');
};
const pdfPath = (id) => path.join(certDir(id), 'template.pdf');
// Bản đã làm sạch CHƯA xoá dòng chữ nào — gốc để dựng lại template.pdf khi sửa chữ
const basePath = (id) => path.join(certDir(id), 'template-base.pdf');
const metaPath = (id) => path.join(certDir(id), 'template.json');

const readMeta = async (seminarId) => {
	try {
		return JSON.parse(await fs.readFile(metaPath(seminarId), 'utf8'));
	} catch (err) {
		if (err.code === 'ENOENT') return null;
		throw err;
	}
};

// Thông tin mẫu trả cho giao diện (không lộ toạ độ chi tiết). found = ô sẽ được in
// (dò thấy hoặc người dùng tự thêm, và không bị tắt).
const publicInfo = (meta) =>
	meta && {
		file_name: meta.file_name,
		uploaded_at: meta.uploaded_at,
		uploaded_by: meta.uploaded_by,
		size: meta.size,
		fields: SLOT_KEYS.map((key) => ({
			key,
			label: SLOT_LABELS[key],
			found: !!meta.slots[key] && !meta.slots[key].hidden,
		})),
		unknown: meta.unknown || [],
		edited:
			Object.values(meta.slots).some((s) => s.edited) ||
			Object.keys(meta.text_overrides || {}).length > 0,
	};

// Dữ liệu mẫu cho bản xem thử + chữ minh hoạ trên màn chỉnh vị trí
const SAMPLE_PERSON = {
	so: '0001',
	title_prefix: 'Ông',
	full_name: 'Nguyễn Văn Mẫu',
	dob: '01/01/1990',
	organization: 'Bệnh viện Hữu nghị Đa khoa Nghệ An',
	role: 'Đại biểu',
	credits: 3,
};

const getTemplate = async (seminarId) => {
	await participantService.ensureSeminar(await getPool(), seminarId);
	return publicInfo(await readMeta(seminarId));
};

// Ghi file qua file tạm + rename để không ai đọc phải file ghi dở
const writeAtomic = async (file, data) => {
	const tmp = `${file}.${crypto.randomBytes(6).toString('hex')}.tmp`;
	await fs.writeFile(tmp, data);
	await fs.rename(tmp, file);
};

/**
 * @param {string} seminarId
 * @param {{ buffer: Buffer, originalname: string }} file
 * @param {string} actorId
 */
const saveTemplate = async (seminarId, file, actorId) => {
	await participantService.ensureSeminar(await getPool(), seminarId);
	const out = await prepareTemplate(file.buffer);
	const dir = certDir(seminarId);
	await fs.mkdir(dir, { recursive: true });
	const old = await readMeta(seminarId);
	const previewFile = await writePreview(seminarId, out.preview);
	const meta = {
		file_name: Buffer.from(file.originalname, 'latin1').toString('utf8'),
		uploaded_at: new Date().toISOString(),
		uploaded_by: actorId,
		size: out.pdf.length,
		page: out.page,
		slots: out.slots,
		// Bản dò tự động — để "Khôi phục vị trí tự dò" sau khi chỉnh tay
		auto_slots: out.slots,
		unknown: out.unknown,
		preview_file: previewFile,
		// Dòng chữ in sẵn (tên hội nghị, ngày...) + bản sửa của người dùng
		texts: out.texts,
		text_overrides: {},
		font_chars: await fontCharsets(out.pdf),
	};
	await writeAtomic(basePath(seminarId), out.pdf);
	await writeAtomic(pdfPath(seminarId), out.pdf);
	await writeAtomic(metaPath(seminarId), JSON.stringify(meta));
	await removeOldPreview(seminarId, old?.preview_file);
	return publicInfo(meta);
};

// Ảnh nền màn chỉnh vị trí: tên ngẫu nhiên mỗi lần (đổi mẫu thì trình duyệt không
// dùng nhầm ảnh cũ trong cache), phục vụ qua link /uploads có chữ ký.
const writePreview = async (seminarId, jpeg) => {
	const name = `preview-${crypto.randomBytes(8).toString('hex')}.jpg`;
	await fs.mkdir(certDir(seminarId), { recursive: true });
	await writeAtomic(path.join(certDir(seminarId), name), jpeg);
	return name;
};
const removeOldPreview = async (seminarId, name) => {
	if (name && /^preview-[a-f0-9]+\.jpg$/.test(name)) {
		await fs.rm(path.join(certDir(seminarId), name), { force: true });
	}
};

const deleteTemplate = async (seminarId) => {
	await fs.rm(certDir(seminarId), { recursive: true, force: true });
};

// ─── Chỉnh vị trí các ô ─────────────────────────────────────────────────────

// Ký tự in được bằng font của dòng (font đầy đủ đặt sẵn → null = mọi ký tự); giao
// diện dùng để báo ký tự phải in bằng font thay thế
const charsetFor = (meta, t) => {
	const key = normFontName(t.font);
	if (!key || hasFullFont(key)) return null;
	return meta.font_chars?.[key] ?? '';
};

const layoutOf = (seminarId, meta) => {
	const sample = fieldValues(SAMPLE_PERSON);
	return {
		page: meta.page,
		image_url: `/uploads/seminars/${seminarId}/certificate/${meta.preview_file}`,
		fields: SLOT_KEYS.map((key) => ({
			key,
			label: SLOT_LABELS[key],
			// Chữ minh hoạ (số giấy kèm đuôi "/C33.01" như khi in)
			sample:
				key === 'so' && meta.slots.so?.suffix ? sample.so + meta.slots.so.suffix : sample[key],
			auto: !!meta.auto_slots?.[key],
			slot: meta.slots[key] ? toEditable(key, meta.slots[key]) : null,
		})),
		texts: (meta.texts || []).map((t) => ({
			...textEditable(t, meta.text_overrides?.[t.id]),
			charset: charsetFor(meta, t),
		})),
	};
};

// Mẫu lưu trước khi có các tính năng mới: tạo bù ảnh nền / bản gốc / dòng chữ 1 lần.
// Lúc đó chưa có dòng nào bị sửa nên template.pdf hiện tại chính là bản gốc.
const backfill = async (seminarId, meta, pdf) => {
	let changed = false;
	if (!meta.preview_file) {
		meta.preview_file = await writePreview(seminarId, await renderPreview(pdf));
		changed = true;
	}
	if (!meta.texts) {
		meta.texts = await extractTexts(pdf);
		meta.text_overrides = {};
		await writeAtomic(basePath(seminarId), pdf);
		changed = true;
	} else if (meta.texts.length && !meta.texts.some((t) => 'outline' in t)) {
		// Dòng chữ trích trước khi lưu font / lớp viền: trích lại từ bản gốc (cùng thứ tự → cùng id)
		const fresh = await extractTexts(await fs.readFile(basePath(seminarId)));
		const byId = new Map(fresh.map((t) => [t.id, t]));
		for (const t of meta.texts) {
			const f = byId.get(t.id);
			if (f && f.text === t.text) Object.assign(t, { font: f.font, outline: f.outline });
		}
		changed = true;
	}
	if (!meta.font_chars) {
		meta.font_chars = await fontCharsets(await fs.readFile(basePath(seminarId)));
		changed = true;
	}
	if (!meta.auto_slots) {
		meta.auto_slots = meta.slots;
		changed = true;
	}
	return changed;
};

// Dựng lại template.pdf từ bản gốc, xoá các dòng chữ đang bị sửa (bản in viết dòng mới)
const rebuildFromBase = async (seminarId, meta) => {
	const boxes = Object.keys(meta.text_overrides || {})
		.map((id) => meta.texts.find((t) => t.id === id))
		.filter(Boolean);
	const out = await removeTexts(await fs.readFile(basePath(seminarId)), boxes);
	const oldPreview = meta.preview_file;
	meta.preview_file = await writePreview(seminarId, out.preview);
	meta.size = out.pdf.length;
	await writeAtomic(pdfPath(seminarId), out.pdf);
	return oldPreview;
};

const getLayout = async (seminarId) => {
	await participantService.ensureSeminar(await getPool(), seminarId);
	const { meta, pdf } = await loadTemplate(seminarId);
	if (await backfill(seminarId, meta, pdf)) {
		await writeAtomic(metaPath(seminarId), JSON.stringify(meta));
	}
	return layoutOf(seminarId, meta);
};

const overrideIds = (o) =>
	Object.keys(o || {})
		.sort()
		.join(',');

/**
 * @param {string} seminarId
 * @param {{ slots?: Record<string, any>, texts?: Record<string, any> }} edits
 *   texts: TOÀN BỘ các dòng đang sửa (dòng không gửi lên = giữ chữ gốc)
 */
const saveLayout = async (seminarId, { slots, texts } = {}) => {
	await participantService.ensureSeminar(await getPool(), seminarId);
	const { meta, pdf } = await loadTemplate(seminarId);
	await backfill(seminarId, meta, pdf);
	if (slots) meta.slots = applyEdits(meta, slots);
	let oldPreview = null;
	if (texts) {
		const next = applyTextEdits(meta, texts);
		const changedSet = overrideIds(next) !== overrideIds(meta.text_overrides);
		meta.text_overrides = next;
		// Chỉ dựng lại PDF khi tập dòng bị xoá thay đổi; sửa chữ/vị trí dòng đã sửa thì không cần
		if (changedSet) oldPreview = await rebuildFromBase(seminarId, meta);
	}
	await writeAtomic(metaPath(seminarId), JSON.stringify(meta));
	if (oldPreview) await removeOldPreview(seminarId, oldPreview);
	return layoutOf(seminarId, meta);
};

const resetLayout = async (seminarId) => {
	await participantService.ensureSeminar(await getPool(), seminarId);
	const { meta, pdf } = await loadTemplate(seminarId);
	await backfill(seminarId, meta, pdf);
	meta.slots = meta.auto_slots;
	let oldPreview = null;
	if (Object.keys(meta.text_overrides || {}).length) {
		meta.text_overrides = {};
		oldPreview = await rebuildFromBase(seminarId, meta);
	}
	await writeAtomic(metaPath(seminarId), JSON.stringify(meta));
	if (oldPreview) await removeOldPreview(seminarId, oldPreview);
	return layoutOf(seminarId, meta);
};

// ─── Thông tin hội nghị trên giấy (4 dòng hay đổi giữa các hội nghị) ──────────

const infoOf = (meta) => {
	const lines = findInfoLines(meta.texts);
	return INFO_FIELDS.map(({ key, label }) => {
		const line = lines[key];
		const t = line && meta.texts.find((x) => x.id === line.id);
		if (!t) return { key, label, found: false, value: '', original: '', prefix: '' };
		const cur = meta.text_overrides?.[t.id]?.text ?? t.text;
		const strip = (s) =>
			line.prefix && s.startsWith(line.prefix) ? s.slice(line.prefix.length) : s;
		return {
			key,
			label,
			found: true,
			value: strip(cur),
			original: strip(t.text),
			prefix: line.prefix,
			charset: charsetFor(meta, t),
		};
	});
};

const getInfo = async (seminarId) => {
	await participantService.ensureSeminar(await getPool(), seminarId);
	const { meta, pdf } = await loadTemplate(seminarId);
	if (await backfill(seminarId, meta, pdf)) {
		await writeAtomic(metaPath(seminarId), JSON.stringify(meta));
	}
	return infoOf(meta);
};

/**
 * Sửa nhanh các dòng thông tin — quy về bản sửa dòng chữ (saveLayout) để dùng chung
 * cơ chế xoá dòng gốc + in dòng mới. Giá trị trùng chữ gốc = bỏ bản sửa.
 * @param {string} seminarId
 * @param {Record<string, string>} values  { content?, organizer?, time?, sign_date? }
 */
const saveInfo = async (seminarId, values) => {
	await participantService.ensureSeminar(await getPool(), seminarId);
	const { meta, pdf } = await loadTemplate(seminarId);
	await backfill(seminarId, meta, pdf);
	const lines = findInfoLines(meta.texts);
	// Giữ nguyên các dòng đang sửa khác (từ màn chỉnh mẫu)
	const edits = Object.fromEntries(
		Object.entries(meta.text_overrides || {}).map(([id, o]) => [id, { ...o }]),
	);
	for (const [key, raw] of Object.entries(values || {})) {
		const line = lines[key];
		if (!line) throw httpError(400, `Không tìm thấy dòng "${key}" trên mẫu.`);
		const t = meta.texts.find((x) => x.id === line.id);
		const text = `${line.prefix}${String(raw ?? '')
			.replace(/\s+/g, ' ')
			.trim()}`.trim();
		if (text === t.text) {
			delete edits[t.id];
			continue;
		}
		const g = textEditable(t, meta.text_overrides?.[t.id]);
		edits[t.id] = { text, x0: g.x0, x1: g.x1, baseline: g.baseline, size: g.size, align: g.align };
	}
	await saveLayout(seminarId, { texts: edits });
	return infoOf((await loadTemplate(seminarId)).meta);
};

const loadTemplate = async (seminarId) => {
	const meta = await readMeta(seminarId);
	if (!meta) {
		throw httpError(400, 'Hội nghị chưa có mẫu giấy chứng nhận. Hãy tải mẫu PDF lên trước.');
	}
	return { meta, pdf: await fs.readFile(pdfPath(seminarId)) };
};

// ─── Chuẩn hoá dữ liệu 1 người ──────────────────────────────────────────────
const pad2 = (n) => String(n).padStart(2, '0');
// date cột DB (pg trả Date 00:00 UTC) / 'YYYY-MM-DD' từ Excel → dd/mm/yyyy
const fmtDob = (dob, dobText) => {
	if (dob) {
		const d = dob instanceof Date ? dob : new Date(`${String(dob).slice(0, 10)}T00:00:00Z`);
		if (!Number.isNaN(d.getTime()))
			return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
	}
	return dobText ? String(dobText).trim() : '';
};

// "Ông/Bà": theo cột danh xưng, thiếu thì suy từ giới tính
const prefixOf = (titlePrefix, gender) =>
	titlePrefix || (gender === 'male' ? 'Ông' : gender === 'female' ? 'Bà' : '');

// SQĐ "261" → "0261" (sổ CME đánh 4 chữ số)
const fmtSo = (v) => {
	const s = String(v ?? '').trim();
	return /^\d{1,3}$/.test(s) ? s.padStart(4, '0') : s;
};

/** @typedef {{ so: string, title_prefix: string, full_name: string, dob: string, organization: string, role: string, credits: number|null }} CertPerson */

/**
 * Người tham dự đã có số CME (lọc theo ids nếu có), theo thứ tự số.
 * @returns {Promise<CertPerson[]>}
 */
const peopleFromParticipants = async (seminarId, ids) => {
	const pool = await getPool();
	const seminar = await participantService.ensureSeminar(pool, seminarId);
	const only = Array.isArray(ids) && ids.length ? new Set(ids.map(String)) : null;
	const rows = (await participantService.listBySeminar(seminarId))
		.filter((p) => p.cme_certificate_no && (!only || only.has(p.id)))
		.sort((a, b) => a.cme_year - b.cme_year || a.cme_seq - b.cme_seq);
	return rows.map((p) => ({
		so: p.cme_certificate_no,
		title_prefix: prefixOf(p.title_prefix, p.gender),
		full_name: p.full_name,
		dob: fmtDob(p.dob, p.dob_text),
		organization: p.organization || p.user_department_name || p.department_raw || '',
		role: ROLE_LABELS[p.participation_type] || '',
		credits: p.cme_credits != null ? Number(p.cme_credits) : (seminar.cme_default_credits ?? null),
	}));
};

/**
 * Từ file Excel "Danh sách cấp CME". Cột "Sửa đổi"/"Ghi chú" dạng "Tên: X" (cách
 * phòng đào tạo ghi đính chính họ tên) → in tên X.
 * @returns {Promise<CertPerson[]>}
 */
const peopleFromExcel = async (seminarId, buffer) => {
	const seminar = await participantService.ensureSeminar(await getPool(), seminarId);
	const { rows } = await importService.parseWorkbook(buffer);
	return rows.map((r) => {
		const fix = String(r.notes || '').match(/^\s*(?:họ\s*)?tên\s*[:：]\s*(.+)$/i);
		return {
			so: fmtSo(r.sqd_raw),
			title_prefix: prefixOf(r.title_prefix, r.gender),
			full_name: fix ? fix[1].replace(/\s+/g, ' ').trim() : r.full_name,
			dob: fmtDob(r.dob, r.dob_text),
			organization: String(r.organization || r.department_raw || '')
				.replace(/\s+/g, ' ')
				.trim(),
			role: ROLE_LABELS[r.participation_type] || '',
			credits: r.cme_credits ?? seminar.cme_default_credits ?? null,
		};
	});
};

// Tên file trong ZIP: "0261 - Ngô Vi Tiến.pdf" (bỏ ký tự cấm trên Windows)
const fileNameOf = (p, i, used) => {
	const clean = (s) =>
		[...String(s || '')]
			.map((c) => (c.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(c) ? ' ' : c))
			.join('')
			.replace(/\s+/g, ' ')
			.trim();
	let base = [clean(p.so) || String(i + 1).padStart(3, '0'), clean(p.full_name)]
		.filter(Boolean)
		.join(' - ');
	base = base.slice(0, 120);
	let name = `${base}.pdf`;
	for (let k = 2; used.has(norm(name)); k++) name = `${base} (${k}).pdf`;
	used.add(norm(name));
	return name;
};

/**
 * Ghi ZIP các giấy chứng nhận ra `res`. Sinh file đầu tiên TRƯỚC khi gửi header
 * để lỗi mẫu/dữ liệu còn trả được JSON; sau đó lỗi chỉ có thể cắt kết nối.
 * @param {import('express').Response} res
 * @param {string} seminarId
 * @param {CertPerson[]} people
 * @param {string} zipName
 */
const streamZip = async (res, seminarId, people, zipName) => {
	if (!people.length) throw httpError(400, 'Không có người nào để xuất giấy chứng nhận.');
	const { meta, pdf } = await loadTemplate(seminarId);
	const render = await createRenderer(pdf, meta);
	const used = new Set();
	const first = await render(fieldValues(people[0]));

	res.setHeader('Content-Type', 'application/zip');
	res.setHeader(
		'Content-Disposition',
		`attachment; filename*=UTF-8''${encodeURIComponent(zipName)}`,
	);
	res.setHeader('X-Certificate-Count', String(people.length));
	const zip = new ZipStoreWriter(res);
	try {
		await zip.add(fileNameOf(people[0], 0, used), first);
		for (let i = 1; i < people.length; i++) {
			await zip.add(fileNameOf(people[i], i, used), await render(fieldValues(people[i])));
		}
		await zip.finish();
	} catch (err) {
		res.destroy(err);
	}
};

// Bản xem thử với dữ liệu mẫu — kiểm tra vị trí chữ trước khi xuất hàng loạt
const previewPdf = async (seminarId) => {
	const { meta, pdf } = await loadTemplate(seminarId);
	const render = await createRenderer(pdf, meta);
	return render(fieldValues(SAMPLE_PERSON));
};

module.exports = {
	getTemplate,
	saveTemplate,
	deleteTemplate,
	previewPdf,
	getLayout,
	saveLayout,
	resetLayout,
	getInfo,
	saveInfo,
	peopleFromParticipants,
	peopleFromExcel,
	streamZip,
	_test: { fmtDob, fmtSo, prefixOf, fileNameOf },
};
