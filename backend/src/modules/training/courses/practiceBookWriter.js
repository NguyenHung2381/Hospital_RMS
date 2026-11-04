// Ghi 1 hồ sơ thực hành GPHN từ sổ đã đọc (practiceBookImportService): ghi danh + vòng thực hành,
// bổ sung danh mục lĩnh vực / hình thức / đơn vị cử đi mới gặp.
const { sql, withTransaction, nowSql } = require('../../../config/db');
const { genCourseEnrollmentId, randomId } = require('../../../utils/idGenerator');
const { broadcast } = require('../../events/eventService');
const { invalidate } = require('../../../utils/cache');

const ymd = (v) => (v ? String(v).slice(0, 10) : null);

const ENROLLMENT_FIELDS = {
	practice_code: sql.NVarChar(30),
	professional_field: sql.NVarChar(200),
	practice_form: sql.NVarChar(300),
	start_date: sql.Date,
	end_date: sql.Date,
	total_duration: sql.NVarChar(50),
	practice_location: sql.NVarChar(500),
	sending_unit: sql.NVarChar(200),
	main_mentor_user_id: sql.VarChar(20),
	progress_status: sql.VarChar(15),
};

const ROTATION_TYPES = {
	lesson_id: sql.VarChar(20),
	round_title: sql.NVarChar(255),
	seq: sql.Int,
	department_id: sql.VarChar(20),
	department_name: sql.NVarChar(200),
	start_date: sql.Date,
	end_date: sql.Date,
	duration_text: sql.NVarChar(50),
	mentor_user_id: sql.VarChar(20),
	mentor_name: sql.NVarChar(150),
	mentor_salutation: sql.NVarChar(10),
	mentor_staff_no: sql.NVarChar(20),
	mentor_dob: sql.Date,
	mentor_qualification: sql.NVarChar(200),
	mentor_license_no: sql.NVarChar(50),
	mentor_license_date: sql.Date,
	mentor_phone: sql.NVarChar(30),
	mentor_scope: sql.NVarChar(1000),
};
const KEEP_IF_BLANK = new Set([
	'practice_code',
	'professional_field',
	'practice_form',
	'start_date',
	'end_date',
	'total_duration',
	'practice_location',
]);
const cut = (v, n) => (v == null ? null : String(v).slice(0, n));

// Lĩnh vực / hình thức / đơn vị cử đi mới gặp trong sổ ⇒ thêm vào danh mục để chọn
// lại được ở hồ sơ (2026-12-03_danh_muc_thuc_hanh_gphn). Hồ sơ vẫn lưu chữ.
/** @type {Record<string, [string, number]>} field → [bảng danh mục, độ dài cột name] */
const CATALOG_OF = {
	professional_field: ['professional_fields', 200],
	practice_form: ['practice_forms', 300],
	sending_unit: ['sending_units', 200],
};
const addToCatalogs = async (pool, records, actorId) => {
	for (const [field, [table, len]] of Object.entries(CATALOG_OF)) {
		const names = [...new Set(records.map((r) => cut(r[field]?.trim(), len)).filter(Boolean))];
		for (const name of names) {
			const req = () => pool.request().input('name', sql.NVarChar(len), name);
			if ((await req().query(`SELECT 1 AS x FROM ${table} WHERE name = @name`)).recordset.length)
				continue;
			await req()
				.input('id', sql.VarChar(20), randomId('', 20))
				.input('actor_id', sql.VarChar(20), actorId)
				.query(`INSERT INTO ${table} (id, name, created_by) VALUES (@id, @name, @actor_id)`);
		}
		if (names.length) {
			await invalidate(`lookup:${table}:`);
			broadcast('update', { entity: table.slice(0, -1) });
		}
	}
};

