// L-03: route ghi dùng phạm vi của quyền ghi (update/delete), không phải phạm vi xem.
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

install(async (text, inputs) => {
	if (/AS is_member/.test(text)) return [{ department_id: 'K1', is_member: 0 }];
	if (/FROM courses c WHERE c\.id = @id AND EXISTS/.test(text)) return [];
	return [];
});
const topicPolicy = require('../../src/modules/topics/topicPolicy');
const coursePolicy = require('../../src/modules/training/courses/coursePolicy');

const actor = (grants) => ({
	id: 'U1',
	department_id: 'K1',
	permissions: new Set(Object.keys(grants)),
	permissionScopes: new Map(Object.entries(grants)),
});
const MIXED_TOPIC = actor({ 'topics:read': 'all', 'topics:delete': 'own', 'topics:update': 'own' });
const MIXED_COURSE = actor({
	'courses:read': 'all',
	'courses:update': 'assigned',
	'courses:delete': 'assigned',
});
const code = (p, c) => assert.rejects(p, (e) => e.statusCode === c || e.status === c);

test('đề tài: xem all nhưng xóa/sửa own ⇒ không xóa/sửa được đề tài người khác', async () => {
	await topicPolicy.assertTopicInScope('DT2', MIXED_TOPIC); // đọc vẫn được
	await code(topicPolicy.assertTopicInScope('DT2', MIXED_TOPIC, 'delete'), 403);
	await code(topicPolicy.assertTopicInScope('DT2', MIXED_TOPIC, 'update'), 403);
});

test('khóa học: xem all nhưng sửa/xóa assigned ⇒ chặn khóa không được phân công', async () => {
	await coursePolicy.assertCourseInScope('KH2', MIXED_COURSE); // đọc vẫn được
	await code(coursePolicy.assertCourseInScope('KH2', MIXED_COURSE, 'delete'), 403);
	await code(coursePolicy.assertCourseChildInScope('sessionId', 'BH', MIXED_COURSE, 'update'), 404);
});

test('vai trò một phạm vi: hành vi không đổi', async () => {
	const all = actor({ 'topics:read': 'all', 'topics:delete': 'all' });
	await topicPolicy.assertTopicInScope('DT2', all, 'delete');
});
