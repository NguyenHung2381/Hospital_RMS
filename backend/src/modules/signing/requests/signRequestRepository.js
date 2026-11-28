const { getPool, sql, nowSql, ilike } = require('../../../config/db');

// Truy cập dữ liệu hồ sơ trình ký — CHỈ SQL, trả dữ liệu thuần. Hàm ghi nhận `tx` (đang trong
// withTransaction); hàm đọc nhận `db` tùy chọn (tx để đọc trong cùng giao dịch, mặc định pool).

const reqOf = async (db) => (db ?? (await getPool())).request();

// ─── Ghi ────────────────────────────────────────────────────────────────

/** @returns {Promise<number>} */
const insertRequest = async (tx, { title, message, dueDate, createdBy }) => {
	const r = await (
		await reqOf(tx)
	)
		.input('title', sql.NVarChar(300), title)
		.input('message', sql.NVarChar(sql.MAX), message)
		.input('due', sql.Date, dueDate)
		.input('by', sql.VarChar(20), createdBy).query(`
      INSERT INTO sign_requests (title, message, due_date, created_by)
      VALUES (@title, @message, @due, @by) RETURNING id`);
	return Number(r.recordset[0].id);
};

/** Văn bản (đường dẫn ghi sau khi có id) @returns {Promise<number>} */
const insertDocument = async (tx, { requestId, sortOrder, fileName, pageCount }) => {
	const r = await (
		await reqOf(tx)
	)
		.input('rid', sql.BigInt, requestId)
		.input('ord', sql.Int, sortOrder)
		.input('name', sql.NVarChar(255), fileName)
		.input('pages', sql.Int, pageCount).query(`
      INSERT INTO sign_request_documents (request_id, sort_order, file_name, page_count, current_path, current_sha256)
      VALUES (@rid, @ord, @name, @pages, '', REPEAT('0', 64)) RETURNING id`);
	return Number(r.recordset[0].id);
};

const setDocumentCurrent = async (tx, documentId, { version, path, sha256 }) => {
	await (
		await reqOf(tx)
	)
		.input('id', sql.BigInt, documentId)
		.input('ver', sql.Int, version)
		.input('path', sql.VarChar(500), path)
		.input('sha', sql.Char(64), sha256)
		.query(
			'UPDATE sign_request_documents SET current_version = @ver, current_path = @path, current_sha256 = @sha WHERE id = @id',
		);
};

const insertVersion = async (tx, { documentId, version, path, sha256, size, signerUserId }) => {
	await (
		await reqOf(tx)
	)
		.input('doc', sql.BigInt, documentId)
		.input('ver', sql.Int, version)
		.input('path', sql.VarChar(500), path)
		.input('sha', sql.Char(64), sha256)
		.input('size', sql.Int, size)
		.input('signer', sql.VarChar(20), signerUserId).query(`
      INSERT INTO sign_request_versions (document_id, version, path, sha256, size_bytes, signer_user_id)
      VALUES (@doc, @ver, @path, @sha, @size, @signer)`);
};

const insertStep = async (tx, requestId, stepNo, mode) => {
	await (
		await reqOf(tx)
	)
		.input('rid', sql.BigInt, requestId)
		.input('no', sql.Int, stepNo)
		.input('mode', sql.VarChar(5), mode)
		.query('INSERT INTO sign_request_steps (request_id, step_no, mode) VALUES (@rid, @no, @mode)');
};

/** @returns {Promise<number>} */
const insertSigner = async (tx, { requestId, stepNo, userId, status }) => {
	const r = await (
		await reqOf(tx)
	)
		.input('rid', sql.BigInt, requestId)
		.input('no', sql.Int, stepNo)
		.input('uid', sql.VarChar(20), userId)
		.input('st', sql.VarChar(10), status).query(`
      INSERT INTO sign_request_signers (request_id, step_no, user_id, status)
      VALUES (@rid, @no, @uid, @st) RETURNING id`);
	return Number(r.recordset[0].id);
};

