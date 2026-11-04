// Mật khẩu SMTP gắn với máy chủ của nó (systemSettingService.smtpPassword):
// người có quyền cấu hình đổi SMTP_HOST sang máy lạ rồi "Gửi thử" không được làm
// server đăng nhập máy đó bằng mật khẩu thật (DB hoặc .env).
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

const rows = new Map();
install(async (text, inputs) => {
	if (/SELECT \* FROM system_settings/.test(text))
		return [...rows].map(([setting_key, value]) => ({ setting_key, value }));
	if (/INSERT INTO system_settings/.test(text)) rows.set(inputs.key, inputs.value);
	else if (/SET value = NULL.*'SMTP_PASS'/s.test(text)) rows.set('SMTP_PASS', null);
	return [];
});
require('../../src/modules/events/eventService').broadcast = () => {};
const svc = require('../../src/modules/settings/systemSettingService');

test('mật khẩu .env chỉ dùng với máy chủ SMTP của .env', async () => {
	process.env.SMTP_HOST = 'smtp.benhvien.vn';
	process.env.SMTP_PASS = 'env-secret';
	rows.clear();
	assert.equal(await svc.smtpPassword(), 'env-secret');

	await svc.update('SMTP_HOST', 'evil.example', 'admin');
	assert.equal(await svc.smtpPassword(), undefined);

	await svc.update('SMTP_HOST', '', 'admin'); // bỏ ghi đè → quay về máy chủ .env
	assert.equal(await svc.smtpPassword(), 'env-secret');
});

test('mật khẩu lưu ở DB bị xóa khi đổi máy chủ, giữ nguyên khi máy chủ không đổi', async () => {
	process.env.SMTP_HOST = 'smtp.benhvien.vn';
	process.env.SMTP_PASS = '';
	rows.clear();
	await svc.update('SMTP_HOST', 'smtp.gmail.com', 'admin');
	await svc.update('SMTP_PASS', 'db-secret', 'admin');
	assert.equal(await svc.smtpPassword(), 'db-secret');

	await svc.update('SMTP_HOST', 'smtp.gmail.com', 'admin'); // lưu lại cùng giá trị
	assert.equal(await svc.smtpPassword(), 'db-secret');

	await svc.update('SMTP_HOST', 'evil.example', 'admin');
	assert.equal(await svc.smtpPassword(), undefined);
	assert.equal((await svc.getById('SMTP_PASS')).has_value, false);
});
