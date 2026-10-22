const bcrypt = require('bcrypt');
const { getPool, sql } = require('../../../config/db');
const { broadcast } = require('../../events/eventService');
const { paging } = require('../../../utils/paging');
const trainingFileService = require('../trainingFileService');
const personService = require('../../persons/personService');
const { normalizeGender } = require('../../../utils/gender');
const { hasPermission } = require('../../../permissions/authz');
const { buildMemberUsername, ensureUniqueUsername } = require('../../topics/topicMemberService');
const { ROLE, requireRoleId } = require('../../access/roleCodes');
const { defaultPassword } = require('../../../utils/passwordPolicy');
const { DOC_COUNT_APPLY, DOC_MISSING_SQL } = require('./traineeDocumentSql');
const userService = require('../../users/userService');
const { httpError } = require('../../../utils/httpError');
const userStatusCache = require('../../../permissions/userStatusCache');

// extraCols/extraJoins: cột & OUTER APPLY thêm cho danh sách lọc theo loại khóa.
const traineeSelectWith = (extraCols = '', extraJoins = '') => `
  SELECT t.*, tt.name AS trainee_type_name, d.name AS department_name,
         au.username AS account_username, au.is_active AS account_active${extraCols}
  FROM trainees t
  LEFT JOIN trainee_types tt ON tt.id = t.trainee_type_id
  LEFT JOIN departments d ON d.id = t.department_id
  LEFT JOIN users au ON au.id = t.user_id
  ${extraJoins}
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

const getAll = async (
	{
		page = 1,
		limit = 20,
		search = undefined,
		trainee_type_id = undefined,
		department_id = undefined,
		training_type_id = undefined,
		missing_docs = undefined,
	} = {},
	actor = null,
) => {
	const pool = await getPool();
	const pg = paging(page, limit, 100);
	const where = ['t.hidden_at IS NULL'];
	const req = pool.request().input('offset', sql.Int, pg.offset).input('limit', sql.Int, pg.limit);

	if (search) {
		where.push(
			'(t.full_name LIKE @search OR t.national_id LIKE @search OR t.phone LIKE @search OR t.email LIKE @search)',
		);
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
	// Loại học viên (GPHN / ĐTLT / CTCV) suy ra từ khóa đã ghi danh — 1 người có
	// thể thuộc nhiều loại. Đếm cho tab dùng mọi bộ lọc trừ chính loại này.
	// Thiếu giấy tờ bắt buộc theo loại khóa đã ghi danh (giai đoạn 3)
	if (missing_docs === '1' || missing_docs === true) where.push(DOC_MISSING_SQL);
	const countWhereSql = `WHERE ${where.join(' AND ')}`;
	if (training_type_id) {
		where.push(`EXISTS (SELECT 1 FROM course_enrollments e JOIN courses c ON c.id = e.course_id
		  WHERE e.trainee_id = t.id AND e.status <> 'rejected' AND c.training_type_id = @training_type_id)`);
		req.input('training_type_id', sql.VarChar(20), training_type_id);
	}
	const whereSql = `WHERE ${where.join(' AND ')}`;

	// Lượt ghi danh gần nhất thuộc loại đang lọc — cột riêng của từng tab.
	const latestEnrollment = training_type_id
		? `OUTER APPLY (
		    SELECT TOP 1 e.id AS enrollment_id, e.practice_code, e.start_date AS enrollment_start_date,
		           e.end_date AS enrollment_end_date, e.status AS enrollment_status,
		           c.name AS course_name, tp.name AS program_name,
		           (SELECT TOP 1 r.department_name FROM enrollment_rotations r
		            WHERE r.enrollment_id = e.id AND CAST(GETDATE() AS DATE) BETWEEN r.start_date AND r.end_date
		            ORDER BY r.seq) AS current_department,
		           (SELECT COUNT(*) FROM course_enrollments e2 JOIN courses c2 ON c2.id = e2.course_id
		            WHERE e2.trainee_id = t.id AND e2.status <> 'rejected' AND c2.training_type_id = @training_type_id) AS type_enrollment_count
		    FROM course_enrollments e
		    JOIN courses c ON c.id = e.course_id
		    LEFT JOIN training_programs tp ON tp.id = e.program_id
		    WHERE e.trainee_id = t.id AND e.status <> 'rejected' AND c.training_type_id = @training_type_id
		    ORDER BY e.created_at DESC
		  ) le`
		: '';

	const result = await req.query(`
    ${traineeSelectWith(
			`, dc.doc_required, ISNULL(dc.doc_done, 0) AS doc_done${training_type_id ? ', le.*' : ''}`,
			`${latestEnrollment} ${DOC_COUNT_APPLY}`,
		)} ${whereSql}
    ORDER BY t.created_at DESC
    ${pg.fetchClause};
    SELECT COUNT(*) AS total FROM trainees t ${whereSql};
    SELECT c.training_type_id, COUNT(DISTINCT t.id) AS total
    FROM trainees t
    JOIN course_enrollments e ON e.trainee_id = t.id AND e.status <> 'rejected'
    JOIN courses c ON c.id = e.course_id
    ${countWhereSql} AND c.training_type_id IS NOT NULL
    GROUP BY c.training_type_id;
    SELECT COUNT(*) AS total FROM trainees t ${countWhereSql};
  `);

	const canSeeSensitive = canReadSensitive(actor);
	return {
		data: result.recordsets[0].map((r) => maskSensitive(r, canSeeSensitive)),
		pagination: { page: pg.page, limit: pg.limit, total: result.recordsets[1][0].total },
		type_counts: {
			'': result.recordsets[3][0].total,
			...Object.fromEntries(result.recordsets[2].map((r) => [r.training_type_id, r.total])),
		},
	};
};

const getById = async (id, actor = null) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('id', sql.VarChar(20), id)
		// Kèm số giấy tờ bắt buộc + số lượt ghi danh cho thẻ tóm tắt ở trang hồ sơ học viên
		.query(
			`${traineeSelectWith(
				`, dc.doc_required, ISNULL(dc.doc_done, 0) AS doc_done,
				  (SELECT COUNT(*) FROM course_enrollments ce WHERE ce.trainee_id = t.id AND ce.status <> 'rejected') AS enrollment_count`,
				DOC_COUNT_APPLY,
			)} WHERE t.id = @id`,
		);
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
		.input('birth_province', sql.NVarChar(100), data.birth_province || null)
		.input('graduated_date', sql.Date, data.graduated_date || null)
		.input('degree_issued_date', sql.Date, data.degree_issued_date || null)
		.input('legacy_code', sql.NVarChar(30), data.legacy_code || null)
		.input('notes', sql.NVarChar(sql.MAX), data.notes || null)
		.input('is_active', sql.Bit, data.is_active !== undefined ? !!data.is_active : true)
		.input('is_employee', sql.Bit, !!data.is_employee).query(`
      DECLARE @new_id VARCHAR(20);
      EXEC sp_gen_trainee_id @actor_id = @actor_id, @new_id = @new_id OUTPUT;
      EXEC sp_set_actor @actor_id;
      INSERT INTO trainees (
        id, full_name, dob, gender, national_id, phone, email, address, permanent_address, trainee_type_id, department_id,
        national_id_issued_date, national_id_issued_place, graduated_school, graduated_year, workplace, position, avatar_url,
        qualification, notes, is_active, is_employee,
        birth_province, graduated_date, degree_issued_date, legacy_code,
        created_by
      )
      VALUES (
        @new_id, @full_name, @dob, @gender, @national_id, @phone, @email, @address, @permanent_address, @trainee_type_id, @department_id,
        @national_id_issued_date, @national_id_issued_place, @graduated_school, @graduated_year, @workplace, @position, @avatar_url,
        @qualification, @notes, @is_active, @is_employee,
        @birth_province, @graduated_date, @degree_issued_date, @legacy_code,
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
	const req = pool
		.request()
		.input('id', sql.VarChar(20), id)
		.input('actor_id', sql.VarChar(20), actorId);

	/** @type {Array<[string, any]>} [cột, kiểu SQL] */
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
		['birth_province', sql.NVarChar(100)],
		['legacy_code', sql.NVarChar(30)],
		['graduated_date', sql.Date],
		['degree_issued_date', sql.Date],
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

	await req.query(
		`EXEC sp_set_actor @actor_id; UPDATE trainees SET ${sets.join(', ')} WHERE id = @id`,
	);
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
		.query(
			'EXEC sp_set_actor @actor_id; UPDATE trainees SET hidden_at = SYSDATETIME() WHERE id = @id',
		);
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
           e.program_id, ep.code AS program_code, ep.name AS program_name,
           e.practice_code, e.progress_status, e.start_date AS practice_start_date, e.end_date AS practice_end_date,
           c.name AS course_name, c.start_date, c.end_date, tt.name AS training_type_name,
           (SELECT STRING_AGG(tp.name, ', ') FROM course_programs cp
            JOIN training_programs tp ON tp.id = cp.program_id
            WHERE cp.course_id = c.id) AS program_names
    FROM course_enrollments e
    JOIN courses c ON c.id = e.course_id
    LEFT JOIN training_programs ep ON ep.id = e.program_id
    LEFT JOIN training_types tt ON tt.id = c.training_type_id
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
    SELECT d.id, d.doc_type, d.status, d.review_note, d.created_at, dt.name AS doc_type_name,
           f.file_name, f.file_url, f.mime_type, f.file_size
    FROM trainee_documents d
    LEFT JOIN trainee_document_types dt ON dt.id = d.doc_type
    JOIN training_files f ON f.id = d.file_id AND f.is_deleted = 0
    WHERE d.trainee_id = @trainee_id
    ORDER BY d.created_at DESC
  `);
	return r.recordset;
};

const addDocument = async (traineeId, docType, file, actorId) => {
	const pool = await getPool();
	const savedFile = await trainingFileService.saveUploadedFile(
		'trainee_document',
		traineeId,
		file,
		actorId,
	);
	const result = await pool
		.request()
		.input('trainee_id', sql.VarChar(20), traineeId)
		.input('doc_type', sql.VarChar(30), docType || 'other')
		.input('file_id', sql.VarChar(20), savedFile.id)
		.input('actor_id', sql.VarChar(20), actorId).query(`
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
	await pool
		.request()
		.input('id', sql.VarChar(20), docId)
		.query('DELETE FROM trainee_documents WHERE id = @id');
	await trainingFileService.softDelete(doc.recordset[0].file_id, actorId);
	broadcast('update', { entity: 'trainee_document' });
};

