const { getPool, sql } = require('../config/db');
const permCache = require('../middlewares/permissionCache');
const { invalidate } = require('../utils/cache');
const { RESOURCE_SCOPES, isScoped, LEGACY_REMOVED_KEYS, normalizeLegacy } = require('./scopes');

// Nâng cấp mô hình phân quyền: phạm vi dữ liệu thành cột role_permissions.scope.
// Idempotent — chạy mỗi lần khởi động (permissions/index.js), hoặc tay:
//   npm run migrate:permissions [-- --dry-run]
//
//   1. Thêm cột role_permissions.scope (+ CHECK) nếu chưa có.
//   2. CHỈ MỘT LẦN — khi DB còn các quyền kiểu cũ (topics:read_all,
//      users:read_department, courses:read_assigned, X:manage dạng wildcard):
//      mỗi vai trò được quy đổi bằng normalizeLegacy (permissions/scopes.js) —
//      giữ nguyên quyền hiệu lực, phạm vi ghi vào cột scope, manage-wildcard
//      bung thành từng quyền cụ thể — rồi xoá các quyền kiểu cũ đó.
//   3. Lượt cấp của resource có phạm vi mà scope còn NULL (vd do phiên bản cũ
//      ghi vào) → gán phạm vi HẸP nhất.
// Bước 2–3 chạy trong 1 transaction: lỗi giữa chừng không để lại dữ liệu dở.

const migratePermissionScopes = async ({ dryRun = false } = {}) => {
	const pool = await getPool();
	const report = { addedColumn: false, roles: [], deletedPermissions: [], filledNullScopes: 0, warnings: [] };

	const hasColumn =
		(await pool.request().query(`SELECT COL_LENGTH('role_permissions', 'scope') AS len`))
			.recordset[0].len != null;
	if (!hasColumn) {
		report.addedColumn = true;
		if (!dryRun) {
			await pool.request().query(`ALTER TABLE role_permissions ADD scope VARCHAR(20) NULL`);
			await pool.request().query(`
        ALTER TABLE role_permissions ADD CONSTRAINT CK_role_permissions_scope
          CHECK (scope IS NULL OR scope IN ('own', 'assigned', 'department', 'all'))
      `);
			permCache.resetSchemaCheck();
		}
	}
	const scopeCol = hasColumn || !dryRun;

	const permRows = (await pool.request().query('SELECT id, resource, action FROM permissions')).recordset;
	const idByKey = new Map(permRows.map((r) => [`${r.resource}:${r.action}`, r.id]));
	const legacyPresent = permRows.filter((r) => LEGACY_REMOVED_KEYS.includes(`${r.resource}:${r.action}`));

	const grantRows = (
		await pool.request().query(`
      SELECT rp.role_id, p.resource, p.action${scopeCol ? ', rp.scope' : ''}
      FROM role_permissions rp INNER JOIN permissions p ON p.id = rp.permission_id
    `)
	).recordset;
	const byRole = new Map();
	for (const g of grantRows) {
		if (!byRole.has(g.role_id)) byRole.set(g.role_id, new Map());
		byRole.get(g.role_id).set(`${g.resource}:${g.action}`, g.scope ?? null);
	}

	// Kế hoạch thay đổi cho từng vai trò
	const plan = [];
	for (const [roleId, current] of byRole) {
		const change = { role_id: roleId, added: [], removed: [], scoped: [] };
		if (legacyPresent.length) {
			const desired = normalizeLegacy(new Set(current.keys()));
			for (const key of desired.keys) {
				if (!idByKey.has(key)) {
					report.warnings.push(`${roleId}: ${key} chưa có trong bảng permissions — bỏ qua`);
					continue;
				}
				const scope = desired.scopes.get(key) ?? null;
				if (!current.has(key)) change.added.push({ key, scope });
				else if (current.get(key) !== scope) change.scoped.push({ key, scope });
			}
			for (const key of current.keys()) {
				if (!desired.keys.has(key)) change.removed.push({ key });
			}
		} else {
			for (const [key, scope] of current) {
				const [resource] = key.split(':');
				if (isScoped(resource) && !scope) {
					change.scoped.push({ key, scope: RESOURCE_SCOPES[resource][0] });
				}
			}
		}
		if (change.added.length || change.removed.length || change.scoped.length) plan.push(change);
	}
	report.roles = plan.map((c) => ({
		role_id: c.role_id,
		added: c.added.map((g) => (g.scope ? `${g.key}@${g.scope}` : g.key)),
		removed: c.removed.map((g) => g.key),
		scoped: c.scoped.map((g) => `${g.key}@${g.scope}`),
	}));
	report.deletedPermissions = legacyPresent.map((r) => `${r.resource}:${r.action}`);
	if (!legacyPresent.length) {
		report.filledNullScopes = plan.reduce((n, c) => n + c.scoped.length, 0);
	}

	if (dryRun || (!plan.length && !legacyPresent.length)) return report;

	const transaction = new sql.Transaction(pool);
	await transaction.begin();
	try {
		const run = (query, params) => {
			const req = new sql.Request(transaction);
			for (const [name, type, value] of params) req.input(name, type, value);
			return req.query(query);
		};
		for (const c of plan) {
			for (const g of c.added) {
				await run(
					`INSERT INTO role_permissions (role_id, permission_id, scope) VALUES (@role_id, @perm_id, @scope)`,
					[
						['role_id', sql.VarChar(20), c.role_id],
						['perm_id', sql.VarChar(20), idByKey.get(g.key)],
						['scope', sql.VarChar(20), g.scope],
					],
				);
			}
			for (const g of c.scoped) {
				await run(
					`UPDATE role_permissions SET scope = @scope WHERE role_id = @role_id AND permission_id = @perm_id`,
					[
						['role_id', sql.VarChar(20), c.role_id],
						['perm_id', sql.VarChar(20), idByKey.get(g.key)],
						['scope', sql.VarChar(20), g.scope],
					],
				);
			}
		}
		// FK_rp_perm là ON DELETE CASCADE → xoá luôn các lượt cấp quyền kiểu cũ.
		for (const r of legacyPresent) {
			await run(`DELETE FROM permissions WHERE id = @id`, [['id', sql.VarChar(20), r.id]]);
		}
		await transaction.commit();
	} catch (err) {
		await transaction.rollback();
		throw err;
	}

	permCache.clear();
	await invalidate('lookup:roles:');
	return report;
};

