// Phiếu duyệt đề tài (approvalRecord.js — thay trigger trg_topic_auto_approval) và
// actorRequest().query(mảng câu) — PG không cho ghép nhiều câu có tham số bằng ';'.
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

const log = install((text) => (/^A$/.test(text) ? [{ n: 1 }] : []));
const { actorRequest } = require('../../src/config/db');
const { withApprovalSync, approvalIdOf } = require('../../src/modules/topics/approvalRecord');

const recorder = () => {
	const inputs = {};
	return {
		inputs,
		input(name, _type, value) {
			inputs[name] = value;
			return this;
		},
	};
};

test('withApprovalSync: sang submitted ⇒ cập nhật đề tài, tạo phiếu nếu thiếu, đưa phiếu về pending', () => {
	const req = recorder();
	const stmts = withApprovalSync(
		req,
		'UPDATE topics SET x = 1 WHERE id = @id',
		'DT01',
		'submitted',
	);
	assert.equal(stmts.length, 3);
	assert.equal(stmts[0], 'UPDATE topics SET x = 1 WHERE id = @id');
	assert.match(stmts[1], /INSERT INTO approvals[\s\S]*WHERE NOT EXISTS/);
	assert.match(stmts[2], /^UPDATE approvals SET status = @apv_status/);
	assert.deepEqual(req.inputs, { apv_id: 'PDDT01', apv_status: 'pending' });
	assert.ok(
		stmts.every((s) => !s.includes(';')),
		'mỗi phần tử chỉ 1 câu',
	);
});

test('withApprovalSync: trạng thái có ở phiếu ⇒ chỉ đồng bộ; trạng thái khác / không đổi ⇒ chỉ cập nhật', () => {
	const approved = recorder();
	assert.equal(withApprovalSync(approved, 'U', 'DT01', 'approved').length, 2);
	assert.deepEqual(approved.inputs, { apv_status: 'approved' });
	for (const status of ['cancelled', 'completed', undefined]) {
		const req = recorder();
		assert.deepEqual(withApprovalSync(req, 'U', 'DT01', status), ['U']);
		assert.deepEqual(req.inputs, {});
	}
	assert.equal(approvalIdOf('NCKH_2026_001'), 'PDNCKH_2026_001');
});

test('actorRequest().query(mảng): chạy lần lượt cùng tham số, trả kết quả câu đầu', async () => {
	log.length = 0;
	const r = await actorRequest('NV01').input('id', null, 'DT01').query(['A', 'B']);
	assert.deepEqual(r.recordset, [{ n: 1 }]);
	const ran = log.filter((l) => l.text === 'A' || l.text === 'B');
	assert.deepEqual(
		ran.map((l) => [l.text, l.inputs.id]),
		[
			['A', 'DT01'],
			['B', 'DT01'],
		],
	);
});