// ─── Cấp tài khoản đăng nhập cho học viên (D0) ──────────────────────────────
// Tài khoản học viên CẤP RIÊNG, không gộp vào tài khoản nội viện: mã 'HV' +
// NNNNNN (không theo mã khoa như nhân viên 'NV<khoa>NNNN'), không gắn khoa/phòng,
// vai trò Học viên, và bị loại khỏi trang Quản lý người dùng — quản lý (khoá,
// đặt lại mật khẩu) ngay tại hồ sơ học viên. Học viên là nhân viên trong viện
// vẫn được cấp tài khoản học viên riêng, không dùng lại tài khoản nhân viên.
// Mỗi học viên xử lý trong 1 transaction ngắn riêng (khoá dải mã 'HV' giữ tới
// khi commit — gộp nhiều học viên vào 1 transaction lớn sẽ giữ khoá quá lâu).
// Mật khẩu mặc định = tên đăng nhập, bắt đổi ở lần đăng nhập đầu
// (users.must_change_password).

const TRAINEE_USER_PREFIX = 'HV';

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

const grantAccounts = async (traineeIds, actorId) => {
	const pool = await getPool();

	const traineesResult = await pool.request().query(`
    SELECT t.id, t.full_name, t.email, t.phone
    FROM trainees t
    WHERE ISNULL(t.account_granted, 0) = 0
  `);
	const filterIds = Array.isArray(traineeIds) && traineeIds.length > 0 ? new Set(traineeIds) : null;
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

			const username = await ensureUniqueUsername(tx, baseUsername, userId);
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
				reason: err instanceof Error ? err.message : 'Lỗi không xác định',
			});
		}
	}

	if (credentials.length > 0) broadcast('update', { entity: 'trainee' });
	return { credentials, skipped };
};