// ─── Giai đoạn 3: phiên đăng nhập + vai trò hệ thống ─────────────────────────
// Idempotent, tương đương backend/migrations/20260924_02_token_version_role_codes.sql.
//   1. users.token_version — tăng lên là mọi access token cũ của tài khoản hết
//      hiệu lực ngay (reset mật khẩu, đăng xuất mọi thiết bị...).
//   2. roles.code (UNIQUE khi có giá trị), roles.is_system, roles.is_superuser.
//   3. CHỈ MỘT LẦN, khi DB còn quyền system:manage: gán mã + cờ hệ thống cho 8
//      vai trò gốc, vai trò đang có system:manage thành is_superuser = 1, rồi
//      xoá quyền system:manage — superuser là thuộc tính của vai trò, không cấp
//      được qua ma trận phân quyền nữa.
const { LEGACY_ROLE_IDS } = require('../services/roleCodes');
const schema = require('../utils/schema');

const GENDER_CODES_SQL = ['trainees', 'lecturers', 'persons', 'seminar_participants']
	.map(
		(t) => `
      UPDATE ${t} SET gender = CASE
          WHEN gender IN ('Nam', 'nam') THEN 'male'
          WHEN gender IN ('N?', 'n?', N'Nữ', 'Nu', 'nu') THEN 'female'
          WHEN gender IN ('Kh?c', N'Khác', 'Khac', 'khac') THEN 'other'
        END${t === 'seminar_participants' ? ', updated_at = updated_at' : ''}
      WHERE gender IN ('Nam', 'nam', 'N?', 'n?', N'Nữ', 'Nu', 'nu', 'Kh?c', N'Khác', 'Khac', 'khac');`,
	)
	.join('\n');

