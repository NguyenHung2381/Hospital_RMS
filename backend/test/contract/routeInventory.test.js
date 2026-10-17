// Ảnh chụp toàn bộ route của API: method + path + lớp bảo vệ (đăng nhập / quyền).
// Lưới an toàn cho việc tách backend thành module: di chuyển code KHÔNG được làm
// mất route, đổi đường dẫn hay đổi quyền một cách vô tình. Không cần DB.
//
// Thay đổi route có chủ đích (thêm/xoá/đổi quyền) → chạy lại với
//   UPDATE_SNAPSHOTS=1 npm run test:contract
// rồi commit file routes.snapshot.txt cùng thay đổi — diff của file này chính là
// danh sách route bị ảnh hưởng để người review soát.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
require('dotenv').config({ path: path.join(__dirname, '../../.env'), quiet: true });
// Không có .env (CI) thì điền giá trị giữ chỗ — app.js dừng nếu thiếu biến bắt buộc
require('../../scripts/lib/static-check-env');

const app = require('../../src/app');
const { listRoutes } = require('../../src/permissions/routeWalker');

const SNAPSHOT = path.join(__dirname, 'routes.snapshot.txt');

const guardOf = (r) => {
	if (r.perms.length) return r.perms.map(([res, act]) => `${res}:${act}`).join(' | ');
	return r.auth ? 'authOnly' : 'public';
};

// Sắp xếp theo path rồi method để diff gọn, không phụ thuộc thứ tự khai báo
// (thứ tự mount thay đổi khi tách module là bình thường; trùng route mới là lỗi
// — kiểm tra riêng ở test dưới).
const inventory = () =>
	listRoutes(app)
		.map((r) => `${r.method.padEnd(6)} ${r.path}  ${guardOf(r)}`)
		.sort((a, b) => {
			const pa = a.slice(7);
			const pb = b.slice(7);
			return pa < pb ? -1 : pa > pb ? 1 : 0;
		});

test('danh sách route khớp ảnh chụp routes.snapshot.txt', () => {
	const current = inventory();
	if (process.env.UPDATE_SNAPSHOTS === '1' || !fs.existsSync(SNAPSHOT)) {
		fs.writeFileSync(SNAPSHOT, current.join('\n') + '\n');
		return;
	}
	const saved = fs.readFileSync(SNAPSHOT, 'utf8').split(/\r?\n/).filter(Boolean);
	const added = current.filter((l) => !saved.includes(l));
	const removed = saved.filter((l) => !current.includes(l));
	assert.ok(
		added.length === 0 && removed.length === 0,
		'Route thay đổi so với ảnh chụp:\n' +
			removed.map((l) => `  - ${l}`).join('\n') +
			(removed.length && added.length ? '\n' : '') +
			added.map((l) => `  + ${l}`).join('\n') +
			'\nCố ý thì chạy: UPDATE_SNAPSHOTS=1 npm run test:contract',
	);
});

test('không có 2 route cùng method + path (route sau bị route trước che mất)', () => {
	const seen = new Map();
	const dupes = [];
	for (const r of listRoutes(app)) {
		const id = `${r.method} ${r.path}`;
		if (seen.has(id)) dupes.push(id);
		seen.set(id, true);
	}
	assert.deepEqual(dupes, []);
});
