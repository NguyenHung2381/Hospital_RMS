// Hồi quy externalReviewerService (04-backend mục C): mọi câu ghi phải chạy trong
// transaction đã gắn người thao tác (set_config app.current_user_id) để trigger audit
// ghi được ai đã thêm / sửa / vô hiệu hoá / xoá chuyên gia ngoài.
const test = require('node:test');
const assert = require('node:assert/strict');

const fakeDb = require('../auth/fakeDb');

let used = false;
const log = fakeDb.install(async (text) => {
	if (/FROM council_members WHERE external_reviewer_id/.test(text)) return used ? [{ x: 1 }] : [];
	return [];
});
require('../../src/modules/persons/personService').syncPerson = async () => null;

const svc = require('../../src/modules/catalog/externalReviewerService');

// Câu ghi khớp `re` phải nằm sau set_config với đúng actor và trước COMMIT
const assertAudited = (re, actor) => {
	const texts = log.map((l) => l.text);
	const w = texts.findIndex((t) => re.test(t));
	assert.ok(w >= 0, `có câu ghi ${re}`);
	const setActor = texts
		.slice(0, w)
		.findLastIndex((t) => /set_config\('app.current_user_id'/.test(t));
	assert.ok(setActor >= 0, `gắn người thao tác trước ${re}\n${texts.join('\n---\n')}`);
	assert.equal(log[setActor].inputs.actor_id, actor);
	assert.ok(texts.indexOf('COMMIT', w) > w, 'commit sau câu ghi');
};

test('C create: INSERT trong transaction có người thao tác', async () => {
	log.length = 0;
	await svc.create({ full_name: 'Chuyên gia A' }, 'ADMIN');
	assertAudited(/INSERT INTO external_reviewers/, 'ADMIN');
});

test('C update: UPDATE trong transaction có người thao tác', async () => {
	log.length = 0;
	await svc.update('CGN001', { full_name: 'Chuyên gia B' }, 'ADMIN');
	assertAudited(/UPDATE external_reviewers SET/, 'ADMIN');
});

test('C remove (đã ngồi hội đồng): vô hiệu hoá trong transaction có người thao tác', async () => {
	used = true;
	log.length = 0;
	await svc.remove('CGN001', 'ADMIN');
	assertAudited(/UPDATE external_reviewers SET is_active/, 'ADMIN');
});

test('C remove (chưa ngồi hội đồng): DELETE trong transaction có người thao tác', async () => {
	used = false;
	log.length = 0;
	await svc.remove('CGN001', 'ADMIN');
	assertAudited(/DELETE FROM external_reviewers/, 'ADMIN');
});
