const { getPool, sql } = require('../config/db');
const { broadcast } = require('./eventService');
const { paging } = require('../utils/paging');
const { ROLE, inputRoleId } = require('./roleCodes');
const { fmtDateVN: fmtDate } = require('../utils/vnDate');

const normalize = (c) => ({
	...c,
	defense_date: c.defense_date ? fmtDate(c.defense_date) : null,
	created_at: fmtDate(c.created_at),
	updated_at: c.updated_at ? fmtDate(c.updated_at) : undefined,
});

const MEMBER_JOIN = `
  SELECT cm.id, cm.council_id, cm.role, cm.user_id, cm.external_reviewer_id,
         COALESCE(u.full_name, er.full_name) AS full_name,
         u.staff_number, u.department_id, d.name AS department_name,
         er.organization AS ext_organization,
         CASE WHEN cm.external_reviewer_id IS NOT NULL THEN 1 ELSE 0 END AS is_external
  FROM council_members cm
  LEFT JOIN users u ON u.id = cm.user_id
  LEFT JOIN departments d ON d.id = u.department_id
  LEFT JOIN external_reviewers er ON er.id = cm.external_reviewer_id
`;

// SQL trả is_external là INT (0/1) từ CASE WHEN, không phải BIT — ép về
// boolean thật ở đây để mọi nơi dùng MEMBER_JOIN không tự vẽ ra chữ "0"
// (JSX render số 0 chứ không ẩn như false/null khi dùng `cond && <x/>`).
const normalizeMember = (m) => m && { ...m, is_external: !!m.is_external };

const ROLE_ORDER = `CASE cm.role
  WHEN 'chairman' THEN 1 WHEN 'secretary' THEN 2
  WHEN 'reviewer1' THEN 3 WHEN 'reviewer2' THEN 4 ELSE 5 END`;

const getAll = async ({ page = 1, limit = 20, round_id, status } = {}) => {
	const pool = await getPool();
	const pg = paging(page, limit);
	let where = 'WHERE 1=1';
	const req = pool
		.request()
		.input('offset', sql.Int, pg.offset)
		.input('limit', sql.Int, pg.limit);

	if (round_id) {
		where += ' AND c.round_id = @round_id';
		req.input('round_id', sql.VarChar(10), round_id);
	}
	if (status) {
		where += ' AND c.status = @status';
		req.input('status', sql.VarChar(15), status);
	}

	const result = await req.query(`
    SELECT c.*, r.name AS round_name,
           (SELECT COUNT(*) FROM topics t WHERE t.council_id = c.id) AS topic_count,
           (SELECT COUNT(DISTINCT cm.role) FROM council_members cm WHERE cm.council_id = c.id) AS member_count,
           (SELECT TOP 1 cm.user_id FROM council_members cm WHERE cm.council_id = c.id AND cm.role = 'chairman') AS chairman_user_id,
           (SELECT TOP 1 COALESCE(u.full_name, er.full_name) FROM council_members cm
              LEFT JOIN users u ON u.id = cm.user_id
              LEFT JOIN external_reviewers er ON er.id = cm.external_reviewer_id
            WHERE cm.council_id = c.id AND cm.role = 'chairman') AS chairman_name,
           (SELECT STRING_AGG(CONCAT(
              CASE cm.role WHEN 'chairman' THEN N'CT' WHEN 'secretary' THEN N'TK'
                WHEN 'reviewer1' THEN N'PB1' WHEN 'reviewer2' THEN N'PB2' ELSE N'TV' END,
              ': ', COALESCE(u.full_name, er.full_name)), N', ') WITHIN GROUP (ORDER BY ${ROLE_ORDER})
            FROM council_members cm
              LEFT JOIN users u ON u.id = cm.user_id
              LEFT JOIN external_reviewers er ON er.id = cm.external_reviewer_id
            WHERE cm.council_id = c.id) AS members_summary
    FROM councils c
    LEFT JOIN research_rounds r ON r.id = c.round_id
    ${where}
    ORDER BY c.created_at DESC
    ${pg.fetchClause};

    SELECT COUNT(*) AS total FROM councils c ${where};

    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN c.status = 'draft' THEN 1 ELSE 0 END) AS draft,
      SUM(CASE WHEN c.status = 'finalized' THEN 1 ELSE 0 END) AS finalized,
      (SELECT COUNT(*) FROM topics t WHERE t.council_id IS NOT NULL) AS topic_sum
    FROM councils c;
  `);

	const statsRow = result.recordsets[2][0];
	return {
		data: result.recordsets[0].map(normalize),
		pagination: { page: pg.page, limit: pg.limit, total: result.recordsets[1][0].total },
		// Tổng quan toàn bộ hội đồng, bỏ qua bộ lọc round_id/status trên UI.
		stats: {
			total: statsRow.total,
			draft: statsRow.draft ?? 0,
			finalized: statsRow.finalized ?? 0,
			topicSum: statsRow.topic_sum ?? 0,
		},
	};
};

