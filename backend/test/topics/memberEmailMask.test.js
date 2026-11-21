// M-09: email thành viên do server điền từ mã NV không được lộ cho người không có
// users:read, kể cả khi dòng đó gắn user_id = chính người gọi.
const test = require('node:test');
const assert = require('node:assert/strict');
const { maskMember, maskTopicMembers } = require('../../src/modules/topics/memberEmailMask');

const leader = { id: 'U1', permissions: new Set(['topics:update']), permissionScopes: new Map() };
const admin = { id: 'U2', permissions: new Set(['users:read']), permissionScopes: new Map() };

test('dòng có user_id = người gọi vẫn bị che email', () => {
	const m = { id: 'M1', user_id: 'U1', email: 'victim@hospital.vn' };
	assert.notEqual(maskMember(m, leader).email, 'victim@hospital.vn');
	assert.match(maskMember(m, leader).email, /\*\*\*@/);
});

test('maskTopicMembers che mọi dòng cho người không có users:read', () => {
	const t = { members: [{ user_id: 'U1', email: 'a.b@x.vn' }, { user_id: 'U9', email: 'c.d@x.vn' }] };
	for (const m of maskTopicMembers(t, leader).members) assert.match(m.email, /\*\*\*@/);
});

test('người có users:read thấy email đầy đủ', () => {
	const m = { user_id: 'U1', email: 'victim@hospital.vn' };
	assert.equal(maskMember(m, admin).email, 'victim@hospital.vn');
});
