// Phòng Đào tạo đối chiếu bản khai (form đăng ký khóa đào tạo liên tục) với hồ sơ học
// viên + giấy tờ trước khi duyệt: bản khai đã parse, chỗ lệch so với hồ sơ, mốc đối
// chiếu (ai / lúc nào), hồ sơ PDF nộp bổ sung, Đơn đăng ký (.docx).
// Bản khai đọc / ghi qua courseRegistrationService (luồng L2); Đơn sinh bằng
// registrationDocumentService (luồng L3) — file này chỉ gom dữ liệu.
const { getPool, sql } = require('../../../config/db');
const { httpError } = require('../../../utils/httpError');
const { hasPermission } = require('../../../permissions/authz');
const courseRegistrationService = require('./courseRegistrationService');
const registrationDocumentService = require('./registrationDocumentService');
const approvalGate = require('./registrationApprovalGate');
const { TRAINEE_FIELDS, INVOICE_FIELDS, CHECK_KEYS } = require('./registrationConstants');

// ─── So sánh bản khai ↔ hồ sơ học viên ──────────────────────────────────────
const DATE_FIELDS = new Set(['dob', 'national_id_issued_date']);
// Số giấy tờ / điện thoại: bỏ mọi dấu cách, chấm, gạch khi so
const COMPACT_FIELDS = new Set(['national_id', 'phone', 'degree_number', 'degree_registry_number']);

const pad = (n) => String(n).padStart(2, '0');

// Ngày về 'YYYY-MM-DD'. Cột DATE đọc ra Date mang đúng ngày ở giờ UTC (config/pgParams.js).
const normDate = (v) => {
	if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
	const s = String(v).trim();
	let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
	if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
	m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
	if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
	return s.toLowerCase();
};

/**
 * Giá trị đã chuẩn hóa để so sánh: ngày về YYYY-MM-DD; chữ bỏ khoảng trắng thừa, chữ thường
 * (Unicode NFC — chữ Việt gõ tổ hợp / dựng sẵn coi như nhau); rỗng / null = ''.
 * @param {string} key
 * @param {unknown} value
 */
const normalizeValue = (key, value) => {
	if (value === null || value === undefined) return '';
	if (DATE_FIELDS.has(key)) return normDate(value);
	if (typeof value === 'number') return String(value);
	if (typeof value === 'boolean') return value ? 'true' : 'false';
	// "0912 345 678" = "0912.345.678" = "0912345678"
	if (COMPACT_FIELDS.has(key))
		return String(value)
			.replace(/[^0-9A-Za-z]/g, '')
			.toLowerCase();
	return String(value).normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
};

// Dạng hiển thị: ngày ISO, còn lại giữ nguyên văn
const displayValue = (key, value) => {
	if (value === null || value === undefined || value === '') return null;
	if (DATE_FIELDS.has(key)) return normDate(value);
	if (value instanceof Date) return value.toISOString();
	return value;
};

/**
 * Trường có trong cả bản khai lẫn hồ sơ học viên mà lệch nhau. Chỉ xét trường hồ sơ thật
 * sự có (cột chưa thêm vào bảng trainees thì bỏ qua) và trường người đăng ký đã khai.
 * @param {Record<string, any>} snapshot
 * @param {Record<string, any> | null} profile dòng trainees
 * @returns {{ key: string, declared: any, profile: any }[]}
 */
const computeDiffs = (snapshot, profile) => {
	if (!snapshot || !profile) return [];
	const diffs = [];
	for (const key of TRAINEE_FIELDS) {
		if (!Object.prototype.hasOwnProperty.call(profile, key)) continue;
		const declared = normalizeValue(key, snapshot[key]);
		if (!declared) continue;
		if (declared === normalizeValue(key, profile[key])) continue;
		diffs.push({
			key,
			declared: displayValue(key, snapshot[key]),
			profile: displayValue(key, profile[key]),
		});
	}
	return diffs;
};

// ─── Đọc bản khai cho màn đối chiếu ─────────────────────────────────────────
const maskId = (v) => {
	if (!v) return v;
	const s = String(v);
	return s.length > 4 ? `••••${s.slice(-4)}` : '••••';
};

const canReadSensitive = (actor) => hasPermission(actor, 'trainees', 'read_sensitive');

