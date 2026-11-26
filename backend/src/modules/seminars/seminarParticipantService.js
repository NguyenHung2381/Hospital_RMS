/**
 * seminarParticipantService.js — người tham dự / được cử đi + cấp CME.
 *
 * Số quyết định CME (SQĐ) sinh qua genCmeNo (utils/idGenerator): dãy chạy theo NĂM, 1..N liên
 * tục cho mọi hội nghị trong năm; sang năm mới reset. Cấp nhiều người một lần
 * thì cấp tuần tự trong 1 transaction để giữ dãy liền mạch.
 */
const { signToken, verifyToken } = require('../../utils/keys');
const {
	getPool,
	sql,
	withTransaction,
	withActorTransaction,
	actorRequest,
	withActor,
	boolExpr,
	jsonValues,
	nowSql,
	utcNowSql,
	outerApply,
	queryBatch,
} = require('../../config/db');
const { broadcast } = require('../events/eventService');
const formCustomValueService = require('../forms/formCustomValueService');
const personService = require('../persons/personService');
const { normalizeGender } = require('../../utils/gender');
const { httpError } = require('../../utils/httpError');
const { isUniqueViolation, constraintName } = require('../../utils/dbErrors');
const { randomId } = require('../../utils/idGenerator');
const { deptAccountJoinSql, isDeptAccountJoinedSql } = require('../../utils/deptAccount');

// Mã QR điểm danh hội thảo — JWT ngắn hạn ký seminar_id (mirror
// courseService.generateAttendanceQrToken / utils/captcha.js).
const CHECKIN_QR_TTL = '75s'; // xem giải thích ở training/courses/courseAttendanceService.js (ATTENDANCE_QR_TTL)
const CHECKIN_QR_PURPOSE = 'seminar_checkin_qr';

// Dòng do chính người tham dự tạo (p = seminar_participants): tự đăng ký qua QR (có vé), hoặc
// tự đăng ký tập huấn trên cổng (/me/hospital-trainings — không vé, created_by = user_id).
// Những dòng này phải điểm danh mới được cấp CME / mới tính là đã tham dự (M-08 audit
// run-5); dòng ban tổ chức thêm / nhập Excel thì không. Ban tổ chức tự thêm chính mình
// cũng bị coi là tự đăng ký (phải điểm danh) — chấp nhận được. Biểu thức không bao giờ ra
// NULL (dòng cũ created_by NULL vẫn là "BTC thêm"), để NOT ... trong CME_ELIGIBLE_SQL đúng.
const SELF_CREATED_SQL = `(p.ticket_code IS NOT NULL OR (p.user_id IS NOT NULL
  AND p.created_by IS NOT NULL AND p.created_by = p.user_id))`;

const PART_TYPES = ['attendee', 'speaker', 'chair', 'organizer', 'trainee'];
const SOURCES = ['internal', 'external'];
// Sinh id trong SQL: 'SPT' + 21 hex = 24 ký tự
const newParticipantId = () => randomId('SPT', 21);

const listBySeminar = async (seminarId) => {
	const pool = await getPool();
	const r = await pool.request().input('id', sql.VarChar(20), seminarId).query(`
      SELECT p.*, u.full_name AS user_full_name, u.staff_number AS user_staff_number,
             d.name AS user_department_name
      FROM seminar_participants p
      LEFT JOIN users u ON u.id = p.user_id
      LEFT JOIN departments d ON d.id = u.department_id
      WHERE p.seminar_id = @id
      ORDER BY
        CASE p.participation_type WHEN 'chair' THEN 0 WHEN 'speaker' THEN 1
             WHEN 'organizer' THEN 2 WHEN 'attendee' THEN 3 ELSE 4 END,
        p.cme_seq, p.full_name;
    `);
	// Trường tùy chỉnh người đăng ký điền ở form công khai (Cấu hình form)
	const custom = await formCustomValueService.getMany(
		'seminar_participant',
		r.recordset.map((p) => p.id),
	);
	return r.recordset.map((p) => ({ ...p, custom: custom.get(p.id) || {} }));
};

const ensureSeminar = async (pool, seminarId) => {
	const s = await pool
		.request()
		.input('id', sql.VarChar(20), seminarId)
		.query('SELECT id, event_year, cme_default_credits FROM seminars WHERE id = @id');
	if (!s.recordset.length) {
		throw httpError(404, 'Hội thảo/hội nghị không tồn tại.');
	}
	return s.recordset[0];
};

