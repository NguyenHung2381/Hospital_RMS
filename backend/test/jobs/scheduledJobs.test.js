// Job định kỳ thay cho proc SQL cũ: tự từ chối đề tài quá hạn bổ sung, xoá
// thông báo cũ. Thay truy vấn DB + markOnce + topicApprovalService bằng hàm giả.
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.LOG_LEVEL = 'silent';
const marked = new Set();
// markOnce bị destructure lúc nạp job ⇒ thay TRƯỚC khi require
require('../../src/jobs/dedupe').markOnce = async (job, key) => {
	const k = `${job}|${key}`;
	if (marked.has(k)) return false;
	marked.add(k);
	return true;
};
const approvals = [];
require('../../src/modules/topics/topicApprovalService').approve = async (...args) => {
	approvals.push(args);
};
const sup = require('../../src/jobs/supplementDeadlineJob');
const nc = require('../../src/jobs/notificationCleanupJob');

const row = (over) => ({
	id: 'DT01',
	deadline_id: 'MD01',
	deadline_name: 'Bổ sung đợt 1',
	deadline_date: new Date('2026-10-15T00:00:00Z'),
	requested_by: 'NV01',
	requested_after_deadline: 0,
	...over,
});

test('decide: chỉ từ chối khi biết người yêu cầu và yêu cầu trước khi hết mốc', () => {
	assert.equal(sup.decide(row()), 'reject');
	assert.match(sup.decide(row({ requested_by: null })), /không xác định người yêu cầu/);
	assert.match(sup.decide(row({ requested_after_deadline: 1 })), /sau khi mốc đã qua/);
});

test('run: từ chối qua topicApprovalService.approve, ghi người yêu cầu + lý do; bỏ qua ca cần xử lý tay', async () => {
	approvals.length = 0;
	sup.findOverdue = async () => [
		row(),
		row({ id: 'DT02', requested_by: null }),
		row({ id: 'DT03', requested_after_deadline: 1 }),
	];
	const r = await sup.run();
	assert.deepEqual(r, { overdue: 3, rejected: 1 });
	assert.equal(approvals.length, 1);
	const [topicId, status, comment, actor] = approvals[0];
	assert.equal(topicId, 'DT01');
	assert.equal(status, 'rejected');
	assert.equal(actor, 'NV01');
	assert.match(comment, /Tự động từ chối: quá hạn bổ sung "Bổ sung đợt 1" \(15\/10\/2026\)/);
});

test('run: mỗi (đề tài, mốc) chỉ xử lý 1 lần dù chạy lại / nhiều worker', async () => {
	approvals.length = 0;
	sup.findOverdue = async () => [row()];
	assert.deepEqual(await sup.run(), { overdue: 1, rejected: 0 }); // đã đánh dấu ở test trước
	assert.equal(approvals.length, 0);
	sup.findOverdue = async () => [row({ deadline_id: 'MD02' })]; // mốc bổ sung mới của đợt
	assert.deepEqual(await sup.run(), { overdue: 1, rejected: 1 });
});

test('dọn thông báo: xoá theo lô tới khi hết, mỗi ngày 1 lần', async () => {
	const batches = [nc.BATCH_SIZE, nc.BATCH_SIZE, 7];
	let calls = 0;
	nc.deleteBatch = async () => {
		calls++;
		return batches.shift() ?? 0;
	};
	assert.deepEqual(await nc.run({ pauseMs: 0 }), {
		deleted: nc.BATCH_SIZE * 2 + 7,
		skipped: false,
	});
	assert.equal(calls, 3);
	assert.deepEqual(await nc.run({ pauseMs: 0 }), { deleted: 0, skipped: true });
	assert.equal(calls, 3);
});

test('mốc giữ thông báo: đã đọc 90 ngày, chưa đọc 180 ngày', () => {
	assert.equal(nc.READ_RETENTION_DAYS, 90);
	assert.equal(nc.UNREAD_RETENTION_DAYS, 180);
});
