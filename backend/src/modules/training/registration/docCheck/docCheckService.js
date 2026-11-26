// Hàng đợi + kết quả tự kiểm tra loại file hồ sơ đăng ký khóa ĐTLT (bảng registration_file_checks).
//   - enqueue: registrationFileService.attach gọi sau mỗi lần nộp / thay file.
//   - processOne: docCheckWorker gọi — nhận 1 việc (FOR UPDATE SKIP LOCKED ⇒ nhiều tiến trình
//     cluster chạy cùng lúc không trùng việc), phân tích trong worker thread, ghi kết quả.
//   - present: dạng gửi FE, gắn vào từng dòng hồ sơ (registrationFileService.summarize).
// 2 nguồn (cột source): 'registration' = file hồ sơ đăng ký khóa ĐTLT (đoán loại + chữ ký);
// 'trainee_document' = hồ sơ học viên tự nộp ở /me/trainee-documents (CHỈ kiểm chữ ký —
// enqueueTraineeDocument, withTraineeDocumentChecks).
const path = require('path');
const { getPool, sql, nowSql } = require('../../../../config/db');
const { UPLOADS_ROOT } = require('../../../../utils/uploadPaths');
const logger = require('../../../../config/logger');
const { labelOf } = require('../registrationFileKinds');
const { CHECKABLE_KINDS, WARNING_MESSAGES } = require('./docCheckRules');
const { presentSignature } = require('./signature/signatureRules');
const runner = require('./docCheckRunner');
const systemSettingService = require('../../../settings/systemSettingService');

const MAX_ATTEMPTS = 3;
// Đơn nội viện không khai đơn vị công tác — tổ chức người ký số so với tên bệnh viện
const HOSPITAL = 'Bệnh viện Hữu nghị Đa khoa Nghệ An';
const STALE_MINUTES = 10; // 'running' quá lâu (tiến trình chết giữa chừng) ⇒ nhận lại

const isCheckable = (kind) => CHECKABLE_KINDS.includes(kind);

/**
 * Công tắc của admin / Phòng Đào tạo (Cấu hình hệ thống TRAINING_REGISTRATION_DOC_CHECK, mặc định
 * bật). Tắt: file mới vẫn được xếp hàng (rẻ) nhưng không xử lý, kết quả ẩn khỏi mọi màn hình;
 * bật lại thì hàng đợi tồn chạy tiếp — không file nào bị bỏ sót.
 */
const isEnabled = async () =>
	(await systemSettingService.getValue('TRAINING_REGISTRATION_DOC_CHECK')) !== 'false';

/**
 * Công tắc kiểm chữ ký (TRAINING_DOC_SIGNATURE_CHECK, MẶC ĐỊNH TẮT — chỉ 'true' mới bật). Chỉ có
 * tác dụng khi TRAINING_REGISTRATION_DOC_CHECK đang bật (cùng vòng xử lý). Tắt: hồ sơ học viên
 * vẫn xếp hàng nhưng không nhận việc (bật lên thì chạy tiếp); file hồ sơ đăng ký vẫn đoán loại,
 * không kiểm chữ ký, và kết quả chữ ký cũ bị ẩn.
 */
const isSignatureEnabled = async () =>
	(await systemSettingService.getValue('TRAINING_DOC_SIGNATURE_CHECK')) === 'true';

/**
 * Xếp hàng kiểm tra 1 file hồ sơ đăng ký. Loại không có luật nhận diện ⇒ bỏ qua.
 * @param {{ fileId: string, enrollmentId: string, kind: string }} job
 * @returns {Promise<boolean>} true = đã xếp hàng
 */
const enqueue = async ({ fileId, enrollmentId, kind }) => {
	if (!fileId || !enrollmentId || !isCheckable(kind)) return false;
	const pool = await getPool();
	await pool
		.request()
		.input('file_id', sql.VarChar(20), fileId)
		.input('enrollment_id', sql.VarChar(20), enrollmentId)
		.input('kind', sql.VarChar(30), kind).query(`
			INSERT INTO registration_file_checks (file_id, source, enrollment_id, kind)
			VALUES (@file_id, 'registration', @enrollment_id, @kind)
			ON CONFLICT (file_id) DO NOTHING`);
	return true;
};

/**
 * Xếp hàng kiểm chữ ký 1 file hồ sơ học viên tự nộp (traineeRecordService.addMyDocument).
 * Không ném lỗi: xếp hàng hỏng không được làm hỏng việc nộp file.
 * @param {{ fileId: string, traineeDocumentId: string }} job
 * @returns {Promise<boolean>} true = đã xếp hàng
 */