const normType = (t) => (PART_TYPES.includes(t) ? t : 'attendee');
const normSource = (s) => (SOURCES.includes(s) ? s : 'internal');

// Mỗi tài khoản tối đa 1 dòng / hội thảo (ux_sp_seminar_user — migration 2026-12-31, L-06
// audit run-5): kiểm "đã có chưa" rồi mới INSERT ở 2 bước rời nhau không chặn được 2 yêu cầu
// song song, nên ràng buộc nằm ở CSDL.
const UX_SEMINAR_USER = 'ux_sp_seminar_user';
const ON_CONFLICT_SKIP = 'ON CONFLICT (seminar_id, user_id) WHERE user_id IS NOT NULL DO NOTHING';
// Lỗi trùng tài khoản trong hội thảo ⇒ 409 rõ nghĩa; lỗi khác ném lại nguyên trạng
const rethrowDuplicateUser = (err) => {
	if (isUniqueViolation(err) && constraintName(err) === UX_SEMINAR_USER) {
		throw httpError(409, 'Tài khoản này đã có trong danh sách người tham dự hội thảo/hội nghị.');
	}
	throw err;
};

// Bind toàn bộ input cho 1 dòng participant vào `req`, trả về câu INSERT dùng
// biến @id đã khai báo trước đó (@id0 cho single, @idN trong vòng lặp bulk).
// skipExisting: tài khoản đã có trong hội thảo thì bỏ qua (rowsAffected = 0) thay vì lỗi.
const bindInsert = (req, idVar, seminarId, data, { skipExisting = false } = {}) => {
	req
		.input('seminar_id', sql.VarChar(20), seminarId)
		.input('user_id', sql.VarChar(20), data.user_id || null)
		.input('title_prefix', sql.NVarChar(10), data.title_prefix || null)
		.input('full_name', sql.NVarChar(255), data.full_name)
		.input('dob', sql.Date, data.dob || null)
		.input('dob_text', sql.NVarChar(50), data.dob_text || null)
		.input('gender', sql.VarChar(10), normalizeGender(data.gender))
		.input('organization', sql.NVarChar(255), data.organization || null)
		.input('department_raw', sql.NVarChar(255), data.department_raw || null)
		.input('staff_number', sql.Int, data.staff_number ?? null)
		.input('qualification_raw', sql.NVarChar(100), data.qualification_raw || null)
		.input('source', sql.VarChar(20), normSource(data.source))
		.input('is_foreign', sql.Bit, data.is_foreign ? 1 : 0)
		.input('participation_type', sql.VarChar(20), normType(data.participation_type))
		.input('cme_year', sql.Int, data.cme_year ?? null)
		.input('cme_seq', sql.Int, data.cme_seq ?? null)
		.input('cme_credits', sql.Decimal(4, 1), data.cme_credits ?? null)
		.input('cme_status', sql.VarChar(15), data.cme_status || 'none')
		.input('cme_issued_date', sql.Date, data.cme_issued_date || null)
		.input('notes', sql.NVarChar(255), data.notes || null)
		.input('phone', sql.VarChar(20), data.phone || null)
		.input('email', sql.NVarChar(255), data.email || null)
		.input('ticket_code', sql.VarChar(32), data.ticket_code || null);
	return `
    INSERT INTO seminar_participants
      (id, seminar_id, user_id, title_prefix, full_name, dob, dob_text, gender,
       organization, department_raw, staff_number, qualification_raw, source,
       is_foreign, participation_type, cme_year, cme_seq, cme_credits, cme_status,
       cme_issued_date, notes, phone, email, ticket_code, created_by)
    VALUES
      (${idVar}, @seminar_id, @user_id, @title_prefix, @full_name, @dob, @dob_text, @gender,
       @organization, @department_raw, @staff_number, @qualification_raw, @source,
       @is_foreign, @participation_type, @cme_year, @cme_seq, @cme_credits, @cme_status,
       @cme_issued_date, @notes, @phone, @email, @ticket_code, @actor_id)
    ${skipExisting ? ON_CONFLICT_SKIP : ''};`;
};

// Trường CME chỉ người có seminars:cme_manage được ghi trực tiếp (số quyết định, năm, trạng thái,
// ngày cấp phải đi qua issueCme — sổ cấp tuần tự + kiểm tra đủ điều kiện). Số tín chỉ
// (cme_credits) vẫn nhập được trên dòng CHƯA có số CME (form người tham dự), xem update().
const CME_ONLY_FIELDS = ['cme_year', 'cme_seq', 'cme_status', 'cme_issued_date'];
const withoutCmeFields = (data) => {
	const out = { ...data };
	for (const k of CME_ONLY_FIELDS) delete out[k];
	return out;
};

