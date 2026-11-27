// Mốc thời hạn của đợt nghiên cứu (rounds/deadlineService) với CSDL giả:
// kiểm tra danh sách mốc gửi kèm lúc tạo đợt (prepareBatch), sinh mã mốc,
// upsert trong transaction có người thao tác, chặn xoá mốc đã phát sinh hành động.
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

require('../../src/modules/events/eventService').broadcast = () => {};

const state = { actions: 0, updated: false };
const log = install(async (text) => {
	if (text.includes('FROM deadline_actions')) return [{ cnt: state.actions }];
	if (text.includes('FROM research_rounds WHERE id = @round_id'))
		return [
			{ start_date: new Date('2026-01-01T00:00:00Z'), end_date: new Date('2026-12-31T00:00:00Z') },
		];
	// rowsAffected giả = số dòng trả về ⇒ [{}] nghĩa là UPDATE trúng 1 dòng
	if (text.includes('UPDATE round_deadlines')) return state.updated ? [{}] : [];
	if (text.includes('SELECT * FROM round_deadlines WHERE round_id = @round_id AND phase'))
		return [
			{
				id: 'X',
				phase: 1,
				deadline_type: 'supplement',
				supplement_fields: 'title,files,hack',
				deadline_date: new Date('2026-05-01T00:00:00Z'),
				created_at: new Date('2026-01-01T00:00:00Z'),
			},
		];
	return [];
});

const svc = require('../../src/modules/rounds/deadlineService');

const RS = '2026-01-01';
const RE = '2026-12-31';
const ok = (over = {}) => ({ name: 'Đăng ký', deadline_date: '2026-03-01', ...over });

test('prepareBatch: không gửi mốc ⇒ mảng rỗng; không phải mảng ⇒ 400', () => {
	assert.deepEqual(svc.prepareBatch(undefined, RS, RE), []);
	assert.deepEqual(svc.prepareBatch(null, RS, RE), []);
	assert.throws(() => svc.prepareBatch({ a: 1 }, RS, RE), { statusCode: 400 });
	assert.throws(() => svc.prepareBatch('x', RS, RE), { statusCode: 400 });
});

test('prepareBatch: tối đa 9 mốc', () => {
	assert.equal(svc.prepareBatch(Array(9).fill(ok()), RS, RE).length, 9);
	assert.throws(() => svc.prepareBatch(Array(10).fill(ok()), RS, RE), {
		statusCode: 400,
		message: /Tối đa 9/,
	});
});

test('prepareBatch: đánh số giai đoạn 1..n, cắt tên, loại không hợp lệ ⇒ edit', () => {
	const rows = svc.prepareBatch(
		[ok({ name: `  ${'a'.repeat(300)}  ` }), ok({ deadline_type: 'drop_table' }), ok()],
		RS,
		RE,
	);
	assert.deepEqual(
		rows.map((r) => r.phase),
		[1, 2, 3],
	);
	assert.equal(rows[0].name.length, 255);
	assert.equal(rows[1].deadline_type, 'edit');
	assert.equal(rows[0].supplement_fields, null);
});

test('prepareBatch: mốc "bổ sung" chỉ giữ các mục được phép sửa', () => {
	const [a, b, c] = svc.prepareBatch(
		[
			ok({ deadline_type: 'supplement', supplement_fields: ['title', 'status', 'files'] }),
			ok({ deadline_type: 'supplement', supplement_fields: 'members, budget' }),
			ok({ deadline_type: 'supplement', supplement_fields: ['status'] }),
		],
		RS,
		RE,
	);
	assert.equal(a.supplement_fields, 'title,files');
	assert.equal(b.supplement_fields, 'members');
	assert.equal(c.supplement_fields, null, 'không còn mục hợp lệ ⇒ null');
});

test('prepareBatch: lỗi nhập liệu ⇒ 400 kèm số thứ tự mốc', () => {
	const cases = [
		[ok({ name: '   ' }), /chưa nhập tên/],
		[ok({ deadline_date: '' }), /chưa chọn hạn cuối/],
		[ok({ deadline_date: '01/03/2026' }), /hạn cuối không hợp lệ/],
		[ok({ start_date: '2026/02/01' }), /ngày bắt đầu không hợp lệ/],
		[ok({ start_date: '2026-03-02' }), /bắt đầu phải trước hạn cuối/],
		[ok({ deadline_date: '2027-01-01' }), /trong khoảng thời gian của đợt/],
		[ok({ start_date: '2025-12-31' }), /trong khoảng thời gian của đợt/],
	];
	for (const [item, msg] of cases) {
		assert.throws(
			() => svc.prepareBatch([ok(), item], RS, RE),
			(err) => {
				assert.equal(err.statusCode, 400);
				assert.match(err.message, msg);
				assert.match(err.message, /^Mốc 2: /, 'báo đúng mốc lỗi (mốc thứ 2)');
				return true;
			},
		);
	}
});