const enqueueTraineeDocument = async ({ fileId, traineeDocumentId }) => {
	if (!fileId || !traineeDocumentId) return false;
	try {
		const pool = await getPool();
		await pool
			.request()
			.input('file_id', sql.VarChar(20), fileId)
			.input('doc_id', sql.VarChar(20), traineeDocumentId).query(`
				INSERT INTO registration_file_checks (file_id, source, trainee_document_id, kind)
				VALUES (@file_id, 'trainee_document', @doc_id, 'trainee_document')
				ON CONFLICT (file_id) DO NOTHING`);
		return true;
	} catch (err) {
		logger.warn(
			`[doc_check] không xếp hàng được hồ sơ học viên ${traineeDocumentId}: ${err instanceof Error ? err.message : err}`,
		);
		return false;
	}
};

/**
 * Nhận 1 việc chờ (hoặc 'running' bị bỏ dở). Công tắc chữ ký tắt ⇒ bỏ qua việc của hồ sơ học
 * viên (chỉ kiểm chữ ký), để nguyên trong hàng đợi.
 * @param {{ signature?: boolean }} [opts]
 */
const claimNext = async ({ signature = false } = {}) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('max', sql.Int, MAX_ATTEMPTS)
		.input('stale', sql.Int, STALE_MINUTES)
		.input('sig', sql.Bit, signature).query(`
			UPDATE registration_file_checks
			SET status = 'running', started_at = ${nowSql}, attempts = attempts + 1
			WHERE file_id = (
				SELECT file_id FROM registration_file_checks
				WHERE attempts < @max
				  AND (status = 'pending'
				       OR (status = 'running' AND started_at < ${nowSql} - make_interval(mins => @stale)))
				  AND (source = 'registration' OR @sig)
				ORDER BY created_at
				LIMIT 1
				FOR UPDATE SKIP LOCKED)
			RETURNING file_id, source, enrollment_id, trainee_document_id, kind, attempts`);
	return r.recordset[0] ?? null;
};

const parseJson = (s, fallback) => {
	if (s == null || s === '') return fallback;
	if (typeof s === 'object') return s;
	try {
		return JSON.parse(s);
	} catch {
		return fallback;
	}
};

/** file_url ('/uploads/...') ⇒ đường dẫn tuyệt đối trong UPLOADS_ROOT, ngoài thư mục ⇒ null. */
const resolveUpload = (fileUrl) => {
	if (!fileUrl?.startsWith('/uploads/')) return null;
	const filePath = path.resolve(UPLOADS_ROOT, fileUrl.slice('/uploads/'.length));
	return filePath.startsWith(UPLOADS_ROOT + path.sep) ? filePath : null;
};

/**
 * Đường dẫn file trên đĩa + thông tin để đối chiếu (họ tên, số CCCD, số hiệu văn bằng, đơn vị
 * công tác — so với tổ chức người ký số). Hồ sơ học viên: chỉ đường dẫn (không đối chiếu).
 */
const loadJob = async (job) => {
	const pool = await getPool();
	if (job.source === 'trainee_document') {
		const r = await pool
			.request()
			.input('file_id', sql.VarChar(20), job.file_id)
			.input('doc_id', sql.VarChar(20), job.trainee_document_id).query(`
				SELECT f.file_url, f.mime_type
				FROM trainee_documents d
				JOIN training_files f ON f.id = d.file_id AND f.is_deleted = 'false'
				WHERE d.id = @doc_id AND d.file_id = @file_id`);
		const row = r.recordset[0];
		const filePath = resolveUpload(row?.file_url);
		if (!filePath) return null;
		return {
			filePath,
			mime: row.mime_type ?? null,
			kind: job.kind,
			source: /** @type {const} */ ('trainee_document'),
			identity: {},
			unit: null,
		};
	}
	const r = await pool
		.request()
		.input('file_id', sql.VarChar(20), job.file_id)
		.input('enrollment_id', sql.VarChar(20), job.enrollment_id).query(`
			SELECT f.file_url, f.mime_type, r.snapshot, r.source AS reg_source
			FROM training_files f
			JOIN course_registrations r ON r.enrollment_id = @enrollment_id
			WHERE f.id = @file_id AND f.is_deleted = 'false'`);
	const row = r.recordset[0];
	const filePath = resolveUpload(row?.file_url);
	if (!filePath) return null;
	const snap = parseJson(row.snapshot, {});
	return {
		filePath,
		mime: row.mime_type ?? null,
		kind: job.kind,
		source: /** @type {const} */ ('registration'),
		identity: {
			full_name: snap.full_name ?? null,
			national_id: snap.national_id ?? null,
			degree_number: snap.degree_number ?? null,
			degree_registry_number: snap.degree_registry_number ?? null,
		},
		unit: snap.workplace || (row.reg_source === 'internal' ? HOSPITAL : null),
	};
};