const add = async (seminarId, rawData, actorId, { canCme = false } = {}) => {
	const data = canCme ? rawData : withoutCmeFields(rawData);
	const pool = await getPool();
	await ensureSeminar(pool, seminarId);
	if (!data.full_name || !String(data.full_name).trim()) {
		throw httpError(400, 'Họ tên không được để trống.');
	}
	const id = newParticipantId();
	const req = actorRequest(actorId)
		.input('actor_id', sql.VarChar(20), actorId)
		.input('id', sql.VarChar(24), id);
	await req.query(bindInsert(req, '@id', seminarId, data)).catch(rethrowDuplicateUser);
	const r = await pool
		.request()
		.input('id', sql.VarChar(24), id)
		.query('SELECT * FROM seminar_participants WHERE id = @id');
	if (r.recordset[0])
		await personService.syncPerson('seminar_participants', r.recordset[0].id, { actorId });
	broadcast('update', { entity: 'seminar' });
	return r.recordset[0];
};

// Thêm nhiều dòng trong 1 transaction. Tài khoản đã có trong hội thảo thì bỏ qua (kể cả khi
// 2 yêu cầu chạy song song — ON CONFLICT trên ux_sp_seminar_user); trả về số dòng THỰC SỰ thêm.
const bulkAdd = async (seminarId, rows, actorId) => {
	const pool = await getPool();
	await ensureSeminar(pool, seminarId);
	const valid = (rows || []).filter((r) => r.full_name && String(r.full_name).trim());
	if (!valid.length) return { inserted: 0, ids: [] };
	const ids = await withTransaction(async (tx) => {
		await withActor(tx, actorId);
		const inserted = [];
		for (const row of valid) {
			const id = newParticipantId();
			const req = new sql.Request(tx)
				.input('actor_id', sql.VarChar(20), actorId)
				.input('id', sql.VarChar(24), id);
			const r = await req.query(bindInsert(req, '@id', seminarId, row, { skipExisting: true }));
			if (r.rowsAffected[0]) inserted.push(id);
		}
		return inserted;
	}, pool);
	await personService.syncPersons('seminar_participants', ids, { actorId });
	broadcast('update', { entity: 'seminar' });
	return { inserted: ids.length, ids };
};

// ─── Tập huấn bệnh viện: người tham dự theo khoa ─────────────────────────────

// Nhân sự đang làm việc (bỏ tài khoản dùng chung của khoa) — dùng chung cho
// chọn người theo khoa và báo cáo "chưa tham dự".
const staffFrom = `FROM users u
  LEFT JOIN departments d ON d.id = u.department_id
  ${deptAccountJoinSql('u')}`;
const staffWhere = `u.is_active = 'true' AND NOT ${isDeptAccountJoinedSql('u')}`;

// Nhân sự 1 khoa, kèm cờ đã có trong danh sách người tham dự
const staffOfDepartment = async (seminarId, departmentId) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('sid', sql.VarChar(20), seminarId)
		.input('dept', sql.VarChar(20), departmentId).query(`
      SELECT u.id, u.staff_number, u.full_name, d.name AS department_name,
             ${boolExpr(`EXISTS (SELECT 1 FROM seminar_participants p
                  WHERE p.seminar_id = @sid AND p.user_id = u.id)`)} AS in_list
      ${staffFrom}
      WHERE u.department_id = @dept AND ${staffWhere}
      ORDER BY u.full_name;
    `);
	return r.recordset;
};

// Thêm nhân sự vào danh sách (vai trò Học viên) — bỏ qua người đã có
const addUsers = async (seminarId, userIds, actorId) => {
	const pool = await getPool();
	await ensureSeminar(pool, seminarId);
	const ids = [...new Set((userIds || []).filter(Boolean))];
	if (!ids.length) return { inserted: 0, skipped: 0 };
	const r = await pool
		.request()
		.input('sid', sql.VarChar(20), seminarId)
		.input('ids', sql.NVarChar(sql.MAX), JSON.stringify(ids)).query(`
      SELECT u.id, u.full_name, u.staff_number, u.date_of_birth, d.name AS department_name
      FROM users u LEFT JOIN departments d ON d.id = u.department_id
      WHERE u.id IN ${jsonValues('@ids')}
        AND NOT EXISTS (SELECT 1 FROM seminar_participants p WHERE p.seminar_id = @sid AND p.user_id = u.id)
      ORDER BY d.name, u.full_name;
    `);
	const { inserted } = await bulkAdd(
		seminarId,
		r.recordset.map((u) => ({
			user_id: u.id,
			full_name: u.full_name,
			staff_number: u.staff_number,
			dob: u.date_of_birth,
			department_raw: u.department_name,
			source: 'internal',
			participation_type: 'trainee',
		})),
		actorId,
	);
	return { inserted, skipped: ids.length - inserted };
};

