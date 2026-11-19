// course_registrations — bản khai của 1 lượt ghi danh tạo từ form đăng ký khóa đào tạo
// liên tục (mã đăng ký, snapshot, cam kết, hóa đơn, mốc đối chiếu, hồ sơ nộp bổ sung).
//
// Chữ ký hàm là hợp đồng giữa các luồng (DANG-KY-DTLT-CONTRACT.md mục 5) — luồng
// khác chỉ gọi. snapshot lưu dạng chuỗi JSON, đọc ra luôn parse thành object.
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { getPool, sql, nowSql, updateReturning } = require('../../../config/db');
const { isUniqueViolation, constraintName } = require('../../../utils/dbErrors');
const { httpError, badRequest } = require('../../../utils/httpError');
const { moveUploadedFiles, UPLOADS_ROOT } = require('../../../utils/uploadPaths');
const trainingFileService = require('../trainingFileService');
const { isPdf } = require('../trainees/traineeProfilePdf');
const { SNAPSHOT_FIELDS, INVOICE_FIELDS, CHECK_KEYS, SOURCES } = require('./registrationConstants');

// Loại thực thể của file hồ sơ nộp bổ sung ở training_files (entity_id = enrollment_id)
// — tách khỏi 'trainee_document' để file không lẫn vào tab "Hồ sơ" của học viên.
const DOSSIER_ENTITY = 'course_registration';

// Bỏ 0/O/1/I để đọc qua điện thoại / chép tay không nhầm
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_RE = /^DK[A-HJ-NP-Z2-9]{10}$/;
const CODE_ATTEMPTS = 5;

const randomCode = () => {
	let s = 'DK';
	for (let i = 0; i < 10; i++) s += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
	return s;
};

// 'dk-ab12 cd34ef' → 'DKAB12CD34EF'; sai dạng ⇒ null (không cần hỏi CSDL)
const normalizeCode = (code) => {
	const v = String(code ?? '')
		.replace(/[\s-]/g, '')
		.toUpperCase();
	return CODE_RE.test(v) ? v : null;
};

const parseSnapshot = (text) => {
	if (!text) return {};
	try {
		const v = JSON.parse(text);
		return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
	} catch {
		return {};
	}
};

const parseRow = (row) => (row ? { ...row, snapshot: parseSnapshot(row.snapshot) } : null);

const clean = (v) => {
	if (v === undefined || v === null) return null;
	if (typeof v === 'string') return v.trim() || null;
	return v;
};

// Chỉ giữ đúng khóa của bản khai — người gọi có truyền thừa cũng không lọt vào đơn
const pickSnapshot = (snapshot) => {
	const out = {};
	for (const k of SNAPSHOT_FIELDS) {
		const v = clean(snapshot?.[k]);
		if (v !== null) out[k] = v;
	}
	return out;
};

// Cột của bản khai + tên khóa / chương trình / khoa và trạng thái ghi danh (đọc kèm cho
// màn tra cứu, cổng nhân viên, quản trị — đỡ mỗi nơi tự JOIN lại).
const SELECT_REGISTRATION = `
	SELECT r.*, e.course_id, e.program_id, e.trainee_id, e.status AS enrollment_status, e.registered_at,
	       c.name AS course_name, tp.name AS program_name, d.name AS department_name
	FROM course_registrations r
	JOIN course_enrollments e ON e.id = r.enrollment_id
	JOIN courses c ON c.id = e.course_id
	LEFT JOIN training_programs tp ON tp.id = e.program_id
	LEFT JOIN departments d ON d.id = r.department_id`;

/**
 * Mã đăng ký in trên đơn: 'DK' + 10 ký tự [A-HJ-NP-Z2-9] (không có 0/O/1/I), duy nhất.
 * @returns {Promise<string>}
 */
const genCode = async () => {
	const pool = await getPool();
	for (let i = 0; i < CODE_ATTEMPTS; i++) {
		const code = randomCode();
		const r = await pool
			.request()
			.input('code', sql.VarChar(16), code)
			.query('SELECT 1 AS x FROM course_registrations WHERE registration_code = @code');
		if (!r.recordset.length) return code;
	}
	throw new Error('Không sinh được mã đăng ký duy nhất');
};

/**
 * Tạo bản khai cho 1 lượt ghi danh vừa tạo.
 * @param {string} enrollmentId
 * @param {{
 *   source: 'internal' | 'external',
 *   channel?: 'public' | 'portal',
 *   staffUserId?: string | null,
 *   staffNumber?: number | null,
 *   departmentId?: string | null,
 *   snapshot: Record<string, unknown>,
 *   rulesVersion: string,
 *   verifiedEmail?: string | null,
 *   invoice?: Record<string, string | null>,
 * }} data
 * @param {string | null} actorId
 * @returns {Promise<{ enrollment_id: string, registration_code: string }>}
 */
