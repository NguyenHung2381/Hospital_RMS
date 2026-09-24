#!/usr/bin/env node
// Kiểm tra độ phủ phân quyền của MỌI route Express:
//   - Route có authorizePermission(...) → OK (quyền phải có trong catalog).
//   - Route chỉ có authenticate (không đòi quyền cụ thể) → phải được liệt kê
//     trong src/permissions/routePolicy.js mục authOnly, kèm lý do.
//   - Route không có authenticate → phải nằm trong mục public, kèm lý do.
// Route mới thêm mà quên guard sẽ làm script FAIL (exit 1) — chạy trong CI
// hoặc trước khi commit:  npm run check:routes  [-- --list]
//
// Không cần DB: chỉ nạp app để đọc router stack rồi thoát.

process.env.NODE_ENV = process.env.NODE_ENV || 'development';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });

const app = require('../src/app');
const { isKnownKey } = require('../src/permissions/catalog');
const { listRoutes } = require('../src/permissions/routeWalker');
const policy = require('../src/permissions/routePolicy');

const showList = process.argv.includes('--list');
const routes = listRoutes(app);

const idOf = (r) => `${r.method} ${r.path}`;
const failures = [];
const used = new Set();
const rows = [];
for (const r of routes) {
	const id = idOf(r);
	let status;
	if (r.perms.length) {
		const unknown = r.perms.map(([res, act]) => `${res}:${act}`).filter((k) => !isKnownKey(k));
		status = r.perms.map(([res, act]) => `${res}:${act}`).join(' | ');
		if (unknown.length) failures.push(`${id} — quyền không có trong catalog: ${unknown.join(', ')}`);
		if (!r.auth) failures.push(`${id} — có authorizePermission nhưng thiếu authenticate trước đó`);
	} else if (r.auth) {
		status = 'authOnly';
		if (policy.authOnly[id]) used.add(id);
		else failures.push(`${id} — chỉ yêu cầu đăng nhập, chưa khai báo trong routePolicy.authOnly`);
	} else {
		status = 'public';
		if (policy.public[id]) used.add(id);
		else failures.push(`${id} — KHÔNG yêu cầu đăng nhập, chưa khai báo trong routePolicy.public`);
	}
	rows.push([id, status]);
}

const stale = [...Object.keys(policy.authOnly), ...Object.keys(policy.public)].filter((id) => !used.has(id));

if (showList) {
	const width = Math.max(...rows.map(([id]) => id.length));
	for (const [id, status] of rows) console.log(`${id.padEnd(width)}  ${status}`);
	console.log('');
}
const count = (s) => rows.filter(([, st]) => (s === 'perm' ? st !== 'authOnly' && st !== 'public' : st === s)).length;
console.log(
	`Tổng ${rows.length} route: ${count('perm')} có kiểm tra quyền, ${count('authOnly')} chỉ cần đăng nhập, ${count('public')} công khai.`,
);
for (const id of stale) console.warn(`⚠️  routePolicy khai báo route không còn tồn tại: ${id}`);
if (failures.length) {
	console.error(`\n❌ ${failures.length} route chưa đạt:`);
	for (const f of failures) console.error(`   - ${f}`);
	process.exit(1);
}
console.log('✅ Mọi route đều đã khai báo phân quyền.');
process.exit(0);
