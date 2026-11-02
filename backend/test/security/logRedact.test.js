// utils/logRedact.js + middlewares/activityLogger.js + scripts/redact-activity-logs.js:
// nhật ký hoạt động không được giữ mã OTP / mã 2FA / mã khôi phục, mật khẩu,
// token, số CCCD, ngày sinh, SĐT, mã vé / token QR trên đường dẫn.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const {
	redact,
	redactUrl,
	redactParams,
	redactActivityRecord,
	isSensitiveKey,
} = require('../../src/utils/logRedact');

const TICKET = 'a'.repeat(16) + '0123456789abcdef';

test('body: che mật khẩu, token, mã OTP/2FA, CCCD, ngày sinh, SĐT — giữ trường thường', () => {
	const out = redact({
		username: 'nva_0001',
		password: 'x',
		pre_auth_token: 'x',
		code: '123456',
		backup_code: 'ABCD-EFGH',
		national_id: '001099012345',
		dob: '1990-01-01',
		date_of_birth: '1990-01-01',
		phone: '0912345678',
		members: [{ full_name: 'A', phone_number: '0900000000', staff_number: '12' }],
		course_code: 'K01',
		role_code: 'admin',
		title: 'Đề tài',
	});
	assert.equal(out.username, 'nva_0001');
	for (const k of [
		'password',
		'pre_auth_token',
		'code',
		'backup_code',
		'national_id',
		'dob',
		'date_of_birth',
		'phone',
	])
		assert.equal(out[k], '[hidden]', k);
	assert.equal(out.members[0].phone_number, '[hidden]');
	assert.equal(out.members[0].staff_number, '12');
	assert.equal(out.course_code, 'K01');
	assert.equal(out.role_code, 'admin');
	assert.equal(out.title, 'Đề tài');
	assert.equal(isSensitiveKey('contact_person'), false);
});

test('query string: che tham số nhạy cảm; cổng công khai che hết giá trị', () => {
	assert.equal(
		redactUrl(
			'/api/v1/public/lookup?national_id=001099012345&dob=1990-01-01&full_name=Nguy%E1%BB%85n',
		),
		'/api/v1/public/lookup?national_id=[hidden]&dob=[hidden]&full_name=[hidden]',
	);
	assert.equal(
		redactUrl('/api/v1/public/topics/T1/status?contact=0912345678'),
		'/api/v1/public/topics/T1/status?contact=[hidden]',
	);
	assert.equal(redactUrl('/api/v1/events?ticket=abc.def'), '/api/v1/events?ticket=[hidden]');
	assert.equal(
		redactUrl('/api/v1/topics?search=tim&page=2&status=draft'),
		'/api/v1/topics?search=tim&page=2&status=draft',
	);
	assert.equal(redactUrl(undefined), undefined);
});

test('đường dẫn: che mã vé / token QR / link đăng ký theo đợt, giữ origin của referer', () => {
	assert.equal(
		redactUrl(`/api/v1/public/seminar-tickets/${TICKET}/test`),
		'/api/v1/public/seminar-tickets/[hidden]/test',
	);
	assert.equal(
		redactUrl('/api/v1/public/topic-rounds/by-token/round-secret-123'),
		'/api/v1/public/topic-rounds/by-token/[hidden]',
	);
	assert.equal(
		redactUrl(`https://nckh.bvnghean.vn/hoi-nghi/ve/${TICKET}?x=1#top`),
		'https://nckh.bvnghean.vn/hoi-nghi/ve/[hidden]?x=1',
	);
	assert.equal(redactUrl('/api/v1/topics/T2026001'), '/api/v1/topics/T2026001');
	assert.deepEqual(redactParams({ code: TICKET, id: 'T1', token: 'x' }), {
		code: '[hidden]',
		id: 'T1',
		token: '[hidden]',
	});
});