const create = async (enrollmentId, data, actorId) => {
	if (!SOURCES.includes(data.source)) throw badRequest('Đối tượng đăng ký không hợp lệ.');
	const channel = data.channel === 'portal' ? 'portal' : 'public';
	const internal = data.source === 'internal';
	// Hóa đơn chỉ hỏi ngoại viện
	const invoice = {};
	for (const k of INVOICE_FIELDS) invoice[k] = internal ? null : clean(data.invoice?.[k]);
	const snapshot = JSON.stringify(pickSnapshot(data.snapshot));
	const verifiedEmail = clean(data.verifiedEmail);
	const pool = await getPool();

	for (let i = 0; i < CODE_ATTEMPTS; i++) {
		const code = await genCode();
		try {
			await pool
				.request()
				.input('enrollment_id', sql.VarChar(20), enrollmentId)
				.input('code', sql.VarChar(16), code)
				.input('source', sql.VarChar(10), data.source)
				.input('channel', sql.VarChar(10), channel)
				.input('staff_user_id', sql.VarChar(20), internal ? data.staffUserId || null : null)
				.input('staff_number', sql.Int, internal ? (data.staffNumber ?? null) : null)
				.input('department_id', sql.VarChar(20), internal ? data.departmentId || null : null)
				.input('snapshot', sql.NVarChar(sql.MAX), snapshot)
				.input('rules_version', sql.VarChar(20), data.rulesVersion || null)
				.input('verified_email', sql.VarChar(100), verifiedEmail)
				.input('invoice_org_name', sql.NVarChar(255), invoice.invoice_org_name)
				.input('invoice_org_address', sql.NVarChar(255), invoice.invoice_org_address)
				.input('invoice_tax_code', sql.VarChar(20), invoice.invoice_tax_code)
				.input('invoice_budget_code', sql.VarChar(20), invoice.invoice_budget_code)
				.input('invoice_email', sql.VarChar(100), invoice.invoice_email)
				.input('actor_id', sql.VarChar(20), actorId || null).query(`
					INSERT INTO course_registrations (
						enrollment_id, registration_code, source, channel, staff_user_id, staff_number, department_id,
						snapshot, rules_version, rules_accepted_at, declared_true_at, verified_email, email_verified_at,
						invoice_org_name, invoice_org_address, invoice_tax_code, invoice_budget_code, invoice_email,
						created_by
					) VALUES (
						@enrollment_id, @code, @source, @channel, @staff_user_id, @staff_number, @department_id,
						@snapshot, @rules_version, ${nowSql}, ${nowSql}, @verified_email,
						CASE WHEN CAST(@verified_email AS VARCHAR(100)) IS NULL THEN NULL ELSE ${nowSql} END,
						@invoice_org_name, @invoice_org_address, @invoice_tax_code, @invoice_budget_code, @invoice_email,
						@actor_id
					)`);
			return { enrollment_id: enrollmentId, registration_code: code };
		} catch (err) {
			// 2 bản khai cùng lúc rút trúng 1 mã (gần như không thể) ⇒ rút lại
			if (isUniqueViolation(err) && constraintName(err) === 'uq_course_registrations_code')
				continue;
			throw err;
		}
	}
	throw new Error('Không sinh được mã đăng ký duy nhất');
};

/**
 * @param {string} enrollmentId
 * @returns {Promise<Record<string, any> | null>} dòng course_registrations, snapshot đã parse thành object
 */
const getByEnrollment = async (enrollmentId) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('id', sql.VarChar(20), enrollmentId)
		.query(`${SELECT_REGISTRATION} WHERE r.enrollment_id = @id`);
	return parseRow(r.recordset[0]);
};

/**
 * @param {string} code mã đăng ký (không phân biệt hoa/thường, bỏ khoảng trắng và dấu '-')
 * @returns {Promise<Record<string, any> | null>}
 */
const getByCode = async (code) => {
	const normalized = normalizeCode(code);
	const pool = await getPool();
	// Mã sai dạng vẫn chạy 1 truy vấn (với giá trị không bao giờ khớp) — mã sai dạng và
	// mã đúng dạng nhưng không có trả về cùng thời gian.
	const r = await pool
		.request()
		.input('code', sql.VarChar(16), normalized || '-')
		.query(`${SELECT_REGISTRATION} WHERE r.registration_code = @code`);
	return normalized ? parseRow(r.recordset[0]) : null;
};

