/**
 * cmeRecordService.js — Ghi nhận tín chỉ CME ĐỘC LẬP, không bắt buộc qua 1
 * seminar cụ thể (tự học, học online, minh chứng đính kèm...). Khác cơ chế
 * hiện có (seminar_participants.cme_credits, luôn gắn 1 seminar_id) — xem
 * 2026-09-16_cme_records.sql. Trang "Cảnh báo tín chỉ CME" (cmeRequirementService
 * .getComplianceReport) đã cộng dồn cả 2 nguồn.
 */
const {
	getPool,
	sql,
	jsonValues,
	queryAll,
	nowSql,
	updateReturning,
	deleteReturning,
	jsonArray,
} = require('../../config/db');
const { randomId } = require('../../utils/idGenerator');
const { broadcast } = require('../events/eventService');
const { paging } = require('../../utils/paging');
const trainingFileService = require('../training/trainingFileService');
const { httpError } = require('../../utils/httpError');
const formCustomValueService = require('../forms/formCustomValueService');

// File bổ sung chứng minh kết quả — người dùng tải lên SAU khi ghi nhận đã duyệt
// (minh chứng chính evidence_file_id bị khóa lúc đó). Lưu ở training_files theo
// entity_type='cme_result', entity_id = id ghi nhận; không cần cột riêng.
const RESULT_FILE_TYPE = 'cme_result';
const RESULT_FILES_SQL = `${jsonArray(
	`SELECT tf.id, tf.file_name, tf.file_url, tf.created_at FROM training_files tf
           WHERE tf.entity_type = '${RESULT_FILE_TYPE}' AND tf.entity_id = r.id AND tf.is_deleted = 'false'`,
	'tf.created_at',
)} AS result_files`;
const withResultFiles = (row) =>
	row && { ...row, result_files: row.result_files ? JSON.parse(row.result_files) : [] };

const recordSelect = `
  SELECT r.*, u.full_name AS user_name, u.staff_number, u.department_id, d.name AS department_name,
         c.name AS category_name, g.name AS group_name, f.file_name AS evidence_file_name, f.file_url AS evidence_file_url,
         ${RESULT_FILES_SQL}
  FROM cme_records r
  JOIN users u ON u.id = r.user_id
  LEFT JOIN departments d ON d.id = u.department_id
  LEFT JOIN cme_credit_categories c ON c.id = r.category_id
  LEFT JOIN cme_credit_groups g ON g.id = c.group_id
  LEFT JOIN training_files f ON f.id = r.evidence_file_id AND f.is_deleted = 'false'
`;

const getAll = async ({
	page = 1,
	limit = 20,
	user_id = undefined,
	year = undefined,
	category_id = undefined,
	approval_status = undefined,
} = {}) => {
	const pool = await getPool();
	const pg = paging(page, limit, 100);
	const where = ['1=1'];
	const req = pool.request().input('offset', sql.Int, pg.offset).input('limit', sql.Int, pg.limit);

	if (user_id) {
		where.push('r.user_id = @user_id');
		req.input('user_id', sql.VarChar(20), user_id);
	}
	if (year) {
		where.push('r.year = @year');
		req.input('year', sql.Int, Number(year));
	}
	if (category_id) {
		where.push('r.category_id = @category_id');
		req.input('category_id', sql.VarChar(20), category_id);
	}
	if (approval_status) {
		where.push('r.approval_status = @approval_status');
		req.input('approval_status', sql.VarChar(20), approval_status);
	}
	const whereSql = `WHERE ${where.join(' AND ')}`;

	const sets = await queryAll(req, [
		`
    ${recordSelect} ${whereSql} ORDER BY r.activity_date DESC, r.created_at DESC
    ${pg.fetchClause}
		`,
		`
    SELECT COUNT(*) AS total FROM cme_records r ${whereSql}
		`,
	]);
	return {
		// custom = trường tùy chỉnh người khai điền (Cấu hình form 'cme_record')
		data: await formCustomValueService.attach('cme_record', sets[0].map(withResultFiles)),
		pagination: { page: pg.page, limit: pg.limit, total: sets[1][0].total },
	};
};

const getById = async (id) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('id', sql.VarChar(20), id)
		.query(`${recordSelect} WHERE r.id = @id`);
	const row = withResultFiles(result.recordset[0]);
	if (!row) return null;
	row.custom = await formCustomValueService.get('cme_record', id);
	return row;
};

