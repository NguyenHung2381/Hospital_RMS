const { getPool, sql } = require('../config/db');
const notifSvc = require('./notificationService');
const { broadcast } = require('./eventService');
const { paging } = require('../utils/paging');

const getAll = async (filters, actor = null) => {
	const {
		page = 1,
		limit = 20,
		search,
		round_id,
		department_id,
		status,
		category_id,
		level_id,
		participant_id,
		year,
		article_type,
	} = filters || {};

	const pool = await getPool();
	const pg = paging(page, limit);

	let where = 'WHERE 1=1';
	const req = pool
		.request()
		.input('offset', sql.Int, pg.offset)
		.input('limit', sql.Int, pg.limit);

	// Lọc theo role: manager chỉ thấy khoa mình, member chỉ thấy đề tài tham gia
	if (actor) {
		if (actor.account_type === 'manager') {
			where += ' AND t.department_id = @actor_dept';
			req.input('actor_dept', sql.VarChar(20), actor.department_id);
		} else if (actor.account_type === 'member') {
			where += ` AND EXISTS (
        SELECT 1 FROM topic_members WHERE topic_id = t.id AND user_id = @actor_id
      )`;
			req.input('actor_id', sql.VarChar(20), actor.id);
		}
		// admin: không giới hạn
	}

	if (search) {
		where += ' AND (t.title LIKE @search OR t.description LIKE @search)';
		req.input('search', sql.NVarChar, `%${search}%`);
	}
	if (round_id) {
		where += ' AND t.round_id = @round_id';
		req.input('round_id', sql.VarChar(10), round_id);
	}
	if (department_id && actor?.account_type === 'admin') {
		// manager đã bị khoá cứng theo khoa, chỉ admin mới lọc theo department_id tuỳ ý
		where += ' AND t.department_id = @dept';
		req.input('dept', sql.VarChar(20), department_id);
	}
	if (status) {
		where += ' AND t.status = @status';
		req.input('status', sql.VarChar(15), status);
	}
	if (category_id) {
		where += ' AND t.category_id = @cat';
		req.input('cat', sql.VarChar(6), category_id);
	}
	if (level_id) {
		where += ' AND t.level_id = @lvl';
		req.input('lvl', sql.VarChar(5), level_id);
	}
	if (participant_id && actor?.account_type === 'admin') {
		// Chỉ admin mới lọc theo participant_id tuỳ ý (member đã tự động lọc)
		where += ` AND (t.created_by = @participant_id OR EXISTS (
      SELECT 1 FROM topic_members WHERE topic_id = t.id AND user_id = @participant_id
    ))`;
		req.input('participant_id', sql.VarChar(20), participant_id);
	}
	if (year) {
		where += ' AND r.year = @year';
		req.input('year', sql.Int, parseInt(year, 10));
	}
	if (article_type) {
		where += ' AND t.article_type = @article_type';
		req.input('article_type', sql.VarChar(20), article_type);
	}

	const result = await req.query(`
    SELECT t.id, t.title, t.description, t.status, t.created_at,
           t.round_id, r.name AS round_name, r.year AS round_year,
           t.category_id, c.name AS category_name,
           t.level_id, l.name AS level_name,
           t.department_id, d.name AS department_name,
           t.created_by, u.full_name AS created_by_name,
           t.article_type, t.journal_name, t.doi, t.publish_date,
           (SELECT COUNT(*) FROM topic_members tm WHERE tm.topic_id = t.id) AS member_count,
           0 AS progress
    FROM topics t
    LEFT JOIN research_rounds r ON r.id = t.round_id
    LEFT JOIN categories c ON c.id = t.category_id
    LEFT JOIN levels l ON l.id = t.level_id
    LEFT JOIN departments d ON d.id = t.department_id
    LEFT JOIN users u ON u.id = t.created_by
    ${where}
    ORDER BY t.created_at DESC
    ${pg.fetchClause};

    SELECT COUNT(*) AS total FROM topics t
    LEFT JOIN research_rounds r ON r.id = t.round_id
    ${where};
  `);

	return {
		data: result.recordsets[0],
		pagination: { page: pg.page, limit: pg.limit, total: result.recordsets[1][0].total },
	};
};

