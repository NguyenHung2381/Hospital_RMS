const bcrypt = require('bcrypt');
const { getPool, sql } = require('../config/db');
const { broadcast } = require('./eventService');
const { paging } = require('../utils/paging');
const trainingFileService = require('./trainingFileService');
const personService = require('./personService');
const { normalizeGender } = require('../utils/gender');
const { hasPermission } = require('../middlewares/auth');
const {
	buildMemberUsername,
	ensureUniqueUsername,
	genUserIdInTx,
} = require('./topicMemberService');
const { ROLE, requireRoleId } = require('./roleCodes');
const { defaultPassword } = require('../utils/passwordPolicy');

const traineeSelect = `
  SELECT t.*, tt.name AS trainee_type_name, d.name AS department_name
  FROM trainees t
  LEFT JOIN trainee_types tt ON tt.id = t.trainee_type_id
  LEFT JOIN departments d ON d.id = t.department_id
`;

// Che bớt CCCD (chỉ hiện 4 số cuối) cho người không có quyền xem dữ liệu
// nhạy cảm — actor=null hoặc thiếu quyền 'trainees:read_sensitive'/system:manage
// đều bị che.
const maskSensitive = (row, canSeeSensitive) => {
	if (canSeeSensitive || !row.national_id) return row;
	const id = String(row.national_id);
	return { ...row, national_id: id.length > 4 ? `••••${id.slice(-4)}` : '••••' };
};

const canReadSensitive = (actor) => hasPermission(actor, 'trainees', 'read_sensitive');

const getAll = async ({ page = 1, limit = 20, search, trainee_type_id, department_id } = {}, actor = null) => {
	const pool = await getPool();
	const pg = paging(page, limit, 100);
	const where = ['t.hidden_at IS NULL'];
	const req = pool.request().input('offset', sql.Int, pg.offset).input('limit', sql.Int, pg.limit);

	if (search) {
		where.push('(t.full_name LIKE @search OR t.national_id LIKE @search OR t.phone LIKE @search OR t.email LIKE @search)');
		req.input('search', sql.NVarChar, `%${search}%`);
	}
	if (trainee_type_id) {
		where.push('t.trainee_type_id = @trainee_type_id');
		req.input('trainee_type_id', sql.VarChar(20), trainee_type_id);
	}
	if (department_id) {
		where.push('t.department_id = @department_id');
		req.input('department_id', sql.VarChar(20), department_id);
	}
	const whereSql = `WHERE ${where.join(' AND ')}`;

	const result = await req.query(`
    ${traineeSelect} ${whereSql} ORDER BY t.created_at DESC
    ${pg.fetchClause};
    SELECT COUNT(*) AS total FROM trainees t ${whereSql};
  `);

	const canSeeSensitive = canReadSensitive(actor);
	return {
		data: result.recordsets[0].map((r) => maskSensitive(r, canSeeSensitive)),
		pagination: { page: pg.page, limit: pg.limit, total: result.recordsets[1][0].total },
	};
};

const getById = async (id, actor = null) => {
	const pool = await getPool();
	const result = await pool.request().input('id', sql.VarChar(20), id).query(`${traineeSelect} WHERE t.id = @id`);
	const row = result.recordset[0];
	if (!row) return null;
	return maskSensitive(row, canReadSensitive(actor));
};