// Tên khóa / chương trình / khoa / đối tượng / người đối chiếu + file hồ sơ — 1 câu
const loadContext = async (enrollmentId, reg) => {
	const snap = reg.snapshot ?? {};
	const pool = await getPool();
	const r = await pool
		.request()
		.input('id', sql.VarChar(20), enrollmentId)
		.input('reg_dept', sql.VarChar(20), reg.department_id || snap.department_id || null)
		.input('reg_type', sql.VarChar(20), snap.trainee_type_id || null)
		.input('id_by', sql.VarChar(20), reg.id_checked_by || null)
		.input('degree_by', sql.VarChar(20), reg.degree_checked_by || null)
		.input('proposal_by', sql.VarChar(20), reg.proposal_checked_by || null)
		.input('dossier_id', sql.VarChar(20), reg.dossier_file_id || null).query(`
      SELECT e.course_id, c.name AS course_name, e.program_id, tp.name AS program_name,
             e.status AS enrollment_status, e.trainee_id,
             (SELECT name FROM departments WHERE id = @reg_dept) AS department_name,
             (SELECT name FROM departments WHERE id = t.department_id) AS profile_department_name,
             (SELECT name FROM trainee_types WHERE id = @reg_type) AS trainee_type_name,
             (SELECT name FROM trainee_types WHERE id = t.trainee_type_id) AS profile_trainee_type_name,
             (SELECT full_name FROM users WHERE id = @id_by) AS id_checked_by_name,
             (SELECT full_name FROM users WHERE id = @degree_by) AS degree_checked_by_name,
             (SELECT full_name FROM users WHERE id = @proposal_by) AS proposal_checked_by_name,
             f.id AS dossier_file_id, f.file_name AS dossier_file_name, f.file_url AS dossier_file_url,
             f.mime_type AS dossier_mime_type, f.file_size AS dossier_file_size
      FROM course_enrollments e
      JOIN courses c ON c.id = e.course_id
      JOIN trainees t ON t.id = e.trainee_id
      LEFT JOIN training_programs tp ON tp.id = e.program_id
      LEFT JOIN training_files f ON f.id = @dossier_id AND f.is_deleted = 'false'
      WHERE e.id = @id`);
	return r.recordset[0] ?? null;
};

const loadProfile = async (enrollmentId) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('id', sql.VarChar(20), enrollmentId)
		.query(
			'SELECT t.* FROM course_enrollments e JOIN trainees t ON t.id = e.trainee_id WHERE e.id = @id',
		);
	return r.recordset[0] ?? null;
};

const checkInfo = (reg, ctx, key) => {
	const base = key.replace(/_checked$/, '');
	const at = reg[`${base}_checked_at`];
	return at
		? {
				at,
				by: reg[`${base}_checked_by`] ?? null,
				by_name: ctx?.[`${base}_checked_by_name`] ?? null,
			}
		: null;
};

/**
 * Bản khai + chỗ lệch với hồ sơ + mốc đối chiếu. Không có bản khai ⇒ null.
 * Người thiếu quyền trainees:read_sensitive: CCCD bị che, không nhận link hồ sơ PDF.
 * @param {string} enrollmentId
 * @param {any} actor req.user
 */
const getForReview = async (enrollmentId, actor) => {
	const reg = await courseRegistrationService.getByEnrollment(enrollmentId);
	if (!reg) return null;
	const [ctx, profile, enabled] = await Promise.all([
		loadContext(enrollmentId, reg),
		loadProfile(enrollmentId),
		approvalGate.requireChecksEnabled(),
	]);
	const sensitive = canReadSensitive(actor);
	const snapshot = { ...(reg.snapshot ?? {}) };
	let diffs = computeDiffs(snapshot, profile).map((d) => {
		if (d.key === 'department_id')
			return {
				...d,
				declared_label: ctx?.department_name ?? null,
				profile_label: ctx?.profile_department_name ?? null,
			};
		if (d.key === 'trainee_type_id')
			return {
				...d,
				declared_label: ctx?.trainee_type_name ?? null,
				profile_label: ctx?.profile_trainee_type_name ?? null,
			};
		return d;
	});
	if (!sensitive) {
		snapshot.national_id = maskId(snapshot.national_id);
		diffs = diffs.map((d) =>
			d.key === 'national_id'
				? { ...d, declared: maskId(d.declared), profile: maskId(d.profile) }
				: d,
		);
	}
	const missing = approvalGate.missingChecks(reg);
	return {
		enrollment_id: enrollmentId,
		registration_code: reg.registration_code,
		source: reg.source,
		channel: reg.channel ?? null,
		staff_number: reg.staff_number ?? null,
		department_id: reg.department_id ?? snapshot.department_id ?? null,
		department_name: ctx?.department_name ?? null,
		trainee_type_name: ctx?.trainee_type_name ?? null,
		course_id: ctx?.course_id ?? null,
		course_name: ctx?.course_name ?? null,
		program_name: ctx?.program_name ?? null,
		enrollment_status: ctx?.enrollment_status ?? null,
		snapshot,
		diffs,
		rules_version: reg.rules_version ?? null,
		rules_accepted_at: reg.rules_accepted_at ?? null,
		declared_true_at: reg.declared_true_at ?? null,
		verified_email: reg.verified_email ?? null,
		email_verified_at: reg.email_verified_at ?? null,
		invoice: Object.fromEntries(INVOICE_FIELDS.map((k) => [k, reg[k] ?? null])),
		checks: Object.fromEntries(CHECK_KEYS.map((k) => [k, checkInfo(reg, ctx, k)])),
		required: approvalGate.requiredKeys(reg.source),
		require_checks: enabled,
		missing: enabled ? missing.map((m) => m.label) : [],
		dossier:
			reg.dossier_file_id && ctx?.dossier_file_id
				? {
						file_id: ctx.dossier_file_id,
						file_name: ctx.dossier_file_name,
						file_url: sensitive ? ctx.dossier_file_url : null,
						mime_type: ctx.dossier_mime_type,
						file_size: ctx.dossier_file_size,
						uploaded_at: reg.dossier_uploaded_at ?? null,
					}
				: null,
		created_at: reg.created_at ?? null,
	};
};