const getById = async (id, actor = null) => {
	const pool = await getPool();
	const result = await pool.request().input('id', sql.VarChar(15), id).query(`
      SELECT t.*, r.name AS round_name, c.name AS category_name,
             l.name AS level_name, d.name AS department_name,
             u.full_name AS created_by_name
      FROM topics t
      LEFT JOIN research_rounds r ON r.id = t.round_id
      LEFT JOIN categories c ON c.id = t.category_id
      LEFT JOIN levels l ON l.id = t.level_id
      LEFT JOIN departments d ON d.id = t.department_id
      LEFT JOIN users u ON u.id = t.created_by
      WHERE t.id = @id
    `);

	if (!result.recordset[0]) return null;
	const topic = result.recordset[0];

	// Kiểm tra quyền xem chi tiết
	if (actor && actor.account_type !== 'admin') {
		if (actor.account_type === 'manager') {
			if (topic.department_id !== actor.department_id) {
				throw Object.assign(new Error('Không có quyền xem đề tài này'), {
					status: 403,
				});
			}
		} else if (actor.account_type === 'member') {
			const access = await pool
				.request()
				.input('topic_id', sql.VarChar(15), id)
				.input('user_id', sql.VarChar(20), actor.id).query(`
          SELECT 1 AS ok FROM topic_members
          WHERE topic_id = @topic_id AND user_id = @user_id
        `);
			if (!access.recordset[0]) {
				throw Object.assign(new Error('Không có quyền xem đề tài này'), {
					status: 403,
				});
			}
		}
	}

	// Get members
	const members = await pool.request().input('topic_id', sql.VarChar(15), id)
		.query(`
      SELECT tm.id, tm.name AS ho_ten, tm.email, tm.phone_number AS so_dien_thoai, tm.position AS chuc_vu, tm.role,
             tm.department_id,
             tm.account_granted, tm.user_id
      FROM topic_members tm WHERE tm.topic_id = @topic_id
    `);
	topic.members = members.recordset;

	// Chuyên ngành liên quan (đề tài liên ngành, VD kế toán tích hợp CNTT)
	const related = await pool.request().input('topic_id', sql.VarChar(15), id)
		.query(`
      SELECT trd.department_id, d.name AS department_name
      FROM topic_related_departments trd
      LEFT JOIN departments d ON d.id = trd.department_id
      WHERE trd.topic_id = @topic_id
    `);
	topic.related_departments = related.recordset;

	return topic;
};

// Ghi đè danh sách chuyên ngành liên quan của đề tài
const setRelatedDepartments = async (topicId, ids) => {
	const pool = await getPool();
	const req = pool.request().input('topic_id', sql.VarChar(15), topicId);
	ids.forEach((d, i) => req.input(`d${i}`, sql.VarChar(20), d));
	await req.query(`
    DELETE FROM topic_related_departments WHERE topic_id = @topic_id;
    ${
			ids.length
				? `INSERT INTO topic_related_departments (topic_id, department_id)
           VALUES ${ids.map((_, i) => `(@topic_id, @d${i})`).join(', ')};`
				: ''
		}
  `);
};

const create = async (data, actorId) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('actor_id', sql.VarChar(20), actorId)
		.input('title', sql.NVarChar(500), data.title)
		.input('description', sql.NVarChar(sql.MAX), data.description || null)
		.input('round_id', sql.VarChar(10), data.round_id)
		.input('category_id', sql.VarChar(6), data.category_id || null)
		.input('level_id', sql.VarChar(5), data.level_id || null)
		.input('department_id', sql.VarChar(20), data.department_id || null)
		.input('article_type', sql.VarChar(20), data.article_type || 'de_tai')
		.input('journal_name', sql.NVarChar(255), data.journal_name || null)
		.input('doi', sql.VarChar(100), data.doi || null)
		.input('publish_date', sql.Date, data.publish_date || null).query(`
      DECLARE @new_id VARCHAR(15);
      EXEC sp_gen_topic_id @category_id, @round_id, @new_id OUTPUT;
      EXEC sp_set_actor @actor_id;
      INSERT INTO topics (id, title, description, round_id, category_id, level_id, department_id, status, created_by, article_type, journal_name, doi, publish_date)
      VALUES (@new_id, @title, @description, @round_id, @category_id, @level_id, @department_id, 'submitted', @actor_id, @article_type, @journal_name, @doi, @publish_date);
      SELECT @new_id AS id;
    `);
	if (Array.isArray(data.related_department_ids) && data.related_department_ids.length)
		await setRelatedDepartments(
			result.recordset[0].id,
			data.related_department_ids,
		);
	const topic = await getById(result.recordset[0].id);
	broadcast('update', { entity: 'topic' });
	return topic;
};

