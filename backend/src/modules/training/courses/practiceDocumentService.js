/**
 * practiceDocumentService.js — sinh giấy tờ thực hành GPHN (.docx) từ hồ sơ ghi
 * danh: Đơn đề nghị thực hành, Hợp đồng thực hành, Phiếu nhận xét quá trình thực
 * hành (1 phiếu / vòng). Mẫu ở backend/templates/training/, chuyển từ mẫu trộn thư
 * của phòng Đào tạo bằng scripts/convert-mergefield-template.js — tên biến là tên
 * cột sổ thực hành bỏ dấu ({ho_va_ten}, {khoa_thuc_hanh_1}…).
 * Thêm mẫu mới: chép file đã chuyển vào templates/training + khai báo 1 dòng TEMPLATES.
 */
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const { getPool, sql } = require('../../../config/db');
const { httpError } = require('../../../utils/httpError');
const { describeSpan } = require('./rotationPlanner');

const TEMPLATE_DIR = path.join(__dirname, '../../../../templates/training');
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const TEMPLATES = {
	'don-de-nghi': {
		file: 'don-de-nghi-thuc-hanh.docx',
		label: 'Đơn đề nghị thực hành',
		perRotation: false,
	},
	'hop-dong': { file: 'hop-dong-thuc-hanh.docx', label: 'Hợp đồng thực hành', perRotation: false },
	'phieu-nhan-xet': {
		file: 'phieu-nhan-xet-thuc-hanh.docx',
		label: 'Phiếu nhận xét quá trình thực hành',
		perRotation: true,
	},
};

// Ô thiếu dữ liệu in thành dòng chấm để điền tay
const BLANK = '……………';

const pad2 = (n) => String(n).padStart(2, '0');
const dmy = (v) => {
	if (!v) return '';
	const d = v instanceof Date ? v : new Date(`${String(v).slice(0, 10)}T00:00:00Z`);
	if (Number.isNaN(d.getTime())) return '';
	return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
};
const salutation = (gender) => (gender === 'male' ? 'ông' : gender === 'female' ? 'bà' : '');
// Mẫu viết "tại khoa «Khoa_thực_hành_1»" ⇒ bỏ chữ "Khoa" đầu tên trong danh mục.
const shortDept = (name) => String(name ?? '').replace(/^\s*khoa\s+/i, '');

const rotationFields = (r, n) =>
	r
		? {
				[`khoa_thuc_hanh_${n}`]: shortDept(r.department_name),
				[`thoi_gian_bat_dau_khoa_${n}`]: dmy(r.start_date),
				[`thoi_gian_ket_thuc_khoa_${n}`]: dmy(r.end_date),
				[`tong_thoi_gian_khoa_${n}`]:
					r.duration_text || describeSpan(r.start_date, r.end_date) || '',
				[`nguoi_huong_dan_${n}`]: r.mentor_name ?? '',
				[`ong_ba_${n}`]: r.mentor_salutation ?? '',
				[`mnv_${n}`]: r.mentor_staff_no ?? '',
				[`ngay_sinh_ng_huong_dan_${n}`]: dmy(r.mentor_dob),
				[`tdcm_ng_huong_dan_${n}`]: r.mentor_qualification ?? '',
				[`so_cchn_${n}`]: r.mentor_license_no ?? '',
				[`ngay_cap_cchn_${n}`]: dmy(r.mentor_license_date),
				[`dien_thoai_${n}`]: r.mentor_phone ?? '',
				[`pvhdcm_cua_nhd_th_${n}`]: r.mentor_scope ?? '',
			}
		: {};

/**
 * Dữ liệu trộn của 1 hồ sơ — cùng tên với cột sổ thực hành. Vòng thứ n (theo thứ
 * tự, bỏ vòng "không đạt") là *_n; `rotation` (phiếu nhận xét) được đặt làm *_1.
 */
