const { getPool, sql, nowSql } = require('../../config/db');

// Truy cập dữ liệu ký số — CHỈ SQL, trả dữ liệu thuần (việc nghiệp vụ ở signingAccountService /
// signingService). secret_enc chỉ đọc ở findCredential, không bao giờ trả ra ngoài API.

const PUBLIC_COLS = `
  a.id, a.label, a.kind, a.user_id, a.provider, a.region, a.api_key,
  a.cert_subject, a.cert_issuer, a.cert_serial, a.cert_valid_from, a.cert_valid_to,
  a.checked_at, a.last_error, a.use_for_certificates, a.is_active,
  (a.signature_image IS NOT NULL) AS has_signature_image, a.signature_show_text, a.signature_caption,
  a.signature_display_name,
  a.created_at, a.created_by, a.updated_at, a.updated_by`;

// Chức vụ trong hồ sơ người dùng — mặc định cho dòng chữ dưới ảnh chữ ký
const PROFILE_POSITION = "NULLIF(TRIM(COALESCE(pos.name, u.position_detail)), '')";

const listAccounts = async () => {
	const pool = await getPool();
	const r = await pool.request().query(`
    SELECT ${PUBLIC_COLS}, u.full_name AS user_name, u.username
    FROM signing_accounts a
    LEFT JOIN users u ON u.id = a.user_id
    ORDER BY CASE WHEN a.kind = 'organization' THEN 0 ELSE 1 END, a.label`);
	return r.recordset;
};

/** @param {number} id */
const findById = async (id) => {
	const pool = await getPool();
	const r = await pool.request().input('id', sql.Int, id).query(`
    SELECT ${PUBLIC_COLS}, u.full_name AS user_name, u.username
    FROM signing_accounts a LEFT JOIN users u ON u.id = a.user_id
    WHERE a.id = @id`);
	return r.recordset[0] ?? null;
};

/** @param {string} userId */
const findPersonalByUser = async (userId) => {
	const pool = await getPool();
	const r = await pool.request().input('user_id', sql.VarChar(20), userId).query(`
    SELECT ${PUBLIC_COLS}, ${PROFILE_POSITION} AS profile_position, u.full_name AS user_name
    FROM signing_accounts a
    LEFT JOIN users u ON u.id = a.user_id
    LEFT JOIN positions pos ON pos.id = u.position_id
    WHERE a.kind = 'personal' AND a.user_id = @user_id`);
	return r.recordset[0] ?? null;
};

const findCertificateDefault = async () => {
	const pool = await getPool();
	const r = await pool.request().query(`
    SELECT ${PUBLIC_COLS} FROM signing_accounts a WHERE a.use_for_certificates`);
	return r.recordset[0] ?? null;
};

/** Thông tin cần để gọi VIN-HSM (secret còn mã hóa). @param {number} id */
const findCredential = async (id) => {
	const pool = await getPool();
	const r = await pool.request().input('id', sql.Int, id).query(`
      SELECT a.id, a.kind, a.user_id, a.provider, a.region, a.api_key, a.secret_enc, a.is_active, a.cert_serial,
        a.signature_image, a.signature_show_text,
        COALESCE(NULLIF(TRIM(a.signature_caption), ''), ${PROFILE_POSITION}) AS signature_caption,
        COALESCE(NULLIF(TRIM(a.signature_display_name), ''), u.full_name) AS signature_display_name
      FROM signing_accounts a
      LEFT JOIN users u ON u.id = a.user_id
      LEFT JOIN positions pos ON pos.id = u.position_id
      WHERE a.id = @id`);
	return r.recordset[0] ?? null;
};

/**
 * @param {{ label: string, kind: string, userId: string|null, region: string, apiKey: string,
 *   secretEnc: string, useForCertificates: boolean, isActive: boolean, actorId: string }} d
 * @returns {Promise<number>}
 */
const insertAccount = async (d) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('label', sql.NVarChar(200), d.label)
		.input('kind', sql.VarChar(15), d.kind)
		.input('user_id', sql.VarChar(20), d.userId)
		.input('region', sql.VarChar(20), d.region)
		.input('api_key', sql.VarChar(200), d.apiKey)
		.input('secret_enc', sql.NVarChar(sql.MAX), d.secretEnc)
		.input('use_cert', sql.Bit, d.useForCertificates)
		.input('is_active', sql.Bit, d.isActive)
		.input('actor_id', sql.VarChar(20), d.actorId).query(`
      INSERT INTO signing_accounts (label, kind, user_id, region, api_key, secret_enc,
        use_for_certificates, is_active, created_by)
      VALUES (@label, @kind, @user_id, @region, @api_key, @secret_enc, @use_cert, @is_active, @actor_id)
      RETURNING id`);
	return r.recordset[0].id;
};