test('prepareBatch: đợt chưa có ngày thì không kiểm khoảng', () => {
	const rows = svc.prepareBatch([ok({ deadline_date: '2030-01-01' })], '', '');
	assert.equal(rows[0].deadline_date, '2030-01-01');
});

test('insertBatch: ghi người thao tác trước rồi mới INSERT, mã mốc HN<năm.số><loại><giai đoạn>', async () => {
	log.length = 0;
	const rows = svc.prepareBatch(
		[ok({ deadline_type: 'topic_registration' }), ok({ deadline_type: 'report_submission' })],
		RS,
		RE,
	);
	const db = require('../../src/config/db');
	await svc.insertBatch(new db.sql.Transaction(), 'DOT2026.1', rows, 'ADMIN');
	assert.match(log[0].text, /app\.current_user_id/);
	assert.equal(log[0].inputs.actor_id, 'ADMIN');
	const ins = log
		.filter((l) => l.text.includes('INSERT INTO round_deadlines'))
		.map((l) => l.inputs);
	assert.deepEqual(
		ins.map((i) => i.id),
		['HN2026.1R01', 'HN2026.1N02'],
	);
	assert.ok(
		ins.every((i) => i.id.length <= 12),
		'vừa cột varchar(12)',
	);
});

test('upsert: chưa có mốc ⇒ INSERT trong cùng transaction, có người thao tác', async () => {
	log.length = 0;
	state.updated = false;
	const r = await svc.upsert(
		'DOT2026.1',
		3,
		{ name: 'Sửa', deadline_date: '2026-04-01', deadline_type: 'không có' },
		'ADMIN',
	);
	const texts = log.map((l) => l.text);
	const iActor = texts.findIndex((t) => t.includes('app.current_user_id'));
	const iUpd = texts.findIndex((t) => t.includes('UPDATE round_deadlines'));
	const iIns = texts.findIndex((t) => t.includes('INSERT INTO round_deadlines'));
	const iCommit = texts.indexOf('COMMIT');
	assert.ok(iActor < iUpd && iUpd < iIns && iIns < iCommit);
	const ins = log[iIns].inputs;
	assert.equal(ins.id, 'HN2026.1E03', 'loại lạ ⇒ edit');
	assert.equal(ins.deadline_type, 'edit');
	assert.equal(ins.supplement_fields, null);
	assert.deepEqual(r.supplement_fields, ['title', 'files'], 'kết quả lọc mục không hợp lệ');
});

test('upsert: đã có mốc ⇒ chỉ UPDATE, không INSERT', async () => {
	log.length = 0;
	state.updated = true;
	await svc.upsert(
		'DOT2026.1',
		1,
		ok({ deadline_type: 'supplement', supplement_fields: ['title'] }),
		'A',
	);
	assert.equal(log.filter((l) => l.text.includes('INSERT INTO round_deadlines')).length, 0);
	const upd = log.find((l) => l.text.includes('UPDATE round_deadlines'));
	assert.equal(upd.inputs.supplement_fields, 'title');
});

test('upsert: ngày bắt đầu sau hạn cuối ⇒ 400 (như prepareBatch)', async () => {
	await assert.rejects(svc.upsert('DOT2026.1', 1, ok({ start_date: '2026-05-01' }), 'A'), {
		statusCode: 400,
	});
});

test('remove: mốc đã phát sinh hành động ⇒ 409, không xoá', async () => {
	log.length = 0;
	state.actions = 2;
	await assert.rejects(svc.remove('DOT2026.1', 1, 'A'), {
		statusCode: 409,
		message: /2 hành động/,
	});
	assert.ok(!log.some((l) => l.text.includes('DELETE')));
});

test('remove: chưa có hành động ⇒ DELETE trong transaction có người thao tác', async () => {
	log.length = 0;
	state.actions = 0;
	await svc.remove('DOT2026.1', 1, 'ADMIN');
	const texts = log.map((l) => l.text);
	const iActor = texts.findIndex((t) => t.includes('app.current_user_id'));
	const iDel = texts.findIndex((t) => t.includes('DELETE FROM round_deadlines'));
	assert.ok(iActor >= 0 && iActor < iDel && iDel < texts.indexOf('COMMIT'));
});