const finish = async (fileId, fields) => {
	const pool = await getPool();
	await pool
		.request()
		.input('file_id', sql.VarChar(20), fileId)
		.input('status', sql.VarChar(10), fields.status)
		.input('verdict', sql.VarChar(10), fields.verdict ?? null)
		.input('detected_kind', sql.VarChar(30), fields.detected_kind ?? null)
		.input('confidence', sql.SmallInt, fields.confidence ?? null)
		.input(
			'warnings',
			sql.NVarChar(sql.MAX),
			fields.warnings ? JSON.stringify(fields.warnings) : null,
		)
		.input('signals', sql.NVarChar(sql.MAX), fields.signals ? JSON.stringify(fields.signals) : null)
		.input('sha256', sql.Char(64), fields.sha256 ?? null)
		.input('sig_verdict', sql.VarChar(10), fields.sig_verdict ?? null)
		.input(
			'sig_details',
			sql.NVarChar(sql.MAX),
			fields.sig_details ? JSON.stringify(fields.sig_details) : null,
		)
		.input('error', sql.NVarChar(300), fields.error ? String(fields.error).slice(0, 300) : null)
		// Cờ riêng thay vì so @status lần 2: PG suy 2 kiểu khác nhau cho cùng 1 tham số ⇒ lỗi
		.input('checked', sql.Bit, fields.status !== 'pending').query(`
			UPDATE registration_file_checks
			SET status = @status, verdict = @verdict, detected_kind = @detected_kind,
			    confidence = @confidence, warnings = @warnings, signals = @signals,
			    sha256 = COALESCE(@sha256, sha256), error = @error,
			    sig_verdict = @sig_verdict, sig_details = @sig_details,
			    checked_at = CASE WHEN @checked THEN ${nowSql} ELSE checked_at END
			WHERE file_id = @file_id`);
};

/**
 * Xử lý 1 việc trong hàng đợi.
 * @returns {Promise<boolean>} false = hàng đợi trống
 */
const processOne = async () => {
	const signature = await isSignatureEnabled();
	const job = await claimNext({ signature });
	if (!job) return false;
	try {
		const input = await loadJob(job);
		if (!input) {
			await finish(job.file_id, { status: 'skipped', error: 'file_missing' });
			return true;
		}
		// Công tắc chữ ký truyền qua input của job (worker thread không đọc CSDL)
		const res = await runner.run({ ...input, signature });
		if (res.status === 'skipped') {
			await finish(job.file_id, {
				status: 'skipped',
				sha256: res.sha256,
				error: res.reason,
				sig_verdict: res.sig_verdict,
				sig_details: res.sig_details,
			});
			return true;
		}
		await finish(job.file_id, { ...res, status: 'done', error: null });
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		logger.warn(`[doc_check] ${job.file_id} (${job.kind}) lỗi lần ${job.attempts}: ${msg}`);
		await finish(job.file_id, {
			status: job.attempts >= MAX_ATTEMPTS ? 'error' : 'pending',
			error: msg,
		});
	}
	return true;
};

/** Máy chủ vừa có OCR ⇒ kiểm lại các file trước đó bị bỏ qua vì thiếu OCR. */
const requeueSkippedForOcr = async () => {
	const pool = await getPool();
	const r = await pool.request().query(`
		UPDATE registration_file_checks SET status = 'pending', attempts = 0, error = NULL
		WHERE status = 'skipped' AND error = 'ocr_unavailable'`);
	return r.rowsAffected?.[0] ?? 0;
};

/**
 * Số liệu hàng đợi cho trang Cấu hình hệ thống: đếm theo trạng thái + việc chờ lâu nhất
 * (chờ quá lâu ⇒ không tiến trình nào đang chạy vòng xử lý). Không trả gì về nội dung file.
 * sig_invalid = file có chữ ký số không hợp lệ / bị sửa sau khi ký; sig_missing = file thiếu dấu /
 * chữ ký (sig_verdict 'missing').
 * @returns {Promise<{ pending: number, running: number, done: number, error: number,
 *   skipped: number, skipped_ocr: number, mismatch: number, sig_invalid: number,
 *   sig_missing: number, oldest_pending_min: number | null, last_checked_min: number | null }>}
 */
