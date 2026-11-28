// /topics/:id/approve chỉ ra quyết định cho đề tài đang chờ duyệt — trước đây server không
// kiểm, gọi thẳng API là đổi được đề tài đã từ chối / đã duyệt (kèm thông báo + dòng tiến
// độ sai). Job tự từ chối đề tài quá hạn bổ sung khai báo from: ['supplement'].
// Lịch sử duyệt lấy người / lúc RA QUYẾT ĐỊNH (topic_progress), không phải người nộp.
process.env.LOG_LEVEL = 'silent';
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

let topicStatus = 'submitted';
const log = install(async (text, inputs) => {
	if (/SELECT 1 AS x FROM approvals/.test(text)) return [{ x: 1 }];
	if (/UPDATE topics SET status = @decision/.test(text)) {
		const allowed = [...text.matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
		if (!allowed.includes(topicStatus)) return [];
		topicStatus = inputs.decision;
		return [{}];
	}
	if (/SELECT status FROM topics/.test(text)) return [{ status: topicStatus }];
	return [];
});
require('../../src/utils/idGenerator').genProgressId = async () => 'TT_X_01';
const notif = require('../../src/modules/notifications/notificationService');
notif.pushWithEmail = async () => {};
const svc = require('../../src/modules/topics/topicApprovalService');

const writes = (from) => log.slice(from).filter((l) => /^\s*(UPDATE|INSERT)/.test(l.text));

test('đề tài đang chờ duyệt: ghi quyết định như cũ', async () => {
	topicStatus = 'submitted';
	const r = await svc.approve('DT1', 'approved', 'Đạt', 'U1');
	assert.equal(r.decision, 'approved');
	assert.equal(topicStatus, 'approved');
});

for (const status of ['approved', 'rejected', 'supplement', 'draft']) {
	test(`đề tài "${status}": /approve bị chặn 409, không ghi phiếu / tiến độ`, async () => {
		topicStatus = status;
		const from = log.length;
		await assert.rejects(svc.approve('DT1', 'approved', null, 'U1'), (e) => e.statusCode === 409);
		assert.equal(topicStatus, status);
		assert.deepEqual(
			writes(from).map((l) => l.text.trim().split(/\s+/).slice(0, 2).join(' ')),
			['UPDATE topics'],
		);
		await assert.rejects(svc.assertDecidable('DT1'), (e) => e.statusCode === 409);
	});
}

test('job quá hạn bổ sung: from supplement thì từ chối được, from không hợp lệ thì lỗi lập trình', async () => {
	topicStatus = 'supplement';
	await svc.approve('DT1', 'rejected', 'Quá hạn', 'U1', { from: ['supplement'] });
	assert.equal(topicStatus, 'rejected');
	await assert.rejects(
		svc.approve('DT1', 'approved', null, 'U1', { from: ['approved'] }),
		/opts\.from/,
	);
});

test('lịch sử duyệt: dựng từ topic_progress (người / lúc quyết định) + phiếu đang chờ', async () => {
	const from = log.length;
	await svc.getApprovals('DT1');
	const sqlText = log[from].text;
	assert.match(sqlText, /FROM topic_progress tp/);
	assert.match(sqlText, /COALESCE\(a\.updated_by, a\.created_by\)/);
	assert.match(sqlText, /LEFT JOIN users u ON u\.id = h\.created_by/);
	assert.equal(log[from].inputs.l_approved, 'Đề tài được phê duyệt');
});