// opts.fetch=false: bỏ query đọc lại bản ghi — dùng cho import hàng loạt
const create = async (data, actorId, { fetch = true } = {}) => {
	const pool = await getPool();
	const newId = randomId('CM', 18);
	await pool
		.request()
		.input('actor_id', sql.VarChar(20), actorId)
		.input('user_id', sql.VarChar(20), data.user_id)
		.input('category_id', sql.VarChar(20), data.category_id || null)
		.input('title', sql.NVarChar(255), data.title)
		.input('activity_date', sql.Date, data.activity_date)
		.input('credits', sql.Decimal(6, 2), Number(data.credits))
		.input('note', sql.NVarChar(500), data.note || null)
		.input('role', sql.NVarChar(100), data.role || null)
		.input('quantity', sql.Decimal(8, 2), data.quantity ?? null)
		.input('end_date', sql.Date, data.end_date || null)
		.input('year', sql.Int, Number(data.year) || new Date(data.activity_date).getUTCFullYear())
		.input('new_id', sql.VarChar(20), newId).query(`
      INSERT INTO cme_records (id, user_id, category_id, title, activity_date, end_date, year, role, quantity, credits, note, created_by)
      VALUES (@new_id, @user_id, @category_id, @title, @activity_date, @end_date, @year, @role, @quantity, @credits, @note, @actor_id);
    `);
	const id = newId;
	broadcast('update', { entity: 'cme_record' });
	return fetch ? getById(id) : { id };
};

// Dựng các câu SET từ data (cập nhật từng phần, trường undefined = giữ nguyên) và gắn
// tham số vào req — dùng chung cho sửa 1 bản ghi và sửa đồng loạt.
const fieldSets = (req, data) => {
	const sets = [];
	const fieldMap = {
		user_id: sql.VarChar(20),
		category_id: sql.VarChar(20),
		title: sql.NVarChar(255),
		activity_date: sql.Date,
		credits: sql.Decimal(6, 2),
		note: sql.NVarChar(500),
		role: sql.NVarChar(100),
		quantity: sql.Decimal(8, 2),
		end_date: sql.Date,
	};
	// year là cột thường NOT NULL: không truyền / để trống thì lấy theo ngày hoạt động
	// (giống create); không có cả hai thì giữ năm cũ, không ghi NULL.
	const year = Number(data.year);
	if (Number.isInteger(year) && year > 0) data = { ...data, year };
	else if (data.activity_date)
		data = { ...data, year: new Date(data.activity_date).getUTCFullYear() };
	else data = { ...data, year: undefined };
	fieldMap.year = sql.Int;
	// Cột NOT NULL — gửi rỗng/null thì bỏ qua thay vì để SQL báo lỗi 500
	const NOT_NULL = new Set(['user_id', 'title', 'credits']);
	for (const [field, type] of Object.entries(fieldMap)) {
		let value = data[field];
		if (value === undefined) continue;
		if (value === '') value = null;
		if (value === null && NOT_NULL.has(field)) continue;
		if (field === 'title') value = String(value).trim();
		sets.push(`${field} = @${field}`);
		req.input(field, type, value);
	}
	return sets;
};

// extraSets: câu SET thêm chạy cùng 1 lệnh UPDATE (vd. updateMine đưa về 'pending') —
// tránh broadcast trạng thái cũ giữa 2 lệnh.
const update = async (id, data, actorId, { extraSets = [] } = {}) => {
	const pool = await getPool();
	const req = pool
		.request()
		.input('id', sql.VarChar(20), id)
		.input('actor_id', sql.VarChar(20), actorId);
	const sets = [
		`updated_at = ${nowSql}`,
		'updated_by = @actor_id',
		...extraSets,
		...fieldSets(req, data),
	];
	const r = await req.query(`UPDATE cme_records SET ${sets.join(', ')} WHERE id = @id`);
	if (!r.rowsAffected[0]) return null;
	broadcast('update', { entity: 'cme_record' });
	return getById(id);
};

