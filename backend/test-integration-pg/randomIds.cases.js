// Mã ngẫu nhiên sinh bằng JS (utils/idGenerator.randomId) / adapter (newIdSql) thay
// cho các lô `DECLARE @new_id = 'XX' + LEFT(REPLACE(NEWID()...))` — chạy trên DB
// THẬT (randomIds.test.js). Mọi thứ trong 1 transaction rồi ROLLBACK.
const assert = require('node:assert/strict');

/**
 * @param {import('node:test').TestContext} t
 * @param {any} db module src/config/db
 * @param {{ skip?: string[] }} [opts] tên ca bỏ qua (kèm lý do ở file gọi)
 */
const run = async (t, db, { skip = [] } = {}) => {
	const { sql } = db;
	const pool = await db.getPool();
	const tx = new sql.Transaction(pool);
	await tx.begin();
	const real = { getPool: db.getPool, withTransaction: db.withTransaction };
	db.getPool = async () => ({ request: () => new sql.Request(tx) });
	db.withTransaction = async (fn) => fn(tx);
	t.after(async () => {
		Object.assign(db, real);
		await tx.rollback();
	});
	require('../src/modules/events/eventService').broadcast = () => {};

	const q = async (text, inputs = {}) => {
		const req = new sql.Request(tx);
		for (const [k, v] of Object.entries(inputs)) req.input(k, v);
		return (await req.query(text)).recordset;
	};
	const [actor] = await q('SELECT id FROM users WHERE is_active = @on ORDER BY id', { on: true });
	if (!actor) return t.skip('DB chưa có người dùng');
	const step = (name, fn) => t.test(name, skip.includes(name) ? { skip: 'xem file gọi' } : {}, fn);

	await step('newIdSql: mỗi dòng 1 mã, đúng định dạng', async () => {
		const rows = await q(
			`SELECT ${db.newIdSql('EPQ', 17)} AS id FROM (VALUES (1), (2), (3)) AS v(n)`,
		);
		assert.equal(rows.length, 3);
		for (const r of rows) assert.match(r.id, /^EPQ[0-9A-F]{17}$/);
		assert.equal(new Set(rows.map((r) => r.id)).size, 3);
	});

	await step('crudService.create: mã tiền tố + hex, trả dòng vừa thêm', async () => {
		const { createCrudService } = require('../src/shared/crudService');
		const svc = createCrudService('venues', 20, 'DD');
		const row = await svc.create({ name: 'Phòng thử mã ngẫu nhiên' }, actor.id);
		assert.match(row.id, /^DD[0-9A-F]{18}$/);
		assert.equal(row.name, 'Phòng thử mã ngẫu nhiên');
	});

	await step('khảo sát: tạo kèm câu hỏi (KS / CH)', async () => {
		const surveyService = require('../src/modules/surveys/surveyService');
		const s = await surveyService.create(
			{
				title: 'Khảo sát thử',
				questions: [
					{ question_text: 'Câu 1', question_type: 'text' },
					{ question_text: 'Câu 2', question_type: 'single_choice', options: ['A', 'B'] },
				],
			},
			actor.id,
		);
		assert.match(s.id, /^KS[0-9A-F]{18}$/);
		const qs = await q('SELECT id FROM survey_questions WHERE survey_id = @id', { id: s.id });
		assert.equal(qs.length, 2);
		for (const r of qs) assert.match(r.id, /^CH[0-9A-F]{18}$/);
	});

	await step('người tham dự hội thảo: bulkAdd sinh mã SPT', async () => {
		const [sem] = await q('SELECT id FROM seminars ORDER BY id');
		if (!sem) return;
		const svc = require('../src/modules/seminars/seminarParticipantService');
		const r = await svc.bulkAdd(
			sem.id,
			[{ full_name: 'Người thử A' }, { full_name: 'Người thử B' }],
			actor.id,
		);
		assert.equal(r.inserted, 2);
		const ids = r.ids;
		assert.equal(ids.length, 2);
		for (const id of ids) assert.match(id, /^SPT[0-9A-F]{21}$/);
		const found = await q(
			`SELECT COUNT(*) AS n FROM seminar_participants WHERE seminar_id = @s AND full_name LIKE @p`,
			{ s: sem.id, p: 'Người thử %' },
		);
		assert.equal(Number(found[0].n), 2);
	});
};

module.exports = { run };
