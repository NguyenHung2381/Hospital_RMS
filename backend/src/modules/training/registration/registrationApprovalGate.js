// Gắn tóm tắt bản khai đăng ký vào danh sách ghi danh của khóa (tab "Ghi danh").
// Không còn chốt chặn duyệt: phòng Đào tạo tự xem bản khai / hồ sơ rồi quyết định duyệt.
// Lượt ghi danh không có bản khai (cán bộ ghi danh hộ, nhập Excel) ⇒ registration = null.
//
// Cố ý chỉ đọc thẳng bảng course_registrations (không qua courseRegistrationService):
// courseEnrollmentService require file này ở đầu file — tránh vòng require với service bản khai.
// Chỉ require registrationFileKinds.js (file thuần) cho cùng lý do.
const { missingKinds } = require('./registrationFileKinds');

// Cột bản khai gắn vào câu danh sách ghi danh (courseEnrollmentService.enrollmentSelect)
// reg_file_kinds: các loại file hồ sơ còn hiệu lực (file chưa xóa, file ngoại viện không bị từ chối)
const ENROLLMENT_COLUMNS_SQL = `cr.registration_code AS reg_code, cr.source AS reg_source,
           (SELECT string_agg(crf.kind, ',')
            FROM course_registration_files crf
            JOIN training_files rf ON rf.id = crf.file_id AND rf.is_deleted = 'false'
            LEFT JOIN trainee_documents rd ON rd.id = crf.trainee_document_id
            WHERE crf.enrollment_id = e.id AND COALESCE(rd.status, 'pending') <> 'rejected') AS reg_file_kinds`;
const ENROLLMENT_JOIN_SQL = 'LEFT JOIN course_registrations cr ON cr.enrollment_id = e.id';
const FLAT_KEYS = ['reg_code', 'reg_source', 'reg_file_kinds'];

/**
 * Che mã đăng ký: 'DKABCDEFGHJK' → 'DK••••••GHJK'. Mã đăng ký + email (hoặc CCCD) là thứ
 * cổng công khai nhận để tra cứu / tải đơn / nộp hồ sơ, nên người thiếu quyền
 * trainees:read_sensitive chỉ thấy bản che (vẫn đủ để nhận ra khi đối chiếu).
 * @param {string|null|undefined} code
 */
const maskRegistrationCode = (code) => {
	if (!code) return code;
	const s = String(code);
	return s.length > 6 ? `${s.slice(0, 2)}••••••${s.slice(-4)}` : '••••••';
};

/**
 * Gom cột reg_* của danh sách ghi danh thành `registration`
 * (null = không có bản khai; còn lại { code, source, has_dossier, files_missing }).
 * has_dossier = đã nộp đủ hồ sơ bắt buộc của đối tượng (cả nội viện lẫn ngoại viện).
 * Mã đăng ký mặc định bị che (maskRegistrationCode) — các route này chỉ cần courses:read;
 * nơi gọi đã kiểm trainees:read_sensitive thì truyền { sensitive: true } để trả mã đầy đủ.
 * @param {Array<Record<string, any>>} rows
 * @param {{ sensitive?: boolean }} [opts]
 * @returns {Promise<Array<Record<string, any>>>}
 */
const annotateEnrollments = async (rows, { sensitive = false } = {}) =>
	rows.map((row) => {
		const out = { ...row };
		for (const k of FLAT_KEYS) delete out[k];
		if (!row.reg_code) return { ...out, registration: null };
		const kinds = row.reg_file_kinds ? String(row.reg_file_kinds).split(',') : [];
		const missing = missingKinds(row.reg_source, kinds);
		return {
			...out,
			registration: {
				code: sensitive ? row.reg_code : maskRegistrationCode(row.reg_code),
				source: row.reg_source,
				has_dossier: missing.length === 0,
				files_missing: missing,
			},
		};
	});

module.exports = {
	ENROLLMENT_COLUMNS_SQL,
	ENROLLMENT_JOIN_SQL,
	annotateEnrollments,
	maskRegistrationCode,
};