const getById = async (id) => {
	const pool = await getPool();
	const result = await pool.request().input('id', sql.VarChar(15), id).query(`
      SELECT c.*, r.name AS round_name
      FROM councils c
      LEFT JOIN research_rounds r ON r.id = c.round_id
      WHERE c.id = @id
    `);
	if (!result.recordset[0]) return null;
	const council = normalize(result.recordset[0]);

	const members = await pool
		.request()
		.input('council_id', sql.VarChar(15), id)
		.query(
			`${MEMBER_JOIN} WHERE cm.council_id = @council_id ORDER BY ${ROLE_ORDER}`,
		);
	council.members = members.recordset.map(normalizeMember);

	const topics = await pool.request().input('council_id', sql.VarChar(15), id)
		.query(`
      SELECT t.id, t.title, t.status, t.[session], t.department_id, d.name AS department_name
      FROM topics t
      LEFT JOIN departments d ON d.id = t.department_id
      WHERE t.council_id = @council_id
      ORDER BY t.created_at
    `);
	const subs = await pool.request().input('council_id', sql.VarChar(15), id)
		.query(`
      SELECT s.topic_id, s.role, s.user_id, u.full_name, u.staff_number,
             u.department_id, d.name AS department_name
      FROM council_seat_substitutes s
      INNER JOIN topics t ON t.id = s.topic_id
      LEFT JOIN users u ON u.id = s.user_id
      LEFT JOIN departments d ON d.id = u.department_id
      WHERE t.council_id = @council_id
    `);
	const subsByTopic = new Map();
	for (const s of subs.recordset) {
		if (!subsByTopic.has(s.topic_id)) subsByTopic.set(s.topic_id, []);
		subsByTopic.get(s.topic_id).push(s);
	}
	council.topics = topics.recordset.map((t) => ({
		...t,
		substitutes: subsByTopic.get(t.id) ?? [],
	}));

	return council;
};

const create = async (data, actorId) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('actor_id', sql.VarChar(20), actorId)
		.input('round_id', sql.VarChar(10), data.round_id)
		.input('name', sql.NVarChar(255), data.name)
		.input('specialty_group', sql.NVarChar(100), data.specialty_group || null)
		.input('location', sql.NVarChar(255), data.location || null)
		.input('defense_date', sql.Date, data.defense_date || null).query(`
      DECLARE @new_id VARCHAR(15);
      EXEC sp_gen_council_id @round_id, @new_id OUTPUT;
      EXEC sp_set_actor @actor_id;
      INSERT INTO councils (id, round_id, name, specialty_group, location, defense_date, status, created_by)
      VALUES (@new_id, @round_id, @name, @specialty_group, @location, @defense_date, 'draft', @actor_id);
      SELECT @new_id AS id;
    `);
	const council = await getById(result.recordset[0].id);
	broadcast('update', { entity: 'council' });
	return council;
};

