// Chia người chờ vào đợt (courseBatchService.planPlacement) — phần quyết định của
// khóa tuyển sinh theo đợt, không cần DB.
const test = require('node:test');
const assert = require('node:assert/strict');
const { planPlacement } = require('../../src/modules/training/courses/courseBatchService');

const ids = (n, from = 1) => Array.from({ length: n }, (_, i) => `E${from + i}`);

test('chưa đủ sĩ số tối thiểu ⇒ tiếp tục chờ', () => {
	const p = planPlacement({ waiting: ids(4), openBatches: [], min: 5, max: 10 });
	assert.deepEqual(p.newBatches, []);
	assert.equal(p.remaining.length, 4);
});

test('đủ tối thiểu ⇒ lập đợt, quá tối đa thì người dư vẫn chờ (ai chờ trước vào trước)', () => {
	const p = planPlacement({ waiting: ids(13), openBatches: [], min: 5, max: 10 });
	assert.deepEqual(p.newBatches, [ids(10)]);
	assert.deepEqual(p.remaining, ids(3, 11));
});

test('dư vẫn đủ tối thiểu ⇒ lập thêm đợt nữa', () => {
	const p = planPlacement({ waiting: ids(16), openBatches: [], min: 5, max: 10 });
	assert.deepEqual(p.newBatches, [ids(10), ids(6, 11)]);
	assert.deepEqual(p.remaining, []);
});

test('đợt chưa khai giảng còn chỗ ⇒ lấp chỗ trước, không lập đợt mới', () => {
	const p = planPlacement({
		waiting: ids(3),
		openBatches: [{ id: 'B1', capacity: 10, approved: 8 }],
		min: 5,
		max: 10,
	});
	assert.deepEqual(p.fills, [{ batchId: 'B1', ids: ['E1', 'E2'] }]);
	assert.deepEqual(p.remaining, ['E3']);
	assert.deepEqual(p.newBatches, []);
});

test('đợt đã đầy ⇒ người mới vào danh sách chờ đợt sau', () => {
	const p = planPlacement({
		waiting: ids(2),
		openBatches: [{ id: 'B1', capacity: 10, approved: 10 }],
		min: 5,
		max: 10,
	});
	assert.deepEqual(p.fills, []);
	assert.equal(p.remaining.length, 2);
});

test('lập đợt ngay (force) dù chưa đủ tối thiểu, chỉ 1 đợt', () => {
	const p = planPlacement({ waiting: ids(3), openBatches: [], min: 5, max: 2, force: true });
	assert.deepEqual(p.newBatches, [ids(2)]);
	assert.deepEqual(p.remaining, ['E3']);
});

test('không giới hạn tối đa ⇒ 1 đợt nhận hết', () => {
	const p = planPlacement({ waiting: ids(7), openBatches: [], min: 5, max: null });
	assert.deepEqual(p.newBatches, [ids(7)]);
});
