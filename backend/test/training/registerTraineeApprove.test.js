// L-10: ghi danh hộ chỉ tự duyệt khi người gọi có courses:approve.
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');
install(async () => []);

const svc = require('../../src/modules/training/courses/courseEnrollmentService');
const decided = [];
svc.registerTrainee = async () => ({ id: 'E1', status: 'pending' });
svc.registerStaff = svc.registerTrainee;
svc.decideEnrollment = async (id, status) => {
	decided.push([id, status]);
	return { status, waitlist_position: null };
};
require('../../src/modules/forms/formCustomValueService').save = async () => {};
const ctrl = require('../../src/modules/training/courses/courseController');

const mk = (...perms) => ({
	id: 'U1',
	permissions: new Set(perms),
	permissionScopes: new Map(),
});
const run = (user) =>
	new Promise((resolve) => {
		const req = { params: { id: 'KH1' }, body: { trainee_id: 'T1' }, user };
		const res = { status: () => res, json: (b) => resolve(b) };
		ctrl.registerTrainee(req, res, (e) => resolve(e));
	});

test('chỉ courses:create ⇒ đăng ký giữ pending, không gọi decideEnrollment', async () => {
	const out = await run(mk('courses:create'));
	assert.equal(decided.length, 0);
	assert.equal((out.data ?? out).status, 'pending');
});

test('có courses:approve ⇒ duyệt như cũ', async () => {
	const out = await run(mk('courses:create', 'courses:approve'));
	assert.deepEqual(decided, [['E1', 'approved']]);
	assert.equal((out.data ?? out).status, 'approved');
});
