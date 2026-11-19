// Chốt chặn duyệt ghi danh có bản khai (DANG-KY-DTLT-CONTRACT.md quyết định 6): lượt ghi
// danh tạo từ form đăng ký chỉ được duyệt khi phòng Đào tạo đã đối chiếu đủ giấy tờ.
//   - Ngoại viện: đã đối chiếu CCCD + văn bằng.
//   - Nội viện: đã nộp hồ sơ (đơn + tờ trình đã duyệt, 1 PDF) + đã đối chiếu tờ trình.
// Cấu hình TRAINING_REGISTRATION_REQUIRE_CHECKS = 'false' tắt chốt chặn. Lượt ghi danh
// không có bản khai (cán bộ ghi danh hộ, nhập Excel) không bị ảnh hưởng; từ chối không bao giờ bị chặn.
//
// Cố ý chỉ đọc thẳng bảng course_registrations (không qua courseRegistrationService):
// courseEnrollmentService require file này ở đầu file — tránh vòng require với service bản khai.
const { getPool, sql } = require('../../../config/db');
const systemSettingService = require('../../settings/systemSettingService');
const { httpError } = require('../../../utils/httpError');

const REQUIRE_CHECKS_KEY = 'TRAINING_REGISTRATION_REQUIRE_CHECKS';
const CHECKS_MISSING = 'REGISTRATION_CHECKS_MISSING';

// key: mốc / điều kiện; label: tên hiện cho người duyệt
const REQUIREMENTS = {
	external: [
		{ key: 'id_checked', label: 'đối chiếu CCCD', done: (r) => !!r.id_checked_at },
		{ key: 'degree_checked', label: 'đối chiếu văn bằng', done: (r) => !!r.degree_checked_at },
	],
	internal: [
		{
			key: 'dossier',
			label: 'hồ sơ nộp bổ sung (đơn + tờ trình đã duyệt)',
			done: (r) => !!r.dossier_file_id,
		},
		{ key: 'proposal_checked', label: 'đối chiếu tờ trình', done: (r) => !!r.proposal_checked_at },
	],
};

/**
 * Điều kiện còn thiếu của 1 bản khai (không xét cấu hình bật/tắt).
 * @param {Record<string, any>} reg dòng course_registrations (source, *_checked_at, dossier_file_id)
 * @returns {{ key: string, label: string }[]}
 */
const missingChecks = (reg) =>
	(REQUIREMENTS[reg.source] ?? [])
		.filter((r) => !r.done(reg))
		.map(({ key, label }) => ({ key, label }));

const requiredKeys = (source) => (REQUIREMENTS[source] ?? []).map((r) => r.key);

// Mặc định bật — chỉ đúng chuỗi 'false' mới tắt
const requireChecksEnabled = async () =>
	String((await systemSettingService.getValue(REQUIRE_CHECKS_KEY)) ?? '')
		.trim()
		.toLowerCase() !== 'false';

const blockMessage = (missing) =>
	`Chưa đủ điều kiện duyệt — còn thiếu: ${missing.map((m) => m.label).join(', ')}. ` +
	'Đánh dấu ở tab "Đơn đăng ký" của hồ sơ ghi danh.';

/**
 * Ném 409 (code REGISTRATION_CHECKS_MISSING, kèm `missing`) khi lượt ghi danh có bản khai
 * mà chưa đủ mốc đối chiếu và cấu hình đang bật. Không có bản khai ⇒ cho qua.
 * @param {string} enrollmentId
 */
const assertApprovable = async (enrollmentId) => {
	const pool = await getPool();
	const reg = (
		await pool
			.request()
			.input('id', sql.VarChar(20), enrollmentId)
			.query(
				`SELECT source, id_checked_at, degree_checked_at, proposal_checked_at, dossier_file_id
				 FROM course_registrations WHERE enrollment_id = @id`,
			)
	).recordset[0];
	if (!reg) return;
	const missing = missingChecks(reg);
	if (!missing.length || !(await requireChecksEnabled())) return;
	throw httpError(409, blockMessage(missing), { code: CHECKS_MISSING, missing });
};

// Cột bản khai gắn vào câu danh sách ghi danh (courseEnrollmentService.enrollmentSelect)
const ENROLLMENT_COLUMNS_SQL = `cr.registration_code AS reg_code, cr.source AS reg_source,
           cr.id_checked_at AS reg_id_checked_at, cr.degree_checked_at AS reg_degree_checked_at,
           cr.proposal_checked_at AS reg_proposal_checked_at, cr.dossier_file_id AS reg_dossier_file_id`;
const ENROLLMENT_JOIN_SQL = 'LEFT JOIN course_registrations cr ON cr.enrollment_id = e.id';
const FLAT_KEYS = [
	'reg_code',
	'reg_source',
	'reg_id_checked_at',
	'reg_degree_checked_at',
	'reg_proposal_checked_at',
	'reg_dossier_file_id',
];

/**
 * Gom cột reg_* của danh sách ghi danh thành `registration` (null = không có bản khai):
 * mốc đã có, điều kiện còn thiếu để duyệt (rỗng khi cấu hình tắt) và `ready`.
 * @param {Array<Record<string, any>>} rows
 * @returns {Promise<Array<Record<string, any>>>}
 */
const annotateEnrollments = async (rows) => {
	const enabled = rows.some((r) => r.reg_code) ? await requireChecksEnabled() : true;
	return rows.map((row) => {
		const out = { ...row };
		for (const k of FLAT_KEYS) delete out[k];
		if (!row.reg_code) return { ...out, registration: null };
		const reg = {
			source: row.reg_source,
			id_checked_at: row.reg_id_checked_at,
			degree_checked_at: row.reg_degree_checked_at,
			proposal_checked_at: row.reg_proposal_checked_at,
			dossier_file_id: row.reg_dossier_file_id,
		};
		const missing = enabled ? missingChecks(reg) : [];
		return {
			...out,
			registration: {
				code: row.reg_code,
				source: row.reg_source,
				id_checked: !!reg.id_checked_at,
				degree_checked: !!reg.degree_checked_at,
				proposal_checked: !!reg.proposal_checked_at,
				has_dossier: !!reg.dossier_file_id,
				require_checks: enabled,
				missing: missing.map((m) => m.label),
				ready: missing.length === 0,
			},
		};
	});
};

module.exports = {
	REQUIRE_CHECKS_KEY,
	CHECKS_MISSING,
	missingChecks,
	requiredKeys,
	requireChecksEnabled,
	assertApprovable,
	ENROLLMENT_COLUMNS_SQL,
	ENROLLMENT_JOIN_SQL,
	annotateEnrollments,
};
