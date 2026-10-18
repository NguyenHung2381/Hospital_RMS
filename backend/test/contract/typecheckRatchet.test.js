// tsc (npm run typecheck, checkJs) kiểm tra mọi file JS trong src/ — trừ file
// mở đầu bằng `// @ts-nocheck` (còn lỗi kiểu từ trước khi bật). Số file đó chỉ
// được GIẢM: sửa xong lỗi của 1 file thì xoá dòng @ts-nocheck và hạ MAX bên dưới.
// File mới không được thêm @ts-nocheck.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const MAX = 71;

const SRC = path.join(__dirname, '../../src');
const walk = (d) =>
	fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
		const p = path.join(d, e.name);
		return e.isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
	});

test(`số file src/ bỏ kiểm tra kiểu (@ts-nocheck) không vượt ${MAX}`, () => {
	const files = walk(SRC).filter((f) => /^\/\/ @ts-nocheck/.test(fs.readFileSync(f, 'utf8')));
	assert.ok(
		files.length <= MAX,
		`${files.length} file có @ts-nocheck (tối đa ${MAX}) — sửa lỗi kiểu thay vì tắt kiểm tra.`,
	);
	if (files.length < MAX) {
		console.log(
			`ℹ Còn ${files.length} file @ts-nocheck — hạ MAX trong test này xuống ${files.length}.`,
		);
	}
});
