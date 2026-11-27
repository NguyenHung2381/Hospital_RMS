// Hồi quy topicService.remove (04-backend mục B): gỡ users.topic_member_id và xoá đề
// tài phải cùng MỘT transaction có người thao tác — DELETE lỗi thì tài khoản không bị
// gỡ liên kết.
const test = require('node:test');
const assert = require('node:assert/strict');

const fakeDb = require('../auth/fakeDb');

let failDelete = false;
const log = fakeDb.install(async (text) => {
	if (/DELETE FROM topics/.test(text) && failDelete) throw new Error('DB rớt');
	return [];
});

const svc = require('../../src/modules/topics/topicService');
const texts = () => log.map((l) => l.text);
const idx = (re) => texts().findIndex((t) => re.test(t));

test('B remove: gỡ topic_member_id + DELETE trong 1 transaction, sau set_config', async () => {
	failDelete = false;
	log.length = 0;
	await svc.remove('DT001', 'ADMIN');
	const actor = idx(/set_config\('app.current_user_id'/);
	const unlink = idx(/UPDATE users SET topic_member_id = NULL/);
	const del = idx(/DELETE FROM topics/);
	const commit = texts().indexOf('COMMIT');
	assert.ok(actor >= 0 && actor < unlink && unlink < del && del < commit, texts().join('\n---\n'));
});

test('B remove: DELETE lỗi ⇒ ROLLBACK cả bước gỡ liên kết tài khoản', async () => {
	failDelete = true;
	log.length = 0;
	await assert.rejects(svc.remove('DT001', 'ADMIN'), /DB rớt/);
	const actor = idx(/set_config\('app.current_user_id'/);
	const unlink = idx(/UPDATE users SET topic_member_id = NULL/);
	const rollback = texts().indexOf('ROLLBACK');
	assert.ok(actor >= 0 && actor < unlink && unlink < rollback, texts().join('\n---\n'));
	assert.ok(!texts().includes('COMMIT'));
});
