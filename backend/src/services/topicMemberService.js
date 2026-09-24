const { getPool, sql } = require('../config/db');
const bcrypt = require('bcryptjs');
const notifSvc = require('./notificationService');
const { broadcast } = require('./eventService');
const personService = require('./personService');
const { ROLE, requireRoleId } = require('./roleCodes');

const getMembers = async (topicId) => {
	const pool = await getPool();

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
        u.is_active      AS account_is_active,
        u.account_expires_at,
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
		.input(
			'staff_number',
			sql.Int,
			memberData.staff_number != null && memberData.staff_number !== ''
				? parseInt(String(memberData.staff_number), 10)
				: null,
		)
		.input('department_id', sql.VarChar(20), memberData.department_id || null)
		.input('role', sql.VarChar(20), memberData.role || 'member').query(`
      BEGIN TRANSACTION;
      DECLARE @new_id VARCHAR(22);
      EXEC sp_gen_member_id @topic_id, @new_id OUTPUT;
      EXEC sp_set_actor @actor_id;
      INSERT INTO topic_members (id, topic_id, name, email, phone_number, position, staff_number, department_id, role, created_by)
      VALUES (@new_id, @topic_id, @ho_ten, @email, @so_dien_thoai, @chuc_vu, @staff_number, @department_id, @role, @actor_id);
      COMMIT TRANSACTION;
      SELECT @new_id AS id;
    `);
	await personService.syncPerson('topic_members', result.recordset[0].id, { actorId });
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

// executor có thể là pool hoặc sql.Transaction — cả hai đều expose .request().
// Khi truyền transaction, việc kiểm tra trùng username chạy cùng ngữ cảnh với
// INSERT/UPDATE users nên nhất quán hơn.
const ensureUniqueUsername = async (executor, baseUsername, userId) => {
	let username = baseUsername;
	let suffix = 1;
	while (true) {
		// Tạo request mới mỗi lần để tránh lỗi "parameter already set"
		const existing = await executor
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// sp_gen_user_id dùng sp_getapplock (LockOwner = Transaction) nên khóa "sinh mã"
// được giữ tới khi transaction bao ngoài COMMIT/ROLLBACK. Vì vậy transaction gọi
// proc này PHẢI NGẮN: sinh mã -> INSERT users -> commit ngay (xem grantAccountsNoEmail).
// Nếu khóa vẫn timeout (nhiều thao tác song song trên cùng khoa), proc RAISERROR
// với error number 50000 -> thử lại vài lần trước khi bỏ cuộc.
const isGenLockTimeout = (err) => {
	if (!err) return false;
	const msg = String(err.message || '');
	return (
		err.number === 50000 ||
		err.originalError?.info?.number === 50000 ||
		/kh[oó]a sinh m[ãa]/i.test(msg)
	);
};

const genUserIdWithRetry = async (
	tx,
	deptCode,
	isDeptAccount = false,
	attempts = 3,
) => {
	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		try {
			const req = new sql.Request(tx);
			req
				.input('dept_code', sql.VarChar(20), deptCode)
				.input('is_dept_account', sql.Bit, isDeptAccount ? 1 : 0)
				.output('new_id', sql.VarChar(20));
			await req.execute('sp_gen_user_id');
			return req.output.new_id;
		} catch (err) {
			if (!isGenLockTimeout(err) || attempt === attempts) throw err;
			await sleep(200 * attempt);
		}
	}
	return undefined;
};

// Sinh mã NV bên trong transaction ngắn của từng thành viên.
// Ưu tiên sp_gen_user_id. Nếu proc trả lỗi khóa (ví dụ DB chưa chạy migration
// 2026-08-28_fix_gen_id_applock_owner.sql — bug @owner NVARCHAR(10) cắt cụt
// 'Transaction' -> sp_getapplock luôn thất bại khi gọi trong transaction) thì
// tự sinh bằng SELECT có (UPDLOCK, HOLDLOCK): range lock trên dải id 'NV<khoa>'
// được giữ tới khi tx commit nên vẫn chống trùng mã khi chạy song song.
const genUserIdInTx = async (tx, deptCode) => {
	try {
		const id = await genUserIdWithRetry(tx, deptCode, false, 2);
		if (id) return id;
	} catch (err) {
		if (!isGenLockTimeout(err)) throw err;
		console.warn(
			'grantAccountsNoEmail: sp_gen_user_id lỗi khóa, dùng fallback sinh mã trong transaction:',
			err.message,
		);
	}
	const res = await new sql.Request(tx)
		.input('dept_code', sql.VarChar(20), deptCode).query(`
			DECLARE @prefix VARCHAR(12) = 'NV' + @dept_code;
			DECLARE @count INT;
			SELECT @count = ISNULL(MAX(CAST(RIGHT(id,4) AS INT)), 0) + 1
			FROM users WITH (UPDLOCK, HOLDLOCK)
			WHERE id LIKE @prefix + '[0-9][0-9][0-9][0-9]'
			  AND RIGHT(id,4) <> '0000';
			IF @count < 1 SET @count = 1;
			SELECT @prefix + RIGHT('0000' + CAST(@count AS VARCHAR(4)), 4) AS new_id;
		`);
	return res.recordset[0]?.new_id;
};

// Cấp tài khoản cho thành viên đề tài (luồng không dùng email).
//
// QUAN TRỌNG: mỗi thành viên được xử lý trong MỘT transaction riêng, ngắn gọn
// (sinh mã -> INSERT/UPDATE users -> gắn user_id vào topic_members -> commit).
// sp_gen_user_id giữ applock "sinh mã" tới khi transaction commit, nên nếu gộp
// cả vòng lặp + bcrypt + notification vào một transaction lớn (như trước đây) thì
// khóa bị giữ quá lâu -> thao tác cấp tài khoản chạy song song trên cùng khoa sẽ
// timeout và văng lỗi "Không lấy được khóa sinh mã nhân viên".
//
// Đổi lại: mất tính "all-or-nothing" của cả batch. Thành viên nào lỗi sẽ được
// đưa vào `skipped` kèm lý do, các thành viên còn lại vẫn được cấp bình thường.
const grantAccountsNoEmail = async (topicId, memberIds, actorId) => {
	const pool = await getPool();

	// --- 1. Kiểm tra đề tài (chỉ đọc, không cần transaction) ---
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
	if (topic.status !== 'approved') {
		const err = new Error(
			'Đề tài chưa được phê duyệt nên chưa thể cấp tài khoản thành viên',
		);
		err.statusCode = 400;
		throw err;
	}

	// --- 2. Lấy danh sách thành viên cần cấp + mã khoa (chỉ đọc) ---
	const membersResult = await pool
		.request()
		.input('topic_id', sql.VarChar(15), topicId).query(`
			SELECT tm.id, tm.name AS ho_ten, tm.email, tm.staff_number,
			       tm.phone_number, tm.position, tm.role,
			       tm.department_id AS member_department_id,
			       t.department_id AS topic_department_id, rr.end_date
			FROM topic_members tm
			INNER JOIN topics t ON t.id = tm.topic_id
			INNER JOIN research_rounds rr ON rr.id = t.round_id
			WHERE tm.topic_id = @topic_id
			  AND tm.account_granted = 0
		`);

	const filterIds =
		Array.isArray(memberIds) && memberIds.length > 0
			? new Set(memberIds)
			: null;
	const membersToProcess = filterIds
		? membersResult.recordset.filter((row) => filterIds.has(row.id))
		: membersResult.recordset;

	const deptCodeResult = await pool
		.request()
		.input('topic_id', sql.VarChar(15), topicId).query(`
			SELECT d.code
			FROM topics t
			INNER JOIN departments d ON d.id = t.department_id
			WHERE t.id = @topic_id
		`);
	const deptCode = deptCodeResult.recordset[0]?.code;
	if (!deptCode) {
		const err = new Error('Không xác định được khoa/phòng để tạo tài khoản');
		err.statusCode = 400;
		throw err;
	}

	const DEFAULT_PASSWORD = '123456';
	const defaultHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);
	const credentials = [];
	const skipped = [];

	// --- 3. Mỗi thành viên = 1 transaction ngắn ---
	for (const member of membersToProcess) {
		const staffNumber =
			member.staff_number != null ? Number(member.staff_number) : null;
		const baseUsername = buildMemberUsername(
			member.ho_ten,
			staffNumber != null ? staffNumber : '0000',
		);
		const deptId = member.member_department_id || member.topic_department_id;
		const roleId = await requireRoleId(member.role === 'leader' ? ROLE.TOPIC_LEADER : ROLE.MEMBER);

		const tx = new sql.Transaction(pool);
		let began = false;
		try {
			await tx.begin();
			began = true;

			// Ghi actor cho trigger audit (trg_users_audit đọc SESSION_CONTEXT)
			await new sql.Request(tx)
				.input('actor_id', sql.VarChar(20), actorId)
				.query(`EXEC sp_set_actor @actor_id`);

			// Tài khoản đã tồn tại (theo topic_member_id / mã NV / email)?
			const existingUserResult = await new sql.Request(tx)
				.input('member_id', sql.VarChar(22), member.id)
				.input('staff_number', sql.Int, staffNumber)
				.input('email', sql.VarChar(255), member.email || null).query(`
					SELECT TOP 1 id
					FROM users
					WHERE topic_member_id = @member_id
					   OR staff_number = @staff_number
					   OR (@email IS NOT NULL AND email = @email)
					ORDER BY CASE WHEN topic_member_id = @member_id THEN 0 ELSE 1 END,
					         CASE WHEN staff_number = @staff_number THEN 0 ELSE 1 END,
					         CASE WHEN @email IS NOT NULL AND email = @email THEN 0 ELSE 1 END
				`);
			const existingUser = existingUserResult.recordset[0];

			let userId = existingUser?.id;
			if (!userId) {
				// Khóa "sinh mã" chỉ được giữ tới khi tx ngắn này commit (vài ms sau).
				userId = await genUserIdInTx(tx, deptCode);
				if (!userId) {
					const err = new Error('Không sinh được mã tài khoản mới');
					err.statusCode = 500;
					throw err;
				}
			}

			const username = await ensureUniqueUsername(tx, baseUsername, userId);
			const storedEmail =
				member.email && String(member.email).trim()
					? String(member.email).trim()
					: `${String(userId).toLowerCase()}@member.local`;

			const writeReq = new sql.Request(tx)
				.input('uid', sql.VarChar(20), userId)
				.input('username', sql.VarChar(100), username)
				.input('password', sql.VarChar(255), defaultHash)
				.input('full_name', sql.NVarChar(255), member.ho_ten)
				.input('staff_number', sql.Int, staffNumber)
				.input('email', sql.VarChar(255), storedEmail)
				.input('phone_number', sql.VarChar(10), member.phone_number || null)
				.input('position_detail', sql.NVarChar(255), member.position || null)
				.input('department_id', sql.VarChar(20), deptId)
				.input('role_id', sql.VarChar(6), roleId)
				.input('topic_member_id', sql.VarChar(22), member.id)
				.input('expires_at', sql.Date, member.end_date)
				.input('actor_id', sql.VarChar(20), actorId);

			if (existingUser) {
				await writeReq.query(`
					UPDATE users
					SET username = @username,
					    password = @password,
					    full_name = @full_name,
					    staff_number = @staff_number,
					    email = @email,
					    phone_number = @phone_number,
					    position_detail = @position_detail,
					    department_id = @department_id,
					    role_id = @role_id,
					    is_active = 1,
					    topic_member_id = @topic_member_id,
					    account_expires_at = @expires_at,
					    updated_at = GETDATE(),
					    updated_by = @actor_id
					WHERE id = @uid
				`);
			} else {
				await writeReq.query(`
					INSERT INTO users (
						id, username, password, full_name, staff_number, email,
						phone_number, position_detail, department_id, role_id,
						topic_member_id, account_expires_at, created_by
					)
					VALUES (
						@uid, @username, @password, @full_name, @staff_number, @email,
						@phone_number, @position_detail, @department_id, @role_id,
						@topic_member_id, @expires_at, @actor_id
					)
				`);
			}

			await new sql.Request(tx)
				.input('member_id', sql.VarChar(22), member.id)
				.input('uid', sql.VarChar(20), userId)
				.input('actor_id', sql.VarChar(20), actorId).query(`
					UPDATE topic_members
					SET user_id = @uid,
					    account_granted = 1,
					    account_granted_at = GETDATE(),
					    updated_at = GETDATE(),
					    updated_by = @actor_id
					WHERE id = @member_id
				`);

			await tx.commit();

			// thành viên và tài khoản vừa cấp phải trỏ cùng 1 person (không ném lỗi)
			await personService.linkTopicMemberToUser(member.id, userId, { actorId });

			credentials.push({
				member_id: member.id,
				user_id: userId,
				username,
				full_name: member.ho_ten,
				password_plain: DEFAULT_PASSWORD,
			});
		} catch (err) {
			if (began) {
				try {
					await tx.rollback();
				} catch {
					// bỏ qua nếu transaction đã bị abort
				}
			}
			console.error(
				`grantAccountsNoEmail: bỏ qua thành viên ${member.id}:`,
				err.message,
			);
			skipped.push({
				member_id: member.id,
				ho_ten: member.ho_ten,
				reason: err instanceof Error ? err.message : 'Lỗi không xác định',
			});
		}
	}

	if (credentials.length === 0) {
		if (skipped.length > 0) {
			const err = new Error(
				skipped.length === 1
					? skipped[0].reason
					: `Không cấp được tài khoản cho ${skipped.length} thành viên`,
			);
			err.statusCode = 500;
			throw err;
		}
		return { credentials, skipped };
	}

	broadcast('update', { entity: 'topic' });

	// --- 4. Thông báo (ngoài transaction; lỗi ở đây không ảnh hưởng việc cấp) ---
	try {
		const newUserIds = credentials.map((c) => c.user_id);
		await notifSvc.push(
			'account_granted',
			'Tài khoản hệ thống đã được cấp',
			newUserIds,
			{
				message: `Tài khoản đã được cấp để tham gia đề tài ${topicId}. Vui lòng đăng nhập với mật khẩu mặc định (123456) và đổi mật khẩu ngay.`,
				refId: topicId,
				refType: 'topic',
			},
		);

		// Thông báo cho khoa và chủ nhiệm đề tài
		const excludeReq = pool
			.request()
			.input('topic_id', sql.VarChar(15), topicId);
		const excludeParams = newUserIds
			.map((id, i) => {
				const name = `excl${i}`;
				excludeReq.input(name, sql.VarChar(20), id);
				return `@${name}`;
			})
			.join(',');
		const deptResult = await excludeReq.query(`
				SELECT DISTINCT u.id
				FROM users u
				INNER JOIN topics t ON t.department_id = u.department_id
				WHERE t.id = @topic_id
				  AND u.is_active = 1
				  AND u.id NOT IN (${excludeParams})
				UNION
				SELECT tm.user_id
				FROM topic_members tm
				WHERE tm.topic_id = @topic_id
				  AND tm.role = 'leader'
				  AND tm.user_id IS NOT NULL
				  AND tm.user_id NOT IN (${excludeParams})
			`);
		const deptUserIds = deptResult.recordset.map((r) => r.id);
		if (deptUserIds.length > 0) {
			await notifSvc.push(
				'account_granted',
				'Cấp tài khoản thành viên đề tài',
				deptUserIds,
				{
					message: `Đã cấp ${credentials.length} tài khoản cho thành viên đề tài ${topicId}. Thành viên mới có thể đăng nhập hệ thống.`,
					refId: topicId,
					refType: 'topic',
				},
			);
		}
	} catch (err) {
		console.error('grantAccountsNoEmail: gửi thông báo thất bại:', err.message);
	}

	return { credentials, skipped };
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
	await personService.syncPerson('topic_members', memberId, { actorId });
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

module.exports = {
	getMembers,
	addMember,
	updateMember,
	deleteMember,
	grantAccounts: grantAccountsNoEmail,
	// Helper cấp tài khoản dùng chung — export để traineeService.grantAccounts
	// (D0) tái dùng thay vì chép lại logic sinh username/mã NV.
	buildMemberUsername,
	ensureUniqueUsername,
	genUserIdInTx,
};