const update = async (id, data, actorId, isAdmin = false) => {
	const pool = await getPool();

	const current = await getById(id);
	if (!current)
		throw Object.assign(new Error('Đề tài không tồn tại.'), { status: 404 });

	if (
		!isAdmin &&
		current.status !== 'submitted' &&
		current.status !== 'supplement'
	) {
		throw Object.assign(
			new Error(
				'Chỉ có thể chỉnh sửa đề tài ở trạng thái "Chờ duyệt" hoặc "Bổ sung".',
			),
			{ status: 403 },
		);
	}

	const sets = [];
	const req = pool
		.request()
		.input('id', sql.VarChar(15), id)
		.input('actor_id', sql.VarChar(20), actorId);

	if (data.title !== undefined) {
		sets.push('title = @title');
		req.input('title', sql.NVarChar(500), data.title);
	}
	if (data.description !== undefined) {
		sets.push('description = @description');
		req.input('description', sql.NVarChar(sql.MAX), data.description);
	}
	if (data.category_id !== undefined) {
		sets.push('category_id = @cat');
		req.input('cat', sql.VarChar(6), data.category_id);
	}
	if (data.level_id !== undefined) {
		sets.push('level_id = @lvl');
		req.input('lvl', sql.VarChar(5), data.level_id);
	}
	if (data.department_id !== undefined) {
		sets.push('department_id = @dept');
		req.input('dept', sql.VarChar(20), data.department_id);
	}
	if (data.round_id !== undefined) {
		sets.push('round_id = @round_id');
		req.input('round_id', sql.VarChar(10), data.round_id);
	}
	if (data.status !== undefined) {
		sets.push('status = @status');
		req.input('status', sql.VarChar(15), data.status);
	}
	if (data.article_type !== undefined) {
		sets.push('article_type = @article_type');
		req.input('article_type', sql.VarChar(20), data.article_type);
	}
	if (data.journal_name !== undefined) {
		sets.push('journal_name = @journal_name');
		req.input('journal_name', sql.NVarChar(255), data.journal_name || null);
	}
	if (data.doi !== undefined) {
		sets.push('doi = @doi');
		req.input('doi', sql.VarChar(100), data.doi || null);
	}
	if (data.publish_date !== undefined) {
		sets.push('publish_date = @publish_date');
		req.input('publish_date', sql.Date, data.publish_date || null);
	}

	const relatedChanged = Array.isArray(data.related_department_ids);
	if (relatedChanged)
		await setRelatedDepartments(id, data.related_department_ids);

	if (!sets.length) {
		if (relatedChanged) broadcast('update', { entity: 'topic' });
		return getById(id);
	}
	sets.push('updated_at = GETDATE()', 'updated_by = @actor_id');
	await req.query(
		`EXEC sp_set_actor @actor_id; UPDATE topics SET ${sets.join(', ')} WHERE id = @id`,
	);
	const topic = await getById(id);
	broadcast('update', { entity: 'topic' });
	return topic;
};

const remove = async (id, actorId) => {
	const pool = await getPool();
	// Phải NULL hóa FK trên users trước khi xóa topic (cascade xóa topic_members)
	await pool.request().input('topic_id', sql.VarChar(15), id).query(`
      UPDATE u SET u.topic_member_id = NULL
      FROM users u
      JOIN topic_members tm ON tm.id = u.topic_member_id
      WHERE tm.topic_id = @topic_id
    `);
	await pool
		.request()
		.input('id', sql.VarChar(15), id)
		.input('actor_id', sql.VarChar(20), actorId)
		.query(`EXEC sp_set_actor @actor_id; DELETE FROM topics WHERE id = @id`);
	broadcast('update', { entity: 'topic' });
};

const approve = async (topicId, status, comment, actorId) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('actor_id', sql.VarChar(20), actorId)
		.input('topic_id', sql.VarChar(15), topicId)
		.input('decision', sql.VarChar(15), status)
		.input('comment', sql.NVarChar(sql.MAX), comment || null)
		.execute('sp_approve_topic');

	// Notify topic creator + all members who have accounts
	const userRes = await pool
		.request()
		.input('topic_id', sql.VarChar(15), topicId).query(`
      SELECT DISTINCT uid FROM (
        SELECT created_by AS uid FROM topics WHERE id = @topic_id
        UNION
        SELECT user_id FROM topic_members WHERE topic_id = @topic_id AND user_id IS NOT NULL
      ) x
    `);
	const ids = userRes.recordset.map((r) => r.uid).filter(Boolean);
	const type =
		status === 'approved'
			? 'topic_approved'
			: status === 'supplement'
				? 'topic_supplement_requested'
				: 'topic_rejected';
	const title =
		status === 'approved'
			? 'Đề tài của bạn đã được phê duyệt'
			: status === 'supplement'
				? 'Đề tài của bạn cần bổ sung thông tin'
				: 'Đề tài của bạn bị từ chối';
	await notifSvc.push(type, title, ids, {
		message: comment || null,
		refId: topicId,
		refType: 'topic',
	});

	broadcast('update', { entity: 'topic' });
	return result.recordset[0];
};

