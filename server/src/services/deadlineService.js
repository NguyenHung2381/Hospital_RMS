const { getPool, sql } = require('../config/db');
const { broadcast } = require('./eventService');

const VN_OFFSET_MS = 7 * 60 * 60 * 1000; // UTC+7 (Asia/Ho_Chi_Minh)

const fmtDate = (d) => {
	if (!d) return '';
	const dt = d instanceof Date ? d : new Date(d);
	if (isNaN(dt.getTime())) return '';
	// Shift to Vietnam local time then read with UTC getters so the result
	// is correct regardless of the Node.js server's own timezone setting.
	const vnDt = new Date(dt.getTime() + VN_OFFSET_MS);
	const dd = String(vnDt.getUTCDate()).padStart(2, '0');
	const mm = String(vnDt.getUTCMonth() + 1).padStart(2, '0');
	return `${dd}/${mm}/${vnDt.getUTCFullYear()}`;
};

// Những mục chủ nhiệm/thư ký được sửa trong cửa sổ "Bổ sung".
const SUPPLEMENT_FIELDS = ['title', 'description', 'members', 'files'];

const parseSupplementFields = (raw) => {
	if (!raw) return null;
	const list = String(raw)
		.split(',')
		.map((s) => s.trim())
		.filter((s) => SUPPLEMENT_FIELDS.includes(s));
	return list.length ? list : null;
};

const normalize = (r) => ({
	...r,
	start_date: r.start_date ? fmtDate(r.start_date) : null,
	deadline_date: fmtDate(r.deadline_date),
	supplement_fields:
		r.deadline_type === 'supplement'
			? parseSupplementFields(r.supplement_fields)
			: null,
	created_at: fmtDate(r.created_at),
	updated_at: r.updated_at ? fmtDate(r.updated_at) : undefined,
});

// ID: "HN" + yearDot(5) + typeChar(1) + phase padded to 2 digits  (max 10 chars < varchar(12))
// deadlineType abbrev: E=edit S=supplement N=report_submission
const TYPE_CHAR = { edit: 'E', supplement: 'S', report_submission: 'N' };
const genId = (roundId, deadlineType, phase) =>
	`HN${roundId.slice(3)}${TYPE_CHAR[deadlineType] ?? 'X'}${String(phase).padStart(2, '0')}`;

const getByRoundId = async (roundId) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('round_id', sql.VarChar(10), roundId)
		.query(
			'SELECT * FROM round_deadlines WHERE round_id = @round_id ORDER BY phase',
		);
	return r.recordset.map(normalize);
};

const ALLOWED_DEADLINE_TYPES = ['edit', 'supplement', 'report_submission'];

const upsert = async (roundId, phase, data, actorId) => {
	const pool = await getPool();
	const deadlineType = ALLOWED_DEADLINE_TYPES.includes(data.deadline_type)
		? data.deadline_type
		: 'edit';
	const id = genId(roundId, deadlineType, phase);
	const startDate = data.start_date ? new Date(data.start_date) : null;
	const supplementFields =
		deadlineType === 'supplement'
			? parseSupplementFields(
					Array.isArray(data.supplement_fields)
						? data.supplement_fields.join(',')
						: data.supplement_fields,
				)
			: null;

	await pool
		.request()
		.input('actor_id', sql.VarChar(20), actorId)
		.input('id', sql.VarChar(12), id)
		.input('round_id', sql.VarChar(10), roundId)
		.input('phase', sql.TinyInt, phase)
		.input('name', sql.NVarChar(255), data.name)
		.input('start_date', sql.Date, startDate)
		.input('deadline_date', sql.Date, new Date(data.deadline_date))
		.input('deadline_type', sql.VarChar(30), deadlineType)
		.input(
			'supplement_fields',
			sql.VarChar(120),
			supplementFields ? supplementFields.join(',') : null,
		).query(`
      EXEC sp_set_actor @actor_id;
      IF EXISTS (
        SELECT 1 FROM round_deadlines
        WHERE round_id = @round_id AND phase = @phase
      )
        UPDATE round_deadlines
           SET name              = @name,
               start_date        = @start_date,
               deadline_date     = @deadline_date,
               deadline_type     = @deadline_type,
               supplement_fields = @supplement_fields,
               updated_at        = GETDATE(),
               updated_by        = @actor_id
         WHERE round_id = @round_id AND phase = @phase;
      ELSE
        INSERT INTO round_deadlines (id, round_id, phase, name, start_date, deadline_date, deadline_type, supplement_fields, created_by)
        VALUES (@id, @round_id, @phase, @name, @start_date, @deadline_date, @deadline_type, @supplement_fields, @actor_id);
    `);

	const r = await pool
		.request()
		.input('round_id', sql.VarChar(10), roundId)
		.input('phase', sql.TinyInt, phase)
		.query(
			'SELECT * FROM round_deadlines WHERE round_id = @round_id AND phase = @phase',
		);
	broadcast('update', { entity: 'round' });
	return r.recordset[0] ? normalize(r.recordset[0]) : null;
};

const remove = async (roundId, phase, actorId) => {
	const pool = await getPool();

	// deadline_actions.deadline_id không có ON DELETE CASCADE → chặn nếu mốc đã
	// phát sinh hành động (gia hạn tự động, khoá nộp...).
	const used = await pool
		.request()
		.input('round_id', sql.VarChar(10), roundId)
		.input('phase', sql.TinyInt, phase).query(`
      SELECT COUNT(*) AS cnt
      FROM deadline_actions da
      JOIN round_deadlines rd ON rd.id = da.deadline_id
      WHERE rd.round_id = @round_id AND rd.phase = @phase;
    `);
	if (used.recordset[0].cnt > 0) {
		const err = new Error(
			`Không thể xoá mốc thời hạn vì đã có ${used.recordset[0].cnt} hành động được ghi nhận.`,
		);
		err.statusCode = 409;
		throw err;
	}

	await pool
		.request()
		.input('round_id', sql.VarChar(10), roundId)
		.input('phase', sql.TinyInt, phase)
		.input('actor_id', sql.VarChar(20), actorId).query(`
      EXEC sp_set_actor @actor_id;
      DELETE FROM round_deadlines WHERE round_id = @round_id AND phase = @phase;
    `);
	broadcast('update', { entity: 'round' });
};

module.exports = { getByRoundId, upsert, remove };
