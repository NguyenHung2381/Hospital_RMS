// Sinh giấy tờ đăng ký khóa đào tạo liên tục (.docx) từ mẫu ở backend/templates/training/:
//   - Đơn đăng ký học khóa đào tạo y tế liên tục (mỗi người đăng ký 1 đơn)
//   - Tờ trình cử cán bộ tham dự lớp + Bảng phân tích nhu cầu đào tạo (mỗi khoa 1 tờ / lớp)
// Hàm thuần: nhận dữ liệu đã gom sẵn, KHÔNG đọc CSDL.
//
// Mẫu dựng từ bản gốc của phòng Đào tạo bằng scripts/build-registration-templates.js
// (dòng chấm → thẻ {ten_the} ngay trong run cũ, nên bố cục giữ nguyên). Cách điền giống
// courses/practiceDocumentService.js: ô thiếu dữ liệu in lại dòng chấm để điền tay.
// Chữ ký hàm là hợp đồng giữa các luồng (DANG-KY-DTLT-CONTRACT.md mục 5).

const fs = require('fs');
const path = require('path');
const { lazyRequire } = require('../../../utils/lazyRequire');
/** @type {typeof import('pizzip')} */
const PizZip = lazyRequire('pizzip');
/** @type {typeof import('docxtemplater')} */
const Docxtemplater = lazyRequire('docxtemplater');

const TEMPLATE_DIR = path.join(__dirname, '../../../../templates/training');
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const TEMPLATES = {
	application: 'don-dang-ky-dtlt.docx',
	proposal: 'to-trinh-dtlt.docx',
};

// Ô thiếu dữ liệu in thành dòng chấm để điền tay
const BLANK = '……………';
const BLANK_LONG = '………………………';
const HOSPITAL = 'Bệnh viện Hữu nghị Đa khoa Nghệ An';
const EXTERNAL_ADDRESSEE = `Giám đốc ${HOSPITAL}; Trung tâm Đào tạo và Chỉ đạo tuyến`;

const pad2 = (n) => String(n).padStart(2, '0');

/** Tách ngày–tháng–năm theo giờ Việt Nam; chuỗi 'YYYY-MM-DD…' lấy nguyên chữ số. */
const dateParts = (v) => {
	if (v === null || v === undefined || v === '') return null;
	if (typeof v === 'string') {
		const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
		if (m && !/(Z|[+-]\d{2}:?\d{2})$/.test(v)) return { y: +m[1], m: +m[2], d: +m[3] };
		const d = new Date(v);
		if (Number.isNaN(d.getTime())) return null;
		// Có múi giờ ⇒ quy về giờ Việt Nam (UTC+7)
		const vn = new Date(d.getTime() + 7 * 3600 * 1000);
		return { y: vn.getUTCFullYear(), m: vn.getUTCMonth() + 1, d: vn.getUTCDate() };
	}
	const d = v instanceof Date ? v : new Date(v);
	if (Number.isNaN(d.getTime())) return null;
	// Date từ driver CSDL là giờ đồng hồ địa phương của cột không múi giờ ⇒ dùng getter địa phương
	return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
};
const dmy = (v) => {
	const p = dateParts(v);
	return p ? `${pad2(p.d)}/${pad2(p.m)}/${p.y}` : '';
};

