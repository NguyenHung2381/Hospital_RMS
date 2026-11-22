// Cấu hình bật/tắt của form đăng ký khóa đào tạo liên tục (TRAINING_REGISTRATION_EMAIL_OTP):
// chỉ nhận 'true'/'false' khi admin lưu, và đổi xong
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

const KEYS = ['TRAINING_REGISTRATION_EMAIL_OTP', 'TRAINING_REGISTRATION_DOC_CHECK'];

test('khóa nằm trong danh sách cho phép lưu', () => {
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

test("công tắc CME tự cộng chỉ nhận 'true' / 'false' (rỗng = bỏ ghi đè)", () => {
	const CME_KEYS = ['CME_AUTO_TRAINEE', 'CME_AUTO_LECTURER'];
	for (const key of CME_KEYS) {
		assert.equal(svc.validateSetting(key, 'true'), null);
		assert.equal(svc.validateSetting(key, 'false'), null);
		assert.equal(svc.validateSetting(key, ''), null);
		assert.equal(svc.validateSetting(key, null), null);
		for (const bad of ['False', 'TRUE', '0', 'tat', ' false'])
			assert.match(svc.validateSetting(key, bad) ?? '', /true\/false/);
	}
});

test('chưa cấu hình ⇒ mặc định bật', async () => {
	rows.clear();
	delete process.env.TRAINING_REGISTRATION_EMAIL_OTP;
	assert.equal(await otp.isRequired(), true);
});

test('đổi cấu hình có hiệu lực ngay dù cache đã nạp (không cần khởi động lại)', async () => {
	rows.clear();
	assert.equal(await otp.isRequired(), true); // nạp cache với bảng trống

	await svc.update('TRAINING_REGISTRATION_EMAIL_OTP', 'false', 'admin');
	assert.equal(await otp.isRequired(), false);

	await svc.update('TRAINING_REGISTRATION_EMAIL_OTP', 'true', 'admin');
	assert.equal(await otp.isRequired(), true);
});

test('trang cấu hình đọc lại được giá trị đang áp dụng (effective)', async () => {
	rows.clear();
	await svc.update('TRAINING_REGISTRATION_EMAIL_OTP', 'false', 'admin');
	const all = await svc.getAll();
	assert.equal(
		all.find((r) => r.setting_key === 'TRAINING_REGISTRATION_EMAIL_OTP').effective,
		'false',
	);
	// Khóa đã gỡ không còn trong danh sách cấu hình
	assert.equal(svc.isKey('TRAINING_REGISTRATION_REQUIRE_CHECKS'), false);
});

// Công tắc ở trang Khóa học (PUT /courses/registration-settings) ghi chung khóa trên
test('cài đặt đăng ký ở trang Khóa học đọc / ghi chung khóa của Cấu hình hệ thống', async () => {
	const regSettings = require('../../src/modules/training/registration/registrationSettingsService');
	// Ghi qua update() để xóa cache 15s của systemSettingService
	await svc.update('TRAINING_REGISTRATION_EMAIL_OTP', '', 'admin');
	await svc.update('MAIL_ENABLED', 'true', 'admin');
	const got = await regSettings.get();
	assert.equal(got.email_otp_required, true);
	assert.equal(got.mail_enabled, true);
	assert.equal(got.doc_check_enabled, true, 'tự kiểm tra hồ sơ mặc định bật');
	assert.equal(typeof got.doc_check_ocr, 'boolean', 'có / không có Tesseract tùy máy');

	assert.equal(
		(await regSettings.update({ email_otp_required: false }, 'u1')).email_otp_required,
		false,
	);
	assert.equal(rows.get('TRAINING_REGISTRATION_EMAIL_OTP'), 'false');
	assert.equal(await otp.isRequired(), false);

	// Không gửi khóa ⇒ không đổi gì
	assert.equal((await regSettings.update({}, 'u1')).email_otp_required, false);
	assert.equal(
		(await regSettings.update({ email_otp_required: true }, 'u1')).email_otp_required,
		true,
	);
	assert.equal(rows.get('TRAINING_REGISTRATION_EMAIL_OTP'), 'true');
});

// Công tắc tự kiểm tra file hồ sơ (OCR / QR) — cùng chỗ lưu với Cấu hình hệ thống
test('công tắc tự kiểm tra file hồ sơ: ghi chung khóa TRAINING_REGISTRATION_DOC_CHECK, có hiệu lực ngay', async () => {
	const regSettings = require('../../src/modules/training/registration/registrationSettingsService');
	const docCheck = require('../../src/modules/training/registration/docCheck/docCheckService');
	await svc.update('TRAINING_REGISTRATION_DOC_CHECK', '', 'admin');
	assert.equal(await docCheck.isEnabled(), true);

	const off = await regSettings.update({ doc_check_enabled: false }, 'u1');
	assert.equal(off.doc_check_enabled, false);
	assert.equal(rows.get('TRAINING_REGISTRATION_DOC_CHECK'), 'false');
	assert.equal(await docCheck.isEnabled(), false);
	// Đổi công tắc này không đụng công tắc OTP
	assert.equal(off.email_otp_required, true);

	assert.equal(
		(await regSettings.update({ doc_check_enabled: true }, 'u1')).doc_check_enabled,
		true,
	);
	assert.equal(await docCheck.isEnabled(), true);
});
