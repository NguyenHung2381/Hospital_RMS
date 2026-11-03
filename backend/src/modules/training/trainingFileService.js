const { getPool, sql, nowSql } = require('../../config/db');
const { randomId } = require('../../utils/idGenerator');
const { removeUploadedFile } = require('../../utils/uploadPaths');

// multer/busboy đọc tên file từ header multipart bằng latin1 theo mặc định,
// nên tên có dấu (UTF-8) bị lỗi (mojibake) nếu không giải mã lại — cùng lỗi
// và cùng cách sửa đã áp dụng cho NCKH (xem fileController.js,
// councilProgressController.js).
const decodeOriginalName = (name) => Buffer.from(name, 'latin1').toString('utf8');

// Ghi 1 dòng training_files từ file multer đã lưu lên đĩa — dùng chung cho
// hồ sơ học viên, tài liệu/bài kiểm tra khóa học, file chứng chỉ.
const saveUploadedFile = async (entityType, entityId, file, actorId) => {
	const pool = await getPool();
	const relativeUrl = `/uploads/training/${entityType}/${entityId}/${file.filename}`;
	const newId = randomId('TF', 18);
	await pool
		.request()
		.input('entity_type', sql.VarChar(30), entityType)
		.input('entity_id', sql.VarChar(20), entityId)
		.input('file_name', sql.NVarChar(255), decodeOriginalName(file.originalname))
		.input('file_url', sql.NVarChar(500), relativeUrl)
		.input('mime_type', sql.VarChar(150), file.mimetype || null)
		.input('file_size', sql.BigInt, file.size || null)
		.input('actor_id', sql.VarChar(20), actorId)
		.input('new_id', sql.VarChar(20), newId).query(`
      INSERT INTO training_files (id, entity_type, entity_id, file_name, file_url, mime_type, file_size, created_by)
      VALUES (@new_id, @entity_type, @entity_id, @file_name, @file_url, @mime_type, @file_size, @actor_id)
    `);
	const r = await pool
		.request()
		.input('id', sql.VarChar(20), newId)
		.query('SELECT * FROM training_files WHERE id = @id');
	return r.recordset[0];
};

const getById = async (fileId) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('id', sql.VarChar(20), fileId)
		.query("SELECT * FROM training_files WHERE id = @id AND is_deleted = 'false'");
	return r.recordset[0] || null;
};

// Soft-delete trong DB + xóa file vật lý (bỏ qua lỗi nếu file không tồn tại).
const softDelete = async (fileId, actorId) => {
	const pool = await getPool();
	const file = await getById(fileId);
	if (!file) return;
	await pool
		.request()
		.input('id', sql.VarChar(20), fileId)
		.input('actor_id', sql.VarChar(20), actorId || null)
		.query(
			`UPDATE training_files SET is_deleted = 'true', updated_at = ${nowSql}, updated_by = @actor_id WHERE id = @id`,
		);
	removeUploadedFile(file.file_url);
};

module.exports = { saveUploadedFile, getById, softDelete, decodeOriginalName };
