// Hồi quy deadlineService.upsert (01-tests mục 3 #5) — CSDL giả.
const test = require('node:test');
const assert = require('node:assert/strict');

const fakeDb = require('../auth/fakeDb');

let round = {
	start_date: new Date('2026-03-01T00:00:00Z'),
	end_date: new Date('2026-06-30T00:00:00Z'),
};
const log = fakeDb.install(async (text) => {
	if (/FROM research_rounds WHERE id = @round_id/.test(text)) return round ? [round] : [];
	if (/^\s*UPDATE round_deadlines/.test(text)) return [];
	if (/SELECT \* FROM round_deadlines/.test(text))
		return [
			{
				phase: 1,
				name: 'M',
				deadline_date: new Date('2026-04-01T00:00:00Z'),
				created_at: new Date(),
			},
		];
	return [];
});

const svc = require('../../src/modules/rounds/deadlineService');
const writes = () =>
	log.filter((l) => /INSERT INTO round_deadlines|UPDATE round_deadlines/.test(l.text));
const is400 = (e) => e.statusCode === 400;

const run = (data) => svc.upsert('DOT20261', 1, { name: 'Mốc', ...data }, 'ADMIN');

test('#5 upsert: ngày bắt đầu sau hạn cuối ⇒ 400, không ghi', async () => {
	log.length = 0;
	await assert.rejects(run({ start_date: '2026-05-10', deadline_date: '2026-05-01' }), is400);
	assert.equal(writes().length, 0);
});

test('#5 upsert: mốc ngoài thời gian của đợt ⇒ 400, không ghi', async () => {
	log.length = 0;
	await assert.rejects(run({ deadline_date: '2026-07-15' }), is400);
	await assert.rejects(run({ start_date: '2026-02-01', deadline_date: '2026-04-01' }), is400);
	assert.equal(writes().length, 0);
});

test('#5 upsert: ngày sai định dạng ⇒ 400 (không để Invalid Date xuống CSDL)', async () => {
	log.length = 0;
	await assert.rejects(run({ deadline_date: 'abc' }), is400);
	await assert.rejects(run({ start_date: '31/12/2026', deadline_date: '2026-04-01' }), is400);
	assert.equal(writes().length, 0);
});

test('#5 upsert: đợt không tồn tại ⇒ 404', async () => {
	round = null;
	await assert.rejects(run({ deadline_date: '2026-04-01' }), (e) => e.statusCode === 404);
	round = {
		start_date: new Date('2026-03-01T00:00:00Z'),
		end_date: new Date('2026-06-30T00:00:00Z'),
	};
});

test('#5 upsert: mốc hợp lệ (biên = ngày đợt) vẫn ghi như cũ', async () => {
	log.length = 0;
	const r = await run({ start_date: '2026-03-01', deadline_date: '2026-06-30' });
	assert.ok(r);
	assert.ok(writes().length >= 1);
});
