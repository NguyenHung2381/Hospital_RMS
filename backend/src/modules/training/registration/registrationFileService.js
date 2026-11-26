// File hồ sơ bắt buộc của 1 lượt đăng ký khóa đào tạo liên tục (bảng course_registration_files,
// mỗi loại 1 file / lượt). Cổng công khai, cổng nhân viên và màn quản trị đều đọc / ghi file
// hồ sơ qua đây; danh sách loại + quy tắc "đủ hồ sơ" nằm ở registrationFileKinds.js.
//
//   - Nội viện: file entity 'course_registration' (uploads/training/course_registration/<mã ghi danh>/).
//   - Ngoại viện: chính file của trainee_documents (tab "Hồ sơ" học viên), trạng thái 'pending',
//     doc_type theo loại — nên phòng Đào tạo duyệt / từ chối từng file ở tab đó.
const fs = require('fs');
const path = require('path');
const { getPool, sql, nowSql } = require('../../../config/db');
const { UPLOADS_ROOT, moveUploadedFiles } = require('../../../utils/uploadPaths');
const { badRequest } = require('../../../utils/httpError');
const logger = require('../../../config/logger');
const trainingFileService = require('../trainingFileService');
const traineeService = require('../trainees/traineeService');
const { isPdfOrImage } = require('../trainees/traineeProfilePdf');
const { DOSSIER_ENTITY } = require('./courseRegistrationService');
const {
	ACCEPT_MESSAGE,
	LEGACY_KIND,
	kindsFor,
	kindDef,
	labelOf,
	missingKinds,
	retiredKindsIn,
} = require('./registrationFileKinds');
const docCheckService = require('./docCheck/docCheckService');
const docCheckWorker = require('./docCheck/docCheckWorker');

const FIELD_RE = /^files\[(.+)\]$/;

/**
 * req.files của multer .fields() ⇒ { [kind]: file } (bóc tên phần `files[<kind>]`).
 * Mảng / undefined (request không phải multipart) ⇒ {}.
 * @param {unknown} reqFiles
 * @returns {Record<string, any>}
 */
const collectByKind = (reqFiles) => {
	const out = {};
	if (!reqFiles || typeof reqFiles !== 'object' || Array.isArray(reqFiles)) return out;
	for (const [field, list] of Object.entries(reqFiles)) {
		const m = FIELD_RE.exec(field);
		const file = Array.isArray(list) ? list[0] : list;
		if (m && file) out[m[1]] = file;
	}
	return out;
};

/**
 * Kiểm bộ file gửi kèm đăng ký (chưa ghi gì): không có loại của đối tượng kia, đủ loại bắt
 * buộc, đúng PDF / JPG / PNG. Lỗi ⇒ 400.
 * @param {string} source 'internal' | 'external'
 * @param {Record<string, any>} byKind
 */
const assertSubmission = (source, byKind) => {
	const allowed = new Set(kindsFor(source).map((k) => k.key));
	for (const key of Object.keys(byKind)) {
		if (!allowed.has(key))
			throw badRequest(`Hồ sơ "${labelOf(key)}" không thuộc đối tượng đăng ký đã chọn.`);
	}
	const missing = missingKinds(source, Object.keys(byKind), { atSubmit: true });
	if (missing.length)
		throw badRequest(`Vui lòng đính kèm đủ hồ sơ bắt buộc: ${missing.map(labelOf).join(', ')}.`);
	for (const file of Object.values(byKind)) {
		if (!isPdfOrImage(file)) throw badRequest(ACCEPT_MESSAGE);
	}
};

/**
 * Các file hồ sơ còn hiệu lực của 1 lượt ghi danh (file đã xóa mềm không được liệt kê).
 * @param {string} enrollmentId
 */
const listFiles = async (enrollmentId) => {
	const pool = await getPool();
	const r = await pool.request().input('id', sql.VarChar(20), enrollmentId).query(`
		SELECT crf.kind, crf.uploaded_at, crf.trainee_document_id,
		       f.id AS file_id, f.file_name, f.file_url, f.mime_type, f.file_size, d.status AS review_status,
		       ck.status AS check_status, ck.verdict AS check_verdict, ck.detected_kind AS check_detected_kind,
		       ck.warnings AS check_warnings, ck.sha256 AS check_sha256,
		       ck.sig_verdict AS check_sig_verdict, ck.sig_details AS check_sig_details
		FROM course_registration_files crf
		JOIN training_files f ON f.id = crf.file_id AND f.is_deleted = 'false'
		LEFT JOIN trainee_documents d ON d.id = crf.trainee_document_id
		LEFT JOIN registration_file_checks ck ON ck.file_id = crf.file_id
		WHERE crf.enrollment_id = @id`);
	return r.recordset;
};

