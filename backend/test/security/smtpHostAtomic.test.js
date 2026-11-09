// L-07: đổi SMTP_HOST phải nguyên tử với việc xóa mật khẩu SMTP lưu ở DB — không reader
// nào (cùng worker hay worker khác hết TTL cache) được thấy host MỚI đi kèm mật khẩu của
// host CŨ, và mailService dựng transport từ một snapshot duy nhất.
const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../src/config/db');

// ── CSDL giả CÓ transaction: ghi trong tx chỉ hiện ra khi commit, rollback thì bỏ ──
let committed = new Map();
let onWindow = null; // gọi ngay SAU câu ghi SMTP_HOST (đúng "khe" của lỗi cũ)
let failPassClear = false;
const calls = { tx: 0, autocommitWrites: [] };

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
				if (!inTx) calls.autocommitWrites.push(inputs.key);
				store.set(inputs.key, inputs.value);
				if (inputs.key === 'SMTP_HOST' && onWindow) await onWindow();
				return { recordset: [] };
			}
			if (/SET value = NULL.*'SMTP_PASS'/s.test(text)) {
				if (failPassClear) throw new Error('lỗi giả lập khi xóa mật khẩu');
				if (!inTx) calls.autocommitWrites.push('SMTP_PASS');
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
	const tx = { request: () => makeRequest(staged, true) };
	const result = await fn(tx); // ném lỗi → bỏ staged (rollback)
	committed = staged; // commit
	return result;
};
require('../../src/modules/events/eventService').broadcast = () => {};
const svc = require('../../src/modules/settings/systemSettingService');
const mailService = require('../../src/modules/notifications/mailService');

// Mỗi lần gọi coi như worker khác đã hết TTL cache 15s → nạp lại từ CSDL đã commit
let clock = 1_000_000;
const realNow = Date.now;
test.before(() => {
	Date.now = () => (clock += 60_000);
});
test.after(() => {
	Date.now = realNow;
});

const seed = (obj) => {
	committed = new Map(Object.entries(obj));
	failPassClear = false;
	onWindow = null;
	calls.tx = 0;
	calls.autocommitWrites.length = 0;
};

test('đổi host sang máy lạ: reader chen vào giữa chừng không thấy host mới + mật khẩu cũ', async () => {
	process.env.SMTP_HOST = 'smtp.benhvien.vn';
	process.env.SMTP_PASS = '';
	seed({ SMTP_HOST: 'smtp.gmail.com', SMTP_PASS: 'db-secret', SMTP_USER: 'rms@bv.vn' });

	const observed = [];
	onWindow = async () => observed.push(await svc.smtpConfig()); // test-mail ngay sau khi ghi host
	await svc.update('SMTP_HOST', 'smtp.attacker.example', 'admin');

	assert.ok(observed.length > 0);
	for (const c of observed) {
		// khe hở cũ: host mới + mật khẩu cũ
		assert.ok(
			!(c.host === 'smtp.attacker.example' && c.pass === 'db-secret'),
			'lộ mật khẩu thật tới host mới',
		);
	}
	// Sau commit: host mới, mật khẩu đã xóa, và mọi ghi đều nằm trong transaction
	const after = await svc.smtpConfig();
	assert.equal(after.host, 'smtp.attacker.example');
	assert.equal(after.pass, undefined);
	assert.equal((await svc.getById('SMTP_PASS')).has_value, false);
	assert.equal(calls.tx, 1);
	assert.deepEqual(calls.autocommitWrites, []);
});

test('xóa mật khẩu lỗi thì host cũng rollback: không còn host mới đi kèm mật khẩu cũ', async () => {
	process.env.SMTP_HOST = 'smtp.benhvien.vn';
	seed({ SMTP_HOST: 'smtp.gmail.com', SMTP_PASS: 'db-secret' });
	failPassClear = true;
	await assert.rejects(svc.update('SMTP_HOST', 'smtp.attacker.example', 'admin'), /giả lập/);
	const c = await svc.smtpConfig();
	assert.equal(c.host, 'smtp.gmail.com');
	assert.equal(c.pass, 'db-secret');
});

test('hostBefore đọc từ DB, không từ cache cũ: cache stale không làm bỏ sót việc xóa mật khẩu', async () => {
	process.env.SMTP_HOST = 'smtp.benhvien.vn';
	seed({ SMTP_HOST: 'smtp.gmail.com', SMTP_PASS: 'db-secret' });
	await svc.smtpConfig(); // nạp cache (host = gmail)
	// worker khác đổi host trực tiếp trong DB; cache worker này còn host cũ
	committed.set('SMTP_HOST', 'smtp.attacker.example');
	Date.now = () => clock; // cache coi như còn hạn
	try {
		await svc.update('SMTP_HOST', 'smtp.other.example', 'admin');
	} finally {
		Date.now = () => (clock += 60_000);
	}
	assert.equal(committed.get('SMTP_PASS'), null);
});

test('ca hợp lệ: lưu lại cùng host giữ mật khẩu; đổi host rồi đặt mật khẩu mới dùng được', async () => {
	process.env.SMTP_HOST = 'smtp.benhvien.vn';
	process.env.SMTP_PASS = 'env-secret';
	seed({ SMTP_HOST: 'smtp.gmail.com', SMTP_PASS: 'db-secret' });

	await svc.update('SMTP_HOST', 'smtp.gmail.com', 'admin');
	assert.equal((await svc.smtpConfig()).pass, 'db-secret');

	await svc.update('SMTP_HOST', 'smtp.office365.com', 'admin');
	assert.equal((await svc.smtpConfig()).pass, undefined);
	await svc.update('SMTP_PASS', 'new-secret', 'admin');
	const c = await svc.smtpConfig();
	assert.deepEqual([c.host, c.pass], ['smtp.office365.com', 'new-secret']);

	// bỏ ghi đè → quay về máy chủ .env, dùng mật khẩu .env
	await svc.update('SMTP_HOST', '', 'admin');
	const env = await svc.smtpConfig();
	assert.equal(env.host, 'smtp.benhvien.vn');
	assert.equal(committed.get('SMTP_PASS'), null);
	assert.equal(env.pass, 'env-secret');
});

test('mailService dựng transport chỉ từ smtpConfig() (một snapshot), không đọc host/mật khẩu rời', async () => {
	const nodemailer = require('nodemailer');
	const created = [];
	const realCreate = nodemailer.createTransport;
	nodemailer.createTransport = (opts) => {
		created.push(opts);
		return { sendMail: async () => ({}) };
	};
	const origGetValue = svc.getValue;
	const origConfig = svc.smtpConfig;
	const origPass = svc.smtpPassword;
	svc.smtpConfig = async () => ({
		host: 'h1.example',
		port: '465',
		secure: 'true',
		user: 'u1',
		pass: 'p1',
	});
	svc.smtpPassword = async () => assert.fail('đọc mật khẩu rời');
	svc.getValue = async (key) => {
		if (/^SMTP_(HOST|PORT|SECURE|PASS)$/.test(key)) assert.fail(`đọc rời ${key}`);
		return undefined;
	};
	try {
		await mailService.sendTest('to@bv.vn');
	} finally {
		nodemailer.createTransport = realCreate;
		svc.smtpConfig = origConfig;
		svc.smtpPassword = origPass;
		svc.getValue = origGetValue;
	}
	assert.deepEqual(created, [
		{ host: 'h1.example', port: 465, secure: true, auth: { user: 'u1', pass: 'p1' } },
	]);
});
