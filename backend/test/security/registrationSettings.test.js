// Hai cấu hình bật/tắt của form đăng ký khóa đào tạo liên tục (TRAINING_REGISTRATION_EMAIL_OTP,
// TRAINING_REGISTRATION_REQUIRE_CHECKS): chỉ nhận 'true'/'false' khi admin lưu, và đổi xong
// thì chỗ đọc (qua systemSettingService.getValue + cache) thấy ngay, không cần khởi động lại.
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

const rows = new Map();
install(async (text, inputs) => {
	if (/SELECT \* FROM system_settings/.test(text))
		return [...rows].map(([setting_key, value]) => ({ setting_key, value }));
	if (/INSERT INTO system_settings/.test(text)) rows.set(inputs.key, inputs.value);
	return [];
});
require('../../src/modules/events/eventService').broadcast = () => {};
const svc = require('../../src/modules/settings/systemSettingService');
const otp = require('../../src/modules/training/registration/registrationEmailOtpService');
const gate = require('../../src/modules/training/registration/registrationApprovalGate');

const KEYS = ['TRAINING_REGISTRATION_EMAIL_OTP', 'TRAINING_REGISTRATION_REQUIRE_CHECKS'];

test('hai khóa nằm trong danh sách cho phép lưu', () => {
	for (const key of KEYS) assert.equal(svc.isKey(key), true);
});

test("chỉ nhận 'true' / 'false' (rỗng = bỏ ghi đè); giá trị gõ sai bị từ chối", () => {
	for (const key of KEYS) {
		assert.equal(svc.validateSetting(key, 'true'), null);
		assert.equal(svc.validateSetting(key, 'false'), null);
		assert.equal(svc.validateSetting(key, ''), null);
		assert.equal(svc.validateSetting(key, null), null);
		for (const bad of ['False', 'TRUE', '0', 'tat', ' false'])
			assert.match(svc.validateSetting(key, bad) ?? '', /true\/false/);
	}
	// khóa khác không bị ràng buộc bởi hàm này
	assert.equal(svc.validateSetting('TRAINING_HOLIDAYS', 'bất kỳ'), null);
});

test('chưa cấu hình ⇒ cả hai mặc định bật', async () => {
	rows.clear();
	delete process.env.TRAINING_REGISTRATION_EMAIL_OTP;
	delete process.env.TRAINING_REGISTRATION_REQUIRE_CHECKS;
	assert.equal(await otp.isRequired(), true);
	assert.equal(await gate.requireChecksEnabled(), true);
});

test('đổi cấu hình có hiệu lực ngay dù cache đã nạp (không cần khởi động lại)', async () => {
	rows.clear();
	assert.equal(await otp.isRequired(), true); // nạp cache với bảng trống
	assert.equal(await gate.requireChecksEnabled(), true);

	await svc.update('TRAINING_REGISTRATION_EMAIL_OTP', 'false', 'admin');
	assert.equal(await otp.isRequired(), false);
	assert.equal(await gate.requireChecksEnabled(), true); // khóa kia không bị ảnh hưởng

	await svc.update('TRAINING_REGISTRATION_REQUIRE_CHECKS', 'false', 'admin');
	assert.equal(await gate.requireChecksEnabled(), false);

	await svc.update('TRAINING_REGISTRATION_EMAIL_OTP', 'true', 'admin');
	assert.equal(await otp.isRequired(), true);

	await svc.update('TRAINING_REGISTRATION_REQUIRE_CHECKS', '', 'admin'); // bỏ ghi đè
	assert.equal(await gate.requireChecksEnabled(), true);
});

test('trang cấu hình đọc lại được giá trị đang áp dụng (effective)', async () => {
	rows.clear();
	await svc.update('TRAINING_REGISTRATION_EMAIL_OTP', 'false', 'admin');
	const all = await svc.getAll();
	assert.equal(
		all.find((r) => r.setting_key === 'TRAINING_REGISTRATION_EMAIL_OTP').effective,
		'false',
	);
	assert.equal(
		all.find((r) => r.setting_key === 'TRAINING_REGISTRATION_REQUIRE_CHECKS').effective ?? null,
		null,
	);
});
