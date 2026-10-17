const { getPool, sql } = require('../../config/db');
const { broadcast } = require('../events/eventService');
const { fmtDateVN: fmtDate } = require('../../utils/vnDate');

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
// deadlineType abbrev: R=topic_registration E=edit S=supplement N=report_submission
const TYPE_CHAR = {
	topic_registration: 'R',
	edit: 'E',
	supplement: 'S',
	report_submission: 'N',
};
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
	'topic_registration',
	'edit',
	'supplement',
	'report_submission',
];

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

// ─── Tạo mốc hàng loạt khi tạo đợt ──────────────────────────────────────────
// Chuẩn hoá + kiểm tra danh sách mốc gửi kèm lúc tạo đợt (ngày dạng
// 'yyyy-mm-dd', phải nằm trong [roundStart, roundEnd]). Giai đoạn đánh số lại
// 1..n theo thứ tự gửi lên. Lỗi ⇒ throw 400 trước khi ghi gì vào DB.
const MAX_PHASE = 9;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const prepareBatch = (list, roundStart, roundEnd) => {
	if (list == null) return [];
	const fail = (msg) => {
		const err = new Error(msg);
		err.statusCode = 400;
		throw err;
	};
	if (!Array.isArray(list)) fail('Danh sách mốc thời gian không hợp lệ');
	if (list.length > MAX_PHASE) fail(`Tối đa ${MAX_PHASE} mốc thời gian cho một đợt`);
	return list.map((d, i) => {
		const label = `Mốc ${i + 1}`;
		const name = String(d?.name ?? '').trim();
		const start = d?.start_date ? String(d.start_date) : null;
		const end = d?.deadline_date ? String(d.deadline_date) : '';
		if (!name) fail(`${label}: chưa nhập tên`);
		if (!ISO_DATE.test(end)) fail(`${label}: chưa chọn hạn cuối`);
		if (start && !ISO_DATE.test(start)) fail(`${label}: ngày bắt đầu không hợp lệ`);
		if (start && start > end) fail(`${label}: ngày bắt đầu phải trước hạn cuối`);
		if ([start, end].some((x) => x && ((roundStart && x < roundStart) || (roundEnd && x > roundEnd))))
			fail(`${label}: phải nằm trong khoảng thời gian của đợt`);
		const deadlineType = ALLOWED_DEADLINE_TYPES.includes(d.deadline_type)
			? d.deadline_type
			: 'edit';
		const supplementFields =
			deadlineType === 'supplement'
				? parseSupplementFields(
						Array.isArray(d.supplement_fields)
							? d.supplement_fields.join(',')
							: d.supplement_fields,
					)
				: null;
		return {
			phase: i + 1,
			name: name.slice(0, 255),
			start_date: start,
			deadline_date: end,
			deadline_type: deadlineType,
			supplement_fields: supplementFields ? supplementFields.join(',') : null,
		};
	});
};

// Ghi các mốc đã prepareBatch vào DB trong transaction của người gọi.
const insertBatch = async (tx, roundId, rows, actorId) => {
	for (const row of rows) {
		await new sql.Request(tx)
			.input('actor_id', sql.VarChar(20), actorId)
			.input('id', sql.VarChar(12), genId(roundId, row.deadline_type, row.phase))
			.input('round_id', sql.VarChar(10), roundId)
			.input('phase', sql.TinyInt, row.phase)
			.input('name', sql.NVarChar(255), row.name)
			.input('start_date', sql.Date, row.start_date ? new Date(row.start_date) : null)
			.input('deadline_date', sql.Date, new Date(row.deadline_date))
			.input('deadline_type', sql.VarChar(30), row.deadline_type)
			.input('supplement_fields', sql.VarChar(120), row.supplement_fields).query(`
        EXEC sp_set_actor @actor_id;
        INSERT INTO round_deadlines (id, round_id, phase, name, start_date, deadline_date, deadline_type, supplement_fields, created_by)
        VALUES (@id, @round_id, @phase, @name, @start_date, @deadline_date, @deadline_type, @supplement_fields, @actor_id);
      `);
	}
};

module.exports = { getByRoundId, upsert, remove, prepareBatch, insertBatch };