/**
 * Chỉ sửa trường có gửi (undefined = giữ nguyên).
 * @param {number} id
 * @param {{ label?: string, region?: string, apiKey?: string, secretEnc?: string,
 *   useForCertificates?: boolean, isActive?: boolean }} d
 * @param {string} actorId
 */
const updateAccount = async (id, d, actorId) => {
	const pool = await getPool();
	const req = pool.request().input('id', sql.Int, id).input('actor_id', sql.VarChar(20), actorId);
	const sets = [`updated_at = ${nowSql}`, 'updated_by = @actor_id'];
	if (d.label !== undefined) {
		req.input('label', sql.NVarChar(200), d.label);
		sets.push('label = @label');
	}
	if (d.region !== undefined) {
		req.input('region', sql.VarChar(20), d.region);
		sets.push('region = @region');
	}
	if (d.apiKey !== undefined) {
		req.input('api_key', sql.VarChar(200), d.apiKey);
		sets.push('api_key = @api_key');
	}
	if (d.secretEnc !== undefined) {
		req.input('secret_enc', sql.NVarChar(sql.MAX), d.secretEnc);
		sets.push('secret_enc = @secret_enc');
	}
	if (d.region !== undefined || d.apiKey !== undefined || d.secretEnc !== undefined) {
		// Đổi thông tin đăng nhập ⇒ thông tin chứng thư cũ không còn chắc đúng
		sets.push(
			'cert_subject = NULL, cert_issuer = NULL, cert_serial = NULL, cert_valid_from = NULL, cert_valid_to = NULL, checked_at = NULL, last_error = NULL',
		);
	}
	if (d.useForCertificates !== undefined) {
		req.input('use_cert', sql.Bit, d.useForCertificates);
		sets.push('use_for_certificates = @use_cert');
	}
	if (d.isActive !== undefined) {
		req.input('is_active', sql.Bit, d.isActive);
		sets.push('is_active = @is_active');
	}
	const r = await req.query(`UPDATE signing_accounts SET ${sets.join(', ')} WHERE id = @id`);
	return r.rowsAffected[0] ?? 0;
};

/** Bỏ cờ "dùng ký giấy chứng nhận" ở mọi tài khoản khác @param {number} keepId */
const clearCertificateDefault = async (keepId) => {
	const pool = await getPool();
	await pool
		.request()
		.input('id', sql.Int, keepId)
		.query(
			'UPDATE signing_accounts SET use_for_certificates = false WHERE use_for_certificates AND id <> @id',
		);
};

/**
 * Ghi kết quả kiểm tra chứng thư. cert = null ⇒ chỉ ghi lỗi.
 * Ngày giờ truyền vào đã quy về giờ VN dạng "UTC giả" (quy ước cột timestamp của hệ thống).
 * @param {number} id
 * @param {{ subject: string, issuer: string, serial: string, validFrom: Date, validTo: Date } | null} cert
 * @param {string|null} error
 */
const saveCheckResult = async (id, cert, error) => {
	const pool = await getPool();
	const req = pool
		.request()
		.input('id', sql.Int, id)
		.input('err', sql.NVarChar(500), error ? String(error).slice(0, 500) : null);
	if (!cert) {
		await req.query(
			`UPDATE signing_accounts SET checked_at = ${nowSql}, last_error = @err WHERE id = @id`,
		);
		return;
	}
	await req
		.input('subject', sql.NVarChar(500), cert.subject.slice(0, 500))
		.input('issuer', sql.NVarChar(500), cert.issuer.slice(0, 500))
		.input('serial', sql.VarChar(100), cert.serial.slice(0, 100))
		.input('valid_from', sql.DateTime2, cert.validFrom)
		.input('valid_to', sql.DateTime2, cert.validTo).query(`
      UPDATE signing_accounts SET cert_subject = @subject, cert_issuer = @issuer, cert_serial = @serial,
        cert_valid_from = @valid_from, cert_valid_to = @valid_to, checked_at = ${nowSql}, last_error = @err
      WHERE id = @id`);
};

/**
 * Ảnh chữ ký tay (PNG base64 đã chuẩn hóa; null = xóa) và cách hiển thị.
 * @param {number} id
 * @param {{ image?: string|null, showText?: boolean, caption?: string|null, displayName?: string|null }} d
 * @param {string} actorId
 */
