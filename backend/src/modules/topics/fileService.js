const { getPool, sql, withActorTransaction } = require('../../config/db');
const { broadcast } = require('../events/eventService');
const { removeUploadedFile } = require('../../utils/uploadPaths');
const { httpError } = require('../../utils/httpError');
const { genFileBatchId, genFileId } = require('../../utils/idGenerator');

// 1 lượt tải lên = 1 file_batches + các dòng files, trong 1 transaction (trước là
// sp_upload_files). file_batches.file_count do trigger trg_file_batch_count đếm.
const uploadFiles = async (topicId, filesData, batchNote, actorId) => {
	const result = await withActorTransaction(actorId, async (tx) => {
		const req = () =>
			tx
				.request()
				.input('topic_id', sql.VarChar(15), topicId)
				.input('actor_id', sql.VarChar(20), actorId);
		const topic = await req().query('SELECT 1 AS x FROM topics WHERE id = @topic_id');
		if (!topic.recordset.length) throw httpError(404, `Đề tài ${topicId} không tồn tại`);
		const batchId = await genFileBatchId(tx, topicId);
		await req()
			.input('batch_id', sql.VarChar(30), batchId)
			.input('note', sql.NVarChar(500), batchNote || null)
			.query(
				'INSERT INTO file_batches (id, topic_id, note, created_by) VALUES (@batch_id, @topic_id, @note, @actor_id)',
			);
		for (const f of filesData) {
			await req()
				.input('id', sql.VarChar(32), await genFileId(tx, topicId))
				.input('batch_id', sql.VarChar(30), batchId)
				.input('file_name', sql.NVarChar(500), f.file_name ?? null)
				.input('file_url', sql.VarChar(1000), f.file_url ?? null)
				.input('file_size', sql.BigInt, f.file_size ?? null)
				.input('mime_type', sql.VarChar(100), f.mime_type ?? null)
				.input('description', sql.NVarChar(sql.MAX), f.description ?? null).query(`
          INSERT INTO files (id, topic_id, batch_id, file_name, file_url, file_size, mime_type, description, created_by)
          VALUES (@id, @topic_id, @batch_id, @file_name, @file_url, @file_size, @mime_type, @description, @actor_id)`);
		}
		return { batch_id: batchId, files_uploaded: filesData.length };
	});
	broadcast('update', { entity: 'file' });
	return result;
};

// File của một đề tài luôn ít — trả toàn bộ, không phân trang
const getByTopic = async (topicId) => {
	const pool = await getPool();
	const result = await pool.request().input('topic_id', sql.VarChar(15), topicId).query(`
      SELECT f.*, u.full_name AS uploaded_by_name, fb.note AS batch_note
      FROM files f
      LEFT JOIN users u ON u.id = f.created_by
      LEFT JOIN file_batches fb ON fb.id = f.batch_id
      WHERE f.topic_id = @topic_id AND f.is_deleted = 'false'
      ORDER BY f.created_at DESC;
    `);
	// Giữ shape { data, pagination } để client không phải đổi type
	const data = result.recordset;
	return {
		data,
		pagination: { page: 1, limit: 0, total: data.length },
	};
};

const getBatches = async (topicId) => {
	const pool = await getPool();
	const result = await pool.request().input('topic_id', sql.VarChar(15), topicId).query(`
      SELECT fb.*, u.full_name AS uploaded_by_name,
             (SELECT COUNT(*) FROM files WHERE batch_id = fb.id AND is_deleted = 'false') AS file_count
      FROM file_batches fb
      LEFT JOIN users u ON u.id = fb.created_by
      WHERE fb.topic_id = @topic_id
      ORDER BY fb.created_at DESC
    `);
	return result.recordset;
};

const deleteFile = async (fileId, actorId) => {
	const pool = await getPool();

	// Lấy file_url trước khi xóa để xóa file vật lý
	const fileRow = await pool
		.request()
		.input('file_id', sql.VarChar(32), fileId)
		.query(`SELECT file_url FROM files WHERE id = @file_id AND is_deleted = 'false'`);

	if (!fileRow.recordset.length) {
		throw httpError(404, 'Không tìm thấy file');
	}

	// Soft-delete trong DB
	await withActorTransaction(actorId, (tx) =>
		tx
			.request()
			.input('file_id', sql.VarChar(32), fileId)
			.input('actor_id', sql.VarChar(20), actorId).query(`
      UPDATE files SET is_deleted = 'true', updated_at = GETDATE(), updated_by = @actor_id
      WHERE id = @file_id
    `),
	);

	// Xóa file vật lý (file_url dạng /uploads/topics/xxx/filename.pdf)
	removeUploadedFile(fileRow.recordset[0].file_url);
	broadcast('update', { entity: 'file' });
};

// Đề tài chứa file (chưa xóa); null nếu không có — dùng kiểm tra quyền trước khi xóa.
const findTopicId = async (fileId) => {
	const pool = await getPool();
	const { recordset } = await pool
		.request()
		.input('fid', sql.VarChar(32), fileId)
		.query(`SELECT topic_id FROM files WHERE id = @fid AND is_deleted = 'false'`);
	return recordset[0]?.topic_id ?? null;
};

module.exports = { uploadFiles, getByTopic, getBatches, deleteFile, findTopicId };