// Sửa đồng loạt — áp cùng giá trị cho nhiều ghi nhận trong 1 câu UPDATE. Không đổi nhân viên.
// Đổi danh mục / số buổi mà không nhập tín chỉ → tính lại tín chỉ = định mức × số buổi của
// từng ghi nhận (giống form sửa 1 bản ghi); danh mục không có định mức thì giữ tín chỉ cũ.
const updateMany = async (ids, data, actorId) => {
	const list = [...new Set((ids || []).filter((id) => typeof id === 'string' && id))];
	if (!list.length) return { updated: 0 };
	const { user_id: _ignored, ...safe } = data;
	const pool = await getPool();
	// Mỗi câu lệnh 1 request riêng, cùng bộ tham số
	const newReq = () => {
		const req = pool
			.request()
			.input('ids', sql.NVarChar(sql.MAX), JSON.stringify(list))
			.input('actor_id', sql.VarChar(20), actorId);
		return { req, fields: fieldSets(req, safe) };
	};
	const { req, fields } = newReq();
	if (!fields.length) throw httpError(400, 'Chưa nhập giá trị nào để sửa');
	const has = (f) => fields.some((s) => s.startsWith(`${f} =`));
	// Giá trị sau khi sửa: tham số nếu có gửi, không thì cột hiện tại (ghi tên bảng — câu UPDATE
	// không đặt alias để chạy cả SQL Server lẫn PG)
	const newVal = (f) => (has(f) ? `@${f}` : `cme_records.${f}`);

	// Đổi 1 đầu khoảng ngày có thể làm "Đến ngày" < "Từ ngày" ở ghi nhận khác → chặn trước
	if (has('activity_date') || has('end_date')) {
		const bad = await newReq().req.query(`SELECT COUNT(*) AS n FROM cme_records
			WHERE cme_records.id IN ${jsonValues('@ids')}
			AND ${newVal('end_date')} < ${newVal('activity_date')}`);
		if (bad.recordset[0].n)
			throw httpError(
				400,
				`${bad.recordset[0].n} ghi nhận sẽ có "Đến ngày" trước "Từ ngày" — vui lòng nhập cả hai ngày`,
			);
	}

	const sets = [`updated_at = ${nowSql}`, 'updated_by = @actor_id', ...fields];
	if (!has('credits') && (has('category_id') || has('quantity'))) {
		const total = `c.conversion_value * COALESCE(${newVal('quantity')}, 1)`;
		// Loại không có hệ số quy đổi (hoặc không tồn tại) ⇒ subquery NULL ⇒ giữ số tín chỉ cũ.
		// @category_id vừa gán vào cột varchar vừa so ở đây: PG suy 2 kiểu khác nhau (varchar / text)
		// ⇒ ép VARCHAR (mã loại chỉ gồm ký tự ASCII, SQL Server không mất gì).
		const catId = has('category_id')
			? 'CAST(@category_id AS VARCHAR(20))'
			: 'cme_records.category_id';
		sets.push(
			`credits = COALESCE((SELECT CASE WHEN c.conversion_value > 0 AND ${total} < 10000 THEN ROUND(${total}, 2) END
				FROM cme_credit_categories c WHERE c.id = ${catId}), cme_records.credits)`,
		);
	}
	const r = await req.query(`UPDATE cme_records SET ${sets.join(', ')}
		WHERE cme_records.id IN ${jsonValues('@ids')}`);
	broadcast('update', { entity: 'cme_record' });
	return { updated: r.rowsAffected[0] };
};

const remove = async (id, actorId) => {
	const pool = await getPool();
	const row = await pool
		.request()
		.input('id', sql.VarChar(20), id)
		.query('SELECT evidence_file_id FROM cme_records WHERE id = @id');
	await pool
		.request()
		.input('id', sql.VarChar(20), id)
		.query('DELETE FROM cme_records WHERE id = @id');
	if (row.recordset[0]?.evidence_file_id) {
		await trainingFileService.softDelete(row.recordset[0].evidence_file_id, actorId);
	}
	await removeResultFiles([id], actorId);
	await formCustomValueService.remove('cme_record', id);
	broadcast('update', { entity: 'cme_record' });
};

const removeResultFiles = async (recordIds, actorId) => {
	const pool = await getPool();
	const files = await pool
		.request()
		.input('ids', sql.NVarChar(sql.MAX), JSON.stringify(recordIds))
		.query(
			`SELECT id FROM training_files WHERE entity_type = '${RESULT_FILE_TYPE}' AND is_deleted = 'false'
       AND entity_id IN ${jsonValues('@ids')}`,
		);
	for (const f of files.recordset) await trainingFileService.softDelete(f.id, actorId);
};

