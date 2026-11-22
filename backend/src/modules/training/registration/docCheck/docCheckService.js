// Hàng đợi + kết quả tự kiểm tra loại file hồ sơ đăng ký khóa ĐTLT (bảng registration_file_checks).
//   - enqueue: registrationFileService.attach gọi sau mỗi lần nộp / thay file.
//   - processOne: docCheckWorker gọi — nhận 1 việc (FOR UPDATE SKIP LOCKED ⇒ nhiều tiến trình
//     cluster chạy cùng lúc không trùng việc), phân tích trong worker thread, ghi kết quả.
//   - present: dạng gửi FE, gắn vào từng dòng hồ sơ (registrationFileService.summarize).
const path = require('path');
const { getPool, sql, nowSql } = require('../../../../config/db');
const { UPLOADS_ROOT } = require('../../../../utils/uploadPaths');
const logger = require('../../../../config/logger');
const { labelOf } = require('../registrationFileKinds');
const { CHECKABLE_KINDS, WARNING_MESSAGES } = require('./docCheckRules');
const runner = require('./docCheckRunner');
const systemSettingService = require('../../../settings/systemSettingService');

const MAX_ATTEMPTS = 3;
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
 * Xếp hàng kiểm tra 1 file. Loại không có luật nhận diện ⇒ bỏ qua.
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
			INSERT INTO registration_file_checks (file_id, enrollment_id, kind)
			VALUES (@file_id, @enrollment_id, @kind)
			ON CONFLICT (file_id) DO NOTHING`);
	return true;
};

/** Nhận 1 việc chờ (hoặc 'running' bị bỏ dở). */
const claimNext = async () => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('max', sql.Int, MAX_ATTEMPTS)
		.input('stale', sql.Int, STALE_MINUTES).query(`
			UPDATE registration_file_checks
			SET status = 'running', started_at = ${nowSql}, attempts = attempts + 1
			WHERE file_id = (
				SELECT file_id FROM registration_file_checks
				WHERE attempts < @max
				  AND (status = 'pending'
				       OR (status = 'running' AND started_at < ${nowSql} - make_interval(mins => @stale)))
				ORDER BY created_at
				LIMIT 1
				FOR UPDATE SKIP LOCKED)
			RETURNING file_id, enrollment_id, kind, attempts`);
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

/** Đường dẫn file trên đĩa + thông tin để đối chiếu (họ tên, số CCCD, số hiệu văn bằng). */
const loadJob = async (job) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('file_id', sql.VarChar(20), job.file_id)
		.input('enrollment_id', sql.VarChar(20), job.enrollment_id).query(`
			SELECT f.file_url, f.mime_type, r.snapshot
			FROM training_files f
			JOIN course_registrations r ON r.enrollment_id = @enrollment_id
			WHERE f.id = @file_id AND f.is_deleted = 'false'`);
	const row = r.recordset[0];
	if (!row?.file_url?.startsWith('/uploads/')) return null;
	const filePath = path.resolve(UPLOADS_ROOT, row.file_url.slice('/uploads/'.length));
	if (!filePath.startsWith(UPLOADS_ROOT + path.sep)) return null;
	const snap = parseJson(row.snapshot, {});
	return {
		filePath,
		mime: row.mime_type ?? null,
		kind: job.kind,
		identity: {
			full_name: snap.full_name ?? null,
			national_id: snap.national_id ?? null,
			degree_number: snap.degree_number ?? null,
			degree_registry_number: snap.degree_registry_number ?? null,
		},
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
		.input('error', sql.NVarChar(300), fields.error ? String(fields.error).slice(0, 300) : null)
		// Cờ riêng thay vì so @status lần 2: PG suy 2 kiểu khác nhau cho cùng 1 tham số ⇒ lỗi
		.input('checked', sql.Bit, fields.status !== 'pending').query(`
			UPDATE registration_file_checks
			SET status = @status, verdict = @verdict, detected_kind = @detected_kind,
			    confidence = @confidence, warnings = @warnings, signals = @signals,
			    sha256 = COALESCE(@sha256, sha256), error = @error,
			    checked_at = CASE WHEN @checked THEN ${nowSql} ELSE checked_at END
			WHERE file_id = @file_id`);
};

/**
 * Xử lý 1 việc trong hàng đợi.
 * @returns {Promise<boolean>} false = hàng đợi trống
 */
const processOne = async () => {
	const job = await claimNext();
	if (!job) return false;
	try {
		const input = await loadJob(job);
		if (!input) {
			await finish(job.file_id, { status: 'skipped', error: 'file_missing' });
			return true;
		}
		const res = await runner.run(input);
		if (res.status === 'skipped') {
			await finish(job.file_id, { status: 'skipped', sha256: res.sha256, error: res.reason });
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
 * @returns {Promise<{ pending: number, running: number, done: number, error: number,
 *   skipped: number, skipped_ocr: number, mismatch: number, oldest_pending_min: number | null,
 *   last_checked_min: number | null }>}
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
 * @param {{ duplicateOf?: string[] }} [opts] loại khác của cùng đơn có file trùng nội dung
 * @returns {null | {
 *   status: string, verdict: string | null, detected_kind: string | null,
 *   detected_label: string | null, level: 'ok' | 'warn' | 'info', message: string,
 *   warnings: Array<{ code: string, message: string }>,
 * }}
 */
const present = (row, { duplicateOf = [] } = {}) => {
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
	};
};

/**
 * Gắn kết quả kiểm tra cho cả bộ hồ sơ — phát hiện thêm file trùng nội dung giữa các loại.
 * @param {Array<Record<string, any>>} rows kết quả listFiles
 * @returns {Map<string, ReturnType<typeof present>>} theo kind
 */
const presentAll = (rows) => {
	const bySha = new Map();
	for (const r of rows) {
		if (!r.check_sha256) continue;
		bySha.set(r.check_sha256, [...(bySha.get(r.check_sha256) ?? []), r.kind]);
	}
	const out = new Map();
	for (const r of rows) {
		const dup = r.check_sha256 ? (bySha.get(r.check_sha256) ?? []).filter((k) => k !== r.kind) : [];
		out.set(r.kind, present(r, { duplicateOf: dup }));
	}
	return out;
};

module.exports = {
	MAX_ATTEMPTS,
	isCheckable,
	isEnabled,
	enqueue,
	claimNext,
	processOne,
	requeueSkippedForOcr,
	queueStats,
	retryFailed,
	present,
	presentAll,
};
