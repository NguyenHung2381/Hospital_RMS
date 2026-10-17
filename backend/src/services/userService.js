const bcrypt = require('bcrypt');
const { getPool, sql, withTransaction } = require('../config/db');
const { broadcast } = require('./eventService');
const personService = require('./personService');
const securityEvents = require('./securityEventService');
const userStatusCache = require('../middlewares/userStatusCache');
const { bumpTokenVersion } = require('./sessionVersion');
const { paging } = require('../utils/paging');
// department_id/role_id nhận danh sách phân tách bởi dấu phẩy (multi-select trên UI)
const { splitList, inClause } = require('../utils/sqlFilters');
const { isDeptAccountSql } = require('../utils/deptAccount');
const { ROLE, requireRoleId } = require('./roleCodes');
const { defaultPassword } = require('../utils/passwordPolicy');
const { httpError } = require('../utils/httpError');

// ─── Cache thống kê toàn bảng (global_stats) ─────────────────────────────────
// global_stats không phụ thuộc filter/phân trang nên trước đây bị quét lại toàn
// bảng users ở MỌI request (kể cả khi chỉ bấm chuyển trang). Cache 30s trong bộ
// nhớ process; xoá ngay khi có thay đổi user (create/update/remove/reset pass).
const STATS_TTL_MS = 30 * 1000;
let _statsCache = null; // { data, ts }

const invalidateStatsCache = () => {
	_statsCache = null;
};

const getGlobalStats = async (pool) => {
	if (_statsCache && Date.now() - _statsCache.ts < STATS_TTL_MS) {
		return _statsCache.data;
	}
	const r = await pool.request().query(`
    SET NOCOUNT ON;
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) AS inactive,
      SUM(CASE WHEN password_changed_at IS NULL
               OR DATEDIFF(day, password_changed_at, GETDATE()) > 90
          THEN 1 ELSE 0 END) AS pwd_warn
    FROM users;
  `);
	const row = r.recordset[0];
	_statsCache = {
		ts: Date.now(),
		data: {
			total: row.total,
			active: row.active,
			inactive: row.inactive,
			pwd_warn: row.pwd_warn,
		},
	};
	return _statsCache.data;
};

