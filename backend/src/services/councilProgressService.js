/**
 * councilProgressService.js — cổng đánh giá tiến độ đề tài của thành viên hội đồng.
 *
 * Quyền dựa trên ghế thực tế của người dùng với từng đề tài (ghế gốc trong
 * council_members, ghế thay thế theo đề tài trong council_seat_substitutes
 * ghi đè ghế gốc cùng vai): ai giữ ghế thì được đánh giá; riêng thư ký được
 * upload/xóa file đánh giá.
 *
 * File đánh giá tái dùng bảng files: batch có note = EVAL_NOTE.
 */
const { getPool, sql } = require('../config/db');
const fileService = require('./fileService');
const sanitizeHtml = require('sanitize-html');
const { stripUploadSignatures } = require('../utils/signedUpload');

const EVAL_NOTE = 'Đánh giá tiến độ của hội đồng'; // ponytail: phân biệt file đánh giá bằng note batch — thêm cột file_type nếu sau này cần chặt chẽ hơn
const MINUTES_NOTE = 'Biên bản họp hội đồng';

const RATINGS = ['on_track', 'behind', 'at_risk'];
const CONCLUSIONS = ['pass', 'fail', 'revise'];

// Nhận xét hỗ trợ định dạng chữ + chèn ảnh (HTML) — lọc trước khi lưu để chặn
// stored-XSS; ảnh chỉ được chèn qua uploadCommentImage nên src luôn bắt đầu
// bằng /uploads/, chặn javascript:/data: và ảnh từ nguồn ngoài.
const sanitizeComment = (html) => {
	if (!html) return null;
	const clean = sanitizeHtml(html, {
		allowedTags: [
			'b',
			'strong',
			'i',
			'em',
			'u',
			's',
			'ul',
			'ol',
			'li',
			'br',
			'p',
			'img',
		],
		allowedAttributes: { img: ['src', 'alt'] },
		exclusiveFilter: (frame) =>
			frame.tag === 'img' && !frame.attribs.src?.startsWith('/uploads/'),
	});
	// Ảnh hiển thị trên trình soạn thảo mang src đã ký (có hạn) — lưu đường dẫn
	// gốc, response sau sẽ ký lại.
	return stripUploadSignatures(clean) || null;
};

// Ghế thực tế của user với các đề tài: ghế thay thế ghi đè ghế gốc cùng vai.
const SEAT_CTE = `
  SELECT t.id AS topic_id, cm.role
  FROM council_members cm
  INNER JOIN topics t ON t.council_id = cm.council_id
  WHERE cm.user_id = @user_id
    AND NOT EXISTS (
      SELECT 1 FROM council_seat_substitutes s
      WHERE s.topic_id = t.id AND s.role = cm.role
    )
  UNION
  SELECT s.topic_id, s.role
  FROM council_seat_substitutes s
  WHERE s.user_id = @user_id
`;

// Các vai của user với một đề tài (thường 1, có thể nhiều nếu vừa ghế gốc vừa thay thế).
const getRolesForTopic = async (topicId, userId) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('user_id', sql.VarChar(20), userId)
		.input('topic_id', sql.VarChar(15), topicId).query(`
      SELECT role FROM (${SEAT_CTE}) seat WHERE seat.topic_id = @topic_id
    `);
	return result.recordset.map((r) => r.role);
};