// Thêm cả khoa bắt buộc 1 lần (GĐ6): mọi nhân sự đang làm việc của các khoa bắt
// buộc chưa có trong danh sách — chạy lại chỉ thêm người mới vào khoa.
const addRequiredStaff = async (seminarId, actorId) => {
	const pool = await getPool();
	const r = await pool.request().input('sid', sql.VarChar(20), seminarId).query(`
      SELECT u.id
      FROM seminar_required_departments r
      JOIN users u ON u.department_id = r.department_id
      ${deptAccountJoinSql('u')}
      WHERE r.seminar_id = @sid AND ${staffWhere}
        AND NOT EXISTS (SELECT 1 FROM seminar_participants p WHERE p.seminar_id = @sid AND p.user_id = u.id)`);
	if (!r.recordset.length) return { inserted: 0, skipped: 0 };
	return addUsers(
		seminarId,
		r.recordset.map((u) => u.id),
		actorId,
	);
};

// Nhân sự thuộc khoa bắt buộc mà chưa tham dự: chưa có trong danh sách, hoặc
// tự đăng ký (QR có vé / cổng tập huấn) nhưng chưa điểm danh.
const requiredAbsentees = async (seminarId) => {
	const pool = await getPool();
	const r = await pool.request().input('sid', sql.VarChar(20), seminarId).query(`
      SELECT u.id, u.staff_number, u.full_name, d.name AS department_name,
             CASE WHEN p.id IS NULL THEN 'not_listed' ELSE 'not_checked_in' END AS reason
      FROM seminar_required_departments r
      JOIN users u ON u.department_id = r.department_id
      LEFT JOIN departments d ON d.id = u.department_id
      ${deptAccountJoinSql('u')}
      ${outerApply(
				`SELECT p.id, p.ticket_code, p.checked_in_at, p.user_id, p.created_by FROM seminar_participants p
                   WHERE p.seminar_id = r.seminar_id AND p.user_id = u.id
                   ORDER BY p.id OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY`,
				'p',
			)}
      WHERE r.seminar_id = @sid AND ${staffWhere}
        AND (p.id IS NULL OR (${SELF_CREATED_SQL} AND p.checked_in_at IS NULL))
      ORDER BY d.name, u.full_name;
    `);
	return r.recordset;
};

const UPDATABLE = {
	title_prefix: sql.NVarChar(10),
	full_name: sql.NVarChar(255),
	dob: sql.Date,
	dob_text: sql.NVarChar(50),
	organization: sql.NVarChar(255),
	department_raw: sql.NVarChar(255),
	staff_number: sql.Int,
	qualification_raw: sql.NVarChar(100),
	cme_credits: sql.Decimal(4, 1),
	cme_issued_date: sql.Date,
	notes: sql.NVarChar(255),
};

const sameCredits = (a, b) => {
	const x = a === '' || a === undefined ? null : a;
	const y = b === '' || b === undefined ? null : b;
	if (x === null || y === null) return x === y;
	return Number(x) === Number(y);
};

// Trường xác định "số CME này cấp cho ai" (M-07, audit run-5): dòng đã có số CME chỉ người có
// seminars:cme_manage được đổi — nếu không, đổi họ tên / ngày sinh của người ngoài viện là
// chuyển được số quyết định sang người khác. Ghi chú, học hàm... vẫn sửa được.
const IDENTITY_FIELDS = [
	'title_prefix',
	'full_name',
	'dob',
	'dob_text',
	'organization',
	'department_raw',
	'staff_number',
];
// Trường bị khóa trên dòng đã cấp số với người không có cme_manage
const ISSUED_LOCKED_FIELDS = [...IDENTITY_FIELDS, 'cme_credits', 'user_id'];

