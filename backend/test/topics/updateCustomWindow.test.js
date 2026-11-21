// L-09: PUT /topics/:id chỉ chứa trường tùy biến vẫn phải qua kiểm mốc/chủ nhiệm.
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');
install(async () => []);

const deadlineGuard = require('../../src/modules/topics/deadlineGuard');
const windowCalls = [];
let denyWindow = true;
deadlineGuard.assertTopicActionWindow = async (id, uid, action) => {
	windowCalls.push([id, uid, action]);
	if (denyWindow) throw Object.assign(new Error('Ngoài mốc'), { status: 403, statusCode: 403 });
};
const topicService = require('../../src/modules/topics/topicService');
let updated = 0;
topicService.update = async () => {
	updated++;
	return { id: 'DT1', members: [] };
};
const formCustomValueService = require('../../src/modules/forms/formCustomValueService');
let saved = 0;
formCustomValueService.save = async () => {
	saved++;
};
const ctrl = require('../../src/modules/topics/topicController');

const OWN = {
	id: 'U1',
	permissions: new Set(['topics:update']),
	permissionScopes: new Map([['topics:update', 'own']]),
};
const run = (user, formCustom) =>
	new Promise((resolve) => {
		const req = { params: { id: 'DT1' }, body: {}, user, formCustom };
		const res = { status: () => res, json: () => resolve('ok') };
		ctrl.updateOne(req, res, (err) => resolve(err ? err.status : 'next'));
	});

test('own + chỉ custom + ngoài mốc ⇒ 403, không ghi', async () => {
	denyWindow = true;
	assert.equal(await run(OWN, { f1: 'x' }), 403);
	assert.deepEqual(windowCalls.at(-1), ['DT1', 'U1', 'edit-info']);
	assert.equal(saved, 0);
	assert.equal(updated, 0);
});

test('own + chỉ custom + trong mốc ⇒ ghi được', async () => {
	denyWindow = false;
	assert.equal(await run(OWN, { f1: 'x' }), 'ok');
	assert.equal(saved, 1);
});

test('không có custom ⇒ không kiểm thêm mốc ở controller', async () => {
	const n = windowCalls.length;
	await run(OWN, undefined);
	assert.equal(windowCalls.length, n);
});
