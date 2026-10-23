const bcrypt = require('bcrypt');
const { getPool, sql } = require('../../../config/db');
const { broadcast } = require('../../events/eventService');
const { ROLE, requireRoleId } = require('../../access/roleCodes');
const { defaultPassword } = require('../../../utils/passwordPolicy');
const { traineeUsernamePrefix, nextTraineeUsername } = require('./traineeUsername');
const userService = require('../../users/userService');
const { httpError } = require('../../../utils/httpError');
const userStatusCache = require('../../../permissions/userStatusCache');

// ─── Cấp tài khoản đăng nhập cho học viên (D0) ──────────────────────────────
// Tài khoản học viên CẤP RIÊNG, không gộp vào tài khoản nội viện: mã 'HV' +
// NNNNNN (không theo mã khoa như nhân viên 'NV<khoa>NNNN'), không gắn khoa/phòng,
// vai trò Học viên, và bị loại khỏi trang Quản lý người dùng — quản lý (khoá,
// đặt lại mật khẩu) ngay tại hồ sơ học viên. Học viên là nhân viên trong viện
// vẫn được cấp tài khoản học viên riêng, không dùng lại tài khoản nhân viên.
// Mỗi học viên xử lý trong 1 transaction ngắn riêng (khoá dải mã 'HV' giữ tới
// khi commit — gộp nhiều học viên vào 1 transaction lớn sẽ giữ khoá quá lâu).
// Tên đăng nhập "NVA_0001" (xem traineeUsername.js). Mật khẩu mặc định = tên
// đăng nhập (cả khi cấp lẫn khi đặt lại), bắt đổi ở lần đăng nhập đầu
// (users.must_change_password).

const TRAINEE_USER_PREFIX = 'HV';

// Tên đăng nhập kế tiếp cho viết tắt của fullName. Gọi SAU genTraineeUserIdInTx
// trong cùng tx: khoá dải mã 'HV' đã tuần tự hoá các lần cấp song song nên hai
// học viên cùng viết tắt không nhận trùng số thứ tự.
const genTraineeUsernameInTx = async (tx, fullName, traineeRoleId) => {
	const prefix = traineeUsernamePrefix(fullName);
	const rows = (
		await new sql.Request(tx)
			.input('pattern', sql.VarChar(110), `${prefix}[_]%`)
			.input('role_id', sql.VarChar(6), traineeRoleId)
			.query(
				`SELECT username, CASE WHEN role_id = @role_id THEN 1 ELSE 0 END AS is_trainee
				 FROM users WHERE username LIKE @pattern`,
			)
	).recordset;
	return nextTraineeUsername(
		prefix,
		rows.filter((r) => r.is_trainee).map((r) => r.username),
		new Set(rows.map((r) => String(r.username).toUpperCase())),
	);
};

// Sinh mã tài khoản học viên trong transaction: (UPDLOCK, HOLDLOCK) khoá dải mã
// 'HV' tới khi tx commit nên chạy song song vẫn không trùng.
const genTraineeUserIdInTx = async (tx) => {
	const res = await new sql.Request(tx).input('prefix', sql.VarChar(4), TRAINEE_USER_PREFIX).query(`
      SELECT @prefix + RIGHT('000000' + CAST(ISNULL(MAX(CAST(RIGHT(id, 6) AS INT)), 0) + 1 AS VARCHAR(6)), 6) AS new_id
      FROM users WITH (UPDLOCK, HOLDLOCK)
      WHERE id LIKE @prefix + '[0-9][0-9][0-9][0-9][0-9][0-9]'
    `);
	return res.recordset[0]?.new_id;
};

