// Hồi quy topicService.setRelatedDepartments (01-tests, phát hiện của phiên tests):
// trước đây gửi "DELETE …; INSERT …" trong 1 query có tham số ⇒ PostgreSQL báo 42601,
// và chạy SAU khi transaction tạo đề tài đã commit ⇒ đề tài đã lưu mà người dùng nhận 500.
const test = require('node:test');
const assert = require('node:assert/strict');

const fakeDb = require('../auth/fakeDb');

let failRelated = false;
const log = fakeDb.install(async (text) => {
	if (/SELECT abbr FROM categories/.test(text)) return [{ abbr: 'NC', year: 2026 }];
	if (/INSERT INTO topic_related_departments/.test(text) && failRelated) throw new Error('DB rớt');
	return [];
});

const svc = require('../../src/modules/topics/topicService');
const texts = () => log.map((l) => l.text);
const oneStatement = (t) => t.split(';').filter((s) => s.trim()).length === 1;

const data = {
	title: '[TEST] Đề tài',
	round_id: 'DOT20261',
	category_id: 'NC',
	article_type: 'bai_bao', // không cần tra cấp độ theo đợt
	related_department_ids: ['K1', 'K2'],
};

test('create: chuyên ngành liên quan ghi trong transaction tạo đề tài, mỗi query 1 câu', async () => {
	failRelated = false;
	log.length = 0;
	await svc.create(data, 'ADMIN');
	const all = texts();
	const del = all.findIndex((t) => /DELETE FROM topic_related_departments/.test(t));
	const ins = all.findIndex((t) => /INSERT INTO topic_related_departments/.test(t));
	const topic = all.findIndex((t) => /INSERT INTO topics/.test(t));
	const commit = all.indexOf('COMMIT');
	assert.ok(topic < del && del < ins && ins < commit, all.join('\n---\n'));
	assert.ok(oneStatement(all[del]) && oneStatement(all[ins]));
	assert.equal(all.filter((t) => t === 'COMMIT').length, 1);
});

test('create: ghi chuyên ngành liên quan lỗi ⇒ ROLLBACK cả đề tài', async () => {
	failRelated = true;
	log.length = 0;
	await assert.rejects(svc.create(data, 'ADMIN'), /DB rớt/);
	assert.equal(texts().filter((t) => t === 'COMMIT').length, 0, texts().join('\n---\n'));
	assert.ok(texts().includes('ROLLBACK'));
});