const update = async (id, data, actorId) => {
	const pool = await getPool();
	const sets = [];
	const req = pool
		.request()
		.input('id', sql.VarChar(15), id)
		.input('actor_id', sql.VarChar(20), actorId);

	if (data.name !== undefined) {
		sets.push('name = @name');
		req.input('name', sql.NVarChar(255), data.name);
	}
	if (data.specialty_group !== undefined) {
		sets.push('specialty_group = @specialty_group');
		req.input('specialty_group', sql.NVarChar(100), data.specialty_group);
	}
	if (data.location !== undefined) {
		sets.push('location = @location');
		req.input('location', sql.NVarChar(255), data.location);
	}
	if (data.defense_date !== undefined) {
		sets.push('defense_date = @defense_date');
		req.input('defense_date', sql.Date, data.defense_date);
	}
	if (data.status !== undefined) {
		sets.push('status = @status');
		req.input('status', sql.VarChar(15), data.status);
	}

	if (sets.length) {
		await req.query(
			`EXEC sp_set_actor @actor_id; UPDATE councils SET ${sets.join(', ')} WHERE id = @id`,
		);
		broadcast('update', { entity: 'council' });
	}
	return getById(id);
};

const remove = async (id, actorId) => {
	const pool = await getPool();
	await pool
		.request()
		.input('id', sql.VarChar(15), id)
		.input('actor_id', sql.VarChar(20), actorId).query(`
      EXEC sp_set_actor @actor_id;
      UPDATE topics SET council_id = NULL WHERE council_id = @id;
      DELETE FROM council_members WHERE council_id = @id;
      DELETE FROM councils WHERE id = @id;
    `);
	broadcast('update', { entity: 'council' });
};

// ─── Members (5 seats: chairman/secretary/reviewer1/reviewer2/member) ─────────

const getMembers = async (councilId) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('council_id', sql.VarChar(15), councilId)
		.query(
			`${MEMBER_JOIN} WHERE cm.council_id = @council_id ORDER BY ${ROLE_ORDER}`,
		);
	return result.recordset.map(normalizeMember);
};

const getMemberById = async (memberId) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('id', sql.VarChar(25), memberId)
		.query(`${MEMBER_JOIN} WHERE cm.id = @id`);
	return normalizeMember(result.recordset[0]) || null;
};

// Ghế nhận đúng 1 trong 2: user_id (trong viện) hoặc external_reviewer_id
// (ngoài viện) — ràng buộc bởi CK_council_members_seat_owner ở DB.
const addMember = async (councilId, data, actorId) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('actor_id', sql.VarChar(20), actorId)
		.input('council_id', sql.VarChar(15), councilId)
		.input('user_id', sql.VarChar(20), data.user_id || null)
		.input('external_reviewer_id', sql.VarChar(20), data.external_reviewer_id || null)
		.input('role', sql.VarChar(15), data.role).query(`
      DECLARE @new_id VARCHAR(25);
      EXEC sp_gen_council_member_id @council_id, @new_id OUTPUT;
      EXEC sp_set_actor @actor_id;
      INSERT INTO council_members (id, council_id, user_id, external_reviewer_id, role, created_by)
      VALUES (@new_id, @council_id, @user_id, @external_reviewer_id, @role, @actor_id);
      SELECT @new_id AS id;
    `);
	broadcast('update', { entity: 'council' });
	return getMemberById(result.recordset[0].id);
};

const updateMember = async (councilId, memberId, data, actorId) => {
	const pool = await getPool();
	const sets = [];
	const req = pool
		.request()
		.input('id', sql.VarChar(25), memberId)
		.input('council_id', sql.VarChar(15), councilId)
		.input('actor_id', sql.VarChar(20), actorId);

	// Đổi ghế từ trong viện <-> ngoài viện phải set cả 2 cột cùng lúc (1 cột
	// NULL, 1 cột có giá trị) để không vi phạm CK_council_members_seat_owner.
	if (data.user_id !== undefined) {
		sets.push('user_id = @user_id');
		req.input('user_id', sql.VarChar(20), data.user_id);
	}
	if (data.external_reviewer_id !== undefined) {
		sets.push('external_reviewer_id = @external_reviewer_id');
		req.input('external_reviewer_id', sql.VarChar(20), data.external_reviewer_id);
	}
	if (data.role !== undefined) {
		sets.push('role = @role');
		req.input('role', sql.VarChar(15), data.role);
	}
	if (!sets.length) return getMemberById(memberId);

	await req.query(
		`EXEC sp_set_actor @actor_id; UPDATE council_members SET ${sets.join(', ')}, updated_at = GETDATE(), updated_by = @actor_id WHERE id = @id AND council_id = @council_id`,
	);
	broadcast('update', { entity: 'council' });
	return getMemberById(memberId);
};