const blankToNull = (v) => (v === '' || v === undefined ? null : v);
const asDateKey = (v) => {
	if (v instanceof Date)
		return Number.isNaN(v.getTime()) ? String(v) : v.toISOString().slice(0, 10);
	return String(v).slice(0, 10);
};
// So giá trị form gửi lên với giá trị đang lưu (form luôn gửi lại cả bộ ⇒ chỉ coi là đổi khi khác)
const sameValue = (field, a, b) => {
	if (field === 'cme_credits') return sameCredits(a, b);
	const x = blankToNull(a);
	const y = blankToNull(b);
	if (x === null || y === null) return x === y;
	if (field === 'dob') return asDateKey(x) === asDateKey(y);
	return String(x) === String(y);
};

const update = async (seminarId, pid, rawData, actorId, { canCme = false } = {}) => {
	let data = rawData;
	// Câu UPDATE chỉ ghi được dòng CHƯA có số CME khi người gọi không có cme_manage mà vẫn
	// ghi trường bị khóa (số có thể vừa được cấp giữa lúc đọc và lúc ghi)
	let guardIssued = false;
	if (!canCme) {
		data = withoutCmeFields(rawData);
		// Dòng đã có số CME: không đổi số tín chỉ, người nhận hay thông tin định danh
		const cur = (
			await (
				await getPool()
			)
				.request()
				.input('sid', sql.VarChar(20), seminarId)
				.input('pid', sql.VarChar(24), pid)
				.query(
					`SELECT cme_seq, cme_credits, user_id, ${IDENTITY_FIELDS.join(', ')}
           FROM seminar_participants WHERE id = @pid AND seminar_id = @sid`,
				)
		).recordset[0];
		if (cur && cur.cme_seq != null) {
			const changed = ISSUED_LOCKED_FIELDS.filter(
				(k) => data[k] !== undefined && !sameValue(k, data[k], cur[k]),
			);
			if (changed.length) {
				throw httpError(
					403,
					'Người tham dự đã có số CME: cần quyền cấp CME để đổi số tín chỉ, người nhận hoặc thông tin định danh (họ tên, ngày sinh, đơn vị...).',
				);
			}
			const rest = { ...data };
			for (const k of ISSUED_LOCKED_FIELDS) delete rest[k];
			data = rest;
		}
		guardIssued = ISSUED_LOCKED_FIELDS.some((k) => data[k] !== undefined);
	}
	const sets = [`updated_at = ${nowSql}`, 'updated_by = @actor_id'];
	const req = actorRequest(actorId)
		.input('sid', sql.VarChar(20), seminarId)
		.input('pid', sql.VarChar(24), pid)
		.input('actor_id', sql.VarChar(20), actorId);

	for (const [k, t] of Object.entries(UPDATABLE)) {
		if (data[k] !== undefined) {
			sets.push(`${k} = @${k}`);
			req.input(k, t, data[k] === '' ? null : data[k]);
		}
	}
	if (data.gender !== undefined) {
		sets.push('gender = @gender');
		req.input('gender', sql.VarChar(10), normalizeGender(data.gender));
	}
	if (data.user_id !== undefined) {
		sets.push('user_id = @user_id');
		req.input('user_id', sql.VarChar(20), data.user_id || null);
	}
	if (data.source !== undefined) {
		sets.push('source = @source');
		req.input('source', sql.VarChar(20), normSource(data.source));
	}
	if (data.is_foreign !== undefined) {
		sets.push('is_foreign = @is_foreign');
		req.input('is_foreign', sql.Bit, data.is_foreign ? 1 : 0);
	}
	if (data.participation_type !== undefined) {
		sets.push('participation_type = @participation_type');
		req.input('participation_type', sql.VarChar(20), normType(data.participation_type));
	}

	const r = await queryBatch(req, [
		`UPDATE seminar_participants SET ${sets.join(', ')}
    WHERE id = @pid AND seminar_id = @sid${guardIssued ? ' AND cme_seq IS NULL' : ''}`,
		`SELECT * FROM seminar_participants WHERE id = @pid AND seminar_id = @sid`,
	]).catch(rethrowDuplicateUser);
	if (guardIssued && !r.rowsAffected[0] && r.recordset[0]) {
		throw httpError(
			409,
			'Người tham dự vừa được cấp số CME: tải lại danh sách — cần quyền cấp CME để sửa thông tin định danh / tín chỉ.',
		);
	}
	await personService.syncPerson('seminar_participants', pid, { actorId });
	broadcast('update', { entity: 'seminar' });
	return r.recordset[0] || null;
};