/**
 * Các bản khai của 1 nhân viên (staff_user_id), mới nhất trước, kèm tên khóa / chương trình
 * và trạng thái ghi danh (enrollment_status).
 * @param {string} userId
 * @returns {Promise<Array<Record<string, any>>>}
 */
const listByStaff = async (userId) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('uid', sql.VarChar(20), userId)
		.query(`${SELECT_REGISTRATION} WHERE r.staff_user_id = @uid ORDER BY r.created_at DESC`);
	return r.recordset.map((row) => {
		const parsed = parseRow(row);
		return { ...parsed, needs_dossier: parsed.source === 'internal' && !parsed.dossier_file_id };
	});
};

/**
 * Ghi / bỏ mốc đối chiếu. Khóa vắng mặt thì giữ nguyên; true ⇒ ghi thời điểm + người
 * đối chiếu (đã có mốc thì giữ mốc cũ), false ⇒ xóa mốc.
 * @param {string} enrollmentId
 * @param {{ id_checked?: boolean, degree_checked?: boolean, proposal_checked?: boolean }} checks
 * @param {string} actorId
 * @returns {Promise<Record<string, any>>} dòng sau khi cập nhật
 */
const setChecks = async (enrollmentId, checks, actorId) => {
	const sets = [];
	for (const key of CHECK_KEYS) {
		const v = checks?.[key];
		if (v === undefined) continue;
		const at = `${key}_at`;
		const by = `${key}_by`;
		// Tên cột lấy từ CHECK_KEYS (hằng số), không lấy từ input
		if (v === true || v === 'true') {
			sets.push(
				`${at} = COALESCE(${at}, ${nowSql})`,
				`${by} = CASE WHEN ${at} IS NULL THEN @actor_id ELSE ${by} END`,
			);
		} else {
			sets.push(`${at} = NULL`, `${by} = NULL`);
		}
	}
	const pool = await getPool();
	const r = await pool
		.request()
		.input('id', sql.VarChar(20), enrollmentId)
		.input('actor_id', sql.VarChar(20), actorId || null)
		.query(
			updateReturning(
				`UPDATE course_registrations SET ${[...sets, `updated_at = ${nowSql}`, 'updated_by = @actor_id'].join(', ')}`,
				'enrollment_id = @id',
				'enrollment_id',
			),
		);
	if (!r.recordset.length) throw httpError(404, 'Không tìm thấy bản khai đăng ký.');
	return getByEnrollment(enrollmentId);
};

/**
 * Lưu file PDF hồ sơ nộp bổ sung (nội viện: đơn + tờ trình đã duyệt). File cũ bị thay.
 * @param {string} enrollmentId
 * @param {{ originalname: string, filename?: string, path?: string, size?: number, mimetype?: string }} file
 * @param {string | null} actorId
 * @returns {Promise<{ file_id: string, dossier_uploaded_at: Date }>}
 */
const attachDossier = async (enrollmentId, file, actorId) => {
	const dropUpload = () => (file?.path ? fs.promises.unlink(file.path).catch(() => {}) : null);
	if (!file || !isPdf(file)) {
		await dropUpload();
		throw badRequest('Hồ sơ nộp bổ sung chỉ nhận 1 file PDF (gộp đơn và tờ trình vào một file).');
	}
	const pool = await getPool();
	const current = await pool
		.request()
		.input('id', sql.VarChar(20), enrollmentId)
		.query('SELECT dossier_file_id FROM course_registrations WHERE enrollment_id = @id');
	if (!current.recordset.length) {
		await dropUpload();
		throw httpError(404, 'Không tìm thấy bản khai đăng ký.');
	}
	const oldFileId = current.recordset[0].dossier_file_id;

	// Cùng chỗ với file đào tạo khác: uploads/training/<loại>/<mã>/ — file_url do
	// saveUploadedFile dựng theo đúng đường này.
	const dir = path.join(UPLOADS_ROOT, 'training', DOSSIER_ENTITY, enrollmentId);
	const [moved] = file.path ? await moveUploadedFiles([file], dir) : [file];
	const saved = await trainingFileService.saveUploadedFile(
		DOSSIER_ENTITY,
		enrollmentId,
		moved,
		actorId,
	);
	const r = await pool
		.request()
		.input('id', sql.VarChar(20), enrollmentId)
		.input('file_id', sql.VarChar(20), saved.id)
		.input('actor_id', sql.VarChar(20), actorId || null)
		.query(
			updateReturning(
				`UPDATE course_registrations
				 SET dossier_file_id = @file_id, dossier_uploaded_at = ${nowSql}, updated_at = ${nowSql}, updated_by = @actor_id`,
				'enrollment_id = @id',
				'dossier_uploaded_at',
			),
		);
	if (oldFileId && oldFileId !== saved.id) await trainingFileService.softDelete(oldFileId, actorId);
	return { file_id: saved.id, dossier_uploaded_at: r.recordset[0]?.dossier_uploaded_at ?? null };
};

