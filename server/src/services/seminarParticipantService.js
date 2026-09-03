/**
 * seminarParticipantService.js — người tham dự / được cử đi + cấp CME.
 *
 * Số quyết định CME (SQĐ) sinh qua sp_gen_cme_no: dãy chạy theo NĂM, 1..N liên
 * tục cho mọi hội nghị trong năm; sang năm mới reset. Cấp nhiều người một lần
 * thì cấp tuần tự trong 1 transaction để giữ dãy liền mạch.
 */
const { getPool, sql } = require('../config/db');
const { broadcast } = require('./eventService');

const PART_TYPES = ['attendee', 'speaker', 'chair', 'organizer', 'trainee'];
const SOURCES = ['internal', 'external'];
// Sinh id trong SQL: 'SPT' + 21 hex = 24 ký tự
const NEW_ID_SQL = `'SPT' + LEFT(REPLACE(CONVERT(VARCHAR(36), NEWID()), '-', ''), 21)`;

const listBySeminar = async (seminarId) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('id', sql.VarChar(20), seminarId)
		.query(`
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
	return r.recordset;
};

const ensureSeminar = async (pool, seminarId) => {
	const s = await pool
		.request()
		.input('id', sql.VarChar(20), seminarId)
		.query('SELECT id, event_year, cme_default_credits FROM seminars WHERE id = @id');
	if (!s.recordset.length) {
		const err = new Error('Hội thảo/hội nghị không tồn tại.');
		err.statusCode = 404;
		throw err;
	}
	return s.recordset[0];
};

const normType = (t) => (PART_TYPES.includes(t) ? t : 'attendee');
const normSource = (s) => (SOURCES.includes(s) ? s : 'internal');

// Bind toàn bộ input cho 1 dòng participant vào `req`, trả về câu INSERT dùng
// biến @id đã khai báo trước đó (@id0 cho single, @idN trong vòng lặp bulk).
const bindInsert = (req, idVar, seminarId, data) => {
	req
		.input('seminar_id', sql.VarChar(20), seminarId)
		.input('user_id', sql.VarChar(20), data.user_id || null)
		.input('title_prefix', sql.NVarChar(10), data.title_prefix || null)
		.input('full_name', sql.NVarChar(255), data.full_name)
		.input('dob', sql.Date, data.dob || null)
		.input('dob_text', sql.NVarChar(50), data.dob_text || null)
		.input('gender', sql.VarChar(10), data.gender || null)
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
		.input('notes', sql.NVarChar(255), data.notes || null);
	return `
    INSERT INTO seminar_participants
      (id, seminar_id, user_id, title_prefix, full_name, dob, dob_text, gender,
       organization, department_raw, staff_number, qualification_raw, source,
       is_foreign, participation_type, cme_year, cme_seq, cme_credits, cme_status,
       cme_issued_date, notes, created_by)
    VALUES
      (${idVar}, @seminar_id, @user_id, @title_prefix, @full_name, @dob, @dob_text, @gender,
       @organization, @department_raw, @staff_number, @qualification_raw, @source,
       @is_foreign, @participation_type, @cme_year, @cme_seq, @cme_credits, @cme_status,
       @cme_issued_date, @notes, @actor_id);`;
};

const add = async (seminarId, data, actorId) => {
	const pool = await getPool();
	await ensureSeminar(pool, seminarId);
	if (!data.full_name || !String(data.full_name).trim()) {
		const err = new Error('Họ tên không được để trống.');
		err.statusCode = 400;
		throw err;
	}
	const req = pool.request().input('actor_id', sql.VarChar(20), actorId);
	const insert = bindInsert(req, '@id', seminarId, data);
	const r = await req.query(`
    EXEC sp_set_actor @actor_id;
    DECLARE @id VARCHAR(24) = ${NEW_ID_SQL};
    ${insert}
    SELECT * FROM seminar_participants WHERE id = @id;
  `);
	broadcast('update', { entity: 'seminar' });
	return r.recordset[0];
};

const bulkAdd = async (seminarId, rows, actorId) => {
	const pool = await getPool();
	await ensureSeminar(pool, seminarId);
	const valid = (rows || []).filter((r) => r.full_name && String(r.full_name).trim());
	if (!valid.length) return { inserted: 0, ids: [] };
	const tx = new sql.Transaction(pool);
	await tx.begin();
	try {
		await new sql.Request(tx)
			.input('actor_id', sql.VarChar(20), actorId)
			.query('EXEC sp_set_actor @actor_id');
		const ids = [];
		for (const row of valid) {
			const req = new sql.Request(tx).input('actor_id', sql.VarChar(20), actorId);
			const insert = bindInsert(req, '@id', seminarId, row);
			const r = await req.query(`
        DECLARE @id VARCHAR(24) = ${NEW_ID_SQL};
        ${insert}
        SELECT @id AS id;
      `);
			ids.push(r.recordset[0].id);
		}
		await tx.commit();
		broadcast('update', { entity: 'seminar' });
		return { inserted: valid.length, ids };
	} catch (err) {
		await tx.rollback();
		throw err;
	}
};

const UPDATABLE = {
	title_prefix: sql.NVarChar(10),
	full_name: sql.NVarChar(255),
	dob: sql.Date,
	dob_text: sql.NVarChar(50),
	gender: sql.VarChar(10),
	organization: sql.NVarChar(255),
	department_raw: sql.NVarChar(255),
	staff_number: sql.Int,
	qualification_raw: sql.NVarChar(100),
	cme_credits: sql.Decimal(4, 1),
	cme_issued_date: sql.Date,
	notes: sql.NVarChar(255),
};

const update = async (seminarId, pid, data, actorId) => {
	const pool = await getPool();
	const sets = ['updated_at = GETDATE()', 'updated_by = @actor_id'];
	const req = pool
		.request()
		.input('sid', sql.VarChar(20), seminarId)
		.input('pid', sql.VarChar(24), pid)
		.input('actor_id', sql.VarChar(20), actorId);

	for (const [k, t] of Object.entries(UPDATABLE)) {
		if (data[k] !== undefined) {
			sets.push(`${k} = @${k}`);
			req.input(k, t, data[k] === '' ? null : data[k]);
		}
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

	const r = await req.query(`
    EXEC sp_set_actor @actor_id;
    UPDATE seminar_participants SET ${sets.join(', ')}
    WHERE id = @pid AND seminar_id = @sid;
    SELECT * FROM seminar_participants WHERE id = @pid AND seminar_id = @sid;
  `);
	broadcast('update', { entity: 'seminar' });
	return r.recordset[0] || null;
};

const remove = async (seminarId, pid, actorId) => {
	const pool = await getPool();
	await pool
		.request()
		.input('sid', sql.VarChar(20), seminarId)
		.input('pid', sql.VarChar(24), pid)
		.input('actor_id', sql.VarChar(20), actorId)
		.query(`
      EXEC sp_set_actor @actor_id;
      DELETE FROM seminar_participants WHERE id = @pid AND seminar_id = @sid;
    `);
	broadcast('update', { entity: 'seminar' });
};

// ─── CME ─────────────────────────────────────────────────────────────────────

// Cấp số CME cho 1 hoặc nhiều người (tuần tự, giữ dãy liền mạch).
const issueCme = async (seminarId, participantIds, actorId, { year } = {}) => {
	const pool = await getPool();
	const seminar = await ensureSeminar(pool, seminarId);
	const cmeYear = parseInt(year, 10) || seminar.event_year;
	if (!cmeYear) {
		const err = new Error(
			'Chưa xác định được năm cấp CME. Hãy đặt "Năm sự kiện" cho hội nghị hoặc chọn năm khi cấp.',
		);
		err.statusCode = 400;
		throw err;
	}
	const ids = (participantIds || []).filter(Boolean);
	if (!ids.length) return { issued: 0, from: null, to: null, year: cmeYear };

	const tx = new sql.Transaction(pool);
	await tx.begin();
	try {
		await new sql.Request(tx)
			.input('actor_id', sql.VarChar(20), actorId)
			.query('EXEC sp_set_actor @actor_id');

		// chỉ người chưa có số, giữ đúng thứ tự gửi lên
		const listReq = new sql.Request(tx).input('sid', sql.VarChar(20), seminarId);
		const inParams = ids
			.map((id, i) => {
				listReq.input(`p${i}`, sql.VarChar(24), id);
				return `@p${i}`;
			})
			.join(',');
		const pending = await listReq.query(`
      SELECT id FROM seminar_participants
      WHERE seminar_id = @sid AND cme_seq IS NULL AND id IN (${inParams});
    `);
		const pendingSet = new Set(pending.recordset.map((r) => r.id));
		const ordered = ids.filter((id) => pendingSet.has(id));

		let first = null;
		let last = null;
		for (const pid of ordered) {
			const gen = await new sql.Request(tx)
				.input('year', sql.Int, cmeYear)
				.input('actor_id', sql.VarChar(20), actorId)
				.output('new_seq', sql.Int)
				.execute('sp_gen_cme_no');
			const seq = gen.output.new_seq;
			if (first === null) first = seq;
			last = seq;
			await new sql.Request(tx)
				.input('pid', sql.VarChar(24), pid)
				.input('year', sql.Int, cmeYear)
				.input('seq', sql.Int, seq)
				.input('credits', sql.Decimal(4, 1), seminar.cme_default_credits ?? null)
				.query(`
          UPDATE seminar_participants
          SET cme_year = @year, cme_seq = @seq, cme_status = 'issued',
              cme_issued_date = COALESCE(cme_issued_date, CAST(GETDATE() AS DATE)),
              cme_credits = COALESCE(cme_credits, @credits)
          WHERE id = @pid;
        `);
		}
		await tx.commit();
		broadcast('update', { entity: 'seminar' });
		return { issued: ordered.length, from: first, to: last, year: cmeYear };
	} catch (err) {
		await tx.rollback();
		throw err;
	}
};

// Thu hồi số CME — tạo lỗ hổng trong sổ, không tự dồn.
const revokeCme = async (seminarId, pid, actorId) => {
	const pool = await getPool();
	await pool
		.request()
		.input('sid', sql.VarChar(20), seminarId)
		.input('pid', sql.VarChar(24), pid)
		.input('actor_id', sql.VarChar(20), actorId)
		.query(`
      EXEC sp_set_actor @actor_id;
      UPDATE seminar_participants
      SET cme_year = NULL, cme_seq = NULL, cme_status = 'none', cme_issued_date = NULL
      WHERE id = @pid AND seminar_id = @sid;
    `);
	broadcast('update', { entity: 'seminar' });
};

// Đổi trạng thái issued ↔ signed hàng loạt
const setCmeStatus = async (seminarId, ids, status, actorId) => {
	if (!['issued', 'signed'].includes(status)) {
		const err = new Error('Trạng thái CME không hợp lệ.');
		err.statusCode = 400;
		throw err;
	}
	const list = (ids || []).filter(Boolean);
	if (!list.length) return { updated: 0 };
	const pool = await getPool();
	const req = pool
		.request()
		.input('sid', sql.VarChar(20), seminarId)
		.input('status', sql.VarChar(15), status)
		.input('actor_id', sql.VarChar(20), actorId);
	const inParams = list
		.map((id, i) => {
			req.input(`p${i}`, sql.VarChar(24), id);
			return `@p${i}`;
		})
		.join(',');
	const r = await req.query(`
    EXEC sp_set_actor @actor_id;
    UPDATE seminar_participants SET cme_status = @status
    WHERE seminar_id = @sid AND cme_seq IS NOT NULL AND id IN (${inParams});
    SELECT @@ROWCOUNT AS updated;
  `);
	broadcast('update', { entity: 'seminar' });
	return { updated: r.recordset[0].updated };
};

module.exports = {
	listBySeminar,
	add,
	bulkAdd,
	update,
	remove,
	issueCme,
	revokeCme,
	setCmeStatus,
	PART_TYPES,
	SOURCES,
};