const migrateRolesAndSessions = async ({ dryRun = false } = {}) => {
	const pool = await getPool();
	const report = { addedColumns: [], codedRoles: [], superuserRoles: [], removedSystemManage: false };
	const colLen = async (t, c) =>
		(await pool.request().query(`SELECT COL_LENGTH('${t}', '${c}') AS len`)).recordset[0].len != null;

	const ddl = [
		['users', 'token_version', `ALTER TABLE users ADD token_version INT NOT NULL CONSTRAINT DF_users_token_version DEFAULT 0`],
		['roles', 'code', `ALTER TABLE roles ADD code VARCHAR(30) NULL`],
		['roles', 'is_system', `ALTER TABLE roles ADD is_system BIT NOT NULL CONSTRAINT DF_roles_is_system DEFAULT 0`],
		['roles', 'is_superuser', `ALTER TABLE roles ADD is_superuser BIT NOT NULL CONSTRAINT DF_roles_is_superuser DEFAULT 0`],
		// Tài khoản đang dùng mật khẩu do người khác cấp (tạo mới / đặt lại) —
		// bắt đổi trước khi dùng hệ thống. Tương đương 2026-10-09_must_change_password.sql.
		['users', 'must_change_password', `ALTER TABLE users ADD must_change_password BIT NOT NULL CONSTRAINT DF_users_must_change_password DEFAULT 0`],
		// Xoay refresh token có phát hiện dùng lại: token cũ được đánh dấu thu hồi
		// (không xoá) và cùng "họ" (family) với token mới. Tương đương
		// 2026-10-10_refresh_token_family.sql.
		['refresh_tokens', 'family_id', `ALTER TABLE refresh_tokens ADD family_id VARCHAR(60) NULL`],
		['refresh_tokens', 'revoked_at', `ALTER TABLE refresh_tokens ADD revoked_at DATETIME2 NULL`],
		// Bước thời gian (30s) của mã TOTP dùng gần nhất — mã cùng bước hoặc cũ
		// hơn bị từ chối (chống dùng lại mã). Tương đương 2026-10-11_2fa_hardening.sql.
		['users', 'totp_last_step', `ALTER TABLE users ADD totp_last_step BIGINT NULL`],
		// Mốc bắt đầu thời gian chuyển tiếp bắt buộc 2FA (permissions/twoFactorPolicy.js)
		['users', 'twofa_required_since', `ALTER TABLE users ADD twofa_required_since DATETIME2 NULL`],
	];
	for (const [t, c, stmt] of ddl) {
		if (await colLen(t, c)) continue;
		report.addedColumns.push(`${t}.${c}`);
		if (!dryRun) await pool.request().query(stmt);
	}
	// CHỈ lần đầu thêm cột: tài khoản chưa từng tự đổi mật khẩu (password_changed_at
	// NULL — gồm mọi tài khoản cấp hàng loạt với mật khẩu chung '123456') phải đổi
	// ở lần đăng nhập tới. Chạy trong batch riêng vì cột vừa ALTER xong.
	if (!dryRun && report.addedColumns.includes('users.must_change_password')) {
		const r = await pool
			.request()
			.query('UPDATE users SET must_change_password = 1 WHERE password_changed_at IS NULL');
		report.forcedPasswordChange = r.rowsAffected[0] ?? 0;
	}
	if (report.addedColumns.length && !dryRun) schema.reset();
	if (dryRun && report.addedColumns.length) return report; // chưa có cột thì chưa tính tiếp được
	if (!dryRun) {
		await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_roles_code' AND object_id = OBJECT_ID('roles'))
        CREATE UNIQUE INDEX UX_roles_code ON roles(code) WHERE code IS NOT NULL
    `);
		await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_rt_family' AND object_id = OBJECT_ID('refresh_tokens'))
        CREATE INDEX IX_rt_family ON refresh_tokens(family_id) WHERE family_id IS NOT NULL
    `);
		// Mã khôi phục 2FA (dùng 1 lần, lưu HMAC — utils/secretBox.keyedHash)
		await pool.request().query(`
      IF OBJECT_ID('user_backup_codes', 'U') IS NULL
      BEGIN
        CREATE TABLE user_backup_codes (
          id         INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
          user_id    VARCHAR(20) NOT NULL
                     CONSTRAINT FK_backup_codes_user REFERENCES users(id) ON DELETE CASCADE,
          code_hash  CHAR(64)    NOT NULL,
          used_at    DATETIME2   NULL,
          created_at DATETIME2   NOT NULL CONSTRAINT DF_backup_codes_created DEFAULT SYSUTCDATETIME()
        );
        CREATE INDEX IX_backup_codes_user ON user_backup_codes(user_id, code_hash);
      END
    `);
		// OTP quên mật khẩu (1 mã/người dùng). Tương đương 2026-10-24_password_reset_otp.sql.
		await pool.request().query(`
      IF OBJECT_ID('password_reset_otps', 'U') IS NULL
        CREATE TABLE password_reset_otps (
          user_id    VARCHAR(20) NOT NULL PRIMARY KEY
                     CONSTRAINT FK_pwreset_user REFERENCES users(id) ON DELETE CASCADE,
          code_hash  CHAR(64)    NOT NULL,
          attempts   INT         NOT NULL CONSTRAINT DF_pwreset_attempts DEFAULT 0,
          expires_at DATETIME2   NOT NULL,
          created_at DATETIME2   NOT NULL CONSTRAINT DF_pwreset_created DEFAULT SYSUTCDATETIME()
        );
    `);
		// Email không trùng giữa các tài khoản (đăng nhập / quên mật khẩu bằng email).
		// Tương đương 2026-10-25_users_email_unique.sql. Schema gốc có thể đã có sẵn
		// UQ_users_email (ngoài repo) → chỉ tạo khi users.email chưa có unique index nào.
		// Dữ liệu đang có email trùng thì CHƯA tạo (tạo sẽ lỗi, chặn server khởi
		// động) — báo ra log để quản trị gộp/sửa.
		const emailIdx = (
			await pool.request().query(`
      IF NOT EXISTS (
        SELECT 1 FROM sys.indexes i
        JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.key_ordinal = 1
        WHERE i.object_id = OBJECT_ID('users') AND i.is_unique = 1
          AND COL_NAME(ic.object_id, ic.column_id) = 'email'
          AND (SELECT COUNT(*) FROM sys.index_columns x WHERE x.object_id = i.object_id AND x.index_id = i.index_id AND x.key_ordinal > 0) = 1
      )
      BEGIN
        IF EXISTS (SELECT 1 FROM users WHERE email <> '' GROUP BY email HAVING COUNT(*) > 1)
          SELECT email, COUNT(*) AS n FROM users WHERE email <> '' GROUP BY email HAVING COUNT(*) > 1;
        ELSE
          CREATE UNIQUE INDEX UX_users_email ON users(email) WHERE email IS NOT NULL AND email <> '';
      END
    `)
		).recordset;
		if (emailIdx?.length)
			console.warn(
				`⚠️  Chưa bật ràng buộc email không trùng: ${emailIdx.length} email đang dùng cho nhiều tài khoản: ${emailIdx.map((r) => `${r.email} (${r.n})`).join(', ')}`,
			);
		// Cấp độ đề tài cấu hình riêng theo từng đợt (chọn ngay khi tạo đợt).
		// Tương đương 2026-10-17_research_round_levels.sql — kiểu cột khoá lấy
		// theo cột id thật để FK không lệch độ dài.
		await pool.request().query(`
      IF OBJECT_ID('research_round_levels', 'U') IS NULL
      BEGIN
        DECLARE @rl INT = COL_LENGTH('research_rounds', 'id'), @ll INT = COL_LENGTH('levels', 'id');
        DECLARE @ddl NVARCHAR(MAX) = N'
          CREATE TABLE research_round_levels (
            round_id   VARCHAR(' + CAST(@rl AS NVARCHAR(5)) + N') NOT NULL,
            level_id   VARCHAR(' + CAST(@ll AS NVARCHAR(5)) + N') NOT NULL,
            created_at DATETIME2(7) NOT NULL CONSTRAINT DF_rrl_created_at DEFAULT GETDATE(),
            CONSTRAINT PK_research_round_levels PRIMARY KEY (round_id, level_id),
            CONSTRAINT FK_rrl_round FOREIGN KEY (round_id) REFERENCES research_rounds (id) ON DELETE CASCADE,
            CONSTRAINT FK_rrl_level FOREIGN KEY (level_id) REFERENCES levels (id) ON DELETE CASCADE
          );
          CREATE NONCLUSTERED INDEX idx_rrl_level ON research_round_levels (level_id);';
        EXEC sp_executesql @ddl;
      END
    `);
		// Đăng ký đề tài trên cổng công khai không có tài khoản đứng sau ⇒
		// created_by = NULL. Tương đương 2026-10-16_public_topic_null_creator.sql.
		await pool.request().query(`
      SET XACT_ABORT ON;
      IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('topics') AND name = 'created_by' AND is_nullable = 0)
      BEGIN
        BEGIN TRANSACTION;
        IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_topics_created_by' AND object_id = OBJECT_ID('topics'))
          DROP INDEX idx_topics_created_by ON topics;
        IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_topics_round_status' AND object_id = OBJECT_ID('topics'))
          DROP INDEX idx_topics_round_status ON topics;
        ALTER TABLE topics ALTER COLUMN created_by VARCHAR(20) NULL;
        CREATE NONCLUSTERED INDEX idx_topics_created_by ON topics(created_by);
        CREATE NONCLUSTERED INDEX idx_topics_round_status ON topics(round_id, status)
          INCLUDE (title, department_id, category_id, level_id, created_by, created_at);
        COMMIT TRANSACTION;
      END
      IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('topic_members') AND name = 'created_by' AND is_nullable = 0)
        ALTER TABLE topic_members ALTER COLUMN created_by VARCHAR(20) NULL;
      IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('approvals') AND name = 'created_by' AND is_nullable = 0)
        ALTER TABLE approvals ALTER COLUMN created_by VARCHAR(20) NULL;
    `);
		// Giới tính lưu mã ASCII male/female/other (utils/gender.js). Dữ liệu cũ
		// ghi nhãn "Nam"/"Nữ" vào cột VARCHAR nên "Nữ" đã mất dấu thành "N?".
		// Tương đương 2026-10-18_gender_codes.sql. Idempotent.
		await pool.request().query(GENDER_CODES_SQL);
		// Loại đề thi trắc nghiệm / tự luận. Tương đương 2026-10-19_exam_paper_type.sql.
		await pool.request().query(`
      IF OBJECT_ID('exam_papers', 'U') IS NOT NULL AND COL_LENGTH('exam_papers', 'paper_type') IS NULL
        ALTER TABLE exam_papers ADD paper_type VARCHAR(20) NULL
          CONSTRAINT CHK_exampapers_type CHECK (paper_type IN ('multiple_choice', 'essay'));
    `);
		// Điểm danh QR ràng buộc thiết bị. Tương đương 2026-10-20_checkin_device.sql.
		await pool.request().query(`
      IF OBJECT_ID('attendance', 'U') IS NOT NULL AND COL_LENGTH('attendance', 'checkin_device_id') IS NULL
        ALTER TABLE attendance ADD checkin_device_id VARCHAR(64) NULL;
      IF OBJECT_ID('seminar_participants', 'U') IS NOT NULL AND COL_LENGTH('seminar_participants', 'checkin_device_id') IS NULL
        ALTER TABLE seminar_participants ADD checkin_device_id VARCHAR(64) NULL;
    `);
		// Xoá học viên = ẩn khỏi danh sách (giữ lịch sử đăng ký/điểm). Tương đương 2026-10-22_trainee_hidden.sql.
		await pool.request().query(`
      IF OBJECT_ID('trainees', 'U') IS NOT NULL AND COL_LENGTH('trainees', 'hidden_at') IS NULL
        ALTER TABLE trainees ADD hidden_at DATETIME2 NULL;
    `);
		// CME tự khai chờ duyệt. Tương đương 2026-10-23_cme_record_approval.sql.
		await pool.request().query(`
      IF OBJECT_ID('cme_records', 'U') IS NOT NULL AND COL_LENGTH('cme_records', 'approval_status') IS NULL
        ALTER TABLE cme_records ADD approval_status VARCHAR(20) NOT NULL
          CONSTRAINT DF_cme_records_approval DEFAULT 'approved'
          CONSTRAINT CHK_cme_records_approval CHECK (approval_status IN ('pending','approved','rejected'));
      IF OBJECT_ID('cme_records', 'U') IS NOT NULL AND COL_LENGTH('cme_records', 'reviewed_by') IS NULL
        ALTER TABLE cme_records ADD reviewed_by VARCHAR(20) NULL, reviewed_at DATETIME NULL, reject_reason NVARCHAR(500) NULL;
    `);
		// Đăng ký hội nghị qua QR + vé + bài test. Tương đương 2026-10-21_seminar_registration.sql.
		await pool.request().query(`
      IF OBJECT_ID('seminars', 'U') IS NOT NULL AND COL_LENGTH('seminars', 'public_token') IS NULL
        ALTER TABLE seminars ADD public_token VARCHAR(32) NULL;
      IF OBJECT_ID('seminars', 'U') IS NOT NULL AND COL_LENGTH('seminars', 'test_questions') IS NULL
        ALTER TABLE seminars ADD test_questions NVARCHAR(MAX) NULL;
      IF OBJECT_ID('seminars', 'U') IS NOT NULL AND COL_LENGTH('seminars', 'test_open') IS NULL
        ALTER TABLE seminars ADD test_open BIT NOT NULL CONSTRAINT DF_seminars_test_open DEFAULT (0);
      IF OBJECT_ID('seminar_participants', 'U') IS NOT NULL AND COL_LENGTH('seminar_participants', 'ticket_code') IS NULL
        ALTER TABLE seminar_participants ADD ticket_code VARCHAR(32) NULL, phone VARCHAR(20) NULL,
          email NVARCHAR(255) NULL, test_answers NVARCHAR(MAX) NULL, test_correct INT NULL,
          test_total INT NULL, test_submitted_at DATETIME NULL;
    `);
		await pool.request().query(`
      IF OBJECT_ID('seminars', 'U') IS NOT NULL
      BEGIN
        UPDATE seminars SET public_token = LOWER(REPLACE(CONVERT(VARCHAR(36), NEWID()), '-', ''))
        WHERE public_token IS NULL;
        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_seminars_public_token' AND object_id = OBJECT_ID('seminars'))
          CREATE UNIQUE NONCLUSTERED INDEX UX_seminars_public_token ON seminars (public_token) WHERE public_token IS NOT NULL;
      END
      IF OBJECT_ID('seminar_participants', 'U') IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_sp_ticket_code' AND object_id = OBJECT_ID('seminar_participants'))
        CREATE UNIQUE NONCLUSTERED INDEX UX_sp_ticket_code ON seminar_participants (ticket_code) WHERE ticket_code IS NOT NULL;
    `);
		// Giờ hội nghị, khung giờ bài test, chương trình. Tương đương 2026-10-31_seminar_schedule_agenda.sql.
		await pool.request().query(`
      IF OBJECT_ID('seminars', 'U') IS NOT NULL AND COL_LENGTH('seminars', 'start_time') IS NULL
        ALTER TABLE seminars ADD start_time VARCHAR(5) NULL, end_time VARCHAR(5) NULL;
      IF OBJECT_ID('seminars', 'U') IS NOT NULL AND COL_LENGTH('seminars', 'test_date') IS NULL
        ALTER TABLE seminars ADD test_date DATE NULL, test_start_time VARCHAR(5) NULL, test_end_time VARCHAR(5) NULL;
      IF OBJECT_ID('seminars', 'U') IS NOT NULL AND COL_LENGTH('seminars', 'agenda') IS NULL
        ALTER TABLE seminars ADD agenda NVARCHAR(MAX) NULL;
    `);
		// systemSettingService.update() ghi created_by. Tương đương 2026-10-26_system_settings_created.sql.
		await pool.request().query(`
      IF OBJECT_ID('system_settings', 'U') IS NOT NULL AND COL_LENGTH('system_settings', 'created_at') IS NULL
        ALTER TABLE system_settings ADD created_at DATETIME NOT NULL
          CONSTRAINT DF_system_settings_created_at DEFAULT (GETDATE());
      IF OBJECT_ID('system_settings', 'U') IS NOT NULL AND COL_LENGTH('system_settings', 'created_by') IS NULL
        ALTER TABLE system_settings ADD created_by VARCHAR(20) NULL;
    `);
		// Ảnh minh hoạ câu hỏi. Tương đương 2026-10-27_question_image.sql.
		await pool.request().query(`
      IF OBJECT_ID('question_bank', 'U') IS NOT NULL AND COL_LENGTH('question_bank', 'image_url') IS NULL
        ALTER TABLE question_bank ADD image_url NVARCHAR(500) NULL;
    `);
		// Chấm công nhân viên. Tương đương 2026-10-29_staff_attendance.sql.
		await pool.request().query(`
      IF OBJECT_ID('staff_attendance', 'U') IS NULL
      BEGIN
        CREATE TABLE staff_attendance (
          id                   INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_staff_attendance PRIMARY KEY,
          user_id              VARCHAR(20) NOT NULL
                               CONSTRAINT FK_staff_attendance_user REFERENCES users(id) ON DELETE CASCADE,
          work_date            DATE        NOT NULL,
          check_in_at          DATETIME2   NOT NULL,
          check_in_ip          VARCHAR(45) NULL,
          check_in_distance_m  INT         NULL,
          check_out_at         DATETIME2   NULL,
          check_out_ip         VARCHAR(45) NULL,
          check_out_distance_m INT         NULL,
          CONSTRAINT UQ_staff_attendance_user_date UNIQUE (user_id, work_date)
        );
        CREATE INDEX IX_staff_attendance_date ON staff_attendance(work_date);
      END
    `);
		// Chấm công theo ca. Tương đương 2026-10-30_attendance_shifts.sql.
		await pool.request().query(`
      IF OBJECT_ID('work_shifts', 'U') IS NULL
        CREATE TABLE work_shifts (
          id                 INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_work_shifts PRIMARY KEY,
          name               NVARCHAR(100) NOT NULL,
          code               NVARCHAR(10)  NOT NULL,
          color              VARCHAR(20)   NULL,
          start_time         CHAR(5)       NOT NULL,
          end_time           CHAR(5)       NOT NULL,
          checkin_before_min INT           NOT NULL CONSTRAINT DF_work_shifts_before DEFAULT 30,
          checkout_after_min INT           NOT NULL CONSTRAINT DF_work_shifts_after DEFAULT 120,
          grace_min          INT           NOT NULL CONSTRAINT DF_work_shifts_grace DEFAULT 5,
          is_active          BIT           NOT NULL CONSTRAINT DF_work_shifts_active DEFAULT 1,
          created_at         DATETIME2     NOT NULL CONSTRAINT DF_work_shifts_created DEFAULT SYSUTCDATETIME(),
          updated_at         DATETIME2     NULL
        );
    `);
		await pool.request().query(`
      IF OBJECT_ID('shift_patterns', 'U') IS NULL
      BEGIN
        CREATE TABLE shift_patterns (
          id         INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_shift_patterns PRIMARY KEY,
          name       NVARCHAR(100) NOT NULL,
          days       NVARCHAR(MAX) NOT NULL,
          is_default BIT           NOT NULL CONSTRAINT DF_shift_patterns_default DEFAULT 0,
          created_at DATETIME2     NOT NULL CONSTRAINT DF_shift_patterns_created DEFAULT SYSUTCDATETIME(),
          updated_at DATETIME2     NULL
        );
        CREATE UNIQUE INDEX UX_shift_patterns_default ON shift_patterns(is_default) WHERE is_default = 1;
      END
    `);
		await pool.request().query(`
      IF COL_LENGTH('users', 'shift_pattern_id') IS NULL
        ALTER TABLE users ADD shift_pattern_id INT NULL
          CONSTRAINT FK_users_shift_pattern REFERENCES shift_patterns(id) ON DELETE SET NULL;
    `);
		await pool.request().query(`
      IF OBJECT_ID('shift_assignments', 'U') IS NULL
      BEGIN
        CREATE TABLE shift_assignments (
          id         INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_shift_assignments PRIMARY KEY,
          user_id    VARCHAR(20) NOT NULL
                     CONSTRAINT FK_shift_assignments_user REFERENCES users(id) ON DELETE CASCADE,
          work_date  DATE        NOT NULL,
          shift_id   INT         NULL CONSTRAINT FK_shift_assignments_shift REFERENCES work_shifts(id),
          updated_by VARCHAR(20) NULL,
          updated_at DATETIME2   NOT NULL CONSTRAINT DF_shift_assignments_updated DEFAULT SYSUTCDATETIME(),
          CONSTRAINT UQ_shift_assignments UNIQUE (user_id, work_date, shift_id)
        );
        CREATE INDEX IX_shift_assignments_date ON shift_assignments(work_date);
      END
    `);
		await pool.request().query(`
      IF OBJECT_ID('staff_attendance', 'U') IS NOT NULL AND COL_LENGTH('staff_attendance', 'shift_id') IS NULL
        ALTER TABLE staff_attendance ADD
          shift_id INT NULL, shift_name NVARCHAR(100) NULL, shift_code NVARCHAR(10) NULL,
          shift_start_at DATETIME2 NULL, shift_end_at DATETIME2 NULL, late_min INT NULL, early_min INT NULL;
    `);
		// Mỗi bước 1 batch: bảng/cột phải có trước khi FK/ràng buộc tham chiếu tới nó
		await pool.request().query(`
      IF OBJECT_ID('UQ_staff_attendance_user_date', 'UQ') IS NOT NULL
        ALTER TABLE staff_attendance DROP CONSTRAINT UQ_staff_attendance_user_date;
      IF OBJECT_ID('staff_attendance', 'U') IS NOT NULL AND OBJECT_ID('UQ_staff_attendance_user_date_shift', 'UQ') IS NULL
        ALTER TABLE staff_attendance ADD CONSTRAINT UQ_staff_attendance_user_date_shift UNIQUE (user_id, work_date, shift_id);
    `);
		// Luồng Đào tạo (khóa học ↔ kế hoạch, môn học → bài học): chạy thẳng file
		// migration idempotent, tách batch theo GO, bỏ USE/PRINT.
		const flowSql = require('fs').readFileSync(
			require('path').join(__dirname, '../../migrations/2026-11-01_training_flow.sql'),
			'utf8',
		);
		for (const batch of flowSql.split(/^\s*GO\s*$/m)) {
			const body = batch.replace(/^\s*(USE|PRINT)\b.*$/gm, '').trim();
			if (body && !/^\/\*[\s\S]*\*\/$/.test(body)) await pool.request().query(body);
		}
	}

	const sysPerm = (
		await pool.request().query(`SELECT id FROM permissions WHERE resource = 'system' AND action = 'manage'`)
	).recordset[0];
	if (!sysPerm) return report;

	const roles = (await pool.request().query('SELECT id, code FROM roles')).recordset;
	const taken = new Set(roles.map((r) => r.code).filter(Boolean));
	for (const [code, id] of Object.entries(LEGACY_ROLE_IDS)) {
		const role = roles.find((r) => r.id === id);
		if (role && !role.code && !taken.has(code)) report.codedRoles.push(`${id}=${code}`);
	}
	report.superuserRoles = (
		await pool
			.request()
			.input('pid', sql.VarChar(20), sysPerm.id)
			.query('SELECT DISTINCT role_id FROM role_permissions WHERE permission_id = @pid')
	).recordset.map((r) => r.role_id);
	report.removedSystemManage = true;
	if (dryRun) return report;

	const transaction = new sql.Transaction(pool);
	await transaction.begin();
	try {
		for (const pair of report.codedRoles) {
			const [id, code] = pair.split('=');
			await new sql.Request(transaction)
				.input('id', sql.VarChar(20), id)
				.input('code', sql.VarChar(30), code)
				.query('UPDATE roles SET code = @code, is_system = 1 WHERE id = @id AND code IS NULL');
		}
		// Vai trò gốc đã có mã từ trước (chạy tay...) vẫn phải là vai trò hệ thống
		const ids = Object.values(LEGACY_ROLE_IDS);
		const req = new sql.Request(transaction);
		ids.forEach((id, i) => req.input(`r${i}`, sql.VarChar(20), id));
		await req.query(`UPDATE roles SET is_system = 1 WHERE is_system = 0 AND id IN (${ids.map((_, i) => `@r${i}`).join(',')})`);
		await new sql.Request(transaction)
			.input('pid', sql.VarChar(20), sysPerm.id)
			.query(`
        UPDATE roles SET is_superuser = 1
        WHERE id IN (SELECT role_id FROM role_permissions WHERE permission_id = @pid);
        DELETE FROM permissions WHERE id = @pid;
      `);
		await transaction.commit();
	} catch (err) {
		await transaction.rollback();
		throw err;
	}
	permCache.clear();
	require('../services/roleCodes').clear();
	await invalidate('lookup:roles:');
	return report;
};