const getAll = async ({
	page = 1,
	limit = 20,
	search,
	department_id,
	role_id,
	is_active,
	// meta=0 -> chỉ trả danh sách + tổng số (phục vụ chuyển trang/đổi sort);
	// bỏ qua global_stats + facet counts. Mặc định bật để tương thích client cũ.
	meta = '1',
}) => {
	const pool = await getPool();
	const pg = paging(page, limit);
	const deptIds = splitList(department_id);
	const roleIds = splitList(role_id);
	const withMeta = meta !== '0' && meta !== 0 && meta !== 'false' && meta !== false;

	const req = pool.request().input('offset', sql.Int, pg.offset).input('limit', sql.Int, pg.limit);

	// Mệnh đề dùng chung (search/is_active) — không phụ thuộc dept/vai trò
	const baseClauses = ['1=1'];
	if (search) {
		const term = String(search).trim();
		// username/email là cột varchar (non-unicode) -> dùng tham số VarChar để
		// tránh SQL Server ép kiểu cả cột sang NVARCHAR (huỷ index, tốn CPU).
		// full_name là nvarchar -> tham số NVarChar riêng.
		const orParts = ['u.username LIKE @search', 'u.full_name LIKE @search_n', 'u.email LIKE @search'];
		req.input('search', sql.VarChar(120), `%${term}%`);
		req.input('search_n', sql.NVarChar(220), `%${term}%`);
		// Chỉ ép kiểu staff_number khi chuỗi tìm là số — bỏ CAST khỏi nhánh phổ
		// biến (tìm theo tên), nơi nó vô hiệu hoá mọi index.
		if (/^\d+$/.test(term)) {
			orParts.push('CAST(u.staff_number AS VARCHAR(20)) LIKE @search');
		}
		baseClauses.push(`(${orParts.join(' OR ')})`);
	}
	if (is_active !== undefined) {
		baseClauses.push('u.is_active = @is_active');
		req.input('is_active', sql.Bit, is_active);
	}

	const deptClause = inClause(req, 'u.department_id', 'dept', deptIds, sql.VarChar(20));
	const roleClause = inClause(req, 'u.role_id', 'rid', roleIds, sql.VarChar(6));

	const whereAll = ['WHERE', [...baseClauses, deptClause, roleClause].filter(Boolean).join(' AND ')].join(' ');
	// Đếm theo vai trò: bỏ qua bộ lọc vai trò (để hiện số lượng nếu chọn thêm vai trò khác)
	const whereForRoleFacet = ['WHERE', [...baseClauses, deptClause].filter(Boolean).join(' AND ')].join(' ');
	// Đếm theo khoa/phòng: bỏ qua bộ lọc khoa/phòng
	const whereForDeptFacet = ['WHERE', [...baseClauses, roleClause].filter(Boolean).join(' AND ')].join(' ');

	// COUNT(*) OVER() gộp tổng số vào chính câu list -> bỏ 1 lần quét bảng riêng.
	let query = `
    SET NOCOUNT ON;

    SELECT u.id, u.username, u.staff_number, u.full_name, u.email, u.is_active,
           u.department_id, d.name AS department_name,
           u.role_id, r.name AS role_name, r.code AS role_code,
           u.can_sit_council, u.can_chair_council,
           u.password_changed_at, u.created_at, u.updated_at,
           CAST(CASE WHEN ${isDeptAccountSql('u')} THEN 1 ELSE 0 END AS BIT) AS is_dept_account,
           COUNT(*) OVER() AS _total
    FROM users u
    LEFT JOIN departments d ON d.id = u.department_id
    LEFT JOIN roles r ON r.id = u.role_id
    ${whereAll}
    ORDER BY CASE WHEN u.staff_number IS NULL THEN 1 ELSE 0 END, u.staff_number
    ${pg.fetchClause};
  `;

	if (withMeta) {
		query += `
    SELECT u.role_id, COUNT(*) AS count
    FROM users u ${whereForRoleFacet}
    GROUP BY u.role_id;

    SELECT u.department_id, COUNT(*) AS count
    FROM users u ${whereForDeptFacet}
    GROUP BY u.department_id;
  `;
	}

	const result = await req.query(query);
	const rows = result.recordsets[0];
	const total = rows.length ? rows[0]._total : 0;
	for (const row of rows) delete row._total;

	const out = {
		data: rows,
		pagination: { page: pg.page, limit: pg.limit, total },
	};

	if (withMeta) {
		const [, roleCountRows, deptCountRows] = result.recordsets;
		out.global_stats = await getGlobalStats(pool);
		out.role_counts = Object.fromEntries(
			roleCountRows
				.filter((r) => r.role_id)
				.map((r) => [r.role_id, r.count]),
		);
		out.dept_counts = Object.fromEntries(
			deptCountRows
				.filter((r) => r.department_id)
				.map((r) => [r.department_id, r.count]),
		);
	}

	return out;
};

const getById = async (id) => {
	const pool = await getPool();
	const result = await pool.request().input('id', sql.VarChar(20), id).query(`
      SELECT u.id, u.username, u.staff_number, u.full_name, u.email, u.is_active,
             u.department_id, d.name AS department_name,
             u.role_id, r.name AS role_name, r.code AS role_code,
             u.can_sit_council, u.can_chair_council,
             u.password_changed_at, u.created_at, u.updated_at
      FROM users u
      LEFT JOIN departments d ON d.id = u.department_id
      LEFT JOIN roles r ON r.id = u.role_id
      WHERE u.id = @id
    `);
	return result.recordset[0] || null;
};

