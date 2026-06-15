const { getPool, sql } = require('../config/db');
const bcrypt = require('bcryptjs');
const notifSvc = require('./notificationService');
const { broadcast } = require('./eventService');

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
	} = filters || {};

	const pool = await getPool();
	const offset = (page - 1) * limit;

	let where = 'WHERE 1=1';
	const req = pool
		.request()
		.input('offset', sql.Int, offset)
		.input('limit', sql.Int, Number(limit));

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

	const result = await req.query(`
    SELECT t.id, t.title, t.description, t.status, t.created_at,
           t.round_id, r.name AS round_name, r.year AS round_year,
           t.category_id, c.name AS category_name,
           t.level_id, l.name AS level_name,
           t.department_id, d.name AS department_name,
           t.created_by, u.full_name AS created_by_name,
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
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;

    SELECT COUNT(*) AS total FROM topics t
    LEFT JOIN research_rounds r ON r.id = t.round_id
    ${where};
  `);

	return {
		data: result.recordsets[0],
		pagination: { page, limit, total: result.recordsets[1][0].total },
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
				throw Object.assign(new Error('Không có quyền xem đề tài này'), { status: 403 });
			}
		} else if (actor.account_type === 'member') {
			const access = await pool.request()
				.input('topic_id', sql.VarChar(15), id)
				.input('user_id', sql.VarChar(20), actor.id)
				.query(`
          SELECT 1 AS ok FROM topic_members
          WHERE topic_id = @topic_id AND user_id = @user_id
        `);
			if (!access.recordset[0]) {
				throw Object.assign(new Error('Không có quyền xem đề tài này'), { status: 403 });
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

	return topic;
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
		.input('department_id', sql.VarChar(20), data.department_id || null).query(`
      DECLARE @new_id VARCHAR(15);
      EXEC sp_gen_topic_id @category_id, @round_id, @new_id OUTPUT;
      EXEC sp_set_actor @actor_id;
      INSERT INTO topics (id, title, description, round_id, category_id, level_id, department_id, status, created_by)
      VALUES (@new_id, @title, @description, @round_id, @category_id, @level_id, @department_id, 'submitted', @actor_id);
      SELECT @new_id AS id;
    `);
	const topic = await getById(result.recordset[0].id);
	broadcast('update', { entity: 'topic' });
	return topic;
};

const update = async (id, data, actorId, isAdmin = false) => {
	const pool = await getPool();

	const current = await getById(id);
	if (!current)
		throw Object.assign(new Error('Đề tài không tồn tại.'), { status: 404 });

	// Kiểm tra xem hiện tại có đang trong cửa sổ bổ sung thông tin (supplement window) của đợt hay không
	let isWithinSupplementWindow = false;
	if (current.round_id) {
		const roundRes = await pool.request()
			.input('round_id', sql.VarChar(10), current.round_id)
			.query(`
				SELECT supplement_start_date, supplement_end_date
				FROM research_rounds
				WHERE id = @round_id
			`);
		const round = roundRes.recordset[0];
		if (round && round.supplement_start_date && round.supplement_end_date) {
			const today = new Date();
			today.setHours(0, 0, 0, 0);
			const start = new Date(round.supplement_start_date);
			start.setHours(0, 0, 0, 0);
			const end = new Date(round.supplement_end_date);
			end.setHours(0, 0, 0, 0);
			if (today >= start && today <= end) {
				isWithinSupplementWindow = true;
			}
		}
	}

	if (
		!isAdmin &&
		current.status !== 'submitted' &&
		current.status !== 'supplement' &&
		!(isWithinSupplementWindow && current.status === 'approved')
	) {
		throw Object.assign(
			new Error(
				'Chỉ có thể chỉnh sửa đề tài ở trạng thái "Chờ duyệt", "Bổ sung" hoặc trong đợt bổ sung thông tin.',
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

	if (!sets.length) return getById(id);
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
	await pool
		.request()
		.input('id', sql.VarChar(15), id)
		.input('actor_id', sql.VarChar(20), actorId)
		.query(`EXEC sp_set_actor @actor_id; DELETE FROM topics WHERE id = @id`);
	broadcast('update', { entity: 'topic' });
};

const getMembers = async (topicId) => {
	const pool = await getPool();

	// account_expires_at is added by migration 001 — use dynamic SQL so the query
	// doesn't crash if the migration hasn't been run yet
	const hasExpiry = await pool.request().query(`
    SELECT COUNT(*) AS c FROM sys.columns
    WHERE object_id = OBJECT_ID('users') AND name = 'account_expires_at'
  `);
	const expiryCol =
		hasExpiry.recordset[0].c > 0
			? ', u.account_expires_at'
			: ', NULL AS account_expires_at';

	const result = await pool
		.request()
		.input('topic_id', sql.VarChar(15), topicId).query(`
      SELECT
        tm.id, tm.topic_id, tm.role, tm.department_id,
        tm.staff_number, tm.user_id,
        tm.account_granted, tm.account_granted_at,
        tm.created_at, tm.created_by, tm.updated_at, tm.updated_by,
        tm.name          AS ho_ten,
        tm.email,
        tm.phone_number  AS so_dien_thoai,
        tm.position      AS chuc_vu,
        u.username,
        u.is_active      AS account_is_active${expiryCol},
        -- Kiểm tra xem thành viên đã có tài khoản trong hệ thống chưa (kể cả chưa liên kết qua user_id)
        CASE
          WHEN u.id IS NOT NULL THEN 0
          WHEN tm.staff_number IS NOT NULL AND EXISTS (
            SELECT 1 FROM users ux WHERE ux.staff_number = tm.staff_number
          ) THEN 1
          ELSE 0
        END AS has_existing_account
      FROM topic_members tm
      LEFT JOIN users u ON u.id = tm.user_id
      WHERE tm.topic_id = @topic_id
    `);
	return result.recordset;
};

const addMember = async (topicId, memberData, actorId) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('actor_id', sql.VarChar(20), actorId)
		.input('topic_id', sql.VarChar(15), topicId)
		.input('ho_ten', sql.NVarChar(200), memberData.ho_ten)
		.input('email', sql.VarChar(100), memberData.email || null)
		.input('so_dien_thoai', sql.VarChar(20), memberData.so_dien_thoai || null)
		.input('chuc_vu', sql.NVarChar(200), memberData.chuc_vu || null)
		.input('staff_number', sql.NVarChar(50), memberData.staff_number != null ? String(memberData.staff_number) : null)
		.input('department_id', sql.VarChar(20), memberData.department_id || null)
		.input('role', sql.VarChar(20), memberData.role || 'member').query(`
      BEGIN TRANSACTION;
      DECLARE @new_id VARCHAR(20);
      EXEC sp_gen_member_id @topic_id, @new_id OUTPUT;
      EXEC sp_set_actor @actor_id;
      INSERT INTO topic_members (id, topic_id, name, email, phone_number, position, staff_number, department_id, role, created_by)
      VALUES (@new_id, @topic_id, @ho_ten, @email, @so_dien_thoai, @chuc_vu, @staff_number, @department_id, @role, @actor_id);
      COMMIT TRANSACTION;
      SELECT @new_id AS id;
    `);
	broadcast('update', { entity: 'topic' });
	return result.recordset[0];
};

// Generate username from Vietnamese full name + staff_number
// e.g. "Nguyễn Văn A" + "123" → "NVA_0123"
const buildMemberUsername = (fullName, staffNumber) => {
	const initials = fullName
		.replace(
			/^(BS\.|TS\.|PGS\.|GS\.|ĐD\.|DS\.|CN\.|KS\.|ThS\.|BSCK\d*\.)\s*/i,
			'',
		)
		.split(/\s+/)
		.map((w) => w.charAt(0))
		.filter(Boolean)
		.join('')
		.toUpperCase();
	const padded = String(staffNumber).padStart(4, '0');
	return `${initials}_${padded}`;
};

const ensureUniqueUsername = async (pool, baseUsername, userId) => {
	let username = baseUsername;
	let suffix = 1;
	while (true) {
		// Tạo request mới mỗi lần để tránh lỗi "parameter already set"
		const existing = await pool
			.request()
			.input('username_check', sql.VarChar(100), username)
			.query(`SELECT TOP 1 id FROM users WHERE username = @username_check`);
		if (!existing.recordset[0] || existing.recordset[0].id === userId) {
			return username;
		}
		username = `${baseUsername}_${suffix}`;
		suffix += 1;
	}
};

const grantAccounts = async (topicId, memberIds, actorId) => {
	const pool = await getPool();

	const topicResult = await pool
		.request()
		.input('topic_id', sql.VarChar(15), topicId)
		.query(`SELECT id, status FROM topics WHERE id = @topic_id`);
	const topic = topicResult.recordset[0];
	if (!topic) {
		const err = new Error('Không tìm thấy đề tài');
		err.statusCode = 404;
		throw err;
	}
	if (topic.status !== 'approved' && topic.status !== 'in_progress') {
		const err = new Error(
			'Đề tài chưa được phê duyệt nên chưa thể cấp tài khoản thành viên',
		);
		err.statusCode = 400;
		throw err;
	}

	const missingEmailResult = await pool
		.request()
		.input('topic_id', sql.VarChar(15), topicId).query(`
			SELECT tm.name AS ho_ten
			FROM topic_members tm
			WHERE tm.topic_id = @topic_id
			  AND tm.account_granted = 0
			  AND (tm.email IS NULL OR LTRIM(RTRIM(tm.email)) = '')
		`);
	if (missingEmailResult.recordset.length > 0) {
		const names = missingEmailResult.recordset
			.map((row) => row.ho_ten)
			.filter(Boolean)
			.slice(0, 3)
			.join(', ');
		const suffix = missingEmailResult.recordset.length > 3 ? ', ...' : '';
		const err = new Error(
			`Không thể cấp tài khoản cho thành viên chưa có email: ${names}${suffix}`,
		);
		err.statusCode = 400;
		throw err;
	}

	// SP creates user rows with a placeholder password hash; returns newly-granted users
	const spResult = await pool
		.request()
		.input('topic_id', sql.VarChar(15), topicId)
		.input('actor_id', sql.VarChar(20), actorId)
		.execute('sp_grant_member_accounts');

	const newUsers = spResult.recordset || [];

	// Replace placeholder hash with default password "123456"
	const DEFAULT_PASSWORD = '123456';
	const defaultHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
	const credentials = [];
	for (const u of newUsers) {
		await pool
			.request()
			.input('uid', sql.VarChar(20), u.id)
			.input('hash', sql.VarChar(200), defaultHash)
			.query(`UPDATE users SET password = @hash WHERE id = @uid`);
		credentials.push({
			user_id: u.id,
			username: u.username,
			full_name: u.full_name,
			password_plain: DEFAULT_PASSWORD,
		});
	}

	// Override username with initials_staffnumber format for members who have staff_number
	if (newUsers.length > 0) {
		const newUserIds = newUsers.map((u) => `'${u.id}'`).join(',');
		const memberInfo = await pool.request().query(`
			SELECT tm.user_id, tm.name AS ho_ten, tm.staff_number
			FROM topic_members tm
			WHERE tm.topic_id = '${topicId}'
			  AND tm.user_id IN (${newUserIds})
			  AND tm.staff_number IS NOT NULL
		`);
		for (const row of memberInfo.recordset) {
			const username = buildMemberUsername(row.ho_ten, row.staff_number);
			await pool
				.request()
				.input('uid', sql.VarChar(20), row.user_id)
				.input('uname', sql.VarChar(100), username)
				.query(`UPDATE users SET username = @uname WHERE id = @uid`);
			const cred = credentials.find((c) => c.user_id === row.user_id);
			if (cred) cred.username = username;
		}
	}

	// Resolve member_id for each user from topic_members
	if (credentials.length > 0) {
		const tmResult = await pool
			.request()
			.input('topic_id', sql.VarChar(15), topicId)
			.query(
				`SELECT tm.id AS member_id, tm.user_id FROM topic_members tm WHERE tm.topic_id = @topic_id AND tm.user_id IS NOT NULL`,
			);
		const memberMap = Object.fromEntries(
			tmResult.recordset.map((r) => [r.user_id, r.member_id]),
		);
		credentials.forEach((c) => {
			c.member_id = memberMap[c.user_id] || null;
		});
	}

	// Set account_expires_at = round end_date (guarded: column may not exist until migration runs)
	const hasExpiry = await pool.request().query(`
    SELECT COUNT(*) AS c FROM sys.columns
    WHERE object_id = OBJECT_ID('users') AND name = 'account_expires_at'
  `);
	if (hasExpiry.recordset[0].c > 0) {
		await pool.request().input('topic_id', sql.VarChar(15), topicId).query(`
        UPDATE u SET u.account_expires_at = rr.end_date
        FROM users u
        INNER JOIN topic_members tm ON tm.user_id = u.id
        INNER JOIN topics t ON t.id = tm.topic_id
        INNER JOIN research_rounds rr ON rr.id = t.round_id
        WHERE t.id = @topic_id AND tm.account_granted = 1
      `);
	}

	broadcast('update', { entity: 'topic' });

	// Thông báo cho các tài khoản vừa được cấp
	const newUserIds = credentials.map(c => c.user_id);
	if (newUserIds.length > 0) {
		await notifSvc.push(
			'account_granted',
			'Tài khoản hệ thống đã được cấp',
			newUserIds,
			{
				message: `Tài khoản đã được cấp để tham gia đề tài ${topicId}. Vui lòng đăng nhập với mật khẩu mặc định (123456) và đổi mật khẩu ngay.`,
				refId: topicId,
				refType: 'topic',
			}
		);

		// Thông báo cho các tài khoản thuộc khoa của đề tài và chủ nhiệm đề tài
		const excludeList = newUserIds.map(id => `'${id}'`).join(',');
		const deptResult = await pool.request()
			.input('topic_id', sql.VarChar(15), topicId)
			.query(`
				SELECT DISTINCT u.id
				FROM users u
				INNER JOIN topics t ON t.department_id = u.department_id
				WHERE t.id = @topic_id
				  AND u.is_active = 1
				  AND u.id NOT IN (${excludeList})
				UNION
				SELECT tm.user_id
				FROM topic_members tm
				WHERE tm.topic_id = @topic_id
				  AND tm.role = 'chu_nhiem'
				  AND tm.user_id IS NOT NULL
				  AND tm.user_id NOT IN (${excludeList})
			`);
		const deptUserIds = deptResult.recordset.map(r => r.id);
		if (deptUserIds.length > 0) {
			await notifSvc.push(
				'account_granted',
				'Cấp tài khoản thành viên đề tài',
				deptUserIds,
				{
					message: `Đã cấp ${credentials.length} tài khoản cho thành viên đề tài ${topicId}. Thành viên mới có thể đăng nhập hệ thống.`,
					refId: topicId,
					refType: 'topic',
				}
			);
		}
	}

	return credentials;
};

const grantAccountsNoEmail = async (topicId, memberIds, actorId) => {
	const pool = await getPool();

	const topicResult = await pool
		.request()
		.input('topic_id', sql.VarChar(15), topicId)
		.query(`SELECT id, status FROM topics WHERE id = @topic_id`);
	const topic = topicResult.recordset[0];
	if (!topic) {
		const err = new Error('KhÃ´ng tÃ¬m tháº¥y Ä‘á» tÃ i');
		err.statusCode = 404;
		throw err;
	}
	if (topic.status !== 'approved' && topic.status !== 'in_progress') {
		const err = new Error(
			'Äá» tÃ i chÆ°a Ä‘Æ°á»£c phÃª duyá»‡t nÃªn chÆ°a thá»ƒ cáº¥p tÃ i khoáº£n thÃ nh viÃªn',
		);
		err.statusCode = 400;
		throw err;
	}

	const DEFAULT_PASSWORD = '123456';
	const defaultHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
	const credentials = [];
	const tx = new sql.Transaction(pool);
	await tx.begin();

	try {
		const memberRequest = new sql.Request(tx);
		memberRequest.input('topic_id', sql.VarChar(15), topicId);
		const membersResult = await memberRequest.query(`
			SELECT tm.id, tm.name AS ho_ten, tm.email, tm.staff_number,
			       t.department_id, rr.end_date
			FROM topic_members tm
			INNER JOIN topics t ON t.id = tm.topic_id
			INNER JOIN research_rounds rr ON rr.id = t.round_id
			WHERE tm.topic_id = @topic_id
			  AND tm.account_granted = 0
		`);

		const filterIds = Array.isArray(memberIds) && memberIds.length > 0 ? new Set(memberIds) : null;
		const allRows = membersResult.recordset;
		const filteredRows = filterIds ? allRows.filter((row) => filterIds.has(row.id)) : allRows;

		const skipped = filteredRows.filter(
			(row) => !row.staff_number,
		);
		const membersToProcess = filteredRows.filter(
			(row) => !!row.staff_number,
		);

		const deptCodeRequest = new sql.Request(tx);
		deptCodeRequest.input('topic_id', sql.VarChar(15), topicId);
		const deptCodeResult = await deptCodeRequest.query(`
			SELECT d.code
			FROM topics t
			INNER JOIN departments d ON d.id = t.department_id
			WHERE t.id = @topic_id
		`);
		const deptCode = deptCodeResult.recordset[0]?.code;
		if (!deptCode) {
			const err = new Error('KhÃ´ng xác định được khoa/phòng để tạo tài khoản');
			err.statusCode = 400;
			throw err;
		}

		for (const member of membersToProcess) {
			const staffNumber = Number(member.staff_number);
			const baseUsername = buildMemberUsername(member.ho_ten, staffNumber);

			const existingUserRequest = new sql.Request(tx);
			existingUserRequest
				.input('member_id', sql.VarChar(22), member.id)
				.input('staff_number', sql.Int, staffNumber)
				.input('email', sql.VarChar(255), member.email || null);
			const existingUserResult = await existingUserRequest.query(`
				SELECT TOP 1 id
				FROM users
				WHERE topic_member_id = @member_id
				   OR staff_number = @staff_number
				   OR (@email IS NOT NULL AND email = @email)
				ORDER BY CASE WHEN topic_member_id = @member_id THEN 0 ELSE 1 END,
				         CASE WHEN staff_number = @staff_number THEN 0 ELSE 1 END,
				         CASE WHEN @email IS NOT NULL AND email = @email THEN 0 ELSE 1 END
			`);

			let userId = existingUserResult.recordset[0]?.id;
			if (!userId) {
				const newIdRequest = new sql.Request(tx);
				newIdRequest
					.input('dept_code', sql.VarChar(20), deptCode)
					.input('is_dept_account', sql.Bit, 0)
					.output('new_id', sql.VarChar(20));
				await newIdRequest.execute('sp_gen_user_id');
				userId = newIdRequest.output.new_id;
				if (!userId) {
					const fallbackIdRequest = new sql.Request(tx);
					fallbackIdRequest.input('dept_code', sql.VarChar(20), deptCode);
					const fallbackIdResult = await fallbackIdRequest.query(`
						DECLARE @prefix VARCHAR(12) = 'NV' + @dept_code;
						DECLARE @count INT;
						SELECT @count = ISNULL(MAX(CAST(RIGHT(id,4) AS INT)), 0) + 1
						FROM users
						WHERE id LIKE @prefix + '[0-9][0-9][0-9][0-9]'
						  AND RIGHT(id,4) <> '0000';
						IF @count < 1 SET @count = 1;
						SELECT @prefix + RIGHT('0000' + CAST(@count AS VARCHAR(4)), 4) AS new_id;
					`);
					userId = fallbackIdResult.recordset[0]?.new_id;
				}
				if (!userId) {
					const err = new Error('KhÃ´ng sinh Ä‘Æ°á»£c mÃ£ tÃ i khoáº£n má»›i');
					err.statusCode = 500;
					throw err;
				}
			}

			const username = await ensureUniqueUsername(
				pool,
				baseUsername,
				userId,
			);
			const storedEmail =
				member.email && String(member.email).trim()
					? String(member.email).trim()
					: `${String(userId).toLowerCase()}@member.local`;

			if (existingUserResult.recordset[0]) {
				const updateUserRequest = new sql.Request(tx);
				updateUserRequest
					.input('uid', sql.VarChar(20), userId)
					.input('username', sql.VarChar(100), username)
					.input('password', sql.VarChar(255), defaultHash)
					.input('full_name', sql.NVarChar(255), member.ho_ten)
					.input('staff_number', sql.Int, staffNumber)
					.input('email', sql.VarChar(255), storedEmail)
					.input('department_id', sql.VarChar(20), member.department_id)
					.input('topic_member_id', sql.VarChar(22), member.id)
					.input('expires_at', sql.Date, member.end_date)
					.input('actor_id', sql.VarChar(20), actorId);
				await updateUserRequest.query(`
					UPDATE users
					SET username = @username,
					    password = @password,
					    full_name = @full_name,
					    staff_number = @staff_number,
					    email = @email,
					    department_id = @department_id,
					    role_id = 'VT06',
					    account_type = 'member',
					    is_active = 1,
					    topic_member_id = @topic_member_id,
					    account_expires_at = @expires_at,
					    updated_at = GETDATE(),
					    updated_by = @actor_id
					WHERE id = @uid
				`);
			} else {
				const createUserRequest = new sql.Request(tx);
				createUserRequest
					.input('uid', sql.VarChar(20), userId)
					.input('username', sql.VarChar(100), username)
					.input('password', sql.VarChar(255), defaultHash)
					.input('full_name', sql.NVarChar(255), member.ho_ten)
					.input('staff_number', sql.Int, staffNumber)
					.input('email', sql.VarChar(255), storedEmail)
					.input('department_id', sql.VarChar(20), member.department_id)
					.input('topic_member_id', sql.VarChar(22), member.id)
					.input('expires_at', sql.Date, member.end_date)
					.input('actor_id', sql.VarChar(20), actorId);
				await createUserRequest.query(`
					INSERT INTO users (
						id, username, password, full_name, staff_number, email,
						department_id, role_id, account_type, topic_member_id,
						account_expires_at, created_by
					)
					VALUES (
						@uid, @username, @password, @full_name, @staff_number, @email,
						@department_id, 'VT06', 'member', @topic_member_id,
						@expires_at, @actor_id
					)
				`);
			}

			const updateMemberRequest = new sql.Request(tx);
			updateMemberRequest
				.input('member_id', sql.VarChar(22), member.id)
				.input('uid', sql.VarChar(20), userId)
				.input('actor_id', sql.VarChar(20), actorId);
			await updateMemberRequest.query(`
				UPDATE topic_members
				SET user_id = @uid,
				    account_granted = 1,
				    account_granted_at = GETDATE(),
				    updated_at = GETDATE(),
				    updated_by = @actor_id
				WHERE id = @member_id
			`);

			credentials.push({
				member_id: member.id,
				user_id: userId,
				username,
				full_name: member.ho_ten,
				password_plain: DEFAULT_PASSWORD,
			});
		}

		await tx.commit();
		broadcast('update', { entity: 'topic' });

		// Thông báo cho tài khoản vừa được cấp
		const newUserIds = credentials.map(c => c.user_id);
		if (newUserIds.length > 0) {
			await notifSvc.push(
				'account_granted',
				'Tài khoản hệ thống đã được cấp',
				newUserIds,
				{
					message: `Tài khoản đã được cấp để tham gia đề tài ${topicId}. Vui lòng đăng nhập với mật khẩu mặc định (123456) và đổi mật khẩu ngay.`,
					refId: topicId,
					refType: 'topic',
				}
			);

			// Thông báo cho khoa và chủ nhiệm đề tài
			const excludeList = newUserIds.map(id => `'${id}'`).join(',');
			const deptResult = await pool.request()
				.input('topic_id', sql.VarChar(15), topicId)
				.query(`
					SELECT DISTINCT u.id
					FROM users u
					INNER JOIN topics t ON t.department_id = u.department_id
					WHERE t.id = @topic_id
					  AND u.is_active = 1
					  AND u.id NOT IN (${excludeList})
					UNION
					SELECT tm.user_id
					FROM topic_members tm
					WHERE tm.topic_id = @topic_id
					  AND tm.role = 'chu_nhiem'
					  AND tm.user_id IS NOT NULL
					  AND tm.user_id NOT IN (${excludeList})
				`);
			const deptUserIds = deptResult.recordset.map(r => r.id);
			if (deptUserIds.length > 0) {
				await notifSvc.push(
					'account_granted',
					'Cấp tài khoản thành viên đề tài',
					deptUserIds,
					{
						message: `Đã cấp ${credentials.length} tài khoản cho thành viên đề tài ${topicId}. Thành viên mới có thể đăng nhập hệ thống.`,
						refId: topicId,
						refType: 'topic',
					}
				);
			}
		}

		return {
			credentials,
			skipped: skipped.map((s) => ({ member_id: s.id, ho_ten: s.ho_ten, reason: 'missing_staff_number' })),
		};
	} catch (err) {
		console.error('Transaction error in grantAccountsNoEmail:', err);
		try {
			await tx.rollback();
		} catch {
			// ignore rollback error if transaction is already aborted
		}
		throw err;
	}
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
	const type = status === 'approved' ? 'topic_approved' : 'topic_rejected';
	const title =
		status === 'approved'
			? 'Đề tài của bạn đã được phê duyệt'
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
      WHERE id = @topic_id AND status = 'supplement'
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

const updateMember = async (topicId, memberId, data, actorId) => {
	const pool = await getPool();
	const sets = ['updated_at = GETDATE()', 'updated_by = @actor_id'];
	const req = pool
		.request()
		.input('id', sql.VarChar(20), memberId)
		.input('topic_id', sql.VarChar(15), topicId)
		.input('actor_id', sql.VarChar(20), actorId);

	if (data.ho_ten !== undefined) {
		sets.push('name = @ho_ten');
		req.input('ho_ten', sql.NVarChar(200), data.ho_ten);
	}
	if (data.email !== undefined) {
		sets.push('email = @email');
		req.input('email', sql.VarChar(100), data.email || null);
	}
	if (data.so_dien_thoai !== undefined) {
		sets.push('phone_number = @sdt');
		req.input('sdt', sql.VarChar(20), data.so_dien_thoai);
	}
	if (data.chuc_vu !== undefined) {
		sets.push('position = @chuc_vu');
		req.input('chuc_vu', sql.NVarChar(200), data.chuc_vu);
	}
	if (data.role !== undefined) {
		sets.push('role = @role');
		req.input('role', sql.VarChar(20), data.role);
	}
	if (data.department_id !== undefined) {
		sets.push('department_id = @department_id');
		req.input('department_id', sql.VarChar(20), data.department_id);
	}

	await req.query(
		`EXEC sp_set_actor @actor_id; UPDATE topic_members SET ${sets.join(', ')} WHERE id = @id AND topic_id = @topic_id`,
	);
	const result = await pool.request().input('id', sql.VarChar(20), memberId)
		.query(`
      SELECT
        tm.id, tm.topic_id, tm.role, tm.department_id,
        tm.staff_number, tm.user_id,
        tm.account_granted, tm.account_granted_at,
        tm.created_at, tm.created_by, tm.updated_at, tm.updated_by,
        tm.name         AS ho_ten,
        tm.email,
        tm.phone_number AS so_dien_thoai,
        tm.position     AS chuc_vu
      FROM topic_members tm WHERE tm.id = @id
    `);
	broadcast('update', { entity: 'topic' });
	return result.recordset[0] || null;
};

const deleteMember = async (topicId, memberId, actorId) => {
	const pool = await getPool();
	// Phải NULL hóa FK trên users trước khi xóa topic_members
	await pool
		.request()
		.input('id', sql.VarChar(20), memberId)
		.query(
			`UPDATE users SET topic_member_id = NULL WHERE topic_member_id = @id`,
		);
	await pool
		.request()
		.input('id', sql.VarChar(20), memberId)
		.input('topic_id', sql.VarChar(15), topicId)
		.input('actor_id', sql.VarChar(20), actorId)
		.query(
			`EXEC sp_set_actor @actor_id; DELETE FROM topic_members WHERE id = @id AND topic_id = @topic_id`,
		);
	broadcast('update', { entity: 'topic' });
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

	const hasStaffNum = await pool.request().query(`
    SELECT COUNT(*) AS c FROM sys.columns
    WHERE object_id = OBJECT_ID('topic_members') AND name = 'staff_number'
  `);
	const staffNumCol =
		hasStaffNum.recordset[0].c > 0
			? ', tm.staff_number'
			: ', NULL AS staff_number';

	const req = pool.request();
	topicIds.forEach((id, i) => req.input(`id${i}`, sql.VarChar(15), id));
	const idParams = topicIds.map((_, i) => `@id${i}`).join(',');

	const result = await req.query(`
    SELECT
      t.id, t.title, t.status, t.created_at,
      t.round_id, r.name AS round_name, r.year AS round_year,
      t.category_id, c.name AS category_name,
      t.level_id, l.name AS level_name,
      t.department_id, d.name AS department_name,
      t.created_by, u.full_name AS created_by_name,
      tm.id AS member_id, tm.name AS ho_ten, tm.role,
      tm.position AS chuc_vu, tm.email AS member_email, tm.phone_number AS so_dien_thoai
      ${staffNumCol}
    FROM topics t
    LEFT JOIN research_rounds r ON r.id = t.round_id
    LEFT JOIN categories c ON c.id = t.category_id
    LEFT JOIN levels l ON l.id = t.level_id
    LEFT JOIN departments d ON d.id = t.department_id
    LEFT JOIN users u ON u.id = t.created_by
    LEFT JOIN topic_members tm ON tm.topic_id = t.id
    WHERE t.id IN (${idParams})
    ORDER BY t.created_at DESC, tm.role
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
	getMembers,
	addMember,
	updateMember,
	deleteMember,
	grantAccounts: grantAccountsNoEmail,
	submit,
	approve,
	getApprovals,
	getForExport,
};
