// Lưu nhiều cấu hình một lần (PUT /system-settings): kiểm cả lô trước khi ghi, ghi trong MỘT
// transaction (lỗi giữa chừng thì không khóa nào được lưu), đổi máy chủ SMTP kèm mật khẩu mới
// trong cùng lần lưu thì giữ mật khẩu vừa nhập, và nhật ký hoạt động không lộ secret.
const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../src/config/db');

// ── CSDL giả CÓ transaction: ghi trong tx chỉ hiện ra khi commit, ném lỗi thì bỏ ──
let committed = new Map();
let failOnKey = null;
const calls = { tx: 0, autocommitWrites: 0 };

const makeRequest = (store, inTx) => {
	const inputs = {};
	const req = {
		input(name, _t, value) {
			inputs[name] = arguments.length === 2 ? _t : value;
			return req;
		},
		async query(text) {
			if (/SELECT \* FROM system_settings/.test(text))
				return { recordset: [...store].map(([setting_key, value]) => ({ setting_key, value })) };
			if (/SELECT value FROM system_settings WHERE setting_key = 'SMTP_HOST'/.test(text))
				return { recordset: store.has('SMTP_HOST') ? [{ value: store.get('SMTP_HOST') }] : [] };
			if (/INSERT INTO system_settings/.test(text)) {
				if (inputs.key === failOnKey) throw new Error('lỗi giả lập khi ghi');
				if (!inTx) calls.autocommitWrites++;
				store.set(inputs.key, inputs.value);
				return { recordset: [] };
			}
			if (/SET value = NULL.*'SMTP_PASS'/s.test(text)) {
				store.set('SMTP_PASS', null);
				return { recordset: [] };
			}
			return { recordset: [] };
		},
	};
	return req;
};
db.getPool = async () => ({ request: () => makeRequest(committed, false) });
db.lockResource = async () => true;
db.withTransaction = async (fn) => {
	calls.tx++;
	const staged = new Map(committed);
	const result = await fn({ request: () => makeRequest(staged, true) });
	committed = staged;
	return result;
};
require('../../src/modules/events/eventService').broadcast = () => {};
const svc = require('../../src/modules/settings/systemSettingService');
const rules = require('../../src/modules/settings/settingRules');
const { redactBody } = require('../../src/utils/logRedact');

const seed = (obj) => {
	committed = new Map(Object.entries(obj));
	failOnKey = null;
	calls.tx = 0;
	calls.autocommitWrites = 0;
};

test('checkMany báo lỗi đủ mọi ô sai, không dừng ở ô đầu tiên', () => {
	const { values, errors } = rules.checkMany({
		MAIL_ENABLED: 'True', // công tắc gõ sai
		UPLOAD_MAX_MB: '99999', // vượt giới hạn
		KHONG_CO_KHOA_NAY: 'x', // ngoài whitelist
		SMTP_PORT: 587, // không phải chuỗi
		SMTP_FROM_NAME: 'Bệnh viện', // hợp lệ
		TRAINING_HOLIDAYS: null, // bỏ ghi đè — hợp lệ
	});
	assert.deepEqual(Object.keys(errors).sort(), ['KHONG_CO_KHOA_NAY', 'MAIL_ENABLED', 'SMTP_PORT', 'UPLOAD_MAX_MB']);
	assert.match(errors.MAIL_ENABLED, /true\/false/);
	assert.deepEqual(values, { SMTP_FROM_NAME: 'Bệnh viện', TRAINING_HOLIDAYS: null });
});

test('checkMany chuẩn hoá trước khi kiểm (cắt khoảng trắng khóa reCAPTCHA)', () => {
	const { values, errors } = rules.checkMany({ RECAPTCHA_PROJECT_ID: '  rms-benhvien  ' });
	assert.deepEqual(errors, {});
	assert.equal(values.RECAPTCHA_PROJECT_ID, 'rms-benhvien');
});

test('công tắc phân hệ / email theo chức năng chỉ nhận true/false', () => {
	for (const key of ['MODULE_RESEARCH', 'MODULE_ATTENDANCE', 'MAIL_EVENT_SIGN_REQUEST', 'REQUIRE_2FA_FOR_ADMINS']) {
		assert.equal(rules.validate(key, 'false'), null);
		assert.equal(rules.validate(key, ''), null);
		assert.match(rules.validate(key, '0') ?? '', /true\/false/);
	}
});