// Danh sách người có thể ngồi ghế hội đồng: tài khoản cá nhân đang hoạt động
// (loại tài khoản khoa dùng chung), chưa có ghế trong hội đồng này.
// Người xung đột (tác giả / cùng khoa với đề tài đã gán) vẫn trả về kèm cờ conflict
// để UI cảnh báo nhưng cho phép chọn.
// Kèm học vị, hệ chuyên môn và cờ được duyệt ngồi HĐ/làm chủ tịch để UI hiển thị.
// type='external' tìm trong danh bạ người ngoài viện thay vì nhân viên.
const getEligibleUsers = async (councilId, search = '', type = 'internal') => {
	const pool = await getPool();

	if (type === 'external') {
		const req = pool.request().input('search', sql.NVarChar, `%${search}%`);
		const result = await req.query(`
      SELECT TOP 20 id, full_name, organization, specialty_group, phone, email
      FROM external_reviewers
      WHERE is_active = 1
        AND (@search = '%%' OR full_name LIKE @search OR organization LIKE @search)
      ORDER BY full_name
    `);
		return result.recordset.map((r) => ({ ...r, is_external: true }));
	}

	const req = pool
		.request()
		.input('council_id', sql.VarChar(15), councilId)
		.input('search', sql.NVarChar, `%${search}%`);
	await inputRoleId(req, 'dept_head_role', ROLE.DEPT_HEAD);

	const result = await req.query(`
    SELECT TOP 20 u.id, u.username, u.full_name, u.staff_number,
           u.department_id, d.name AS department_name,
           d.specialty_group, q.code AS qualification,
           u.can_sit_council, u.can_chair_council,
           CASE WHEN EXISTS (
             SELECT 1 FROM topic_members tm
             INNER JOIN topics t ON t.id = tm.topic_id
             WHERE t.council_id = @council_id AND tm.user_id = u.id
           ) THEN 1 ELSE 0 END AS is_author_conflict,
           CASE WHEN u.department_id IS NOT NULL AND EXISTS (
             SELECT 1 FROM topics t
             WHERE t.council_id = @council_id AND t.department_id = u.department_id
           ) THEN 1 ELSE 0 END AS is_dept_conflict
    FROM users u
    LEFT JOIN departments d ON d.id = u.department_id
    LEFT JOIN qualifications q ON q.id = u.qualification_id
    WHERE u.is_active = 1
      AND u.role_id <> @dept_head_role -- loại tài khoản khoa dùng chung khỏi nguồn thành viên hội đồng
      AND NOT EXISTS (
        SELECT 1 FROM council_members cm
        WHERE cm.council_id = @council_id AND cm.user_id = u.id
      )
      AND (@search = '%%'
        OR u.full_name LIKE @search
        OR u.username LIKE @search
        OR CAST(u.staff_number AS VARCHAR(20)) LIKE @search)
    ORDER BY u.can_sit_council DESC, u.full_name
  `);
	return result.recordset.map((u) => ({
		...u,
		is_external: false,
		can_sit_council: !!u.can_sit_council,
		can_chair_council: !!u.can_chair_council,
		is_author_conflict: !!u.is_author_conflict,
		is_dept_conflict: !!u.is_dept_conflict,
	}));
};

const removeMember = async (councilId, memberId, actorId) => {
	const pool = await getPool();
	await pool
		.request()
		.input('id', sql.VarChar(25), memberId)
		.input('council_id', sql.VarChar(15), councilId)
		.input('actor_id', sql.VarChar(20), actorId)
		.query(
			`EXEC sp_set_actor @actor_id; DELETE FROM council_members WHERE id = @id AND council_id = @council_id`,
		);
	broadcast('update', { entity: 'council' });
};

module.exports = {
	getAll,
	getById,
	create,
	update,
	remove,
	getMembers,
	addMember,
	updateMember,
	removeMember,
	getEligibleUsers,
};