const birthYear = (dob) => {
	const y = dob ? Number(String(dob).slice(0, 4)) : NaN;
	return Number.isInteger(y) && y > 1900 ? y : null;
};

/**
 * Bản khai nội viện gom theo khóa + chương trình + khoa — dữ liệu cho Tờ trình. Trả mọi
 * trạng thái ghi danh (kèm enrollment_status) — người gọi tự lọc nếu cần.
 * @param {{ courseId?: string, departmentId?: string, programId?: string }} filter
 * @returns {Promise<Array<{
 *   course_id: string, course_name: string, start_date: Date | null, end_date: Date | null,
 *   program_id: string | null, program_name: string | null, tuition_fee: number | null,
 *   department_id: string, department_name: string,
 *   people: Array<{ enrollment_id: string, staff_user_id: string, staff_number: number | null,
 *     full_name: string, birth_year: number | null, qualification: string | null,
 *     enrollment_status: string, dossier_uploaded_at: Date | null, proposal_checked_at: Date | null }>,
 * }>>}
 */
const listInternalGroups = async (filter = {}) => {
	const pool = await getPool();
	const req = pool.request();
	const where = ["r.source = 'internal'", 'r.department_id IS NOT NULL'];
	if (filter.courseId) {
		req.input('course_id', sql.VarChar(20), filter.courseId);
		where.push('e.course_id = @course_id');
	}
	if (filter.departmentId) {
		req.input('department_id', sql.VarChar(20), filter.departmentId);
		where.push('r.department_id = @department_id');
	}
	if (filter.programId) {
		req.input('program_id', sql.VarChar(20), filter.programId);
		where.push('e.program_id = @program_id');
	}
	const r = await req.query(`
		SELECT r.enrollment_id, r.staff_user_id, r.staff_number, r.department_id, r.snapshot,
		       r.dossier_uploaded_at, r.proposal_checked_at, e.status AS enrollment_status,
		       e.course_id, c.name AS course_name, c.start_date, c.end_date,
		       e.program_id, tp.name AS program_name, tp.tuition_fee, d.name AS department_name
		FROM course_registrations r
		JOIN course_enrollments e ON e.id = r.enrollment_id
		JOIN courses c ON c.id = e.course_id
		LEFT JOIN training_programs tp ON tp.id = e.program_id
		LEFT JOIN departments d ON d.id = r.department_id
		WHERE ${where.join(' AND ')}
		ORDER BY c.start_date, c.name, tp.name, d.name, r.created_at`);

	const groups = new Map();
	for (const row of r.recordset) {
		const key = `${row.course_id}|${row.program_id ?? ''}|${row.department_id}`;
		let g = groups.get(key);
		if (!g) {
			g = {
				course_id: row.course_id,
				course_name: row.course_name,
				start_date: row.start_date ?? null,
				end_date: row.end_date ?? null,
				program_id: row.program_id ?? null,
				program_name: row.program_name ?? null,
				tuition_fee:
					row.tuition_fee === null || row.tuition_fee === undefined
						? null
						: Number(row.tuition_fee),
				department_id: row.department_id,
				department_name: row.department_name ?? '',
				people: [],
			};
			groups.set(key, g);
		}
		const s = parseSnapshot(row.snapshot);
		g.people.push({
			enrollment_id: row.enrollment_id,
			staff_user_id: row.staff_user_id,
			staff_number: row.staff_number ?? null,
			full_name: s.full_name || '',
			birth_year: birthYear(s.dob),
			qualification: s.qualification || null,
			enrollment_status: row.enrollment_status,
			dossier_uploaded_at: row.dossier_uploaded_at ?? null,
			proposal_checked_at: row.proposal_checked_at ?? null,
		});
	}
	return [...groups.values()];
};

module.exports = {
	genCode,
	create,
	getByEnrollment,
	getByCode,
	listByStaff,
	setChecks,
	attachDossier,
	listInternalGroups,
	// Dùng chung với cổng công khai (mã giả của honeypot, chuẩn hóa mã người dùng gõ)
	normalizeCode,
	randomCode,
	DOSSIER_ENTITY,
};
