// Phòng Đào tạo xem bản khai (form đăng ký khóa đào tạo liên tục) trước khi duyệt: bản
// khai đã parse, chỗ lệch so với hồ sơ học viên, file hồ sơ đính kèm, Đơn đăng ký (.docx).
// Bản khai đọc / ghi qua courseRegistrationService; Đơn sinh bằng
// registrationDocumentService — file này chỉ gom dữ liệu.
const { getPool, sql } = require('../../../config/db');
const { httpError } = require('../../../utils/httpError');
const { hasPermission } = require('../../../permissions/authz');
const courseRegistrationService = require('./courseRegistrationService');
const registrationDocumentService = require('./registrationDocumentService');
const registrationFileService = require('./registrationFileService');
const { TRAINEE_FIELDS, INVOICE_FIELDS } = require('./registrationConstants');

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

// ─── Đọc bản khai cho màn xem bản khai ─────────────────────────────────────────
const maskId = (v) => {
	if (!v) return v;
	const s = String(v);
	return s.length > 4 ? `••••${s.slice(-4)}` : '••••';
};

const canReadSensitive = (actor) => hasPermission(actor, 'trainees', 'read_sensitive');

// Tên khóa / chương trình / khoa / đối tượng — 1 câu
const loadContext = async (enrollmentId, reg) => {
	const snap = reg.snapshot ?? {};
	const pool = await getPool();
	const r = await pool
		.request()
		.input('id', sql.VarChar(20), enrollmentId)
		.input('reg_dept', sql.VarChar(20), reg.department_id || snap.department_id || null)
		.input('reg_type', sql.VarChar(20), snap.trainee_type_id || null).query(`
      SELECT e.course_id, c.name AS course_name, e.program_id, tp.name AS program_name,
             e.status AS enrollment_status, e.trainee_id,
             (SELECT name FROM departments WHERE id = @reg_dept) AS department_name,
             (SELECT name FROM departments WHERE id = t.department_id) AS profile_department_name,
             (SELECT name FROM trainee_types WHERE id = @reg_type) AS trainee_type_name,
             (SELECT name FROM trainee_types WHERE id = t.trainee_type_id) AS profile_trainee_type_name
      FROM course_enrollments e
      JOIN courses c ON c.id = e.course_id
      JOIN trainees t ON t.id = e.trainee_id
      LEFT JOIN training_programs tp ON tp.id = e.program_id
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

/**
 * Bản khai + chỗ lệch với hồ sơ. Không có bản khai ⇒ null.
 * Người thiếu quyền trainees:read_sensitive: CCCD bị che, file hồ sơ không có link xem (file_url null).
 * @param {string} enrollmentId
 * @param {any} actor req.user
 */
const getForReview = async (enrollmentId, actor) => {
	const reg = await courseRegistrationService.getByEnrollment(enrollmentId);
	if (!reg) return null;
	const sensitive = canReadSensitive(actor);
	const [ctx, profile, { files, files_missing }] = await Promise.all([
		loadContext(enrollmentId, reg),
		loadProfile(enrollmentId),
		registrationFileService.describe(
			{ ...reg, enrollment_id: enrollmentId },
			{ withUrl: sensitive },
		),
	]);
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
		files,
		files_missing,
		created_at: reg.created_at ?? null,
	};
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

// File PDF hồ sơ nộp bổ sung theo cách cũ (kind = 'dossier') — trả đường dẫn /uploads (response tự ký link có hạn)
const dossierForEnrollment = async (enrollmentId) => {
	const rows = await registrationFileService.listFiles(enrollmentId);
	const row = rows.find((r) => r.kind === 'dossier');
	if (!row) throw httpError(404, 'Chưa có hồ sơ nộp bổ sung.');
	return {
		file_id: row.file_id,
		file_name: row.file_name,
		file_url: row.file_url,
		mime_type: row.mime_type,
		file_size: row.file_size,
		uploaded_at: row.uploaded_at ?? null,
	};
};

module.exports = {
	normalizeValue,
	computeDiffs,
	getForReview,
	renderApplicationFor,
	applicationForEnrollment,
	dossierForEnrollment,
};