// Toàn bộ dữ liệu đánh giá tiến độ của user: đề tài theo hội đồng, đánh giá của
// cả hội đồng, file đánh giá — trả về phẳng, client tự gom nhóm theo hội đồng.
const getMyProgress = async (userId) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('user_id', sql.VarChar(20), userId)
		.input('eval_note', sql.NVarChar(500), EVAL_NOTE)
		.input('minutes_note', sql.NVarChar(500), MINUTES_NOTE).query(`
      SELECT seat.topic_id, seat.role INTO #seat FROM (${SEAT_CTE}) seat;

      SELECT s.topic_id AS id, s.role AS my_role,
             t.title, t.[session], t.status,
             d.name AS department_name, cat.name AS category_name,
             c.id AS council_id, c.name AS council_name, c.location,
             CONVERT(VARCHAR(10), c.defense_date, 103) AS defense_date,
             r.name AS round_name, r.year AS round_year
      FROM #seat s
      INNER JOIN topics t ON t.id = s.topic_id
      INNER JOIN councils c ON c.id = t.council_id
      LEFT JOIN departments d ON d.id = t.department_id
      LEFT JOIN categories cat ON cat.id = t.category_id
      LEFT JOIN research_rounds r ON r.id = c.round_id
      ORDER BY c.round_id DESC, c.id,
        CASE t.[session] WHEN 'morning' THEN 0 WHEN 'afternoon' THEN 1 ELSE 2 END,
        t.created_at;

      SELECT pr.topic_id, pr.user_id, pr.role, pr.progress_percent, pr.rating,
             pr.comment, u.full_name
      FROM council_progress_reviews pr
      LEFT JOIN users u ON u.id = pr.user_id
      WHERE pr.topic_id IN (SELECT topic_id FROM #seat);

      SELECT f.id, f.topic_id, f.file_name, f.file_url, f.file_size,
             f.created_by, u.full_name AS uploaded_by_name,
             CONVERT(VARCHAR(16), f.created_at, 120) AS created_at,
             CASE WHEN fb.note = @minutes_note THEN 1 ELSE 0 END AS is_minutes
      FROM files f
      INNER JOIN file_batches fb ON fb.id = f.batch_id
      LEFT JOIN users u ON u.id = f.created_by
      WHERE f.is_deleted = 0 AND fb.note IN (@eval_note, @minutes_note)
        AND f.topic_id IN (SELECT topic_id FROM #seat)
      ORDER BY f.created_at DESC;

      -- Tài liệu đề tài do chủ nhiệm/khoa tải lên (không phải file đánh giá/biên bản) — hội đồng xem để tham khảo khi đánh giá.
      SELECT f.id, f.topic_id, f.file_name, f.file_url, f.file_size,
             f.created_by, u.full_name AS uploaded_by_name,
             CONVERT(VARCHAR(16), f.created_at, 120) AS created_at
      FROM files f
      INNER JOIN file_batches fb ON fb.id = f.batch_id
      LEFT JOIN users u ON u.id = f.created_by
      WHERE f.is_deleted = 0
        AND (fb.note IS NULL OR fb.note NOT IN (@eval_note, @minutes_note))
        AND f.topic_id IN (SELECT topic_id FROM #seat)
      ORDER BY f.created_at DESC;

      SELECT tr.topic_id, tr.conclusion, tr.general_comment, tr.decided_by,
             u.full_name AS decided_by_name,
             CONVERT(VARCHAR(16), tr.updated_at, 120) AS updated_at
      FROM council_topic_results tr
      LEFT JOIN users u ON u.id = tr.decided_by
      WHERE tr.topic_id IN (SELECT topic_id FROM #seat);
    `);

	const [topics, reviews, files, topicFiles, results] = result.recordsets;
	const reviewsByTopic = new Map();
	for (const r of reviews) {
		if (!reviewsByTopic.has(r.topic_id)) reviewsByTopic.set(r.topic_id, []);
		reviewsByTopic.get(r.topic_id).push(r);
	}
	const evalFilesByTopic = new Map();
	const minutesFilesByTopic = new Map();
	for (const f of files) {
		const map = f.is_minutes ? minutesFilesByTopic : evalFilesByTopic;
		if (!map.has(f.topic_id)) map.set(f.topic_id, []);
		map.get(f.topic_id).push(f);
	}
	const topicFilesByTopic = new Map();
	for (const f of topicFiles) {
		if (!topicFilesByTopic.has(f.topic_id))
			topicFilesByTopic.set(f.topic_id, []);
		topicFilesByTopic.get(f.topic_id).push(f);
	}
	const resultByTopic = new Map(results.map((r) => [r.topic_id, r]));
	return topics.map((t) => ({
		...t,
		reviews: reviewsByTopic.get(t.id) ?? [],
		evaluation_files: evalFilesByTopic.get(t.id) ?? [],
		minutes_files: minutesFilesByTopic.get(t.id) ?? [],
		topic_files: topicFilesByTopic.get(t.id) ?? [],
		result: resultByTopic.get(t.id) ?? null,
	}));
};

const upsertReview = async (
	topicId,
	userId,
	{ progress_percent, rating, comment },
) => {
	if (rating != null && !RATINGS.includes(rating)) {
		throw Object.assign(new Error('Xếp loại tiến độ không hợp lệ.'), {
			status: 400,
		});
	}
	const roles = await getRolesForTopic(topicId, userId);
	if (!roles.length) {
		throw Object.assign(
			new Error('Bạn không có ghế trong hội đồng đánh giá đề tài này.'),
			{ status: 403 },
		);
	}
	const pool = await getPool();
	await pool
		.request()
		.input('topic_id', sql.VarChar(15), topicId)
		.input('user_id', sql.VarChar(20), userId)
		.input('role', sql.VarChar(15), roles[0])
		.input('progress_percent', sql.Int, progress_percent ?? null)
		.input('rating', sql.VarChar(15), rating || null)
		.input('comment', sql.NVarChar(sql.MAX), sanitizeComment(comment)).query(`
      UPDATE council_progress_reviews
      SET progress_percent = @progress_percent, rating = @rating,
          comment = @comment, role = @role, updated_at = GETDATE(), updated_by = @user_id
      WHERE topic_id = @topic_id AND user_id = @user_id;
      IF @@ROWCOUNT = 0
        INSERT INTO council_progress_reviews
          (topic_id, user_id, role, progress_percent, rating, comment, created_by)
        VALUES (@topic_id, @user_id, @role, @progress_percent, @rating, @comment, @user_id);
    `);
};