const create = async (data, actorId) => {
	const pool = await getPool();
	// Không truyền mật khẩu ⇒ mặc định = tên đăng nhập (bắt đổi ở lần đăng nhập đầu)
	const hashed = await bcrypt.hash(data.password || defaultPassword(data.username), 12);
	// require muộn: topicMemberService nạp nhiều service khác
	const { genUserIdInTx } = require('./topicMemberService');
	const roleId = data.role_id || (await requireRoleId(ROLE.MEMBER));

	// Mã người dùng 'NV' + mã khoa + NNNN như các luồng cấp tài khoản khác (sp_gen_user_id).
	// sp_gen_user_id giữ applock sinh mã tới khi commit ⇒ transaction ngắn: sinh mã → INSERT → commit.
	const newId = await withTransaction(async (tx) => {
		const dept = data.department_id
			? (
					await new sql.Request(tx)
						.input('dept', sql.VarChar(20), data.department_id)
						.query('SELECT code FROM departments WHERE id = @dept')
				).recordset[0]
			: null;
		const id = await genUserIdInTx(tx, dept?.code || '');
		if (!id) throw new Error('Không sinh được mã nhân viên mới');
		await new sql.Request(tx)
			.input('new_id', sql.VarChar(20), id)
			.input('actor_id', sql.VarChar(20), actorId)
			.input('username', sql.VarChar(50), data.username)
			.input('password', sql.VarChar(255), hashed)
			.input(
				'staff_number',
				sql.Int,
				data.staff_number != null && data.staff_number !== ''
					? parseInt(String(data.staff_number), 10)
					: null,
			)
			.input('full_name', sql.NVarChar(200), data.full_name)
			.input('email', sql.VarChar(100), data.email?.trim() || null)
			.input('department_id', sql.VarChar(20), data.department_id || null)
			.input('role_id', sql.VarChar(20), roleId)
			.query(`
      EXEC sp_set_actor @actor_id;
      -- Mật khẩu do quản trị đặt ⇒ người dùng phải tự đổi ở lần đăng nhập đầu
      INSERT INTO users (id, username, password, staff_number, full_name, email, department_id, role_id, created_by, must_change_password)
      VALUES (@new_id, @username, @password, @staff_number, @full_name, @email, @department_id, @role_id, @actor_id, 1);
    `);
		return id;
	}, pool);

	await personService.syncPerson('users', newId, { actorId });
	const user = await getById(newId);
	invalidateStatsCache();
	broadcast('update', { entity: 'user' });
	return user;
};

const update = async (id, data, actorId) => {
	const pool = await getPool();

	const sets = [];
	const req = pool
		.request()
		.input('id', sql.VarChar(20), id)
		.input('actor_id', sql.VarChar(20), actorId);

	if (data.staff_number !== undefined) {
		sets.push('staff_number = @staff_number');
		req.input(
			'staff_number',
			sql.Int,
			data.staff_number != null && data.staff_number !== ''
				? parseInt(String(data.staff_number), 10)
				: null,
		);
	}
	if (data.full_name !== undefined) {
		sets.push('full_name = @full_name');
		req.input('full_name', sql.NVarChar(200), data.full_name);
	}
	if (data.email !== undefined) {
		sets.push('email = @email');
		// '' → NULL: unique index trên email chỉ bỏ qua NULL
		req.input('email', sql.VarChar(100), data.email?.trim() || null);
	}
	if (data.department_id !== undefined) {
		sets.push('department_id = @department_id');
		req.input('department_id', sql.VarChar(20), data.department_id);
	}
	if (data.role_id !== undefined) {
		sets.push('role_id = @role_id');
		req.input('role_id', sql.VarChar(20), data.role_id);
	}
	if (data.is_active !== undefined) {
		sets.push('is_active = @is_active');
		req.input('is_active', sql.Bit, data.is_active);
	}
	if (data.can_sit_council !== undefined) {
		sets.push('can_sit_council = @can_sit_council');
		req.input('can_sit_council', sql.Bit, data.can_sit_council);
	}
	if (data.can_chair_council !== undefined) {
		sets.push('can_chair_council = @can_chair_council');
		req.input('can_chair_council', sql.Bit, data.can_chair_council);
	}

	if (!sets.length) return getById(id);

	sets.push('updated_at = GETDATE()', 'updated_by = @actor_id');
	await req.query(
		`EXEC sp_set_actor @actor_id; UPDATE users SET ${sets.join(', ')} WHERE id = @id`,
	);
	// Vai trò / khoa / trạng thái mới phải có hiệu lực ngay với phiên đang mở
	// (middlewares/auth.js đọc các field này qua userStatusCache, không tin JWT).
	userStatusCache.clear(id);
	await personService.syncPerson('users', id, { actorId });
	const user = await getById(id);
	invalidateStatsCache();
	broadcast('update', { entity: 'user' });
	return user;
};