/** Loại có file còn hiệu lực — file ngoại viện bị từ chối tính là chưa nộp. */
const presentKinds = (rows) =>
	rows.filter((r) => r.review_status !== 'rejected').map((r) => r.kind);

/**
 * Dòng hồ sơ gửi FE: luôn đủ các loại của đối tượng (theo thứ tự khai báo), thêm loại đã thôi
 * yêu cầu (vd đơn đã ký) và 'dossier' ở cuối nếu đơn cũ có file đó.
 * @param {string} source
 * @param {Array<Record<string, any>>} rows kết quả listFiles
 * @param {{ withUrl?: boolean, withChecks?: boolean, withSignature?: boolean, sigConfig?: any }} [opts]
 *   withUrl = false ⇒ file_url luôn null; withChecks = false ⇒ check luôn null (công tắc tự kiểm
 *   tra đang tắt); withSignature = false ⇒ check.signature luôn null (công tắc kiểm chữ ký đang
 *   tắt); sigConfig = cấu hình chi tiết kiểm chữ ký (null ⇒ bật hết)
 */
const summarize = (
	source,
	rows,
	{ withUrl = false, withChecks = true, withSignature = true, sigConfig = null } = {},
) => {
	const byKey = new Map(rows.map((r) => [r.kind, r]));
	const checks = withChecks
		? docCheckService.presentAll(rows, { withSignature, sigConfig })
		: new Map();
	const item = (def, legacy) => {
		const row = byKey.get(def.key);
		return {
			kind: def.key,
			label: def.label,
			required: def.required,
			later: !!def.later,
			legacy,
			uploaded_at: row?.uploaded_at ?? null,
			file_name: row?.file_name ?? null,
			file_url: withUrl ? (row?.file_url ?? null) : null,
			mime_type: row?.mime_type ?? null,
			review_status: row?.review_status ?? null,
			// Tự kiểm tra loại file (docCheck/) — chỉ để cảnh báo, null = chưa / không kiểm
			check: checks.get(def.key) ?? null,
		};
	};
	const items = kindsFor(source).map((def) => item(def, false));
	for (const def of retiredKindsIn(byKey.keys())) items.push(item(def, true));
	if (byKey.has(LEGACY_KIND.key)) items.push(item(LEGACY_KIND, true));
	return items;
};

/**
 * Hồ sơ của 1 lượt + các loại bắt buộc còn thiếu.
 * @param {Record<string, any>} reg cần enrollment_id và source
 * @param {{ withUrl?: boolean }} [opts]
 * @returns {Promise<{ files: ReturnType<typeof summarize>, files_missing: string[] }>}
 */
const describe = async (reg, opts = {}) => {
	const [rows, withChecks, withSignature, sigConfig] = await Promise.all([
		listFiles(reg.enrollment_id),
		docCheckService.isEnabled(),
		docCheckService.isSignatureEnabled(),
		docCheckService.getSignatureConfig(),
	]);
	return {
		files: summarize(reg.source, rows, { ...opts, withChecks, withSignature, sigConfig }),
		files_missing: missingKinds(reg.source, presentKinds(rows)),
	};
};

const dropTmp = (file) => (file?.path ? fs.promises.unlink(file.path).catch(() => {}) : null);

/**
 * Nộp (hoặc thay) 1 file hồ sơ của 1 lượt đăng ký. file_id luôn trỏ training_files.
 * Thay file: nội viện — file cũ xóa mềm; ngoại viện — dòng trainee_documents cũ bị xóa nếu còn
 * 'pending', đã 'approved' / 'rejected' thì giữ nguyên (lịch sử duyệt), chỉ bỏ liên kết.
 * @param {{ enrollment_id: string, source: string, trainee_id?: string | null }} reg
 * @param {string} kind
 * @param {{ originalname: string, filename?: string, path?: string, size?: number, mimetype?: string }} file
 * @param {string | null} actorId
 * @returns {Promise<{ kind: string, uploaded_at: Date | null }>}
 */
