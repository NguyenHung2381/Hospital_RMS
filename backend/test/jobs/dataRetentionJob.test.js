// Job dọn nhật ký cũ (security_events, job_execution_log) và xoá OTP hết hạn.
// DB giả: rowsAffected = độ dài mảng handler trả về (test/auth/fakeDb.js).
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.LOG_LEVEL = 'silent';
const { install } = require('../auth/fakeDb');

const marked = new Set();
// markOnce bị destructure lúc nạp job ⇒ thay TRƯỚC khi require
require('../../src/jobs/dedupe').markOnce = async (job, key) => {
	const k = `${job}|${key}`;
	if (marked.has(k)) return false;
	marked.add(k);
	return true;
};

// Mỗi câu DELETE trả lần lượt số dòng trong hàng đợi của bảng đó.
const queues = { security_events: [], job_execution_log: [], password_reset_otps: [] };
const log = install((text) => {
	const table = Object.keys(queues).find((t) => text.includes(`DELETE FROM ${t}`));
	if (!table) return [];
	return Array.from({ length: queues[table].shift() ?? 0 }, () => ({}));
});

const job = require('../../src/jobs/dataRetentionJob');
const accountMaintenance = require('../../src/jobs/accountMaintenanceJob');
const { countUsage } = require('../../scripts/check-tsql-usage');

const deletes = (table) => log.filter((q) => q.text.includes(`DELETE FROM ${table}`));

test('số tháng giữ security_events: mặc định 24, 0 = không xoá, tối thiểu 12', () => {
	assert.equal(job.securityEventMonths(undefined), 24);
	assert.equal(job.securityEventMonths(''), 24);
	assert.equal(job.securityEventMonths('36'), 36);
	assert.equal(job.securityEventMonths('0'), null);
	assert.equal(job.securityEventMonths('6'), job.MIN_SECURITY_EVENT_MONTHS);
	assert.equal(job.securityEventMonths('abc'), 24);
	assert.equal(job.securityEventMonths('-3'), 24);
});

test('mức giữ tối thiểu dài hơn cửa sổ code đọc lại security_events (181 ngày)', () => {
	// trustedDeviceService.isRevoked tra 'device_untrusted' trong DEVICE_TOKEN_TTL_DAYS + 1 ngày
	assert.ok(job.MIN_SECURITY_EVENT_MONTHS * 28 > 181);
});

test('mốc xoá: 00:00 hôm nay giờ VN lùi theo tháng / ngày', () => {
	const today = new Date(Date.UTC(2026, 10, 3)); // 03/11/2026
	assert.equal(job.cutoffVN({ months: 24 }, today).toISOString(), '2024-11-03T00:00:00.000Z');
	assert.equal(job.cutoffVN({ days: 180 }, today).toISOString(), '2026-05-07T00:00:00.000Z');
});

test('chỉ dọn job_execution_log của job có khoá theo ngày', () => {
	for (const name of ['password_expiry_warning', 'deadline_reminder', 'supplement_auto_reject'])
		assert.ok(!job.DAILY_KEY_JOBS.includes(name), name);
	assert.ok(job.DAILY_KEY_JOBS.includes('notification_cleanup'));
});

test('run: xoá theo lô tới khi hết, mỗi ngày 1 lần', async () => {
	delete process.env.SECURITY_EVENTS_RETENTION_MONTHS;
	log.length = 0;
	queues.security_events.push(job.BATCH_SIZE, 5);
	queues.job_execution_log.push(3);

	assert.deepEqual(await job.run({ pauseMs: 0 }), {
		skipped: false,
		securityEvents: job.BATCH_SIZE + 5,
		jobLogs: 3,
	});
	assert.equal(deletes('security_events').length, 2);
	const se = deletes('security_events')[0];
	assert.match(se.text, /OFFSET 0 ROWS FETCH NEXT @batch ROWS ONLY/);
	assert.equal(se.inputs.batch, job.BATCH_SIZE);
	assert.ok(se.inputs.cutoff instanceof Date);

	const jl = deletes('job_execution_log')[0];
	assert.deepEqual(
		Object.keys(jl.inputs)
			.filter((k) => k.startsWith('job'))
			.map((k) => jl.inputs[k]),
		job.DAILY_KEY_JOBS,
	);

	assert.deepEqual(await job.run({ pauseMs: 0 }), { skipped: true });
});

test('SECURITY_EVENTS_RETENTION_MONTHS=0: không xoá security_events', async () => {
	process.env.SECURITY_EVENTS_RETENTION_MONTHS = '0';
	marked.clear();
	log.length = 0;
	const r = await job.run({ pauseMs: 0 });
	assert.equal(r.securityEvents, 0);
	assert.equal(deletes('security_events').length, 0);
	assert.equal(deletes('job_execution_log').length, 1);
	delete process.env.SECURITY_EVENTS_RETENTION_MONTHS;
});

test('PostgreSQL: mỗi ngày tạo/bỏ partition security_events, kể cả khi không xoá', async () => {
	const db = require('../../src/config/db');
	const realClient = db.client;
	db.client = 'pg';
	try {
		for (const [env, keep] of [
			[undefined, 24],
			['0', null],
		]) {
			if (env === undefined) delete process.env.SECURITY_EVENTS_RETENTION_MONTHS;
			else process.env.SECURITY_EVENTS_RETENTION_MONTHS = env;
			marked.clear();
			log.length = 0;
			await job.run({ pauseMs: 0 });
			const q = log.filter((x) => x.text.includes('rms_maintain_monthly_partitions'));
			assert.equal(q.length, 1);
			assert.match(q[0].text, /'security_events', 0, 2, @keep/);
			assert.equal(q[0].inputs.keep, keep);
		}
	} finally {
		db.client = realClient;
		delete process.env.SECURITY_EVENTS_RETENTION_MONTHS;
	}
	// SQL Server: không gọi hàm của PG
	marked.clear();
	log.length = 0;
	await job.run({ pauseMs: 0 });
	assert.equal(log.filter((x) => x.text.includes('rms_maintain')).length, 0);
});

test('xoá OTP quên mật khẩu đã hết hạn, so với giờ UTC hiện tại', async () => {
	log.length = 0;
	queues.password_reset_otps.push(2);
	const pool = await require('../../src/config/db').getPool();
	const before = Date.now();
	await accountMaintenance.purgeExpiredResetOtps(pool);
	const q = deletes('password_reset_otps')[0];
	assert.match(q.text, /expires_at < @now/);
	assert.ok(Math.abs(q.inputs.now.getTime() - before) < 5000);
});

test('SQL của job không dùng cú pháp chỉ T-SQL', () => {
	const usage = countUsage();
	for (const [key, { files }] of Object.entries(usage))
		assert.equal(files['src/jobs/dataRetentionJob.js'] ?? 0, 0, key);
});