const buildFields = ({ enrollment: e, trainee: t, rotations }, rotation = null) => {
	const active = rotations.filter((r) => r.result !== 'fail');
	const location =
		e.practice_location ||
		(active.length
			? `Tại các khoa: ${[...new Set(active.map((r) => shortDept(r.department_name)).filter(Boolean))].join(', ')}`
			: '');
	const fields = {
		ma_thuc_hanh: e.practice_code ?? '',
		ho_va_ten: t.full_name ?? '',
		gioi_tinh: salutation(t.gender),
		ngay_sinh: dmy(t.dob),
		noi_sinh_tinh: t.birth_province ?? '',
		cmtcccd: t.national_id ?? '',
		ngay_cap: dmy(t.national_id_issued_date),
		noi_cap: t.national_id_issued_place ?? '',
		ho_khau_thuong_tru: t.permanent_address || t.address || '',
		dien_thoai: t.phone ?? '',
		trinh_do_chuyen_mon: t.qualification ?? '',
		nam_tot_nghiep:
			t.graduated_year ?? (t.graduated_date ? new Date(t.graduated_date).getUTCFullYear() : ''),
		linh_vuc_chuyen_mon: e.professional_field ?? '',
		hinh_thuc_hanh_nghe: e.practice_form ?? '',
		tong_thoi_gian_thuc_hanh: e.total_duration || describeSpan(e.start_date, e.end_date) || '',
		ngay_bat_dau: dmy(e.start_date),
		ngay_ket_thuc: dmy(e.end_date),
		dia_diem_thuc_hanh: location,
		don_vi_cu_di: e.sending_unit ?? '',
	};
	active.forEach((r, i) => Object.assign(fields, rotationFields(r, i + 1)));
	if (rotation) Object.assign(fields, rotationFields(rotation, 1));
	return fields;
};

const loadTemplate = (type) => {
	const tpl = TEMPLATES[type];
	if (!tpl) throw httpError(400, 'Loại giấy tờ không hợp lệ.');
	return { ...tpl, buffer: fs.readFileSync(path.join(TEMPLATE_DIR, tpl.file)) };
};

// Biến có trong mẫu (để báo trước ô nào còn thiếu dữ liệu).
const tagsCache = new Map();
const templateTags = (type) => {
	if (!tagsCache.has(type)) {
		const xml = new PizZip(loadTemplate(type).buffer).file('word/document.xml').asText();
		tagsCache.set(type, [...new Set([...xml.matchAll(/\{([a-z0-9_]+)\}/g)].map((m) => m[1]))]);
	}
	return tagsCache.get(type);
};

const render = (type, fields) => {
	const doc = new Docxtemplater(new PizZip(loadTemplate(type).buffer), {
		paragraphLoop: true,
		linebreaks: true,
		nullGetter: () => BLANK,
	});
	const data = Object.fromEntries(
		Object.entries(fields).map(([k, v]) => [k, v === '' || v == null ? BLANK : String(v)]),
	);
	doc.render(data);
	return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
};

const loadRecord = async (enrollmentId) => {
	const pool = await getPool();
	const r = await pool.request().input('id', sql.VarChar(20), enrollmentId).query(`
    SELECT e.* FROM course_enrollments e WHERE e.id = @id;
    SELECT t.* FROM trainees t JOIN course_enrollments e ON e.trainee_id = t.id WHERE e.id = @id;
    SELECT * FROM enrollment_rotations WHERE enrollment_id = @id ORDER BY seq, created_at;
  `);
	const [[enrollment], [trainee], rotations] = r.recordsets;
	if (!enrollment || !trainee) throw httpError(404, 'Không tìm thấy hồ sơ ghi danh.');
	return { enrollment, trainee, rotations };
};

const missingOf = (type, fields) =>
	templateTags(type).filter(
		(tag) => fields[tag] === undefined || fields[tag] === '' || fields[tag] === null,
	);