/**
 * Ghi / bỏ mốc đối chiếu rồi trả lại bản khai như getForReview.
 * @param {string} enrollmentId
 * @param {{ id_checked?: boolean, degree_checked?: boolean, proposal_checked?: boolean }} checks
 * @param {any} actor
 */
const setChecks = async (enrollmentId, checks, actor) => {
	const reg = await courseRegistrationService.getByEnrollment(enrollmentId);
	if (!reg) throw httpError(404, 'Lượt ghi danh này không có bản khai đăng ký.');
	const clean = {};
	for (const k of CHECK_KEYS) if (typeof checks?.[k] === 'boolean') clean[k] = checks[k];
	if (!Object.keys(clean).length) throw httpError(400, 'Chưa chọn mốc đối chiếu nào.');
	await courseRegistrationService.setChecks(enrollmentId, clean, actor.id);
	return getForReview(enrollmentId, actor);
};

/**
 * Đơn đăng ký (.docx) của 1 bản khai — in đúng dữ liệu người đó đã khai (snapshot).
 * Dùng chung cho màn quản trị và cổng nhân viên.
 * @param {Record<string, any>} reg dòng courseRegistrationService.getByEnrollment
 */
const renderApplicationFor = async (reg) => {
	const ctx = await loadContext(reg.enrollment_id, reg);
	if (!ctx) throw httpError(404, 'Không tìm thấy lượt ghi danh.');
	return registrationDocumentService.renderApplication({
		source: reg.source,
		registration_code: reg.registration_code,
		created_at: reg.created_at,
		snapshot: reg.snapshot ?? {},
		course_name: ctx.course_name,
		program_name: ctx.program_name ?? null,
		department_name: ctx.department_name ?? null,
		trainee_type_name: ctx.trainee_type_name ?? null,
	});
};

const applicationForEnrollment = async (enrollmentId) => {
	const reg = await courseRegistrationService.getByEnrollment(enrollmentId);
	if (!reg) throw httpError(404, 'Lượt ghi danh này không có bản khai đăng ký.');
	return renderApplicationFor({ ...reg, enrollment_id: enrollmentId });
};

// File PDF hồ sơ nộp bổ sung — trả đường dẫn /uploads (response tự ký link có hạn)
const dossierForEnrollment = async (enrollmentId) => {
	const reg = await courseRegistrationService.getByEnrollment(enrollmentId);
	if (!reg?.dossier_file_id) throw httpError(404, 'Chưa có hồ sơ nộp bổ sung.');
	const ctx = await loadContext(enrollmentId, reg);
	if (!ctx?.dossier_file_id) throw httpError(404, 'Chưa có hồ sơ nộp bổ sung.');
	return {
		file_id: ctx.dossier_file_id,
		file_name: ctx.dossier_file_name,
		file_url: ctx.dossier_file_url,
		mime_type: ctx.dossier_mime_type,
		file_size: ctx.dossier_file_size,
		uploaded_at: reg.dossier_uploaded_at ?? null,
	};
};

module.exports = {
	normalizeValue,
	computeDiffs,
	getForReview,
	setChecks,
	renderApplicationFor,
	applicationForEnrollment,
	dossierForEnrollment,
};