const submit = async (topicId, actorId) => {
	const pool = await getPool();
	await pool
		.request()
		.input('topic_id', sql.VarChar(15), topicId)
		.input('actor_id', sql.VarChar(20), actorId).query(`
      EXEC sp_set_actor @actor_id;
      UPDATE topics SET status = 'submitted', updated_at = GETDATE(), updated_by = @actor_id
      WHERE id = @topic_id AND status = 'supplement';
      -- Nộp lại: reset verdict cũ, nếu không getApprovals vẫn trả kết quả duyệt lần trước
      IF @@ROWCOUNT > 0
        UPDATE approvals SET status = 'pending', comment = NULL,
          updated_at = GETDATE(), updated_by = @actor_id
        WHERE topic_id = @topic_id;
    `);

	// Notify all admin/manager accounts
	const adminRes = await pool
		.request()
		.query(
			`SELECT id FROM users WHERE account_type IN ('admin', 'manager') AND is_active = 1`,
		);
	const ids = adminRes.recordset.map((r) => r.id);
	await notifSvc.push('topic_submitted', 'Có đề tài mới cần xét duyệt', ids, {
		refId: topicId,
		refType: 'topic',
	});

	const topic = await getById(topicId);
	broadcast('update', { entity: 'topic' });
	return topic;
};

const getApprovals = async (topicId) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('topic_id', sql.VarChar(15), topicId).query(`
      SELECT a.*, u.full_name AS approver_name
      FROM approvals a
      LEFT JOIN users u ON u.id = a.created_by
      WHERE a.topic_id = @topic_id
      ORDER BY a.created_at DESC
    `);
	return result.recordset;
};

const getForExport = async (topicIds) => {
	if (!topicIds || topicIds.length === 0) return [];
	const pool = await getPool();

	const req = pool.request();
	topicIds.forEach((id, i) => req.input(`id${i}`, sql.VarChar(15), id));
	const idParams = topicIds.map((_, i) => `@id${i}`).join(',');

	const result = await req.query(`
    SELECT
      t.id, t.title, t.status, t.created_at,
      t.round_id, r.name AS round_name, r.year AS round_year,
      t.category_id, c.name AS category_name,
      t.level_id, l.name AS level_name,
      t.department_id, d.name AS department_name, d.specialty_group,
      t.created_by, u.full_name AS created_by_name,
      tm.id AS member_id, tm.name AS ho_ten, tm.role,
      tm.position AS chuc_vu, tm.email AS member_email, tm.phone_number AS so_dien_thoai,
      tm.staff_number
    FROM topics t
    LEFT JOIN research_rounds r ON r.id = t.round_id
    LEFT JOIN categories c ON c.id = t.category_id
    LEFT JOIN levels l ON l.id = t.level_id
    LEFT JOIN departments d ON d.id = t.department_id
    LEFT JOIN users u ON u.id = t.created_by
    LEFT JOIN topic_members tm ON tm.topic_id = t.id
    WHERE t.id IN (${idParams})
    ORDER BY t.created_at DESC,
      CASE tm.role WHEN 'leader' THEN 0 WHEN 'secretary' THEN 1 ELSE 2 END
  `);

	const topicsMap = new Map();
	for (const row of result.recordset) {
		if (!topicsMap.has(row.id)) {
			topicsMap.set(row.id, {
				id: row.id,
				title: row.title,
				status: row.status,
				created_at: row.created_at,
				round_id: row.round_id,
				round_name: row.round_name,
				round_year: row.round_year,
				category_id: row.category_id,
				category_name: row.category_name,
				level_id: row.level_id,
				level_name: row.level_name,
				department_id: row.department_id,
				department_name: row.department_name,
				specialty_group: row.specialty_group,
				created_by: row.created_by,
				created_by_name: row.created_by_name,
				members: [],
			});
		}
		if (row.member_id) {
			topicsMap.get(row.id).members.push({
				id: row.member_id,
				ho_ten: row.ho_ten,
				staff_number: row.staff_number,
				role: row.role,
				chuc_vu: row.chuc_vu,
				email: row.member_email,
				so_dien_thoai: row.so_dien_thoai,
			});
		}
	}

	return topicIds.map((id) => topicsMap.get(id)).filter(Boolean);
};

module.exports = {
	getAll,
	getById,
	create,
	update,
	remove,
	submit,
	approve,
	getApprovals,
	getForExport,
};