const LABELS = {
	ma_thuc_hanh: 'mã thực hành',
	cmtcccd: 'CCCD',
	ngay_cap: 'ngày cấp CCCD',
	noi_cap: 'nơi cấp CCCD',
	ngay_sinh: 'ngày sinh',
	ho_khau_thuong_tru: 'hộ khẩu thường trú',
	trinh_do_chuyen_mon: 'trình độ chuyên môn',
	noi_sinh_tinh: 'nơi sinh',
	gioi_tinh: 'giới tính',
	nam_tot_nghiep: 'năm tốt nghiệp',
	hinh_thuc_hanh_nghe: 'hình thức hành nghề',
	tong_thoi_gian_thuc_hanh: 'tổng thời gian',
	ngay_bat_dau: 'ngày bắt đầu',
	ngay_ket_thuc: 'ngày kết thúc',
	dia_diem_thuc_hanh: 'địa điểm',
	dien_thoai: 'điện thoại',
	khoa_thuc_hanh_1: 'khoa',
	nguoi_huong_dan_1: 'người hướng dẫn',
	so_cchn_1: 'số CCHN của NHD',
	ngay_cap_cchn_1: 'ngày cấp CCHN',
	ngay_sinh_ng_huong_dan_1: 'ngày sinh NHD',
	tdcm_ng_huong_dan_1: 'trình độ NHD',
	pvhdcm_cua_nhd_th_1: 'phạm vi HĐCM của NHD',
	thoi_gian_bat_dau_khoa_1: 'ngày bắt đầu vòng',
	thoi_gian_ket_thuc_khoa_1: 'ngày kết thúc vòng',
	tong_thoi_gian_khoa_1: 'thời gian vòng',
};
const label = (tag) => LABELS[tag] ?? tag;

/** Các giấy tờ in được của 1 hồ sơ + ô còn thiếu dữ liệu (in ra thành dòng chấm). */
const describe = async (enrollmentId) => {
	const rec = await loadRecord(enrollmentId);
	const base = buildFields(rec);
	return {
		documents: Object.entries(TEMPLATES).map(([type, tpl]) => ({
			type,
			label: tpl.label,
			per_rotation: tpl.perRotation,
			missing: tpl.perRotation ? [] : missingOf(type, base).map(label),
		})),
		rotations: rec.rotations.map((r) => ({
			id: r.id,
			label: `${r.round_title ?? 'Vòng'}${r.department_name ? ` — ${r.department_name}` : ''}`,
			missing: missingOf('phieu-nhan-xet', buildFields(rec, r)).map(label),
		})),
	};
};

const fileSlug = (s) =>
	String(s ?? '')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/đ/gi, 'd')
		.replace(/[^A-Za-z0-9.]+/g, '-')
		.replace(/^-+|-+$/g, '');

/**
 * Sinh 1 giấy tờ. Phiếu nhận xét: rotationId = 1 vòng; bỏ trống = file .zip gồm
 * phiếu của mọi vòng (trừ vòng không đạt).
 */
const generate = async (enrollmentId, type, rotationId = null) => {
	const tpl = loadTemplate(type);
	const rec = await loadRecord(enrollmentId);
	const who = fileSlug(rec.enrollment.practice_code || rec.trainee.full_name);
	const base = `${fileSlug(type)}_${who}`;

	if (!tpl.perRotation)
		return { buffer: render(type, buildFields(rec)), fileName: `${base}.docx`, mime: DOCX_MIME };

	if (rotationId) {
		const rotation = rec.rotations.find((r) => r.id === rotationId);
		if (!rotation) throw httpError(404, 'Không tìm thấy vòng thực hành của hồ sơ này.');
		return {
			buffer: render(type, buildFields(rec, rotation)),
			fileName: `${base}_${fileSlug(shortDept(rotation.department_name) || `vong-${rotation.seq}`)}.docx`,
			mime: DOCX_MIME,
		};
	}
	const rotations = rec.rotations.filter((r) => r.result !== 'fail');
	if (!rotations.length) throw httpError(400, 'Hồ sơ chưa có vòng thực hành nào.');
	const zip = new PizZip();
	rotations.forEach((r, i) => {
		const name = `${pad2(i + 1)}_${fileSlug(shortDept(r.department_name) || 'vong')}.docx`;
		zip.file(name, render(type, buildFields(rec, r)));
	});
	return {
		buffer: zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }),
		fileName: `${base}.zip`,
		mime: 'application/zip',
	};
};

module.exports = { TEMPLATES, buildFields, describe, generate, render, templateTags, BLANK };