const summarizeRoles = (report) => {
	const parts = [];
	if (report.addedColumns.length) parts.push(`thêm cột ${report.addedColumns.join(', ')}`);
	if (report.forcedPasswordChange) {
		parts.push(`${report.forcedPasswordChange} tài khoản chưa từng đổi mật khẩu phải đổi ở lần đăng nhập tới`);
	}
	if (report.codedRoles.length) parts.push(`gán mã ${report.codedRoles.join(', ')}`);
	if (report.removedSystemManage) {
		parts.push(`superuser chuyển thành cờ vai trò (${report.superuserRoles.join(', ') || 'không vai trò nào'}), bỏ quyền system:manage`);
	}
	return parts.join('; ');
};

// Tóm tắt 1 dòng cho log khởi động.
const summarize = (report) => {
	const parts = [];
	if (report.addedColumn) parts.push('thêm cột role_permissions.scope');
	if (report.deletedPermissions.length) {
		parts.push(`quy đổi ${report.roles.length} vai trò, bỏ ${report.deletedPermissions.length} quyền kiểu cũ`);
	}
	if (report.filledNullScopes) parts.push(`gán phạm vi cho ${report.filledNullScopes} lượt cấp còn trống`);
	return parts.join('; ');
};

module.exports = { migratePermissionScopes, summarize, migrateRolesAndSessions, summarizeRoles };