// opts.fetch=false: bỏ query đọc lại bản ghi — dùng cho import hàng loạt
const create = async (data, actorId, { fetch = true } = {}) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('actor_id', sql.VarChar(20), actorId)
		.input('full_name', sql.NVarChar(150), data.full_name)
		.input('dob', sql.Date, data.dob || null)
		.input('gender', sql.VarChar(10), normalizeGender(data.gender))
		.input('national_id', sql.VarChar(20), data.national_id || null)
		.input('phone', sql.VarChar(20), data.phone || null)
		.input('email', sql.VarChar(100), data.email || null)
		.input('address', sql.NVarChar(255), data.address || null)
		.input('permanent_address', sql.NVarChar(255), data.permanent_address || null)
		.input('trainee_type_id', sql.VarChar(20), data.trainee_type_id || null)
		.input('department_id', sql.VarChar(20), data.department_id || null)
		.input('national_id_issued_date', sql.Date, data.national_id_issued_date || null)
		.input('national_id_issued_place', sql.NVarChar(200), data.national_id_issued_place || null)
		.input('graduated_school', sql.NVarChar(200), data.graduated_school || null)
		.input('graduated_year', sql.SmallInt, data.graduated_year || null)
		.input('workplace', sql.NVarChar(200), data.workplace || null)
		.input('position', sql.NVarChar(100), data.position || null)
		.input('avatar_url', sql.NVarChar(500), data.avatar_url || null)
		.input('qualification', sql.NVarChar(150), data.qualification || null)
		.input('notes', sql.NVarChar(sql.MAX), data.notes || null)
		.input('is_active', sql.Bit, data.is_active !== undefined ? !!data.is_active : true)
		.input('is_employee', sql.Bit, !!data.is_employee)
		.query(`
      DECLARE @new_id VARCHAR(20);
      EXEC sp_gen_trainee_id @actor_id = @actor_id, @new_id = @new_id OUTPUT;
      EXEC sp_set_actor @actor_id;
      INSERT INTO trainees (
        id, full_name, dob, gender, national_id, phone, email, address, permanent_address, trainee_type_id, department_id,
        national_id_issued_date, national_id_issued_place, graduated_school, graduated_year, workplace, position, avatar_url,
        qualification, notes, is_active, is_employee,
        created_by
      )
      VALUES (
        @new_id, @full_name, @dob, @gender, @national_id, @phone, @email, @address, @permanent_address, @trainee_type_id, @department_id,
        @national_id_issued_date, @national_id_issued_place, @graduated_school, @graduated_year, @workplace, @position, @avatar_url,
        @qualification, @notes, @is_active, @is_employee,
        @actor_id
      );
      SELECT @new_id AS id;
    `);
	const id = result.recordset[0].id;
	await personService.syncPerson('trainees', id, { actorId });
	broadcast('update', { entity: 'trainee' });
	return fetch ? getById(id, true) : { id };
};

const update = async (id, data, actorId) => {
	const pool = await getPool();
	const sets = ['updated_at = GETDATE()', 'updated_by = @actor_id'];
	const req = pool.request().input('id', sql.VarChar(20), id).input('actor_id', sql.VarChar(20), actorId);

	const simpleFields = [
		['full_name', sql.NVarChar(150)],
		['national_id', sql.VarChar(20)],
		['phone', sql.VarChar(20)],
		['email', sql.VarChar(100)],
		['address', sql.NVarChar(255)],
		['permanent_address', sql.NVarChar(255)],
		['trainee_type_id', sql.VarChar(20)],
		['department_id', sql.VarChar(20)],
		['national_id_issued_place', sql.NVarChar(200)],
		['graduated_school', sql.NVarChar(200)],
		['workplace', sql.NVarChar(200)],
		['position', sql.NVarChar(100)],
		['avatar_url', sql.NVarChar(500)],
		['qualification', sql.NVarChar(150)],
		['notes', sql.NVarChar(sql.MAX)],
	];
	for (const [field, type] of simpleFields) {
		if (data[field] !== undefined) {
			sets.push(`${field} = @${field}`);
			req.input(field, type, data[field] || null);
		}
	}
	if (data.gender !== undefined) {
		sets.push('gender = @gender');
		req.input('gender', sql.VarChar(10), normalizeGender(data.gender));
	}
	if (data.is_active !== undefined) {
		sets.push('is_active = @is_active');
		req.input('is_active', sql.Bit, !!data.is_active);
	}
	if (data.is_employee !== undefined) {
		sets.push('is_employee = @is_employee');
		req.input('is_employee', sql.Bit, !!data.is_employee);
	}
	if (data.dob !== undefined) {
		sets.push('dob = @dob');
		req.input('dob', sql.Date, data.dob || null);
	}
	if (data.national_id_issued_date !== undefined) {
		sets.push('national_id_issued_date = @national_id_issued_date');
		req.input('national_id_issued_date', sql.Date, data.national_id_issued_date || null);
	}
	if (data.graduated_year !== undefined) {
		sets.push('graduated_year = @graduated_year');
		req.input('graduated_year', sql.SmallInt, data.graduated_year || null);
	}

	await req.query(`EXEC sp_set_actor @actor_id; UPDATE trainees SET ${sets.join(', ')} WHERE id = @id`);
	await personService.syncPerson('trainees', id, { actorId });
	broadcast('update', { entity: 'trainee' });
	return getById(id, true);
};

