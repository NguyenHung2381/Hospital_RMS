// Chính sách mật khẩu dùng chung (utils/passwordPolicy.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const {
	checkPassword,
	generateTempPassword,
	MIN_LENGTH,
} = require('../../src/utils/passwordPolicy');

test('mật khẩu tạm: ngẫu nhiên, đạt chính sách, không chứa tên đăng nhập', () => {
	const seen = new Set();
	for (let i = 0; i < 200; i++) {
		const pw = generateTempPassword('nva_0001');
		assert.equal(pw.length, 12);
		assert.equal(checkPassword(pw, { username: 'nva_0001' }), null);
		assert.notEqual(pw, 'nva_0001');
		seen.add(pw);
	}
	assert.equal(seen.size, 200);
});

test('từ chối mật khẩu mặc định cũ và mật khẩu ngắn', () => {
	assert.ok(checkPassword('123456'));
	assert.ok(checkPassword('abc12345')); // 8 ký tự — dưới mức tối thiểu mới
	assert.match(checkPassword('Abcdefgh1'.slice(0, MIN_LENGTH - 1)), /ít nhất/);
});

test('bắt buộc có cả chữ và số', () => {
	assert.match(checkPassword('abcdefghijk'), /chữ số/);
	assert.match(checkPassword('12345678901'), /chữ cái/);
});

test('từ chối mật khẩu phổ biến (không phân biệt hoa thường) và chứa username', () => {
	assert.match(checkPassword('Password123'), /phổ biến/);
	assert.match(checkPassword('xNVA_0123x99', { username: 'nva_0123' }), /tên đăng nhập/);
});

test('chấp nhận mật khẩu đạt chuẩn', () => {
	assert.equal(checkPassword('Benhvien#2026x'), null);
});