const remove = async (id, actorId) => {
	const pool = await getPool();

	// Nhiều FK trỏ tới users.id KHÔNG có ON DELETE CASCADE (đề tài/hội đồng/đợt/tệp
	// do user tạo, ghế hội đồng, tài khoản liên hệ khoa...). Không thể xoá cứng mà
	// giữ được lịch sử → chặn và yêu cầu vô hiệu hoá tài khoản (is_active = 0).
	const check = await pool.request().input('id', sql.VarChar(20), id).query(`
		SELECT
			(SELECT COUNT(*) FROM topics WHERE created_by = @id) AS topics_created,
			(SELECT COUNT(*) FROM councils WHERE created_by = @id) AS councils_created,
			(SELECT COUNT(*) FROM research_rounds WHERE created_by = @id) AS rounds_created,
			(SELECT COUNT(*) FROM file_batches WHERE created_by = @id)
			  + (SELECT COUNT(*) FROM files WHERE created_by = @id) AS files_created,
			(SELECT COUNT(*) FROM topic_progress WHERE created_by = @id) AS progress_created,
			(SELECT COUNT(*) FROM council_topic_results WHERE decided_by = @id) AS results_decided,
			(SELECT COUNT(*) FROM council_members WHERE user_id = @id)
			  + (SELECT COUNT(*) FROM council_progress_reviews WHERE user_id = @id)
			  + (SELECT COUNT(*) FROM council_seat_substitutes WHERE user_id = @id) AS council_seats,
			(SELECT COUNT(*) FROM departments WHERE dept_account_id = @id) AS dept_accounts,
			(SELECT COUNT(*) FROM cme_records WHERE user_id = @id) AS cme_records,
			(SELECT COUNT(*) FROM seminar_participants WHERE user_id = @id) AS seminar_participations,
			(SELECT COUNT(*) FROM survey_responses WHERE respondent_user_id = @id) AS survey_responses
	`);
	const c = check.recordset[0];
	const blockers = [];
	if (c.topics_created) blockers.push(`${c.topics_created} đề tài`);
	if (c.councils_created) blockers.push(`${c.councils_created} hội đồng`);
	if (c.rounds_created) blockers.push(`${c.rounds_created} đợt nghiên cứu`);
	if (c.files_created) blockers.push(`${c.files_created} tệp đính kèm`);
	if (c.progress_created) blockers.push(`${c.progress_created} bản ghi tiến độ`);
	if (c.results_decided) blockers.push(`${c.results_decided} kết luận hội đồng`);
	if (c.council_seats) blockers.push(`${c.council_seats} lượt tham gia hội đồng`);
	if (c.dept_accounts) blockers.push(`${c.dept_accounts} khoa (tài khoản liên hệ)`);
	if (c.cme_records) blockers.push(`${c.cme_records} bản ghi CME`);
	if (c.seminar_participations) blockers.push(`${c.seminar_participations} lượt tham dự hội thảo`);
	if (c.survey_responses) blockers.push(`${c.survey_responses} phiếu khảo sát`);

	if (blockers.length) {
		const err = new Error(
			`Không thể xoá tài khoản vì còn liên kết: ${blockers.join(', ')}. Hãy vô hiệu hoá tài khoản (ngừng hoạt động) thay vì xoá.`,
		);
		err.statusCode = 409;
		throw err;
	}

	// Lấy trước khi xoá — sau khi xoá thì dọn person (bảng persons không có FK tới users)
	const personId = await personService.personIdOf('users', id);
	await pool
		.request()
		.input('id', sql.VarChar(20), id)
		.input('actor_id', sql.VarChar(20), actorId).query(`
			EXEC sp_set_actor @actor_id;
			UPDATE topic_members SET user_id = NULL, account_granted = 0, account_granted_at = NULL WHERE user_id = @id;
			UPDATE trainees SET user_id = NULL, account_granted = 0, account_granted_at = NULL WHERE user_id = @id;
			UPDATE round_deadlines SET created_by = @actor_id WHERE created_by = @id;
			UPDATE departments SET head_user_id = NULL WHERE head_user_id = @id;
			UPDATE lecturers SET user_id = NULL WHERE user_id = @id;
			DELETE FROM users WHERE id = @id;
		`);
	await personService.releasePerson('users', id, personId, { actorId });
	userStatusCache.clear(id);
	invalidateStatsCache();
	broadcast('update', { entity: 'user' });
};

