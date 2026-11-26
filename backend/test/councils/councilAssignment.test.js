// Gán đề tài vào hội đồng và ghế thay thế (councilAssignmentService) với CSDL giả:
// chỉ gán đề tài cùng đợt, xoá ghế thay thế của hội đồng cũ, mọi câu ghi chạy
// trong transaction có người thao tác, đề tài không thuộc hội đồng ⇒ 404.
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

require('../../src/modules/events/eventService').broadcast = () => {};

const state = { rows: {} };
// state.rows[đoạn SQL] = recordset; rowsAffected giả = độ dài recordset
const log = install(async (text) => {
	for (const [needle, rows] of Object.entries(state.rows)) if (text.includes(needle)) return rows;
	return [];
});
const svc = require('../../src/modules/councils/councilAssignmentService');

const reset = (rows = {}) => {
	log.length = 0;
	state.rows = rows;
};
const texts = () => log.map((l) => l.text);
const actorFirst = () => {
	const t = texts();
	const iActor = t.findIndex((x) => x.includes('app.current_user_id'));
	assert.ok(iActor >= 0, 'có ghi người thao tác');
	return iActor;
};

test('assignTopics: danh sách rỗng ⇒ không truy vấn gì', async () => {
	reset();
	assert.deepEqual(await svc.assignTopics('HD1', [], 'A'), { assigned: 0 });
	assert.deepEqual(await svc.assignTopics('HD1', undefined, 'A'), { assigned: 0 });
	assert.equal(log.length, 0);
});

test('assignTopics: xoá ghế thay thế của hội đồng cũ trước, chỉ chuyển đề tài cùng đợt, mã đề tài qua tham số', async () => {
	reset({ 'UPDATE topics SET council_id = @council_id': [{}, {}] });
	const r = await svc.assignTopics('HD1', ['DT1', "DT2'; DROP TABLE topics; --"], 'ADMIN');
	assert.deepEqual(r, { assigned: 2 });
	const iActor = actorFirst();
	const t = texts();
	const iDel = t.findIndex((x) => x.includes('DELETE FROM council_seat_substitutes'));
	const iUpd = t.findIndex((x) => x.includes('UPDATE topics SET council_id'));
	assert.ok(iActor < iDel && iDel < iUpd && iUpd < t.indexOf('COMMIT'));
	assert.match(t[iDel], /council_id <> @council_id/, 'chỉ xoá ghế thay của hội đồng KHÁC');
	assert.match(t[iUpd], /round_id = \(SELECT round_id FROM councils WHERE id = @council_id\)/);
	assert.ok(!t[iUpd].includes('DROP TABLE'));
	assert.equal(log[iUpd].inputs.id1, "DT2'; DROP TABLE topics; --");
});

test('unassignTopic: chỉ xoá ghế thay thế khi đề tài thực sự rời hội đồng', async () => {
	reset();
	await svc.unassignTopic('HD1', 'DT1', 'A');
	assert.ok(!texts().some((x) => x.includes('DELETE FROM council_seat_substitutes')));

	reset({ 'SET council_id = NULL': [{}] });
	await svc.unassignTopic('HD1', 'DT1', 'A');
	actorFirst();
	assert.ok(texts().some((x) => x.includes('DELETE FROM council_seat_substitutes')));
});

test('setTopicSession: đề tài không thuộc hội đồng ⇒ 404', async () => {
	reset();
	await assert.rejects(svc.setTopicSession('HD1', 'DT9', 'morning', 'A'), { status: 404 });
	reset({ 'UPDATE topics SET session': [{}] });
	await svc.setTopicSession('HD1', 'DT1', '', 'A');
	const upd = log.find((l) => l.text.includes('UPDATE topics SET session'));
	assert.equal(upd.inputs.session, null, 'chuỗi rỗng ⇒ bỏ buổi');
	assert.match(upd.text, /council_id = @council_id/);
});

test('setSeatSubstitute: đề tài không thuộc hội đồng ⇒ 404, không ghi', async () => {
	reset();
	await assert.rejects(svc.setSeatSubstitute('HD1', 'DT9', 'chairman', 'U1', 'A'), {
		statusCode: 404,
	});
	assert.ok(!texts().some((x) => /UPDATE council_seat|INSERT INTO council_seat/.test(x)));
});

test('setSeatSubstitute: chưa có ghế thay ⇒ INSERT; đã có ⇒ chỉ UPDATE', async () => {
	reset({ 'SELECT 1 AS x FROM topics': [{ x: 1 }] });
	await svc.setSeatSubstitute('HD1', 'DT1', 'reviewer1', 'U2', 'ADMIN');
	actorFirst();
	const ins = log.find((l) => l.text.includes('INSERT INTO council_seat_substitutes'));
	assert.deepEqual(
		[ins.inputs.topic_id, ins.inputs.role, ins.inputs.user_id],
		['DT1', 'reviewer1', 'U2'],
	);

	reset({ 'SELECT 1 AS x FROM topics': [{ x: 1 }], 'UPDATE council_seat_substitutes': [{}] });
	await svc.setSeatSubstitute('HD1', 'DT1', 'reviewer1', 'U3', 'ADMIN');
	assert.ok(!texts().some((x) => x.includes('INSERT INTO council_seat_substitutes')));
});

test('removeSeatSubstitute: chỉ xoá ghế thay của đề tài thuộc đúng hội đồng', async () => {
	reset();
	await svc.removeSeatSubstitute('HD1', 'DT1', 'member', 'A');
	actorFirst();
	const del = log.find((l) => l.text.includes('DELETE FROM council_seat_substitutes'));
	assert.match(del.text, /topic_id IN \(SELECT id FROM topics WHERE council_id = @council_id\)/);
});