const writeRecord = async (pool, it, traineeId, courseId, actorId) => {
	const rec = it.record;
	const values = {
		practice_code: rec.practice_code || null,
		professional_field: cut(rec.professional_field, 200),
		practice_form: cut(rec.practice_form, 300),
		start_date: ymd(rec.start_date),
		end_date: ymd(rec.end_date),
		total_duration: cut(rec.total_duration, 50),
		practice_location: cut(rec.practice_location, 500),
		sending_unit: cut(rec.sending_unit, 200),
		main_mentor_user_id: it.main_mentor?.user_id ?? null,
		progress_status: rec.dropped ? 'dropped' : rec.completed ? 'completed' : 'in_progress',
	};
	// Đăng ký mới cần mã sinh trong transaction (khoá sinh mã giữ tới khi commit)
	const enrollmentId = await withTransaction(async (tx) => {
		const bind = (id) => {
			const req = tx
				.request()
				.input('id', sql.VarChar(20), id)
				.input('course_id', sql.VarChar(20), courseId)
				.input('trainee_id', sql.VarChar(20), traineeId)
				.input('program_id', sql.VarChar(20), it.program_id)
				.input('actor_id', sql.VarChar(20), actorId);
			for (const [f, t] of Object.entries(ENROLLMENT_FIELDS)) req.input(f, t, values[f]);
			return req;
		};
		const found =
			it.enrollment_id ??
			(
				await bind(null).query(`
        SELECT id FROM course_enrollments
        WHERE course_id = @course_id AND trainee_id = @trainee_id
          AND COALESCE(program_id, '') = COALESCE(@program_id, '')
        ORDER BY id OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY`)
			).recordset[0]?.id;
		if (found) {
			await bind(found).query(`
      UPDATE course_enrollments
      SET trainee_id = @trainee_id, program_id = COALESCE(@program_id, program_id),
          ${Object.keys(ENROLLMENT_FIELDS)
						// Dòng chưa có mã / chưa có ngày: giữ giá trị đã tự điền lần trước
						.map((f) => (KEEP_IF_BLANK.has(f) ? `${f} = COALESCE(@${f}, ${f})` : `${f} = @${f}`))
						.join(', ')},
          updated_at = ${nowSql}, updated_by = @actor_id
      WHERE id = @id`);
			return found;
		}
		const newId = await genCourseEnrollmentId(tx);
		await bind(newId).query(`
      INSERT INTO course_enrollments (id, course_id, trainee_id, program_id, status, decided_by, decided_at, created_by,
        ${Object.keys(ENROLLMENT_FIELDS).join(', ')})
      VALUES (@id, @course_id, @trainee_id, @program_id, 'approved', @actor_id, ${nowSql}, @actor_id,
        ${Object.keys(ENROLLMENT_FIELDS)
					.map((f) => `@${f}`)
					.join(', ')})`);
		return newId;
	});

	if (it.rotations.length) {
		const ins = pool
			.request()
			.input('enrollment_id', sql.VarChar(20), enrollmentId)
			.input('actor_id', sql.VarChar(20), actorId);
		const valuesSql = it.rotations.map((rot, i) => {
			const row = {
				...rot,
				mentor_user_id: rot.user_id ?? null,
				start_date: ymd(rot.start_date),
				end_date: ymd(rot.end_date),
				mentor_dob: ymd(rot.mentor_dob),
				mentor_license_date: ymd(rot.mentor_license_date),
				round_title: cut(rot.round_title, 255),
				department_name: cut(rot.department_name, 200),
				duration_text: cut(rot.duration_text, 50),
				mentor_name: cut(rot.mentor_name, 150),
				mentor_salutation: cut(rot.mentor_salutation, 10),
				mentor_staff_no: cut(rot.mentor_staff_no, 20),
				mentor_qualification: cut(rot.mentor_qualification, 200),
				mentor_license_no: cut(rot.mentor_license_no, 50),
				mentor_phone: cut(rot.mentor_phone, 30),
				mentor_scope: cut(rot.mentor_scope, 1000),
			};
			for (const [f, t] of Object.entries(ROTATION_TYPES))
				ins.input(`${f}_${i}`, t, row[f] ?? null);
			ins.input(`id_${i}`, sql.VarChar(20), randomId('VR', 18));
			return `(@id_${i}, @enrollment_id, ${Object.keys(ROTATION_TYPES)
				.map((f) => `@${f}_${i}`)
				.join(', ')}, @actor_id)`;
		});
		await ins.query(`
      DELETE FROM enrollment_rotations WHERE enrollment_id = @enrollment_id;
      INSERT INTO enrollment_rotations (id, enrollment_id, ${Object.keys(ROTATION_TYPES).join(', ')}, created_by)
      VALUES ${valuesSql.join(',\n')};
    `);
	}
	return enrollmentId;
};

module.exports = {
	addToCatalogs,
	writeRecord,
};