const attach = async (reg, kind, file, actorId) => {
	const def = kindDef(reg.source, kind);
	if (!def) {
		await dropTmp(file);
		throw badRequest('Loại hồ sơ không hợp lệ cho đơn này.');
	}
	if (!isPdfOrImage(file)) {
		await dropTmp(file);
		throw badRequest(ACCEPT_MESSAGE);
	}
	const pool = await getPool();
	const prev = await pool
		.request()
		.input('id', sql.VarChar(20), reg.enrollment_id)
		.input('kind', sql.VarChar(30), kind)
		.query(
			'SELECT file_id, trainee_document_id FROM course_registration_files WHERE enrollment_id = @id AND kind = @kind',
		);
	const old = prev.recordset[0] ?? null;

	let fileId;
	let docId = null;
	if (reg.source === 'internal') {
		const dir = path.join(UPLOADS_ROOT, 'training', DOSSIER_ENTITY, reg.enrollment_id);
		const [moved] = file.path ? await moveUploadedFiles([file], dir) : [file];
		const saved = await trainingFileService.saveUploadedFile(
			DOSSIER_ENTITY,
			reg.enrollment_id,
			moved,
			actorId,
		);
		fileId = saved.id;
	} else {
		const dir = path.join(UPLOADS_ROOT, 'training', 'trainee_document', reg.trainee_id);
		const [moved] = file.path ? await moveUploadedFiles([file], dir) : [file];
		const doc = await traineeService.addDocument(reg.trainee_id, moved, actorId, {
			status: 'pending',
			docType: def.doc_type,
		});
		fileId = doc.file_id;
		docId = doc.id;
	}

	const up = await pool
		.request()
		.input('id', sql.VarChar(20), reg.enrollment_id)
		.input('kind', sql.VarChar(30), kind)
		.input('file_id', sql.VarChar(20), fileId)
		.input('doc_id', sql.VarChar(20), docId)
		.input('actor_id', sql.VarChar(20), actorId || null).query(`
			INSERT INTO course_registration_files (enrollment_id, kind, file_id, trainee_document_id, uploaded_at, created_by)
			VALUES (@id, @kind, @file_id, @doc_id, ${nowSql}, @actor_id)
			ON CONFLICT (enrollment_id, kind) DO UPDATE
			  SET file_id = EXCLUDED.file_id, trainee_document_id = EXCLUDED.trainee_document_id,
			      uploaded_at = EXCLUDED.uploaded_at, updated_at = ${nowSql}, updated_by = @actor_id
			RETURNING uploaded_at`);

	// Xếp hàng tự kiểm tra loại file — lỗi ở đây không được làm hỏng việc nộp hồ sơ
	try {
		if (await docCheckService.enqueue({ fileId, enrollmentId: reg.enrollment_id, kind }))
			docCheckWorker.kick();
	} catch (err) {
		logger.warn(
			`[doc_check] không xếp hàng được ${fileId}: ${err instanceof Error ? err.message : err}`,
		);
	}

	if (old && old.file_id !== fileId) {
		if (reg.source === 'internal') {
			await trainingFileService.softDelete(old.file_id, actorId);
		} else if (old.trainee_document_id) {
			const st = await pool
				.request()
				.input('id', sql.VarChar(20), old.trainee_document_id)
				.query('SELECT status FROM trainee_documents WHERE id = @id');
			if (st.recordset[0]?.status === 'pending')
				await traineeService.removeDocument(old.trainee_document_id, actorId);
		}
	}
	return { kind, uploaded_at: up.recordset[0]?.uploaded_at ?? null };
};

/**
 * Nộp cả bộ file khi gửi đăng ký — lần lượt theo thứ tự loại của đối tượng.
 * @param {{ enrollment_id: string, source: string, trainee_id?: string | null }} reg
 * @param {Record<string, any>} byKind
 * @param {string | null} actorId
 */
const attachAll = async (reg, byKind, actorId) => {
	const out = [];
	for (const def of kindsFor(reg.source)) {
		const file = byKind?.[def.key];
		if (file) out.push(await attach(reg, def.key, file, actorId));
	}
	return out;
};

module.exports = {
	collectByKind,
	assertSubmission,
	listFiles,
	presentKinds,
	summarize,
	describe,
	attach,
	attachAll,
};
