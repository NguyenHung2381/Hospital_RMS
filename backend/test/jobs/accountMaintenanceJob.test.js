// Khoá tài khoản thành viên hết hạn: vai trò tra theo mã "member", không ghi cứng id
// (id vai trò có thể được đánh số lại trên DB đang chạy).
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.LOG_LEVEL = 'silent';
const { install } = require('../auth/fakeDb');

let roles = [];
let expired = 0;
const log = install((text) => {
	if (text.includes('FROM roles')) return roles;
	if (text.includes('COUNT(*) AS n FROM users')) return [{ n: expired }];
	return [];
});

const db = require('../../src/config/db');
const roleCodes = require('../../src/modules/access/roleCodes');
const { deactivateExpired } = require('../../src/jobs/accountMaintenanceJob');

const usersQueries = () => log.filter((q) => /FROM users|UPDATE users/.test(q.text));

test('khoá đúng vai trò mang mã member dù id không phải VT06', async () => {
	roles = [
		{ id: 'VT06', code: 'dept_head' },
		{ id: 'VT09', code: 'member' },
	];
	expired = 2;
	roleCodes.clear();
	log.length = 0;

	assert.equal(await deactivateExpired(await db.getPool()), 2);
	const qs = usersQueries();
	assert.equal(qs.length, 2); // đếm + khoá
	for (const q of qs) assert.equal(q.inputs.role_id, 'VT09');
	assert.match(qs[1].text, /UPDATE users SET is_active = @off/);
});

test('không có vai trò mã member: không đụng bảng users', async () => {
	roles = [{ id: 'VT06', code: 'dept_head' }];
	expired = 5;
	roleCodes.clear();
	log.length = 0;

	assert.equal(await deactivateExpired(await db.getPool()), 0);
	assert.equal(usersQueries().length, 0);
});
