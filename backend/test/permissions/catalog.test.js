// Tính toàn vẹn của danh mục quyền (src/permissions/catalog.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
	ALL_PERMISSIONS,
	BY_KEY,
	MODULES,
	ACTION_LABELS,
	impliesOf,
} = require('../../src/permissions/catalog');
const { RESOURCE_SCOPES, SCOPE_LABELS } = require('../../src/permissions/scopes');

test('mỗi quyền có id, key, tên duy nhất và action có nhãn', () => {
	const ids = new Set();
	const names = new Set();
	for (const p of ALL_PERMISSIONS) {
		assert.ok(!ids.has(p.id), `trùng id ${p.id}`);
		assert.ok(!names.has(p.name), `trùng tên "${p.name}" (permissions.name có UNIQUE)`);
		assert.ok(ACTION_LABELS[p.action], `${p.key}: action "${p.action}" không có nhãn`);
		assert.ok(p.name.length <= 100, `${p.key}: tên dài quá 100 ký tự (NVARCHAR(100))`);
		ids.add(p.id);
		names.add(p.name);
	}
	assert.equal(BY_KEY.size, ALL_PERMISSIONS.length);
});

test('không còn quyền kiểu cũ trong danh mục', () => {
	for (const p of ALL_PERMISSIONS) {
		assert.ok(
			!['read_all', 'read_department', 'read_assigned'].includes(p.action),
			`${p.key}: phạm vi phải là cột scope, không phải action`,
		);
	}
	assert.ok(
		!BY_KEY.has('system:manage'),
		'superuser là cờ roles.is_superuser, không phải quyền cấp được',
	);
});

test('seedFrom trỏ tới quyền có thật; quyền đi kèm (implies) cùng resource', () => {
	for (const p of ALL_PERMISSIONS) {
		for (const src of p.seedFrom ?? [])
			assert.ok(BY_KEY.has(src), `${p.key}.seedFrom → ${src} không tồn tại`);
		for (const k of impliesOf(p))
			assert.equal(k.split(':')[0], p.resource, `${p.key} implies ${k} khác resource`);
	}
});

test('resource có phạm vi dữ liệu: có trong catalog, đủ nhãn, có quyền Xem', () => {
	const resources = new Set(MODULES.flatMap((m) => m.resources.map((r) => r.key)));
	for (const [res, scopes] of Object.entries(RESOURCE_SCOPES)) {
		assert.ok(resources.has(res), `${res} có phạm vi nhưng không có trong catalog`);
		assert.ok(BY_KEY.has(`${res}:read`), `${res} có phạm vi nhưng không có quyền ${res}:read`);
		for (const s of scopes) assert.ok(SCOPE_LABELS[res]?.[s], `thiếu nhãn phạm vi ${res}.${s}`);
	}
});

test('kiểu PermissionKey của frontend khớp danh mục (đã chạy npm run gen:perm-types)', () => {
	const file = path.join(__dirname, '../../../frontend/src/shared/types/permissions.generated.ts');
	if (!fs.existsSync(file)) return test.skip?.('không có thư mục frontend cạnh backend');
	const generated = [...fs.readFileSync(file, 'utf8').matchAll(/^\t'([a-z_]+:[a-z_]+)',$/gm)].map(
		(m) => m[1],
	);
	assert.deepEqual(
		generated,
		ALL_PERMISSIONS.map((p) => p.key),
		'chạy lại: npm run gen:perm-types',
	);
});