test('che lại dòng log cũ, kể cả body bị cắt ngắn không parse được', () => {
	const rec = redactActivityRecord({
		stream: 'audit',
		path: '/api/v1/auth/2fa/verify',
		params: { code: TICKET },
		body: JSON.stringify({ pre_auth_token: '[hidden]', code: '987654' }),
		referer: `https://x.vn/hoi-nghi/ve/${TICKET}`,
	});
	assert.deepEqual(JSON.parse(rec.body), { pre_auth_token: '[hidden]', code: '[hidden]' });
	assert.equal(rec.params.code, '[hidden]');
	assert.equal(rec.referer, 'https://x.vn/hoi-nghi/ve/[hidden]');

	const cut = redactActivityRecord({
		stream: 'audit',
		body: '{"username":"a","code":"123456","phone":"0912","note":"dài…',
	});
	assert.equal(cut.body, '{"username":"a","code":"[hidden]","phone":"[hidden]","note":"dài…');
});

test('activityLogger ghi log đã che (body, query, params, referer)', async () => {
	const auditLogger = require('../../src/config/auditLogger');
	const lines = [];
	auditLogger.info = (obj) => lines.push(obj);
	const activityLogger = require('../../src/middlewares/activityLogger');

	const handlers = {};
	const res = {
		statusCode: 200,
		writableFinished: true,
		json: (x) => x,
		getHeader: () => undefined,
		on: (ev, fn) => (handlers[ev] = fn),
	};
	const req = {
		method: 'POST',
		originalUrl: `/api/v1/public/seminar-tickets/${TICKET}/test?dob=1990-01-01`,
		params: { code: TICKET },
		headers: { referer: `https://x.vn/hoi-nghi/ve/${TICKET}` },
		body: { answers: [1, 2], code: '111111', national_id: '001099012345' },
		ip: '10.0.0.1',
	};
	activityLogger(req, res, () => {});
	handlers.close();
	const line = lines[0];
	assert.equal(line.path, '/api/v1/public/seminar-tickets/[hidden]/test?dob=[hidden]');
	assert.equal(line.params.code, '[hidden]');
	assert.equal(line.referer, 'https://x.vn/hoi-nghi/ve/[hidden]');
	assert.deepEqual(JSON.parse(line.body), {
		answers: [1, 2],
		code: '[hidden]',
		national_id: '[hidden]',
	});
});

test('script che log cũ: mặc định chỉ xem; --apply ghi đè, giữ mtime, bỏ qua file đang ghi', () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rms-logs-'));
	const leak = JSON.stringify({
		stream: 'audit',
		path: '/api/v1/public/lookup?national_id=001099012345',
		body: JSON.stringify({ code: '123456' }),
	});
	const clean = JSON.stringify({ stream: 'audit', path: '/api/v1/topics' });
	const old = path.join(dir, 'audit.2026-10-01.1.log');
	const current = path.join(dir, 'audit.2026-11-02.1.log');
	fs.writeFileSync(old, `${leak}\n${clean}\nkhông phải json\n`);
	fs.writeFileSync(current, `${leak}\n`);
	const oldTime = new Date('2026-10-01T12:00:00Z');
	fs.utimesSync(old, oldTime, oldTime);

	const script = path.join(__dirname, '../../scripts/redact-activity-logs.js');
	const run = (...args) =>
		execFileSync(process.execPath, [script, ...args], {
			env: { ...process.env, LOG_DIR: dir },
			encoding: 'utf8',
		});

	assert.match(run(), /Sẽ che 1 dòng/);
	assert.ok(fs.readFileSync(old, 'utf8').includes('001099012345'), 'xem trước không ghi');

	run('--apply');
	const [first, second, third] = fs.readFileSync(old, 'utf8').split('\n');
	assert.ok(!first.includes('001099012345') && !first.includes('123456'));
	assert.equal(second, clean, 'dòng không có gì để che giữ nguyên');
	assert.equal(third, 'không phải json');
	assert.equal(fs.statSync(old).mtimeMs, oldTime.getTime(), 'giữ mtime');
	assert.ok(fs.readFileSync(current, 'utf8').includes('001099012345'), 'bỏ qua file đang ghi');

	run('--apply', '--all');
	assert.ok(!fs.readFileSync(current, 'utf8').includes('001099012345'));
	fs.rmSync(dir, { recursive: true, force: true });
});