const str = (v) => (v === null || v === undefined ? '' : String(v).trim());
// Giá trị rỗng ⇒ dòng chấm
const orBlank = (v, blank = BLANK) => str(v) || blank;
// Mẫu viết "khoa …" / "KHOA: …" ⇒ bỏ chữ "Khoa" đầu tên trong danh mục để khỏi lặp
const shortDept = (name) => str(name).replace(/^khoa\s+/i, '');
const money = (n) => {
	if (n === null || n === undefined || n === '' || Number.isNaN(Number(n))) return '';
	return String(Math.round(Number(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};
const className = (courseName, programName) => {
	const c = str(courseName);
	const p = str(programName);
	return p && p !== c ? (c ? `${c} – ${p}` : p) : c;
};

const slug = (s) =>
	str(s)
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/đ/g, 'd')
		.replace(/Đ/g, 'D')
		.replace(/[^A-Za-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
// Tên lớp rút gọn: tối đa ~40 ký tự, cắt ở ranh giới từ
const shortSlug = (s, max = 40) => {
	const full = slug(s);
	if (full.length <= max) return full;
	const cut = full.slice(0, max);
	return cut.slice(0, Math.max(cut.lastIndexOf('-'), 1)).replace(/-+$/, '');
};

const templateCache = new Map();
const loadTemplate = (key) => {
	if (!templateCache.has(key)) {
		templateCache.set(key, fs.readFileSync(path.join(TEMPLATE_DIR, TEMPLATES[key])));
	}
	return templateCache.get(key);
};

const render = (key, data) => {
	const doc = new Docxtemplater(new PizZip(loadTemplate(key)), {
		paragraphLoop: true,
		linebreaks: true,
		nullGetter: () => BLANK,
	});
	doc.render(data);
	return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
};

const parseSnapshot = (s) => {
	if (!s) return {};
	if (typeof s === 'string') {
		try {
			return JSON.parse(s) ?? {};
		} catch {
			return {};
		}
	}
	return s;
};

/**
 * Đơn đăng ký học khóa đào tạo y tế liên tục, điền sẵn từ bản khai.
 * @param {{
 *   source: 'internal' | 'external',
 *   registration_code: string,
 *   created_at: Date | string,
 *   snapshot: Record<string, any>,
 *   course_name: string,
 *   program_name?: string | null,
 *   department_name?: string | null,
 *   trainee_type_name?: string | null,
 * }} data
 * @returns {Promise<{ buffer: Buffer, filename: string, mime: string }>}
 */
const renderApplication = async (data) => {
	const s = parseSnapshot(data.snapshot);
	const internal = data.source === 'internal';
	const dept = str(data.department_name);
	const fullName = str(s.full_name);
	const created = dateParts(data.created_at);
	// Ngày lập đơn không có ⇒ chừa chỗ trống như mẫu gốc (mẫu gốc là khoảng trắng, không phải dòng chấm)
	const gap = '        ';

	const fields = {
		// Nội viện gửi khoa/phòng; ngoại viện gửi Giám đốc + Trung tâm ĐT-CĐT
		kinh_gui: internal ? `Khoa/Phòng/TT ${orBlank(dept, BLANK_LONG)}` : EXTERNAL_ADDRESSEE,
		ho_ten_hoa: fullName ? fullName.toUpperCase() : BLANK_LONG,
		dan_toc: orBlank(s.ethnicity),
		ngay_sinh: orBlank(dmy(s.dob)),
		que_quan: orBlank(s.hometown),
		cccd: orBlank(s.national_id),
		ngay_cap: orBlank(dmy(s.national_id_issued_date)),
		noi_cap: orBlank(s.national_id_issued_place),
		dia_chi: orBlank(s.address || s.permanent_address),
		dien_thoai: orBlank(s.phone),
		email: orBlank(s.email),
		truong_tot_nghiep: orBlank(s.graduated_school),
		nam_tn: orBlank(s.graduated_year),
		chuyen_nganh_tn: orBlank(s.graduated_major || s.qualification, BLANK_LONG),
		co_quan: internal ? (dept ? `${HOSPITAL} – ${dept}` : HOSPITAL) : orBlank(s.workplace),
		chuyen_nganh_cong_tac: orBlank(s.work_specialty),
		tham_nien: orBlank(s.work_seniority),
		khoa_hoc: orBlank(className(data.course_name, data.program_name)),
		ngay: created ? pad2(created.d) : gap,
		thang: created ? pad2(created.m) : gap,
		nam: created ? String(created.y) : gap,
		ho_ten: fullName,
		ma_dang_ky: orBlank(data.registration_code, ''),
	};

	const code = slug(data.registration_code);
	return {
		buffer: render('application', fields),
		filename: `Don-dang-ky-${slug(fullName) || 'nguoi-dang-ky'}${code ? `-${code}` : ''}.docx`,
		mime: DOCX_MIME,
	};
};

/**
 * Tờ trình cử cán bộ tham dự lớp đào tạo liên tục + Bảng phân tích nhu cầu đào tạo.
 * @param {{
 *   department_name: string,
 *   course_name: string,
 *   program_name?: string | null,
 *   start_date?: Date | string | null,
 *   end_date?: Date | string | null,
 *   tuition_fee?: number | null,
 *   year?: number,
 *   people: Array<{ staff_number: number | null, full_name: string, birth_year: number | null, qualification: string | null }>,
 *   analysis?: {
 *     technique?: string | null,
 *     certified_count?: number | null,
 *     proposed_count?: number | null,
 *     in_other_training_count?: number | null,
 *     reason?: string | null,
 *   },
 * }} data
 * @returns {Promise<{ buffer: Buffer, filename: string, mime: string }>}
 */
const renderProposal = async (data) => {
	const dept = shortDept(data.department_name);
	const lop = className(data.course_name, data.program_name);
	const a = data.analysis ?? {};
	const people = Array.isArray(data.people) ? data.people : [];
	const year = data.year || dateParts(data.start_date)?.y || new Date().getFullYear();

	// Không có ai ⇒ vẫn giữ 1 dòng trống để khoa viết tay (vòng lặp rỗng sẽ xóa mất dòng)
	const rows = people.length
		? people.map((p, i) => ({
				stt: String(i + 1),
				staff_number: str(p.staff_number),
				full_name: str(p.full_name),
				birth_year: str(p.birth_year),
				qualification: str(p.qualification),
			}))
		: [{ stt: '', staff_number: '', full_name: '', birth_year: '', qualification: '' }];
	// Số người đề xuất mặc định = số người trong danh sách
	const proposed = a.proposed_count ?? (people.length || null);

	const fields = {
		khoa_hoa: dept ? dept.toUpperCase() : BLANK,
		khoa: orBlank(dept),
		nam: String(year),
		ten_lop: orBlank(lop),
		tu_ngay: orBlank(dmy(data.start_date), BLANK_LONG),
		den_ngay: orBlank(dmy(data.end_date), BLANK_LONG),
		kinh_phi: orBlank(money(data.tuition_fee)),
		people: rows,
		// Bảng phân tích: ô không có dữ liệu để trống cho khoa ghi tay
		ky_thuat: str(a.technique),
		co_chung_chi: str(a.certified_count),
		de_xuat: str(proposed),
		khoa_khac: str(a.in_other_training_count),
		ly_do: str(a.reason),
	};

	const khoaSlug = slug(dept) || 'khoa';
	const lopSlug = shortSlug(lop) || 'lop';
	return {
		buffer: render('proposal', fields),
		filename: `To-trinh-${khoaSlug}-${lopSlug}.docx`,
		mime: DOCX_MIME,
	};
};

module.exports = { DOCX_MIME, BLANK, renderApplication, renderProposal };