test('updateMany ghi mọi khóa trong một transaction', async () => {
	seed({ SMTP_FROM_NAME: 'Cũ' });
	const n = await svc.updateMany({ SMTP_FROM_NAME: 'Mới', CME_MIN_HOURS: '100', TRAINING_HOLIDAYS: '' }, 'admin');
	assert.equal(n, 3);
	assert.equal(calls.tx, 1);
	assert.equal(calls.autocommitWrites, 0);
	assert.equal(committed.get('SMTP_FROM_NAME'), 'Mới');
	assert.equal(committed.get('CME_MIN_HOURS'), '100');
	assert.equal(committed.get('TRAINING_HOLIDAYS'), null); // rỗng = bỏ ghi đè
	assert.equal(await svc.getValue('CME_MIN_HOURS'), '100'); // cache đã xóa
});

test('lỗi ở khóa giữa lô ⇒ không khóa nào được lưu', async () => {
	seed({ SMTP_FROM_NAME: 'Cũ', CME_MIN_HOURS: '120' });
	failOnKey = 'CME_MIN_HOURS';
	await assert.rejects(svc.updateMany({ SMTP_FROM_NAME: 'Mới', CME_MIN_HOURS: '100', CME_CYCLE_YEARS: '3' }, 'admin'));
	assert.equal(committed.get('SMTP_FROM_NAME'), 'Cũ');
	assert.equal(committed.get('CME_MIN_HOURS'), '120');
	assert.equal(committed.has('CME_CYCLE_YEARS'), false);
});

test('đổi máy chủ SMTP kèm mật khẩu mới trong cùng lần lưu ⇒ giữ mật khẩu mới', async () => {
	seed({ SMTP_HOST: 'smtp.gmail.com', SMTP_PASS: 'mat-khau-cu' });
	// Khóa SMTP_PASS đứng TRƯỚC SMTP_HOST trong lô — service vẫn phải ghi host trước
	await svc.updateMany({ SMTP_PASS: 'mat-khau-moi', SMTP_HOST: 'smtp.benhvien.vn' }, 'admin');
	assert.equal(committed.get('SMTP_HOST'), 'smtp.benhvien.vn');
	assert.equal(committed.get('SMTP_PASS'), 'mat-khau-moi');
});

test('đổi máy chủ SMTP mà không nhập mật khẩu ⇒ mật khẩu cũ bị xóa như PUT /:key', async () => {
	seed({ SMTP_HOST: 'smtp.gmail.com', SMTP_PASS: 'mat-khau-cu' });
	await svc.updateMany({ SMTP_HOST: 'smtp.la.vn', SMTP_PASS: '••••••' }, 'admin');
	assert.equal(committed.get('SMTP_PASS'), null);
});

test('secret gửi lại chuỗi che ⇒ bỏ qua, không ghi đè', async () => {
	seed({ RECAPTCHA_API_KEY: 'khoa-that' });
	const n = await svc.updateMany({ RECAPTCHA_API_KEY: '••••••' }, 'admin');
	assert.equal(n, 0);
	assert.equal(calls.tx, 0);
	assert.equal(committed.get('RECAPTCHA_API_KEY'), 'khoa-that');
});

test('nhật ký hoạt động che secret trong body lưu hàng loạt', () => {
	const body = {
		values: {
			SMTP_PASS: 'p@ss',
			RECAPTCHA_SECRET_KEY: 's',
			RECAPTCHA_API_KEY: 'k',
			SMTP_HOST: 'smtp.benhvien.vn',
		},
	};
	const clean = redactBody(body, '/api/v1/system-settings');
	assert.equal(clean.values.SMTP_PASS, '[hidden]');
	assert.equal(clean.values.RECAPTCHA_SECRET_KEY, '[hidden]');
	assert.equal(clean.values.RECAPTCHA_API_KEY, '[hidden]');
	assert.equal(clean.values.SMTP_HOST, 'smtp.benhvien.vn');
});