// Xóa hàng loạt (nút "Xóa tất cả theo bộ lọc") — một câu DELETE, rồi gỡ file minh chứng kèm theo.
const removeMany = async (ids, actorId) => {
	const list = [...new Set((ids || []).filter((id) => typeof id === 'string' && id))];
	if (!list.length) return { deleted: 0 };
	const pool = await getPool();
	const result = await pool
		.request()
		.input('ids', sql.NVarChar(sql.MAX), JSON.stringify(list))
		.query(
			deleteReturning(
				'DELETE FROM cme_records',
				`id IN ${jsonValues('@ids')}`,
				'old.evidence_file_id',
			),
		);
	for (const { evidence_file_id } of result.recordset) {
		if (evidence_file_id) await trainingFileService.softDelete(evidence_file_id, actorId);
	}
	await removeResultFiles(list, actorId);
	await formCustomValueService.removeMany('cme_record', list);
	broadcast('update', { entity: 'cme_record' });
	return { deleted: result.recordset.length };
};

// Đính kèm minh chứng — tách thành bước riêng (id ghi nhận phải tồn tại
// trước, đúng convention thư mục upload dùng entity id — xem uploadTraining.js).
const addEvidence = async (id, file, actorId) => {
	const pool = await getPool();
	const savedFile = await trainingFileService.saveUploadedFile('cme_evidence', id, file, actorId);
	// old_id = minh chứng cũ bị thay (giá trị trước khi sửa) → gỡ luôn, không để file mồ côi
	const r = await pool
		.request()
		.input('id', sql.VarChar(20), id)
		.input('file_id', sql.VarChar(20), savedFile.id)
		.query(
			updateReturning(
				'UPDATE cme_records SET evidence_file_id = @file_id',
				'id = @id',
				'old.evidence_file_id AS old_id',
			),
		);
	const oldId = r.recordset[0]?.old_id;
	if (oldId && oldId !== savedFile.id) await trainingFileService.softDelete(oldId, actorId);
	broadcast('update', { entity: 'cme_record' });
	return getById(id);
};

// ── Người dùng tự khai (chờ admin duyệt) ──────────────────────────────────────
// Chỉ bản ghi approval_status='approved' mới được cộng vào tín chỉ CME.
const httpErr = (message, statusCode) => httpError(statusCode, message);

// Bản ghi phải của chính user và chưa được duyệt (đã duyệt thì khóa, tránh đổi tín chỉ sau duyệt)
const assertEditableMine = async (id, userId) => {
	const rec = await getById(id);
	if (!rec || rec.user_id !== userId) throw httpErr('Không tìm thấy ghi nhận CME', 404);
	// Dòng tự động từ khóa học (courseCmeService) — theo giấy chứng nhận / khóa điểm, không tự sửa
	if (rec.source_type)
		throw httpErr('Ghi nhận CME tự động từ khóa học, không thể sửa hoặc xóa', 409);
	if (rec.approval_status === 'approved')
		throw httpErr('Ghi nhận đã được duyệt, không thể sửa hoặc xóa', 409);
	return rec;
};

// Số giờ tín chỉ người dùng tự khai: > 0 thì lưu, bỏ trống / 0 = chưa khai (lưu 0).
// Bản 'pending' không được cộng vào tổng (mọi chỗ cộng đều lọc 'approved'); người
// quản lý xem / sửa số này khi duyệt (review).
const selfCredits = (v) => (Number(v) > 0 && Number(v) < 10000 ? Number(v) : 0);

const createMine = async (data, userId) => {
	const rec = await create(
		{ ...data, user_id: userId, credits: selfCredits(data.credits) },
		userId,
	);
	// create() luôn để mặc định 'approved' → chuyển về chờ duyệt
	const pool = await getPool();
	await pool
		.request()
		.input('id', sql.VarChar(20), rec.id)
		.query("UPDATE cme_records SET approval_status = 'pending' WHERE id = @id");
	return getById(rec.id);
};

// Sửa xong → quay lại 'pending' (kể cả bản đã bị từ chối = nộp lại)
const updateMine = async (id, data, userId) => {
	await assertEditableMine(id, userId);
	const { user_id: _ignored, credits, ...safe } = data;
	// Không gửi credits = giữ nguyên; gửi rỗng / null = xóa số đã khai (về 0)
	if (credits !== undefined) safe.credits = selfCredits(credits);
	return update(id, safe, userId, {
		extraSets: [
			"approval_status = 'pending'",
			'reviewed_by = NULL',
			'reviewed_at = NULL',
			'reject_reason = NULL',
		],
	});
};