const insertField = async (tx, f) => {
	await (
		await reqOf(tx)
	)
		.input('rid', sql.BigInt, f.requestId)
		.input('doc', sql.BigInt, f.documentId)
		.input('signer', sql.BigInt, f.signerId)
		.input('page', sql.Int, f.page)
		.input('x', sql.Decimal(9, 2), f.x)
		.input('y', sql.Decimal(9, 2), f.y)
		.input('w', sql.Decimal(9, 2), f.width)
		.input('h', sql.Decimal(9, 2), f.height).query(`
      INSERT INTO sign_request_fields (request_id, document_id, signer_id, page, x, y, width, height)
      VALUES (@rid, @doc, @signer, @page, @x, @y, @w, @h)`);
};

const insertEvent = async (db, { requestId, actorId, action, note = null }) => {
	await (
		await reqOf(db)
	)
		.input('rid', sql.BigInt, requestId)
		.input('actor', sql.VarChar(20), actorId)
		.input('action', sql.VarChar(20), action)
		.input('note', sql.NVarChar(1000), note ? String(note).slice(0, 1000) : null)
		.query(
			'INSERT INTO sign_request_events (request_id, actor_id, action, note) VALUES (@rid, @actor, @action, @note)',
		);
};

/** Đổi trạng thái 1 người ký (ghi thời điểm + ghi chú) */
const updateSigner = async (tx, signerId, { status, note = null }) => {
	await (
		await reqOf(tx)
	)
		.input('id', sql.BigInt, signerId)
		.input('st', sql.VarChar(10), status)
		.input('note', sql.NVarChar(1000), note ? String(note).slice(0, 1000) : null)
		.query(
			`UPDATE sign_request_signers SET status = @st, note = COALESCE(@note, note), acted_at = ${nowSql} WHERE id = @id`,
		);
};

/** Đổi trạng thái hàng loạt người ký của 1 bước (vd waiting → pending khi tới bước) */
const setStepSignersStatus = async (tx, requestId, stepNo, from, to) => {
	const r = await (
		await reqOf(tx)
	)
		.input('rid', sql.BigInt, requestId)
		.input('no', sql.Int, stepNo)
		.input('from', sql.VarChar(10), from)
		.input('to', sql.VarChar(10), to).query(`
      UPDATE sign_request_signers SET status = @to
      WHERE request_id = @rid AND step_no = @no AND status = @from
      RETURNING user_id`);
	return r.recordset.map((x) => x.user_id);
};

/** Hồ sơ dừng sớm (từ chối / hủy): ai chưa ký thì không cần ký nữa. */
const closeOpenSigners = async (tx, requestId) => {
	await (await reqOf(tx)).input('rid', sql.BigInt, requestId).query(`
      UPDATE sign_request_signers SET status = 'skipped'
      WHERE request_id = @rid AND status IN ('waiting', 'pending')`);
};

/**
 * @param {any} tx
 * @param {number} id
 * @param {{ status?: string, currentStep?: number, completed?: boolean }} d
 * @param {string} actorId
 */
const updateRequest = async (tx, id, { status, currentStep, completed = false }, actorId) => {
	const req = (await reqOf(tx))
		.input('id', sql.BigInt, id)
		.input('actor', sql.VarChar(20), actorId);
	const sets = [`updated_at = ${nowSql}`, 'updated_by = @actor'];
	if (status !== undefined) {
		req.input('st', sql.VarChar(15), status);
		sets.push('status = @st');
	}
	if (currentStep !== undefined) {
		req.input('step', sql.Int, currentStep);
		sets.push('current_step = @step');
	}
	if (completed) sets.push(`completed_at = ${nowSql}`);
	await req.query(`UPDATE sign_requests SET ${sets.join(', ')} WHERE id = @id`);
};

// ─── Đọc ────────────────────────────────────────────────────────────────

