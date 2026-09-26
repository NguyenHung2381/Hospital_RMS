// Chống IDOR cho đề tài (services/topicService.js): quyền topics:xxx ở route
// chưa đủ — đề tài cụ thể phải nằm trong phạm vi của người gọi.
//   own        → là thành viên đề tài
//   department → đề tài cùng khoa
//   all        → mọi đề tài
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

const TOPICS = {
	DT1: { id: 'DT1', department_id: 'K1', status: 'submitted', members: ['U-MEM'] },
	DT2: { id: 'DT2', department_id: 'K2', status: 'submitted', members: [] },
};
const writes = [];
install(async (text, inputs) => {
	const t = TOPICS[inputs.id] ?? TOPICS[inputs.topic_id];
	if (/AS is_member/.test(text)) {
		return t ? [{ department_id: t.department_id, is_member: t.members.includes(inputs.uid) ? 1 : 0 }] : [];
	}
	if (/SELECT 1 AS ok FROM topic_members/.test(text)) return t?.members.includes(inputs.user_id) ? [{ ok: 1 }] : [];
	if (/WHERE t\.id = @id/.test(text)) return t ? [{ ...t }] : [];
	if (/UPDATE topics/.test(text)) writes.push(inputs.id);
	return [];
});
require('../../src/services/eventService').broadcast = () => {};
const topicService = require('../../src/services/topicService');
const { errorHandler } = require('../../src/middlewares/errorHandler');

const actor = (id, dept, grants) => ({
	id,
	department_id: dept,
	permissions: new Set(Object.keys(grants)),
	permissionScopes: new Map(Object.entries(grants)),
});
const OWN_MEMBER = actor('U-MEM', 'K9', { 'topics:read': 'own', 'topics:update': 'own' });
const OWN_OTHER = actor('U-X', 'K1', { 'topics:read': 'own', 'topics:update': 'own' });
const DEPT_K1 = actor('U-K1', 'K1', { 'topics:read': 'department', 'topics:update': 'department' });
const ALL = actor('U-ALL', 'K5', { 'topics:read': 'all', 'topics:update': 'all' });

const denied = (p, code = 403) => assert.rejects(p, (e) => (e.statusCode ?? e.status) === code);

test('phạm vi own: chỉ đề tài mình là thành viên', async () => {
	await topicService.assertTopicInScope('DT1', OWN_MEMBER);
	await denied(topicService.assertTopicInScope('DT1', OWN_OTHER)); // cùng khoa nhưng không là thành viên
	await denied(topicService.assertTopicInScope('DT2', OWN_MEMBER));
});

test('phạm vi department: chỉ đề tài cùng khoa', async () => {
	await topicService.assertTopicInScope('DT1', DEPT_K1);
	await denied(topicService.assertTopicInScope('DT2', DEPT_K1));
});

test('phạm vi all: mọi đề tài; đề tài không tồn tại → 404', async () => {
	await topicService.assertTopicInScope('DT2', ALL);
	await denied(topicService.assertTopicInScope('DT404', DEPT_K1), 404);
});

test('sửa đề tài ngoài phạm vi (kể cả chỉ sửa trường "phụ" như tạp chí) bị chặn, không ghi DB', async () => {
	await denied(topicService.update('DT2', { journal_name: 'X' }, 'U-K1', DEPT_K1));
	await denied(topicService.update('DT1', { journal_name: 'X' }, 'U-X', OWN_OTHER));
	assert.deepEqual(writes, []);
});

test('phạm vi khoa không chuyển được đề tài sang khoa khác', async () => {
	await denied(topicService.update('DT1', { department_id: 'K2' }, 'U-K1', DEPT_K1));
	assert.deepEqual(writes, []);
});

test('xuất dữ liệu theo danh sách mã: tự bỏ đề tài ngoài phạm vi', async () => {
	assert.deepEqual(await topicService.idsInScope(['DT1', 'DT2', 'DT404'], DEPT_K1), ['DT1']);
	assert.deepEqual(await topicService.idsInScope(['DT1', 'DT2'], ALL), ['DT1', 'DT2']);
	assert.deepEqual(await topicService.idsInScope('not-an-array', DEPT_K1), []);
});

test('lỗi nghiệp vụ chỉ có `status` (không có statusCode) trả đúng mã, không thành 500', () => {
	let sent;
	const res = {
		status(c) {
			sent = c;
			return this;
		},
		json() {},
	};
	errorHandler(Object.assign(new Error('Không có quyền xem đề tài này'), { status: 403 }), { method: 'GET', path: '/x' }, res);
	assert.equal(sent, 403);
});