const removeMine = async (id, userId) => {
	await assertEditableMine(id, userId);
	return remove(id, userId);
};

const addEvidenceMine = async (id, file, userId) => {
	await assertEditableMine(id, userId);
	return addEvidence(id, file, userId);
};

// File kết quả bổ sung — chỉ bản ghi của chính mình ĐÃ duyệt. Không đổi trạng
// thái/tín chỉ, chỉ đính thêm minh chứng.
const assertApprovedMine = async (id, userId) => {
	const rec = await getById(id);
	if (!rec || rec.user_id !== userId) throw httpErr('Không tìm thấy ghi nhận CME', 404);
	if (rec.approval_status !== 'approved')
		throw httpErr('Chỉ bổ sung file kết quả sau khi ghi nhận đã được duyệt', 409);
	return rec;
};

const addResultFileMine = async (id, file, userId) => {
	await assertApprovedMine(id, userId);
	await trainingFileService.saveUploadedFile(RESULT_FILE_TYPE, id, file, userId);
	broadcast('update', { entity: 'cme_record' });
	return getById(id);
};

const removeResultFileMine = async (id, fileId, userId) => {
	await assertApprovedMine(id, userId);
	const f = await trainingFileService.getById(fileId);
	if (!f || f.entity_type !== RESULT_FILE_TYPE || f.entity_id !== id)
		throw httpErr('Không tìm thấy file', 404);
	await trainingFileService.softDelete(fileId, userId);
	broadcast('update', { entity: 'cme_record' });
};

// Admin duyệt / từ chối. Duyệt kèm credits = số tín chỉ người quản lý nhập cho
// bản ghi (người dùng tự khai không nhập); không gửi thì giữ tín chỉ hiện có.
// Duyệt phải ra số tín chỉ > 0: bản tự khai lưu 0 (createMine), trước đây duyệt mà
// không nhập (gọi API thẳng / duyệt đồng loạt) thì thành "đã duyệt" 0 tín chỉ.
// Không đủ điều kiện tính tín chỉ thì từ chối, không duyệt 0.
const review = async (id, approve, reason, actorId, credits) => {
	if (!approve && !String(reason || '').trim()) throw httpErr('Vui lòng nhập lý do từ chối', 400);
	const hasCredits = approve && credits !== undefined && credits !== null && credits !== '';
	if (
		hasCredits &&
		!(Number.isFinite(Number(credits)) && Number(credits) >= 0 && Number(credits) < 10000)
	)
		throw httpErr('Số tín chỉ không hợp lệ', 400);
	if (hasCredits && Number(credits) === 0)
		throw httpErr('Số tín chỉ phải lớn hơn 0 — không đủ điều kiện thì từ chối ghi nhận', 400);
	const pool = await getPool();
	if (approve && !hasCredits) {
		const cur = (
			await pool
				.request()
				.input('id', sql.VarChar(20), id)
				.query('SELECT credits FROM cme_records WHERE id = @id')
		).recordset[0];
		if (!cur) return null;
		if (!(Number(cur.credits) > 0))
			throw httpErr('Ghi nhận chưa có số tín chỉ — vui lòng nhập số tín chỉ khi duyệt', 400);
	}
	const r = await pool
		.request()
		.input('id', sql.VarChar(20), id)
		.input('status', sql.VarChar(20), approve ? 'approved' : 'rejected')
		.input('reason', sql.NVarChar(500), approve ? null : String(reason).trim())
		.input('actor', sql.VarChar(20), actorId)
		.input('credits', sql.Decimal(6, 2), hasCredits ? Number(credits) : null)
		.query(`UPDATE cme_records SET approval_status = @status, reject_reason = @reason, reviewed_by = @actor,
		        reviewed_at = ${nowSql}, credits = COALESCE(@credits, credits) WHERE id = @id`);
	if (!r.rowsAffected[0]) return null;
	broadcast('update', { entity: 'cme_record' });
	return getById(id);
};

module.exports = {
	getAll,
	getById,
	create,
	update,
	updateMany,
	remove,
	removeMany,
	addEvidence,
	createMine,
	updateMine,
	removeMine,
	addEvidenceMine,
	assertApprovedMine,
	addResultFileMine,
	removeResultFileMine,
	RESULT_FILES_SQL,
	withResultFiles,
	review,
};