// Tài khoản học viên quản lý tại đây (không qua trang Quản lý người dùng).
// Trả user_id của tài khoản học viên, 404 nếu học viên chưa được cấp tài khoản.
const accountUserIdOf = async (traineeId) => {
	const pool = await getPool();
	const row = (
		await pool.request().input('id', sql.VarChar(20), traineeId).query(`
      SELECT t.user_id FROM trainees t
      JOIN users u ON u.id = t.user_id
      WHERE t.id = @id
    `)
	).recordset[0];
	if (!row) throw httpError(404, 'Học viên chưa được cấp tài khoản');
	return row.user_id;
};

// Đặt lại mật khẩu về mặc định (= tên đăng nhập), thu hồi mọi phiên đang mở.
const resetAccountPassword = async (traineeId, actorId, ip = null) => {
	const userId = await accountUserIdOf(traineeId);
	const result = await userService.resetPassword(userId, null, actorId, ip);
	broadcast('update', { entity: 'trainee' });
	return result;
};

// Khoá / mở khoá tài khoản học viên. Không qua userService.update: hàm đó đồng
// bộ users → persons (danh tính nhân viên), tài khoản học viên không thuộc đó.
const setAccountActive = async (traineeId, isActive, actorId) => {
	const userId = await accountUserIdOf(traineeId);
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
	resetAccountPassword,
	setAccountActive,
};