const remove = async (id, actorId) => {
	const pool = await getPool();
	// Chỉ ẩn khỏi danh sách: học viên còn FK từ course_enrollments... nên không DELETE cứng.
	await pool
		.request()
		.input('id', sql.VarChar(20), id)
		.input('actor_id', sql.VarChar(20), actorId)
		.query('EXEC sp_set_actor @actor_id; UPDATE trainees SET hidden_at = SYSDATETIME() WHERE id = @id');
	broadcast('update', { entity: 'trainee' });
};

// ─── Khóa học / chương trình đào tạo đã đăng ký ─────────────────────────────
// Học viên <-> chương trình đào tạo không có cột liên kết trực tiếp, quan hệ
// đi qua course_enrollments -> courses -> course_programs -> training_programs.
// Hàm này đọc chiều ngược (từ 1 học viên ra danh sách khóa học/chương trình),
// bổ sung cho chiều thuận đã có sẵn ở courseService.listEnrollments.
const listEnrollments = async (traineeId) => {
	const pool = await getPool();
	const r = await pool.request().input('trainee_id', sql.VarChar(20), traineeId).query(`
    SELECT e.id, e.course_id, e.status, e.registered_at, e.decided_at,
           c.name AS course_name, c.start_date, c.end_date,
           (SELECT STRING_AGG(tp.name, ', ') FROM course_programs cp
            JOIN training_programs tp ON tp.id = cp.program_id
            WHERE cp.course_id = c.id) AS program_names
    FROM course_enrollments e
    JOIN courses c ON c.id = e.course_id
    WHERE e.trainee_id = @trainee_id
    ORDER BY e.registered_at DESC
  `);
	return r.recordset;
};

// ─── Hồ sơ học viên (trainee_documents) ─────────────────────────────────────
// Toàn bộ danh sách/xem tài liệu bị chặn ở tầng route bằng quyền
// 'trainees:read_sensitive' — không che riêng từng field như national_id,
// vì bản thân file (ảnh CCCD, bằng cấp...) đã là dữ liệu nhạy cảm.
const listDocuments = async (traineeId) => {
	const pool = await getPool();
	const r = await pool.request().input('trainee_id', sql.VarChar(20), traineeId).query(`
    SELECT d.id, d.doc_type, d.created_at, f.file_name, f.file_url, f.mime_type, f.file_size
    FROM trainee_documents d
    JOIN training_files f ON f.id = d.file_id AND f.is_deleted = 0
    WHERE d.trainee_id = @trainee_id
    ORDER BY d.created_at DESC
  `);
	return r.recordset;
};

const addDocument = async (traineeId, docType, file, actorId) => {
	const pool = await getPool();
	const savedFile = await trainingFileService.saveUploadedFile('trainee_document', traineeId, file, actorId);
	const result = await pool
		.request()
		.input('trainee_id', sql.VarChar(20), traineeId)
		.input('doc_type', sql.VarChar(30), docType || 'other')
		.input('file_id', sql.VarChar(20), savedFile.id)
		.input('actor_id', sql.VarChar(20), actorId)
		.query(`
      DECLARE @new_id VARCHAR(20) = 'HS' + LEFT(REPLACE(NEWID(),'-',''), 18);
      INSERT INTO trainee_documents (id, trainee_id, doc_type, file_id, created_by)
      VALUES (@new_id, @trainee_id, @doc_type, @file_id, @actor_id);
      SELECT @new_id AS id;
    `);
	broadcast('update', { entity: 'trainee_document' });
	return { id: result.recordset[0].id };
};

const removeDocument = async (docId, actorId) => {
	const pool = await getPool();
	const doc = await pool
		.request()
		.input('id', sql.VarChar(20), docId)
		.query('SELECT file_id FROM trainee_documents WHERE id = @id');
	if (!doc.recordset[0]) return;
	await pool.request().input('id', sql.VarChar(20), docId).query('DELETE FROM trainee_documents WHERE id = @id');
	await trainingFileService.softDelete(doc.recordset[0].file_id, actorId);
	broadcast('update', { entity: 'trainee_document' });
};

// ─── Cấp tài khoản đăng nhập cho học viên (D0) ──────────────────────────────
// Mirror topicMemberService.grantAccountsNoEmail: mỗi học viên xử lý trong 1
// transaction ngắn riêng (sp_gen_user_id giữ applock sinh mã tới khi transaction
// commit — gộp nhiều học viên vào 1 transaction lớn sẽ làm khoá bị giữ quá lâu).
// Khác topic_members ở chỗ học viên không thuộc 1 khoa/phòng thống nhất (mỗi
// học viên tự có department_id riêng, có thể null) nên mã NV dùng mã khoa của
// CHÍNH học viên đó, hoặc tiền tố chung 'HV' nếu học viên không gắn khoa nào.
// Mật khẩu mặc định = tên đăng nhập, bắt đổi ở lần đăng nhập đầu
// (users.must_change_password).