// traineeIds BẮT BUỘC (route đã kiểm tra) — trước đây bỏ trống = cấp cho mọi học
// viên chưa có tài khoản, kể cả hồ sơ đã xoá. Hồ sơ đã xoá / ngừng hoạt động /
// đã có tài khoản / không tồn tại được trả về trong skipped kèm lý do.
const grantAccounts = async (traineeIds, actorId) => {
	const ids = [...new Set((traineeIds || []).map(String))];
	if (ids.length === 0) throw httpError(400, 'Chưa chọn học viên cần cấp tài khoản');

	const pool = await getPool();
	const traineesResult = await pool
		.request()
		.input('ids', sql.NVarChar(sql.MAX), JSON.stringify(ids)).query(`
    SELECT t.id, t.full_name, t.email, t.phone, t.is_active, t.hidden_at,
           ISNULL(t.account_granted, 0) AS account_granted
    FROM trainees t
    WHERE t.id IN (SELECT value FROM OPENJSON(@ids))
  `);
	const byId = new Map(traineesResult.recordset.map((row) => [row.id, row]));

	const credentials = [];
	const skipped = [];
	const traineesToProcess = [];
	for (const id of ids) {
		const row = byId.get(id);
		const reason = !row
			? 'Không tìm thấy học viên'
			: row.hidden_at
				? 'Hồ sơ học viên đã bị xoá'
				: !row.is_active
					? 'Học viên đang ngừng hoạt động'
					: row.account_granted
						? 'Học viên đã có tài khoản'
						: null;
		if (reason) skipped.push({ trainee_id: id, full_name: row?.full_name ?? null, reason });
		else traineesToProcess.push(row);
	}

	const traineeRoleId = traineesToProcess.length > 0 ? await requireRoleId(ROLE.TRAINEE) : null;

	for (const trainee of traineesToProcess) {
		const tx = new sql.Transaction(pool);
		let began = false;
		try {
			await tx.begin();
			began = true;

			await new sql.Request(tx)
				.input('actor_id', sql.VarChar(20), actorId)
				.query(`EXEC sp_set_actor @actor_id`);

			const userId = await genTraineeUserIdInTx(tx);
			if (!userId) {
				throw new Error('Không sinh được mã tài khoản mới');
			}

			const username = await genTraineeUsernameInTx(tx, trainee.full_name, traineeRoleId);
			const tempPassword = defaultPassword(username);
			const passwordHash = await bcrypt.hash(tempPassword, 12);
			// Email đã thuộc tài khoản khác (thường là tài khoản nhân viên của chính
			// học viên) ⇒ vẫn cấp tài khoản riêng, dùng email nội bộ thay thế.
			const email = trainee.email?.trim() || null;
			const emailTaken =
				email &&
				(
					await new sql.Request(tx)
						.input('email', sql.VarChar(255), email)
						.query('SELECT TOP 1 1 AS x FROM users WHERE email = @email')
				).recordset.length > 0;
			const storedEmail = email && !emailTaken ? email : `${userId.toLowerCase()}@trainee.local`;

			await new sql.Request(tx)
				.input('uid', sql.VarChar(20), userId)
				.input('username', sql.VarChar(100), username)
				.input('password', sql.VarChar(255), passwordHash)
				.input('full_name', sql.NVarChar(255), trainee.full_name)
				.input('email', sql.VarChar(255), storedEmail)
				.input('phone_number', sql.VarChar(10), trainee.phone || null)
				.input('role_id', sql.VarChar(6), traineeRoleId)
				.input('actor_id', sql.VarChar(20), actorId).query(`
          INSERT INTO users (
            id, username, password, full_name, email,
            phone_number, role_id, created_by, must_change_password
          )
          VALUES (
            @uid, @username, @password, @full_name, @email,
            @phone_number, @role_id, @actor_id, 1
          )
        `);

			const linked = await new sql.Request(tx)
				.input('trainee_id', sql.VarChar(20), trainee.id)
				.input('uid', sql.VarChar(20), userId)
				.input('actor_id', sql.VarChar(20), actorId).query(`
          UPDATE trainees
          SET user_id = @uid, account_granted = 1, account_granted_at = GETDATE(),
              updated_at = GETDATE(), updated_by = @actor_id
          WHERE id = @trainee_id AND ISNULL(account_granted, 0) = 0
        `);
			// Người khác vừa cấp cho cùng học viên (bấm 2 lần / 2 tab) ⇒ rollback tài khoản thừa
			if (linked.rowsAffected[0] === 0) throw new Error('Học viên đã có tài khoản');

			await tx.commit();

			credentials.push({
				trainee_id: trainee.id,
				user_id: userId,
				username,
				full_name: trainee.full_name,
				password_plain: tempPassword,
			});
		} catch (err) {
			if (began) {
				try {
					await tx.rollback();
				} catch {
					// bỏ qua nếu transaction đã bị abort
				}
			}
			skipped.push({
				trainee_id: trainee.id,
				full_name: trainee.full_name,
				reason: err instanceof Error ? err.message : 'Lỗi không xác định',
			});
		}
	}

	if (credentials.length > 0) broadcast('update', { entity: 'trainee' });
	return { credentials, skipped };
};