/** Khóa dòng hồ sơ tới hết giao dịch (2 người ký cùng lúc không ghi đè bản của nhau) */
const lockRequest = async (tx, id) => {
	const r = await (
		await reqOf(tx)
	)
		.input('id', sql.BigInt, id)
		.query('SELECT * FROM sign_requests WHERE id = @id FOR UPDATE');
	return r.recordset[0] ?? null;
};

const findRequest = async (id, db) => {
	const r = await (await reqOf(db)).input('id', sql.BigInt, id).query(`
    SELECT r.*, u.full_name AS creator_name,
      (SELECT COUNT(*) FROM sign_request_steps s WHERE s.request_id = r.id) AS total_steps
    FROM sign_requests r JOIN users u ON u.id = r.created_by
    WHERE r.id = @id`);
	return r.recordset[0] ?? null;
};

const listDocuments = async (requestId, db) => {
	const r = await (
		await reqOf(db)
	)
		.input('rid', sql.BigInt, requestId)
		.query('SELECT * FROM sign_request_documents WHERE request_id = @rid ORDER BY sort_order, id');
	return r.recordset;
};

const listSteps = async (requestId, db) => {
	const r = await (
		await reqOf(db)
	)
		.input('rid', sql.BigInt, requestId)
		.query('SELECT step_no, mode FROM sign_request_steps WHERE request_id = @rid ORDER BY step_no');
	return r.recordset;
};

const listSigners = async (requestId, db) => {
	const r = await (await reqOf(db)).input('rid', sql.BigInt, requestId).query(`
    SELECT s.*, u.full_name, d.name AS department_name
    FROM sign_request_signers s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN departments d ON d.id = u.department_id
    WHERE s.request_id = @rid
    ORDER BY s.step_no, s.id`);
	return r.recordset;
};

const listFields = async (requestId, db) => {
	const r = await (
		await reqOf(db)
	)
		.input('rid', sql.BigInt, requestId)
		.query('SELECT * FROM sign_request_fields WHERE request_id = @rid');
	return r.recordset;
};

const listEvents = async (requestId) => {
	const r = await (await reqOf()).input('rid', sql.BigInt, requestId).query(`
    SELECT e.*, u.full_name AS actor_name
    FROM sign_request_events e LEFT JOIN users u ON u.id = e.actor_id
    WHERE e.request_id = @rid ORDER BY e.created_at, e.id`);
	return r.recordset;
};

const findVersion = async (documentId, version) => {
	const r = await (
		await reqOf()
	)
		.input('doc', sql.BigInt, documentId)
		.input('ver', sql.Int, version)
		.query('SELECT * FROM sign_request_versions WHERE document_id = @doc AND version = @ver');
	return r.recordset[0] ?? null;
};

/** Tài khoản đang hoạt động trong danh sách mã @param {string[]} ids */
const findActiveUsers = async (ids) => {
	if (!ids.length) return [];
	const req = await reqOf();
	ids.forEach((id, i) => req.input(`u${i}`, sql.VarChar(20), id));
	const r = await req.query(`
    SELECT id, full_name FROM users
    WHERE is_active = true AND id IN (${ids.map((_, i) => `@u${i}`).join(', ')})`);
	return r.recordset;
};

// Cột tóm tắt cho danh sách
const SUMMARY = `
  r.id, r.title, r.status, r.current_step, r.due_date, r.created_at, r.completed_at, r.created_by,
  cu.full_name AS creator_name,
  (SELECT COUNT(*) FROM sign_request_steps st WHERE st.request_id = r.id) AS total_steps,
  (SELECT COUNT(*) FROM sign_request_documents d WHERE d.request_id = r.id) AS doc_count,
  (SELECT COUNT(*) FROM sign_request_signers s WHERE s.request_id = r.id) AS signer_count,
  (SELECT COUNT(*) FROM sign_request_signers s WHERE s.request_id = r.id AND s.status = 'signed') AS signed_count`;

