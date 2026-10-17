// Email cảnh báo sự kiện bảo mật (modules/audit/securityAlertService.js).
process.env.ALERT_EMAILS = 'it@bvnghean.vn, admin@bvnghean.vn';
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

let recentLocks = 0;
install(async (text) => {
	if (/COUNT\(\*\) AS n FROM security_events/.test(text)) return [{ n: recentLocks }];
	return [];
});
const sent = [];
require('../../src/modules/notifications/mailService').send = async (m) => sent.push(m);
const { notify } = require('../../src/modules/audit/securityAlertService');

test('sự kiện nghiêm trọng: gửi email tới ALERT_EMAILS, nội dung được escape', async () => {
	await notify({
		eventType: 'refresh_token_reuse',
		actorId: 'NV01',
		targetType: 'user',
		targetId: 'NV01',
		ip: '10.0.0.5',
		detail: '<script>x</script>',
	});
	assert.equal(sent.length, 1);
	assert.equal(sent[0].to, 'it@bvnghean.vn, admin@bvnghean.vn');
	assert.match(sent[0].subject, /Cảnh báo bảo mật/);
	assert.match(sent[0].html, /10\.0\.0\.5/);
	assert.ok(!sent[0].html.includes('<script>'));
});

test('chống spam: cùng loại + cùng đối tượng trong 30 phút chỉ gửi 1 lần', async () => {
	const before = sent.length;
	await notify({ eventType: 'refresh_token_reuse', targetId: 'NV01' });
	assert.equal(sent.length, before);
	await notify({ eventType: 'refresh_token_reuse', targetId: 'NV02' }); // tài khoản khác → gửi
	assert.equal(sent.length, before + 1);
});

test('khoá tài khoản lẻ tẻ không cảnh báo; dồn dập (≥5 trong 15 phút) thì gửi 1 email', async () => {
	const before = sent.length;
	recentLocks = 2;
	await notify({ eventType: 'login_locked', targetId: 'A' });
	assert.equal(sent.length, before);
	recentLocks = 6;
	await notify({ eventType: 'login_locked', targetId: 'B' });
	await notify({ eventType: 'login_locked', targetId: 'C' }); // gộp, không gửi thêm
	assert.equal(sent.length, before + 1);
	assert.match(sent.at(-1).html, /6/);
});

test('sự kiện thường (đăng nhập, bật 2FA) không gửi email', async () => {
	const before = sent.length;
	await notify({ eventType: '2fa_enabled', targetId: 'X' });
	await notify({ eventType: 'logout_all_sessions', targetId: 'X' });
	assert.equal(sent.length, before);
});

test('lỗi gửi email không ném ra ngoài', async () => {
	require('../../src/modules/notifications/mailService').send = async () => {
		throw new Error('SMTP down');
	};
	await notify({ eventType: 'upload_malware_blocked', targetId: 'F1' });
});