// Tài khoản học viên quản lý tại đây (không qua trang Quản lý người dùng).
// Trả user_id của tài khoản học viên, 404 nếu học viên chưa được cấp tài khoản.
const accountOf = async (traineeId) => {
	const pool = await getPool();
	const row = (
		await pool.request().input('id', sql.VarChar(20), traineeId).query(`
      SELECT t.user_id, t.is_active AS trainee_active, t.hidden_at FROM trainees t
      JOIN users u ON u.id = t.user_id
      WHERE t.id = @id
    `)
	).recordset[0];
	if (!row) throw httpError(404, 'Học viên chưa được cấp tài khoản');
	return row;
};

// Đặt lại mật khẩu về mặc định (= tên đăng nhập), thu hồi mọi phiên đang mở.
// Trả { temporary_password } để người cấp gửi lại cho học viên.
const resetAccountPassword = async (traineeId, actorId, ip = null) => {
	const { user_id: userId } = await accountOf(traineeId);
	const result = await userService.resetPassword(userId, null, actorId, ip);
	broadcast('update', { entity: 'trainee' });
	return result;
};

// Khoá tài khoản học viên (nếu có) — dùng khi xoá / ngừng hồ sơ học viên.
const lockAccountOf = async (traineeId, actorId) => {
	const pool = await getPool();
	// Không dùng OUTPUT: bảng users có trigger audit (trg_users_audit)
	const r = await pool
		.request()
		.input('id', sql.VarChar(20), traineeId)
		.input('actor_id', sql.VarChar(20), actorId).query(`
      DECLARE @uid VARCHAR(20) = (SELECT user_id FROM trainees WHERE id = @id);
      IF @uid IS NOT NULL
      BEGIN
        EXEC sp_set_actor @actor_id;
        UPDATE users SET is_active = 0, updated_at = GETDATE(), updated_by = @actor_id
        WHERE id = @uid AND is_active = 1;
      END
      SELECT @uid AS user_id;
    `);
	const userId = r.recordset[0]?.user_id;
	// middlewares/auth.js đọc is_active qua cache — xoá để khoá có hiệu lực ngay
	if (userId) userStatusCache.clear(userId);
};

// Khoá / mở khoá tài khoản học viên. Không qua userService.update: hàm đó đồng
// bộ users → persons (danh tính nhân viên), tài khoản học viên không thuộc đó.
const setAccountActive = async (traineeId, isActive, actorId) => {
	const {
		user_id: userId,
		trainee_active: traineeActive,
		hidden_at: hiddenAt,
	} = await accountOf(traineeId);
	if (isActive && hiddenAt)
		throw httpError(400, 'Hồ sơ học viên đã bị xoá, không mở khoá tài khoản');
	if (isActive && !traineeActive)
		throw httpError(
			400,
			'Học viên đang ngừng hoạt động — bật lại hồ sơ trước khi mở khoá tài khoản',
		);
	const pool = await getPool();
	await pool
		.request()
		.input('id', sql.VarChar(20), userId)
		.input('is_active', sql.Bit, !!isActive)
		.input('actor_id', sql.VarChar(20), actorId).query(`
      EXEC sp_set_actor @actor_id;
      UPDATE users SET is_active = @is_active, updated_at = GETDATE(), updated_by = @actor_id
      WHERE id = @id
    `);
	// middlewares/auth.js đọc is_active qua cache — xoá để khoá có hiệu lực ngay
	userStatusCache.clear(userId);
	broadcast('update', { entity: 'trainee' });
};

module.exports = {
	grantAccounts,
	resetAccountPassword,
	setAccountActive,
	lockAccountOf,
};