// Reset mật khẩu bởi người quản lý: thu hồi toàn bộ phiên của tài khoản đích
// (refresh token + token_version) — người đang giữ phiên cũ (có thể chính là
// kẻ đã chiếm tài khoản) bị đăng xuất ngay, phải đăng nhập bằng mật khẩu mới.
// Không truyền newPassword ⇒ về mật khẩu mặc định = tên đăng nhập. Trả về
// { temporary_password } (chỉ khi tự đặt) để hiển thị cho quản trị.
// Mật khẩu này đã qua tay người khác nên luôn bắt đổi ở lần đăng nhập tới.
const resetPassword = async (id, newPassword, actorId, ip = null) => {
	const pool = await getPool();
	let generated = null;
	if (!newPassword) {
		const found = await pool
			.request()
			.input('id', sql.VarChar(20), id)
			.query('SELECT username FROM users WHERE id=@id');
		const username = found.recordset[0]?.username;
		if (!username) {
			const err = new Error('Không tìm thấy người dùng');
			err.statusCode = 404;
			throw err;
		}
		generated = defaultPassword(username);
	}
	const hashed = await bcrypt.hash(newPassword || generated, 12);
	await pool
		.request()
		.input('id', sql.VarChar(20), id)
		.input('password', sql.VarChar(255), hashed)
		.input('actor_id', sql.VarChar(20), actorId)
		.query(
			`EXEC sp_set_actor @actor_id;
			 UPDATE users SET password=@password, password_changed_at=GETDATE(), must_change_password=1,
			   updated_at=GETDATE(), updated_by=@actor_id WHERE id=@id;
			 DELETE FROM refresh_tokens WHERE user_id=@id;`,
		);
	// Thu hồi ngay cả access token đang lưu hành (không chờ hết hạn 8h)
	await bumpTokenVersion(id, pool);
	await securityEvents.log({
		eventType: 'password_reset_by_admin',
		actorId,
		targetType: 'user',
		targetId: id,
		ip,
	});
	invalidateStatsCache();
	broadcast('update', { entity: 'user' });
	return generated ? { temporary_password: generated } : null;
};

