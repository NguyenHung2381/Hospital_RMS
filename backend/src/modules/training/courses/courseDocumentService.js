const { getPool, sql } = require('../../../config/db');
const { broadcast } = require('../../events/eventService');
const trainingFileService = require('../trainingFileService');
const { assertHttpUrl } = require('../../../utils/safeUrl');

// ─── Tài liệu / bài kiểm tra khóa học (course_documents) ────────────────────
// source_type 'file' (upload, kể cả video — giới hạn dung lượng xem
// modules/training/courses/courses.routes.js) hoặc 'link' (dán URL ngoài, không có file) — xem
// 2026-09-17_course_documents_link_support.
const listDocuments = async (courseId) => {
	const pool = await getPool();
	const r = await pool.request().input('course_id', sql.VarChar(20), courseId).query(`
    SELECT d.id, d.doc_type, d.title, d.is_public, d.exam_type, d.download_count, d.created_at,
           d.source_type, d.external_url,
           f.file_name, f.file_url, f.mime_type, f.file_size
    FROM course_documents d
    LEFT JOIN training_files f ON f.id = d.file_id AND f.is_deleted = 0
    WHERE d.course_id = @course_id
    ORDER BY d.created_at DESC
  `);
	return r.recordset;
};

const addDocument = async (courseId, data, file, actorId) => {
	const pool = await getPool();
	const sourceType = data.source_type === 'link' ? 'link' : 'file';
	let fileId = null;
	if (sourceType === 'file') {
		const savedFile = await trainingFileService.saveUploadedFile(
			'course_document',
			courseId,
			file,
			actorId,
		);
		fileId = savedFile.id;
	}
	const result = await pool
		.request()
		.input('course_id', sql.VarChar(20), courseId)
		.input('doc_type', sql.VarChar(20), data.doc_type || 'material')
		.input(
			'title',
			sql.NVarChar(255),
			data.title || (file ? trainingFileService.decodeOriginalName(file.originalname) : 'Liên kết'),
		)
		.input('source_type', sql.VarChar(10), sourceType)
		.input('file_id', sql.VarChar(20), fileId)
		.input(
			'external_url',
			sql.NVarChar(500),
			sourceType === 'link' ? assertHttpUrl(data.external_url, 'Liên kết') : null,
		)
		.input('is_public', sql.Bit, data.is_public === 'false' || data.is_public === false ? 0 : 1)
		.input('exam_type', sql.VarChar(20), data.exam_type || null)
		.input('actor_id', sql.VarChar(20), actorId).query(`
      DECLARE @new_id VARCHAR(20);
      EXEC sp_gen_course_document_id @actor_id = @actor_id, @new_id = @new_id OUTPUT;
      INSERT INTO course_documents (id, course_id, doc_type, title, source_type, file_id, external_url, is_public, exam_type, created_by)
      VALUES (@new_id, @course_id, @doc_type, @title, @source_type, @file_id, @external_url, @is_public, @exam_type, @actor_id);
      SELECT @new_id AS id;
    `);
	broadcast('update', { entity: 'course_document' });
	return { id: result.recordset[0].id };
};

// Tăng lượt tải khi học viên/quản trị mở file — không kiểm tra quyền chi
// tiết hơn ở đây (route đã gate courses:read, ai xem được là tải được).
const incrementDocumentDownload = async (docId) => {
	const pool = await getPool();
	const result = await pool.request().input('id', sql.VarChar(20), docId).query(`
    UPDATE course_documents SET download_count = download_count + 1 WHERE id = @id;
    SELECT download_count FROM course_documents WHERE id = @id;
  `);
	if (!result.recordset[0]) {
		const err = new Error('Không tìm thấy tài liệu.');
		err.statusCode = 404;
		throw err;
	}
	return { download_count: result.recordset[0].download_count };
};

const removeDocument = async (docId, actorId) => {
	const pool = await getPool();
	const doc = await pool
		.request()
		.input('id', sql.VarChar(20), docId)
		.query('SELECT file_id FROM course_documents WHERE id = @id');
	if (!doc.recordset[0]) return;
	await pool
		.request()
		.input('id', sql.VarChar(20), docId)
		.query('DELETE FROM course_documents WHERE id = @id');
	if (doc.recordset[0].file_id)
		await trainingFileService.softDelete(doc.recordset[0].file_id, actorId);
	broadcast('update', { entity: 'course_document' });
};

module.exports = {
	listDocuments,
	addDocument,
	incrementDocumentDownload,
	removeDocument,
};