// Xóa người tham dự. Dòng đã có số CME là một quyết định đã cấp: chỉ người có
// seminars:cme_manage được xóa (M-07, audit run-5) — người khác phải thu hồi số trước
// (revoke-cme). Điều kiện cme_seq nằm ngay trong câu DELETE để kiểm và ghi là một.
const remove = async (seminarId, pid, actorId, { canCme = false } = {}) => {
	const blocked = await withActorTransaction(actorId, async (tx) => {
		const r = await tx
			.request()
			.input('sid', sql.VarChar(20), seminarId)
			.input('pid', sql.VarChar(24), pid)
			.input('actor_id', sql.VarChar(20), actorId)
			.query(
				`DELETE FROM seminar_participants WHERE id = @pid AND seminar_id = @sid${canCme ? '' : ' AND cme_seq IS NULL'};`,
			);
		if (canCme || r.rowsAffected[0]) return false;
		const still = await tx
			.request()
			.input('sid', sql.VarChar(20), seminarId)
			.input('pid', sql.VarChar(24), pid)
			.query('SELECT 1 AS x FROM seminar_participants WHERE id = @pid AND seminar_id = @sid');
		return still.recordset.length > 0;
	});
	if (blocked) {
		throw httpError(
			403,
			'Người tham dự đã có số CME: cần quyền cấp CME (thu hồi số trước) mới xóa được.',
		);
	}
	await formCustomValueService.remove('seminar_participant', pid);
	broadcast('update', { entity: 'seminar' });
};

// seminar_participants đã có sẵn user_id (khác course_enrollments phải qua
// trainees) — tự điểm danh chỉ cần so đúng tài khoản đang đăng nhập, KHÔNG tự
// tạo participant mới nếu chưa có trong danh sách (tránh lộ khả năng "tự đăng
// ký tham dự" qua đường quét QR). Tự đăng ký tập huấn trên cổng thì có tạo dòng
// (hospitalTrainingSelfService.register) — dòng đó vẫn phải điểm danh (SELF_CREATED_SQL).
const generateCheckInQrToken = (seminarId) =>
	signToken('seminar-qr', { seminar_id: seminarId, purpose: CHECKIN_QR_PURPOSE }, CHECKIN_QR_TTL);

const checkInSelf = async (token, deviceId, actor) => {
	let decoded;
	try {
		decoded = verifyToken('seminar-qr', token);
	} catch {
		throw httpError(401, 'Mã QR đã hết hạn, vui lòng thử lại.');
	}
	if (decoded.purpose !== CHECKIN_QR_PURPOSE) {
		throw httpError(401, 'Mã QR không hợp lệ.');
	}

	const pool = await getPool();
	const req = () =>
		pool
			.request()
			.input('seminar_id', sql.VarChar(20), decoded.seminar_id)
			.input('user_id', sql.VarChar(20), actor.id)
			.input('device_id', sql.VarChar(64), deviceId);
	const row = (
		await req().query(`
      SELECT id, ${boolExpr(`EXISTS (
        -- 1 thiết bị chỉ điểm danh cho 1 người mỗi hội thảo (xem courseService.checkInSelf)
        SELECT 1 FROM seminar_participants o WHERE o.seminar_id = @seminar_id
          AND o.checkin_device_id = @device_id AND (o.user_id IS NULL OR o.user_id <> @user_id))`)} AS device_taken
      FROM seminar_participants WHERE seminar_id = @seminar_id AND user_id = @user_id`)
	).recordset[0];
	if (!row) {
		throw httpError(403, 'Bạn không có trong danh sách tham dự hội thảo/hội nghị này.');
	}
	if (!row.device_taken) {
		await req().query(`
      UPDATE seminar_participants SET checked_in_at = ${utcNowSql}, checkin_device_id = @device_id
      WHERE seminar_id = @seminar_id AND user_id = @user_id`);
	}
	if (row.device_taken) {
		throw httpError(
			403,
			'Thiết bị này đã dùng để điểm danh cho người khác trong hội thảo/hội nghị này. Vui lòng dùng thiết bị của chính bạn hoặc liên hệ ban tổ chức.',
		);
	}
	broadcast('update', { entity: 'seminar' });
	return { seminar_id: decoded.seminar_id };
};

module.exports = {
	listBySeminar,
	add,
	bulkAdd,
	update,
	generateCheckInQrToken,
	checkInSelf,
	remove,
	SOURCES,
	ensureSeminar,
	staffOfDepartment,
	addUsers,
	addRequiredStaff,
	requiredAbsentees,
	SELF_CREATED_SQL,
};