const queueStats = async () => {
	const pool = await getPool();
	const r = await pool.request().query(`
		SELECT
			COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
			COUNT(*) FILTER (WHERE status = 'running')::int AS running,
			COUNT(*) FILTER (WHERE status = 'done')::int AS done,
			COUNT(*) FILTER (WHERE status = 'error')::int AS error,
			COUNT(*) FILTER (WHERE status = 'skipped')::int AS skipped,
			COUNT(*) FILTER (WHERE status = 'skipped' AND error = 'ocr_unavailable')::int AS skipped_ocr,
			COUNT(*) FILTER (WHERE status = 'done' AND verdict = 'mismatch')::int AS mismatch,
			COUNT(*) FILTER (WHERE sig_details IS NOT NULL
				AND sig_details::jsonb #>> '{digital,verdict}' IN ('invalid', 'modified'))::int AS sig_invalid,
			COUNT(*) FILTER (WHERE sig_verdict = 'missing')::int AS sig_missing,
			-- Tính phút ngay trong SQL: cột là giờ VN không múi giờ, tránh lệch khi máy chủ khác TZ
			FLOOR(EXTRACT(EPOCH FROM ${nowSql} - MIN(created_at) FILTER (WHERE status = 'pending')) / 60)::int
				AS oldest_pending_min,
			FLOOR(EXTRACT(EPOCH FROM ${nowSql} - MAX(checked_at)) / 60)::int AS last_checked_min
		FROM registration_file_checks`);
	return r.recordset[0];
};

/**
 * Thử lại các file đã hết lượt (lỗi MAX_ATTEMPTS lần) — admin bấm sau khi sửa nguyên nhân
 * (cài OCR, file bị khóa...). File đã có kết quả không bị kiểm lại.
 * @returns {Promise<number>} số file đưa lại hàng đợi
 */
const retryFailed = async () => {
	const pool = await getPool();
	const r = await pool.request().query(`
		UPDATE registration_file_checks SET status = 'pending', attempts = 0, error = NULL
		WHERE status = 'error'`);
	return r.rowsAffected?.[0] ?? 0;
};

// ─── Dạng gửi FE ────────────────────────────────────────────────────────────────
const SUMMARY = {
	pending: 'Đang kiểm tra tự động…',
	running: 'Đang kiểm tra tự động…',
	error: 'Không kiểm tra tự động được file này.',
	skipped: 'Chưa kiểm tra tự động.',
};

/**
 * Kết quả kiểm tra của 1 dòng hồ sơ (cột check_* do listFiles JOIN sẵn).
 * @param {Record<string, any>} row
 * @param {{ duplicateOf?: string[], withSignature?: boolean }} [opts] duplicateOf = loại khác của
 *   cùng đơn có file trùng nội dung; withSignature = false ⇒ signature luôn null (công tắc tắt)
 * @returns {null | {
 *   status: string, verdict: string | null, detected_kind: string | null,
 *   detected_label: string | null, level: 'ok' | 'warn' | 'info', message: string,
 *   warnings: Array<{ code: string, message: string }>,
 *   signature: import('./signature/signatureRules').SignaturePresentation | null,
 * }}
 */
const present = (row, { duplicateOf = [], withSignature = true } = {}) => {
	if (!row?.check_status) return null;
	const status = row.check_status;
	const verdict = status === 'done' ? (row.check_verdict ?? null) : null;
	const detected = verdict ? (row.check_detected_kind ?? null) : null;
	const codes = verdict ? parseJson(row.check_warnings, []) : [];
	const warnings = codes
		.filter((c) => WARNING_MESSAGES[c])
		.map((c) => ({ code: c, message: WARNING_MESSAGES[c] }));
	if (duplicateOf.length)
		warnings.push({
			code: 'duplicate',
			message: `File trùng với file đã nộp ở mục: ${duplicateOf.map(labelOf).join(', ')}.`,
		});

	let level = /** @type {'ok' | 'warn' | 'info'} */ ('info');
	let message = SUMMARY[status] ?? '';
	if (verdict === 'ok') {
		level = warnings.length ? 'warn' : 'ok';
		message = `Nhận diện đúng loại "${labelOf(row.kind)}".`;
	} else if (verdict === 'mismatch') {
		level = 'warn';
		message = detected
			? `File có vẻ là "${labelOf(detected)}", không phải "${labelOf(row.kind)}".`
			: `Không thấy dấu hiệu của "${labelOf(row.kind)}" trong file.`;
	} else if (verdict === 'unclear') {
		message = 'Không đọc được nội dung file để kiểm tra tự động.';
		if (warnings.length) level = 'warn';
	} else if (duplicateOf.length) {
		level = 'warn';
	}
	return {
		status,
		verdict,
		detected_kind: detected,
		detected_label: detected ? labelOf(detected) : null,
		level,
		message,
		warnings,
		// Kiểm chữ ký (signature/signatureRules.js) — null = chưa kiểm / loại không kiểm
		signature:
			withSignature && status !== 'pending' && status !== 'running'
				? presentSignature(row.check_sig_verdict, row.check_sig_details)
				: null,
	};
};

