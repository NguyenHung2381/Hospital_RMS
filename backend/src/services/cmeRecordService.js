/**
 * cmeRecordService.js — Ghi nhận tín chỉ CME ĐỘC LẬP, không bắt buộc qua 1
 * seminar cụ thể (tự học, học online, minh chứng đính kèm...). Khác cơ chế
 * hiện có (seminar_participants.cme_credits, luôn gắn 1 seminar_id) — xem
 * 2026-09-16_cme_records.sql. Trang "Cảnh báo tín chỉ CME" (cmeRequirementService
 * .getComplianceReport) đã cộng dồn cả 2 nguồn.
 */
const { getPool, sql } = require('../config/db');
const { broadcast } = require('./eventService');
const { paging } = require('../utils/paging');
const trainingFileService = require('./trainingFileService');

const recordSelect = `
  SELECT r.*, u.full_name AS user_name, u.staff_number, u.department_id, d.name AS department_name,
         c.name AS category_name, g.name AS group_name, f.file_name AS evidence_file_name, f.file_url AS evidence_file_url
  FROM cme_records r
  JOIN users u ON u.id = r.user_id
  LEFT JOIN departments d ON d.id = u.department_id
  LEFT JOIN cme_credit_categories c ON c.id = r.category_id
  LEFT JOIN cme_credit_groups g ON g.id = c.group_id
  LEFT JOIN training_files f ON f.id = r.evidence_file_id AND f.is_deleted = 0
`;

const getAll = async ({ page = 1, limit = 20, user_id, year, category_id } = {}) => {
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
	const whereSql = `WHERE ${where.join(' AND ')}`;

	const result = await req.query(`
    ${recordSelect} ${whereSql} ORDER BY r.activity_date DESC, r.created_at DESC
    ${pg.fetchClause};
    SELECT COUNT(*) AS total FROM cme_records r ${whereSql};
  `);
	return {
		data: result.recordsets[0],
		pagination: { page: pg.page, limit: pg.limit, total: result.recordsets[1][0].total },
	};
};

const getById = async (id) => {
	const pool = await getPool();
	const result = await pool.request().input('id', sql.VarChar(20), id).query(`${recordSelect} WHERE r.id = @id`);
	return result.recordset[0] || null;
};

// opts.fetch=false: bỏ query đọc lại bản ghi — dùng cho import hàng loạt
const create = async (data, actorId, { fetch = true } = {}) => {
	const pool = await getPool();
	const result = await pool
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
		.query(`
      DECLARE @new_id VARCHAR(20) = 'CM' + LEFT(REPLACE(NEWID(),'-',''), 18);
      INSERT INTO cme_records (id, user_id, category_id, title, activity_date, end_date, year, role, quantity, credits, note, created_by)
      VALUES (@new_id, @user_id, @category_id, @title, @activity_date, @end_date, @year, @role, @quantity, @credits, @note, @actor_id);
      SELECT @new_id AS id;
    `);
	const id = result.recordset[0].id;
	broadcast('update', { entity: 'cme_record' });
	return fetch ? getById(id) : { id };
};

const update = async (id, data, actorId) => {
	const pool = await getPool();
	const sets = ['updated_at = GETDATE()', 'updated_by = @actor_id'];
	const req = pool.request().input('id', sql.VarChar(20), id).input('actor_id', sql.VarChar(20), actorId);

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
	// year là cột thường: đổi ngày hoạt động thì cập nhật theo, trừ khi truyền year rõ ràng
	if (data.year === undefined && data.activity_date) data = { ...data, year: new Date(data.activity_date).getUTCFullYear() };
	fieldMap.year = sql.Int;
	for (const [field, type] of Object.entries(fieldMap)) {
		if (data[field] !== undefined) {
			sets.push(`${field} = @${field}`);
			req.input(field, type, data[field] === '' ? null : data[field]);
		}
	}
	await req.query(`UPDATE cme_records SET ${sets.join(', ')} WHERE id = @id`);
	broadcast('update', { entity: 'cme_record' });
	return getById(id);
};

const remove = async (id, actorId) => {
	const pool = await getPool();
	const row = await pool
		.request()
		.input('id', sql.VarChar(20), id)
		.query('SELECT evidence_file_id FROM cme_records WHERE id = @id');
	await pool.request().input('id', sql.VarChar(20), id).query('DELETE FROM cme_records WHERE id = @id');
	if (row.recordset[0]?.evidence_file_id) {
		await trainingFileService.softDelete(row.recordset[0].evidence_file_id, actorId);
	}
	broadcast('update', { entity: 'cme_record' });
};

// Đính kèm minh chứng — tách thành bước riêng (id ghi nhận phải tồn tại
// trước, đúng convention thư mục upload dùng entity id — xem uploadTraining.js).
const addEvidence = async (id, file, actorId) => {
	const pool = await getPool();
	const savedFile = await trainingFileService.saveUploadedFile('cme_evidence', id, file, actorId);
	await pool
		.request()
		.input('id', sql.VarChar(20), id)
		.input('file_id', sql.VarChar(20), savedFile.id)
		.query('UPDATE cme_records SET evidence_file_id = @file_id WHERE id = @id');
	broadcast('update', { entity: 'cme_record' });
	return getById(id);
};

module.exports = { getAll, getById, create, update, remove, addEvidence };
