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

const normalize = (r) => ({
	...r,
	start_date: r.start_date ? fmtDate(r.start_date) : null,
	deadline_date: fmtDate(r.deadline_date),
	created_at: fmtDate(r.created_at),
	updated_at: r.updated_at ? fmtDate(r.updated_at) : undefined,
});

// ID: "HN" + yearDot(5) + typeChar(1) + phase padded to 2 digits  (max 10 chars < varchar(12))
// deadlineType abbrev: R=registration S=supplement N=report_submission C=council_submission
const TYPE_CHAR = { registration: 'R', supplement: 'S', report_submission: 'N', council_submission: 'C' };
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

const ALLOWED_DEADLINE_TYPES = [
	'registration',
	'supplement',
	'report_submission',
	'council_submission',
];

const upsert = async (roundId, phase, data, actorId) => {
	const pool = await getPool();
	const deadlineType = ALLOWED_DEADLINE_TYPES.includes(data.deadline_type)
		? data.deadline_type
		: 'report_submission';
	const id = genId(roundId, deadlineType, phase);
	const startDate = data.start_date ? new Date(data.start_date) : null;

	await pool
		.request()
		.input('actor_id', sql.VarChar(20), actorId)
		.input('id', sql.VarChar(12), id)
		.input('round_id', sql.VarChar(10), roundId)
		.input('phase', sql.TinyInt, phase)
		.input('name', sql.NVarChar(255), data.name)
		.input('start_date', sql.Date, startDate)
		.input('deadline_date', sql.Date, new Date(data.deadline_date))
		.input('deadline_type', sql.VarChar(30), deadlineType).query(`
      EXEC sp_set_actor @actor_id;
      IF EXISTS (
        SELECT 1 FROM round_deadlines
        WHERE round_id = @round_id AND deadline_type = @deadline_type AND phase = @phase
      )
        UPDATE round_deadlines
           SET name          = @name,
               start_date    = @start_date,
               deadline_date = @deadline_date,
               updated_at    = GETDATE(),
               updated_by    = @actor_id
         WHERE round_id = @round_id AND deadline_type = @deadline_type AND phase = @phase;
      ELSE
        INSERT INTO round_deadlines (id, round_id, phase, name, start_date, deadline_date, deadline_type, created_by)
        VALUES (@id, @round_id, @phase, @name, @start_date, @deadline_date, @deadline_type, @actor_id);
    `);

	const r = await pool
		.request()
		.input('round_id', sql.VarChar(10), roundId)
		.input('phase', sql.TinyInt, phase)
		.input('deadline_type', sql.VarChar(30), deadlineType)
		.query(
			'SELECT * FROM round_deadlines WHERE round_id = @round_id AND deadline_type = @deadline_type AND phase = @phase',
		);
	broadcast('update', { entity: 'round' });
	return r.recordset[0] ? normalize(r.recordset[0]) : null;
};

const remove = async (roundId, phase, actorId) => {
	const pool = await getPool();
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
