const {
	getPool,
	sql,
	withActorTransaction,
	actorRequest,
	nowSql,
	queryBatch,
} = require('../../../config/db');
const { genTraineeId, randomId } = require('../../../utils/idGenerator');
const { broadcast } = require('../../events/eventService');
const trainingFileService = require('../trainingFileService');
const personService = require('../../persons/personService');
const { normalizeGender } = require('../../../utils/gender');
const { DOC_STATE_SQL } = require('./traineeDocumentSql');
const {
	PROFILE_DOC_TYPE,
	REGISTRATION_DOC_TYPES,
	assertPdf,
	assertPdfOrImage,
} = require('./traineeProfilePdf');
const { lockAccountOf } = require('./traineeAccountService');
const {
	traineeSelectWith,
	maskSensitive,
	canReadSensitive,
	getAll,
} = require('./traineeListService');

const getById = async (id, actor = null) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('id', sql.VarChar(20), id)
		// Kèm trạng thái hồ sơ PDF + số lượt ghi danh cho thẻ tóm tắt ở trang hồ sơ học viên
		.query(
			`${traineeSelectWith(
				`, ${DOC_STATE_SQL('t')} AS doc_state,
				  (SELECT COUNT(*) FROM course_enrollments ce WHERE ce.trainee_id = t.id AND ce.status <> 'rejected') AS enrollment_count`,
			)} WHERE t.id = @id`,
		);
	const row = result.recordset[0];
	if (!row) return null;
	return maskSensitive(row, canReadSensitive(actor));
};

// opts.fetch=false: bỏ query đọc lại bản ghi — dùng cho import hàng loạt
const create = async (data, actorId, { fetch = true } = {}) => {
	const result = await withActorTransaction(actorId, async (tx) =>
		queryBatch(
			tx
				.request()
				.input('new_id', sql.VarChar(20), await genTraineeId(tx, undefined, actorId))
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
				.input('is_employee', sql.Bit, !!data.is_employee),
			[
				`INSERT INTO trainees (
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
      )`,
				`SELECT @new_id AS id`,
			],
		),
	);
	const id = result.recordset[0].id;
	await personService.syncPerson('trainees', id, { actorId });
	broadcast('update', { entity: 'trainee' });
	return fetch ? getById(id, true) : { id };
};

const update = async (id, data, actorId) => {
	const sets = [`updated_at = ${nowSql}`, 'updated_by = @actor_id'];
	const req = actorRequest(actorId)
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

	await req.query(`UPDATE trainees SET ${sets.join(', ')} WHERE id = @id`);
	// Ngừng học viên ⇒ khóa luôn tài khoản. Bật lại KHÔNG tự mở khóa: tài khoản có
	// thể đã bị khóa vì lý do khác — mở khóa thủ công tại hồ sơ học viên.
	if (data.is_active !== undefined && !data.is_active) await lockAccountOf(id, actorId);
	await personService.syncPerson('trainees', id, { actorId });
	broadcast('update', { entity: 'trainee' });
	return getById(id, true);
};

const remove = async (id, actorId) => {
	// Chỉ ẩn khỏi danh sách: học viên còn FK từ course_enrollments... nên không DELETE cứng.
	await withActorTransaction(actorId, (tx) =>
		tx
			.request()
			.input('id', sql.VarChar(20), id)
			.input('actor_id', sql.VarChar(20), actorId)
			.query(`UPDATE trainees SET hidden_at = ${nowSql} WHERE id = @id`),
	);
	// Hồ sơ đã xóa thì tài khoản học viên cũng không được đăng nhập nữa
	await lockAccountOf(id, actorId);
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
    JOIN training_files f ON f.id = d.file_id AND f.is_deleted = 'false'
    WHERE d.trainee_id = @trainee_id
    ORDER BY d.created_at DESC
  `);
	return r.recordset;
};

// Hồ sơ học viên = 1 file PDF (doc_type 'profile'). status: 'approved' chỉ dành cho nhân
// viên đã đăng nhập tải lên; mọi nguồn không xác thực (đăng ký công khai...) phải truyền
// 'pending' để chờ phòng Đào tạo duyệt.
// docType: 'profile' (mặc định, chỉ PDF) hoặc 1 trong 4 giấy tờ đăng ký khóa đào tạo liên tục
// (national_id / degree / license / decision — nhận PDF, JPG, PNG).
// Trả { id, file_id } của dòng giấy tờ vừa thêm.
const DOC_STATUSES = ['approved', 'pending'];
const addDocument = async (
	traineeId,
	file,
	actorId,
	{ status = 'approved', docType = PROFILE_DOC_TYPE } = {},
) => {
	if (!DOC_STATUSES.includes(status)) throw new Error(`Trạng thái giấy tờ không hợp lệ: ${status}`);
	if (![PROFILE_DOC_TYPE, ...REGISTRATION_DOC_TYPES].includes(docType))
		throw new Error(`Loại giấy tờ không hợp lệ: ${docType}`);
	if (docType === PROFILE_DOC_TYPE) await assertPdf(file);
	else await assertPdfOrImage(file);
	const pool = await getPool();
	const savedFile = await trainingFileService.saveUploadedFile(
		'trainee_document',
		traineeId,
		file,
		actorId,
	);
	const newId = randomId('HS', 18);
	await pool
		.request()
		.input('trainee_id', sql.VarChar(20), traineeId)
		.input('doc_type', sql.VarChar(30), docType)
		.input('file_id', sql.VarChar(20), savedFile.id)
		.input('status', sql.VarChar(10), status)
		.input('actor_id', sql.VarChar(20), actorId)
		.input('new_id', sql.VarChar(20), newId).query(`
      INSERT INTO trainee_documents (id, trainee_id, doc_type, file_id, status, created_by)
      VALUES (@new_id, @trainee_id, @doc_type, @file_id, @status, @actor_id);
    `);
	broadcast('update', { entity: 'trainee_document' });
	return { id: newId, file_id: savedFile.id };
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
};