/**
 * Gắn kết quả kiểm tra cho cả bộ hồ sơ — phát hiện thêm file trùng nội dung giữa các loại.
 * @param {Array<Record<string, any>>} rows kết quả listFiles
 * @param {{ withSignature?: boolean }} [opts]
 * @returns {Map<string, ReturnType<typeof present>>} theo kind
 */
const presentAll = (rows, { withSignature = true } = {}) => {
	const bySha = new Map();
	for (const r of rows) {
		if (!r.check_sha256) continue;
		bySha.set(r.check_sha256, [...(bySha.get(r.check_sha256) ?? []), r.kind]);
	}
	const out = new Map();
	for (const r of rows) {
		const dup = r.check_sha256 ? (bySha.get(r.check_sha256) ?? []).filter((k) => k !== r.kind) : [];
		out.set(r.kind, present(r, { duplicateOf: dup, withSignature }));
	}
	return out;
};

/**
 * Kết quả kiểm của 1 file hồ sơ học viên tự nộp (source 'trainee_document' — chỉ kiểm chữ ký).
 * Cùng dạng với present() để FE dùng chung; verdict / detected_* luôn null.
 * @param {Record<string, any>} row cột check_* (withTraineeDocumentChecks JOIN sẵn)
 * @returns {ReturnType<typeof present>}
 */
const presentTraineeDocument = (row) => {
	if (!row?.check_status) return null;
	const status = row.check_status;
	const signature =
		status === 'done'
			? presentSignature(row.check_sig_verdict, row.check_sig_details, { trainee: true })
			: null;
	return {
		status,
		verdict: null,
		detected_kind: null,
		detected_label: null,
		level: signature?.level ?? 'info',
		message: signature?.message ?? SUMMARY[status] ?? '',
		warnings: [],
		signature,
	};
};

/**
 * Gắn kết quả kiểm vào danh sách hồ sơ của 1 học viên (traineeRecordService.documentChecklist,
 * màn cán bộ): mỗi document thêm `check` (null = chưa / không kiểm, hoặc công tắc tắt). File nộp
 * kèm đơn đăng ký (source 'registration') trả dạng present(); file học viên tự nộp trả
 * presentTraineeDocument().
 * @template {{ documents: Array<Record<string, any>> }} T
 * @param {string} traineeId
 * @param {T} checklist
 * @returns {Promise<T>}
 */
const withTraineeDocumentChecks = async (traineeId, checklist) => {
	const docs = checklist?.documents ?? [];
	const [enabled, withSignature] = await Promise.all([isEnabled(), isSignatureEnabled()]);
	/** @type {Map<string, Record<string, any>>} */
	const byDoc = new Map();
	if (enabled && docs.length) {
		const pool = await getPool();
		const r = await pool.request().input('trainee_id', sql.VarChar(20), traineeId).query(`
			SELECT d.id AS document_id, ck.source AS check_source, ck.kind,
			       ck.status AS check_status, ck.verdict AS check_verdict,
			       ck.detected_kind AS check_detected_kind, ck.warnings AS check_warnings,
			       ck.sig_verdict AS check_sig_verdict, ck.sig_details AS check_sig_details
			FROM trainee_documents d
			JOIN registration_file_checks ck ON ck.file_id = d.file_id
			WHERE d.trainee_id = @trainee_id`);
		for (const row of r.recordset) byDoc.set(row.document_id, row);
	}
	const checkOf = (row) => {
		if (!row) return null;
		if (row.check_source !== 'trainee_document') return present(row, { withSignature });
		return withSignature ? presentTraineeDocument(row) : null;
	};
	return { ...checklist, documents: docs.map((d) => ({ ...d, check: checkOf(byDoc.get(d.id)) })) };
};

module.exports = {
	MAX_ATTEMPTS,
	isCheckable,
	isEnabled,
	isSignatureEnabled,
	enqueue,
	enqueueTraineeDocument,
	claimNext,
	processOne,
	requeueSkippedForOcr,
	queueStats,
	retryFailed,
	present,
	presentAll,
	presentTraineeDocument,
	withTraineeDocumentChecks,
};
