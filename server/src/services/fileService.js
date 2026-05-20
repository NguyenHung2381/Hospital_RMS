const { getPool, sql } = require('../config/db');
const { broadcast } = require('./eventService');
const fs = require('fs');
const path = require('path');

const UPLOADS_ROOT = path.resolve(process.env.UPLOADS_DIR || 'uploads');

const uploadFiles = async (topicId, filesData, batchNote, actorId) => {
  const pool = await getPool();
  const result = await pool.request()
    .input('topic_id', sql.VarChar(15), topicId)
    .input('actor_id', sql.VarChar(20), actorId)
    .input('batch_note', sql.NVarChar(500), batchNote || null)
    .input('files_json', sql.NVarChar(sql.MAX), JSON.stringify(filesData))
    .execute('sp_upload_files');
  broadcast('update', { entity: 'topic' });
  return result.recordset[0];
};

const getByTopic = async (topicId, { page = 1, limit = 20 } = {}) => {
  const pool = await getPool();
  const offset = (page - 1) * limit;
  const result = await pool.request()
    .input('topic_id', sql.VarChar(15), topicId)
    .input('offset', sql.Int, offset)
    .input('limit', sql.Int, limit)
    .query(`
      SELECT f.*, u.full_name AS uploaded_by_name, fb.note AS batch_note
      FROM files f
      LEFT JOIN users u ON u.id = f.created_by
      LEFT JOIN file_batches fb ON fb.id = f.batch_id
      WHERE f.topic_id = @topic_id AND f.is_deleted = 0
      ORDER BY f.created_at DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;

      SELECT COUNT(*) AS total FROM files WHERE topic_id = @topic_id AND is_deleted = 0;
    `);
  return {
    data: result.recordsets[0],
    pagination: { page, limit, total: result.recordsets[1][0].total },
  };
};

const getBatches = async (topicId) => {
  const pool = await getPool();
  const result = await pool.request()
    .input('topic_id', sql.VarChar(15), topicId)
    .query(`
      SELECT fb.*, u.full_name AS uploaded_by_name,
             (SELECT COUNT(*) FROM files WHERE batch_id = fb.id AND is_deleted = 0) AS file_count
      FROM file_batches fb
      LEFT JOIN users u ON u.id = fb.created_by
      WHERE fb.topic_id = @topic_id
      ORDER BY fb.created_at DESC
    `);
  return result.recordset;
};

const deleteFile = async (fileId, actorId) => {
  const pool = await getPool();

  // Lấy file_url trước khi xoá để xoá file vật lý
  const fileRow = await pool.request()
    .input('file_id', sql.VarChar(32), fileId)
    .query(`SELECT file_url FROM files WHERE id = @file_id AND is_deleted = 0`);

  if (!fileRow.recordset.length) {
    const err = new Error('Không tìm thấy file');
    err.status = 404;
    throw err;
  }

  // Soft-delete trong DB
  await pool.request()
    .input('file_id', sql.VarChar(32), fileId)
    .input('actor_id', sql.VarChar(20), actorId)
    .query(`
      EXEC sp_set_actor @actor_id;
      UPDATE files SET is_deleted = 1, updated_at = GETDATE(), updated_by = @actor_id
      WHERE id = @file_id
    `);

  // Xoá file vật lý (file_url dạng /uploads/topics/xxx/filename.pdf)
  const fileUrl = fileRow.recordset[0].file_url;
  if (fileUrl && fileUrl.startsWith('/uploads/')) {
    const diskPath = path.join(UPLOADS_ROOT, fileUrl.replace('/uploads/', ''));
    fs.unlink(diskPath, () => {}); // bỏ qua lỗi nếu file không tồn tại
  }
  broadcast('update', { entity: 'topic' });
};

module.exports = { uploadFiles, getByTopic, getBatches, deleteFile };