const grantAccounts = async (traineeIds, actorId) => {
	const pool = await getPool();

	const traineesResult = await pool.request().query(`
    SELECT t.id, t.full_name, t.email, t.phone, t.department_id,
           d.code AS department_code
    FROM trainees t
    LEFT JOIN departments d ON d.id = t.department_id
    WHERE ISNULL(t.account_granted, 0) = 0
  `);
	const filterIds =
		Array.isArray(traineeIds) && traineeIds.length > 0
			? new Set(traineeIds)
			: null;
	const traineesToProcess = filterIds
		? traineesResult.recordset.filter((row) => filterIds.has(row.id))
		: traineesResult.recordset;

	const traineeRoleId = await requireRoleId(ROLE.TRAINEE);
	const credentials = [];
	const skipped = [];

	for (const trainee of traineesToProcess) {
		// Hậu tố lấy từ mã học viên, KHÔNG lấy từ CCCD: username hiển thị khắp nơi
		// (danh sách, nhật ký, hội đồng...) nên 4 số cuối CCCD trong đó là lộ dữ
		// liệu cá nhân, và giúp đoán username từ CCCD. Trùng thì ensureUniqueUsername
		// tự thêm hậu tố.
		const usernameSeed = String(trainee.id).slice(-4);
		const baseUsername = buildMemberUsername(trainee.full_name, usernameSeed);
		const deptCode = trainee.department_code || 'HV';

		const tx = new sql.Transaction(pool);
		let began = false;
		try {
			await tx.begin();
			began = true;

			await new sql.Request(tx)
				.input('actor_id', sql.VarChar(20), actorId)
				.query(`EXEC sp_set_actor @actor_id`);

			const userId = await genUserIdInTx(tx, deptCode);
			if (!userId) {
				throw new Error('Không sinh được mã tài khoản mới');
			}

			const username = await ensureUniqueUsername(tx, baseUsername, userId);
			const tempPassword = defaultPassword(username);
			const passwordHash = await bcrypt.hash(tempPassword, 12);
			const storedEmail =
				trainee.email && trainee.email.trim()
					? trainee.email.trim()
					: `${userId.toLowerCase()}@trainee.local`;

			await new sql.Request(tx)
				.input('uid', sql.VarChar(20), userId)
				.input('username', sql.VarChar(100), username)
				.input('password', sql.VarChar(255), passwordHash)
				.input('full_name', sql.NVarChar(255), trainee.full_name)
				.input('email', sql.VarChar(255), storedEmail)
				.input('phone_number', sql.VarChar(10), trainee.phone || null)
				.input('department_id', sql.VarChar(20), trainee.department_id || null)
				.input('role_id', sql.VarChar(6), traineeRoleId)
				.input('actor_id', sql.VarChar(20), actorId).query(`
          INSERT INTO users (
            id, username, password, full_name, email,
            phone_number, department_id, role_id, created_by, must_change_password
          )
          VALUES (
            @uid, @username, @password, @full_name, @email,
            @phone_number, @department_id, @role_id, @actor_id, 1
          )
        `);

			await new sql.Request(tx)
				.input('trainee_id', sql.VarChar(20), trainee.id)
				.input('uid', sql.VarChar(20), userId)
				.input('actor_id', sql.VarChar(20), actorId).query(`
          UPDATE trainees
          SET user_id = @uid, account_granted = 1, account_granted_at = GETDATE(),
              updated_at = GETDATE(), updated_by = @actor_id
          WHERE id = @trainee_id
        `);

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
				reason: /U[QX]_users_email/.test(err?.message)
					? `Email ${trainee.email} đã được dùng cho tài khoản khác (có thể học viên đã có tài khoản nhân viên)`
					: err instanceof Error
						? err.message
						: 'Lỗi không xác định',
			});
		}
	}

	if (credentials.length > 0) broadcast('update', { entity: 'trainee' });
	return { credentials, skipped };
};

module.exports = {
	getAll,
	getById,
	create,
	update,
	remove,
	canReadSensitive,
	listEnrollments,
	listDocuments,
	addDocument,
	removeDocument,
	grantAccounts,
};