/**
 * Danh sách theo hộp: todo (đang chờ tôi ký) | sent (tôi tạo) | involved (tôi có trong danh
 * sách ký) | all (mọi hồ sơ — chỉ quản trị).
 * @param {{ box: string, userId: string, status?: string, search?: string, offset: number, limit: number }} q
 */
const listRequests = async (q) => {
	const pool = await getPool();
	const where = [];
	if (q.box === 'todo') {
		where.push(`r.status = 'in_progress' AND EXISTS (SELECT 1 FROM sign_request_signers s
      WHERE s.request_id = r.id AND s.user_id = @uid AND s.status = 'pending')`);
	} else if (q.box === 'sent') {
		where.push('r.created_by = @uid');
	} else if (q.box === 'involved') {
		where.push(
			'EXISTS (SELECT 1 FROM sign_request_signers s WHERE s.request_id = r.id AND s.user_id = @uid)',
		);
	}
	if (q.status) where.push('r.status = @status');
	if (q.search) where.push(ilike('r.title', '@search'));
	const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
	const bind = () => {
		const req = pool.request().input('uid', sql.VarChar(20), q.userId);
		if (q.status) req.input('status', sql.VarChar(15), q.status);
		if (q.search) req.input('search', sql.NVarChar(200), `%${q.search.replace(/[%_]/g, '')}%`);
		return req;
	};
	const rows = await bind().input('offset', sql.Int, q.offset).input('limit', sql.Int, q.limit)
		.query(`
    SELECT ${SUMMARY},
      (SELECT s.status FROM sign_request_signers s WHERE s.request_id = r.id AND s.user_id = @uid) AS my_status,
      (SELECT s.id FROM sign_request_signers s WHERE s.request_id = r.id AND s.user_id = @uid) AS my_signer_id
    FROM sign_requests r JOIN users cu ON cu.id = r.created_by
    ${w}
    ORDER BY r.created_at DESC, r.id DESC
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`);
	const total = await bind().query(`SELECT COUNT(*) AS n FROM sign_requests r ${w}`);
	return { rows: rows.recordset, total: Number(total.recordset[0]?.n ?? 0) };
};

/** Văn bản thiếu khung đặt sẵn cho từng người ký (ký hàng loạt cần đủ khung) */
const countMissingFields = async (signerIds) => {
	if (!signerIds.length) return new Map();
	const req = await reqOf();
	signerIds.forEach((id, i) => req.input(`s${i}`, sql.BigInt, id));
	const r = await req.query(`
    SELECT s.id AS signer_id,
      (SELECT COUNT(*) FROM sign_request_documents d WHERE d.request_id = s.request_id
         AND NOT EXISTS (SELECT 1 FROM sign_request_fields f WHERE f.document_id = d.id AND f.signer_id = s.id)) AS missing
    FROM sign_request_signers s WHERE s.id IN (${signerIds.map((_, i) => `@s${i}`).join(', ')})`);
	return new Map(r.recordset.map((x) => [Number(x.signer_id), Number(x.missing)]));
};

/** Số hồ sơ đang chờ tôi ký (huy hiệu menu) */
const countTodo = async (userId) => {
	const r = await (await reqOf()).input('uid', sql.VarChar(20), userId).query(`
    SELECT COUNT(*) AS n FROM sign_request_signers s JOIN sign_requests r ON r.id = s.request_id
    WHERE s.user_id = @uid AND s.status = 'pending' AND r.status = 'in_progress'`);
	return Number(r.recordset[0]?.n ?? 0);
};

module.exports = {
	insertRequest,
	insertDocument,
	setDocumentCurrent,
	insertVersion,
	insertStep,
	insertSigner,
	insertField,
	insertEvent,
	updateSigner,
	setStepSignersStatus,
	closeOpenSigners,
	updateRequest,
	lockRequest,
	findRequest,
	listDocuments,
	listSteps,
	listSigners,
	listFields,
	listEvents,
	findVersion,
	findActiveUsers,
	listRequests,
	countMissingFields,
	countTodo,
};