const searchForMember = async ({ q, department_id, limit = 10 }) => {
	const pool = await getPool();
	let where = 'WHERE u.is_active = 1';
	const req = pool.request().input('limit', sql.Int, Number(limit));

	if (q && q.trim()) {
		const term = q.trim();
		// Tham số đúng kiểu cột (username varchar / full_name nvarchar) để không
		// ép kiểu cả cột; chỉ CAST staff_number khi chuỗi tìm là số.
		const orParts = ['u.username LIKE @search', 'u.full_name LIKE @search_n'];
		req.input('search', sql.VarChar(120), `%${term}%`);
		req.input('search_n', sql.NVarChar(220), `%${term}%`);
		if (/^\d+$/.test(term)) {
			orParts.push('CAST(u.staff_number AS VARCHAR(20)) LIKE @search');
		}
		where += ` AND (${orParts.join(' OR ')})`;
	}
	if (department_id) {
		where += ' AND u.department_id = @dept';
		req.input('dept', sql.VarChar(20), department_id);
	}

	const result = await req.query(`
    SELECT TOP (@limit) u.id, u.full_name, u.username, u.staff_number, u.email, u.department_id
    FROM users u
    ${where}
    ORDER BY u.full_name
  `);

	return {
		data: result.recordset,
		pagination: {
			page: 1,
			limit: Number(limit),
			total: result.recordset.length,
		},
	};
};

// Tạo nhân viên mới từ file nhập (vd ghi nhận CME có Mã NV chưa có trong hệ thống).
// Cùng quy ước với cấp tài khoản thành viên đề tài (topicMemberService): mã
// 'NV' + mã khoa + NNNN, username = chữ cái đầu họ tên + "_" + MNV, vai trò Thành viên.
// Bắt buộc có họ tên (tên đăng nhập sinh từ họ tên).
// Mật khẩu mặc định = tên đăng nhập, bắt đổi ở lần đăng nhập đầu.
// Caller tự kiểm tra quyền users:create. Trả { id, username }.
const createStaffAccount = async (
	{ full_name, staff_number, department_id, department_code },
	actorId,
) => {
	full_name = String(full_name || '').trim();
	if (!full_name) throw httpError(400, 'Vui lòng nhập họ và tên');
	// require muộn: topicMemberService nạp nhiều service khác, chỉ cần ở luồng này
	const { buildMemberUsername, ensureUniqueUsername, genUserIdInTx } = require('./topicMemberService');
	const pool = await getPool();
	const roleId = await requireRoleId(ROLE.MEMBER);

	const { userId, username } = await withTransaction(async (tx) => {
		await new sql.Request(tx).input('actor_id', sql.VarChar(20), actorId).query('EXEC sp_set_actor @actor_id');
		const userId = await genUserIdInTx(tx, department_code || '');
		if (!userId) throw new Error('Không sinh được mã nhân viên mới');
		const username = await ensureUniqueUsername(tx, buildMemberUsername(full_name, staff_number), userId);
		const passwordHash = await bcrypt.hash(defaultPassword(username), 12);
		await new sql.Request(tx)
			.input('uid', sql.VarChar(20), userId)
			.input('username', sql.VarChar(100), username)
			.input('password', sql.VarChar(255), passwordHash)
			.input('full_name', sql.NVarChar(255), full_name)
			.input('staff_number', sql.Int, staff_number)
			.input('department_id', sql.VarChar(20), department_id)
			.input('role_id', sql.VarChar(20), roleId)
			.input('actor_id', sql.VarChar(20), actorId).query(`
        INSERT INTO users (id, username, password, full_name, staff_number, department_id, role_id, created_by, must_change_password)
        VALUES (@uid, @username, @password, @full_name, @staff_number, @department_id, @role_id, @actor_id, 1)
      `);
		return { userId, username };
	}, pool);

	await personService.syncPerson('users', userId, { actorId });
	invalidateStatsCache();
	broadcast('update', { entity: 'user' });
	return { id: userId, username };
};

module.exports = {
	getAll,
	getById,
	create,
	update,
	remove,
	resetPassword,
	searchForMember,
	createStaffAccount,
};