const updateSignatureImage = async (id, d, actorId) => {
	const pool = await getPool();
	const req = pool.request().input('id', sql.Int, id).input('actor_id', sql.VarChar(20), actorId);
	const sets = [`updated_at = ${nowSql}`, 'updated_by = @actor_id'];
	if (d.image !== undefined) {
		req.input('img', sql.NVarChar(sql.MAX), d.image);
		sets.push('signature_image = @img');
	}
	if (d.showText !== undefined) {
		req.input('show_text', sql.Bit, d.showText);
		sets.push('signature_show_text = @show_text');
	}
	if (d.caption !== undefined) {
		req.input('caption', sql.NVarChar(150), d.caption);
		sets.push('signature_caption = @caption');
	}
	if (d.displayName !== undefined) {
		req.input('display_name', sql.NVarChar(150), d.displayName);
		sets.push('signature_display_name = @display_name');
	}
	const r = await req.query(`UPDATE signing_accounts SET ${sets.join(', ')} WHERE id = @id`);
	return r.rowsAffected[0] ?? 0;
};

/** @param {number} id */
const findSignatureImage = async (id) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('id', sql.Int, id)
		.query('SELECT signature_image FROM signing_accounts WHERE id = @id');
	return r.recordset[0]?.signature_image ?? null;
};

/** @param {number} id */
const deleteAccount = async (id) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('id', sql.Int, id)
		.query('DELETE FROM signing_accounts WHERE id = @id');
	return r.rowsAffected[0] ?? 0;
};

/**
 * @param {{ accountId: number|null, actorId: string|null, docType: string, docRef: string|null,
 *   endpoint: string, inputSha256: string|null, outputSha256: string|null, certSerial: string|null,
 *   status: 'ok'|'error', errorCode: number|null, errorMessage: string|null, durationMs: number }} l
 */
const insertLog = async (l) => {
	const pool = await getPool();
	await pool
		.request()
		.input('account_id', sql.Int, l.accountId)
		.input('actor_id', sql.VarChar(20), l.actorId)
		.input('doc_type', sql.VarChar(30), l.docType)
		.input('doc_ref', sql.NVarChar(60), l.docRef ? String(l.docRef).slice(0, 60) : null)
		.input('endpoint', sql.VarChar(100), l.endpoint)
		.input('in_sha', sql.Char(64), l.inputSha256)
		.input('out_sha', sql.Char(64), l.outputSha256)
		.input('serial', sql.VarChar(100), l.certSerial)
		.input('status', sql.VarChar(10), l.status)
		.input('err_code', sql.Int, l.errorCode)
		.input(
			'err_msg',
			sql.NVarChar(500),
			l.errorMessage ? String(l.errorMessage).slice(0, 500) : null,
		)
		.input('duration', sql.Int, l.durationMs).query(`
      INSERT INTO signing_logs (account_id, actor_id, doc_type, doc_ref, endpoint, input_sha256,
        output_sha256, cert_serial, status, error_code, error_message, duration_ms)
      VALUES (@account_id, @actor_id, @doc_type, @doc_ref, @endpoint, @in_sha, @out_sha, @serial,
        @status, @err_code, @err_msg, @duration)`);
};

/**
 * @param {{ offset: number, limit: number, fetchClause: string, status?: string, docType?: string,
 *   accountId?: number, actorId?: string }} q
 */
const listLogs = async (q) => {
	const pool = await getPool();
	const where = ['1 = 1'];
	if (q.status) where.push('l.status = @status');
	if (q.docType) where.push('l.doc_type = @doc_type');
	if (q.accountId) where.push('l.account_id = @account_id');
	if (q.actorId) where.push('l.actor_id = @actor_id');
	const w = where.join(' AND ');
	const bind = () => {
		const req = pool.request();
		if (q.status) req.input('status', sql.VarChar(10), q.status);
		if (q.docType) req.input('doc_type', sql.VarChar(30), q.docType);
		if (q.accountId) req.input('account_id', sql.Int, q.accountId);
		if (q.actorId) req.input('actor_id', sql.VarChar(20), q.actorId);
		return req;
	};
	const rows = await bind().input('offset', sql.Int, q.offset).input('limit', sql.Int, q.limit)
		.query(`
    SELECT l.*, a.label AS account_label, u.full_name AS actor_name
    FROM signing_logs l
    LEFT JOIN signing_accounts a ON a.id = l.account_id
    LEFT JOIN users u ON u.id = l.actor_id
    WHERE ${w}
    ORDER BY l.created_at DESC, l.id DESC
    ${q.fetchClause}`);
	const total = await bind().query(`SELECT COUNT(*) AS n FROM signing_logs l WHERE ${w}`);
	return { rows: rows.recordset, total: Number(total.recordset[0]?.n ?? 0) };
};

module.exports = {
	listAccounts,
	findById,
	findPersonalByUser,
	findCertificateDefault,
	findCredential,
	insertAccount,
	updateAccount,
	clearCertificateDefault,
	saveCheckResult,
	deleteAccount,
	updateSignatureImage,
	findSignatureImage,
	insertLog,
	listLogs,
};