const assertSecretary = async (topicId, userId) => {
	const roles = await getRolesForTopic(topicId, userId);
	if (!roles.includes('secretary')) {
		throw Object.assign(
			new Error('Chỉ thư ký hội đồng được thao tác file đánh giá.'),
			{ status: 403 },
		);
	}
};

const assertChairman = async (topicId, userId) => {
	const roles = await getRolesForTopic(topicId, userId);
	if (!roles.includes('chairman')) {
		throw Object.assign(
			new Error('Chỉ chủ tịch hội đồng được chốt kết luận đề tài.'),
			{ status: 403 },
		);
	}
};

const upsertResult = async (
	topicId,
	userId,
	{ conclusion, general_comment },
) => {
	if (conclusion != null && !CONCLUSIONS.includes(conclusion)) {
		throw Object.assign(new Error('Kết luận không hợp lệ.'), {
			status: 400,
		});
	}
	await assertChairman(topicId, userId);
	const pool = await getPool();
	await pool
		.request()
		.input('topic_id', sql.VarChar(15), topicId)
		.input('user_id', sql.VarChar(20), userId)
		.input('conclusion', sql.VarChar(15), conclusion || null)
		.input(
			'general_comment',
			sql.NVarChar(sql.MAX),
			sanitizeComment(general_comment),
		).query(`
      UPDATE council_topic_results
      SET conclusion = @conclusion, general_comment = @general_comment,
          decided_by = @user_id, updated_at = GETDATE(), updated_by = @user_id
      WHERE topic_id = @topic_id;
      IF @@ROWCOUNT = 0
        INSERT INTO council_topic_results
          (topic_id, conclusion, general_comment, decided_by, updated_at, created_by, updated_by)
        VALUES (@topic_id, @conclusion, @general_comment, @user_id, GETDATE(), @user_id, @user_id);
    `);
};

const uploadEvalFiles = async (topicId, filesData, userId) => {
	return fileService.uploadFiles(topicId, filesData, EVAL_NOTE, userId);
};

const uploadMinutesFiles = async (topicId, filesData, userId) => {
	return fileService.uploadFiles(topicId, filesData, MINUTES_NOTE, userId);
};

// Ảnh chèn vào nhận xét (rich-text) — không lưu vào bảng files vì đây là ảnh
// minh hoạ trong nhận xét, không phải tài liệu đề tài. Bất kỳ ai có ghế trong
// hội đồng của đề tài đều được chèn ảnh vào nhận xét của chính mình.
const uploadCommentImage = async (topicId, userId, file) => {
	const roles = await getRolesForTopic(topicId, userId);
	if (!roles.length) {
		throw Object.assign(
			new Error('Bạn không có ghế trong hội đồng đánh giá đề tài này.'),
			{ status: 403 },
		);
	}
	return {
		url: `/uploads/topics/${topicId}/comments/${file.filename}`,
	};
};

const deleteEvalFileByNote = async (topicId, fileId, userId, note, label) => {
	await assertSecretary(topicId, userId);
	const pool = await getPool();
	const check = await pool
		.request()
		.input('file_id', sql.VarChar(32), fileId)
		.input('topic_id', sql.VarChar(15), topicId)
		.input('note', sql.NVarChar(500), note).query(`
      SELECT 1 FROM files f
      INNER JOIN file_batches fb ON fb.id = f.batch_id
      WHERE f.id = @file_id AND f.topic_id = @topic_id
        AND f.is_deleted = 0 AND fb.note = @note
    `);
	if (!check.recordset.length) {
		throw Object.assign(new Error(`Không tìm thấy file ${label}.`), {
			status: 404,
		});
	}
	await fileService.deleteFile(fileId, userId);
};

const deleteEvalFile = (topicId, fileId, userId) =>
	deleteEvalFileByNote(topicId, fileId, userId, EVAL_NOTE, 'đánh giá');

const deleteMinutesFile = (topicId, fileId, userId) =>
	deleteEvalFileByNote(topicId, fileId, userId, MINUTES_NOTE, 'biên bản');

// Số đề tài user đang giữ ghế (gốc hoặc thay thế) — để client biết có hiển thị
// mục "Đánh giá tiến độ" hay không. Truy vấn nhẹ, chỉ đếm.
const getMySeatCount = async (userId) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('user_id', sql.VarChar(20), userId).query(`
      SELECT COUNT(*) AS n FROM (
        SELECT DISTINCT topic_id FROM (${SEAT_CTE}) seat
      ) x
    `);
	return result.recordset[0]?.n ?? 0;
};

module.exports = {
	getMyProgress,
	getMySeatCount,
	getRolesForTopic,
	upsertReview,
	assertSecretary,
	assertChairman,
	upsertResult,
	uploadEvalFiles,
	uploadMinutesFiles,
	uploadCommentImage,
	deleteEvalFile,
	deleteMinutesFile,
};
