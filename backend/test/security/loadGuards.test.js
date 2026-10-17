// Giới hạn chống quá tải: cổng bcrypt (utils/cpuGate.js) và số kết nối SSE mỗi
// user (modules/events/eventService.js).
process.env.SSE_MAX_PER_USER = '2';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGate, BUSY_ERROR } = require('../../src/utils/cpuGate');
const events = require('../../src/modules/events/eventService');

const deferred = () => {
	let resolve;
	const promise = new Promise((r) => (resolve = r));
	return { promise, resolve };
};

test('cpuGate: chạy tối đa `max`, xếp hàng `queue`, quá thì 503 ngay', async () => {
	const gate = createGate({ max: 2, queue: 1 });
	const jobs = [deferred(), deferred(), deferred()];
	let started = 0;
	const results = jobs.map((d) =>
		gate.run(() => {
			started += 1;
			return d.promise;
		}),
	);
	await Promise.resolve();
	assert.equal(started, 2);
	assert.deepEqual(gate.stats(), { running: 2, waiting: 1 });

	await assert.rejects(gate.run(() => 'x'), (err) => err === BUSY_ERROR && err.statusCode === 503);

	jobs[0].resolve('a');
	assert.equal(await results[0], 'a');
	await new Promise((r) => setImmediate(r));
	assert.equal(started, 3); // tác vụ đang chờ được chạy khi có chỗ trống
	jobs[1].resolve('b');
	jobs[2].resolve('c');
	assert.deepEqual(await Promise.all(results), ['a', 'b', 'c']);
	assert.deepEqual(gate.stats(), { running: 0, waiting: 0 });
});

test('cpuGate: tác vụ lỗi vẫn trả chỗ cho tác vụ sau', async () => {
	const gate = createGate({ max: 1, queue: 0 });
	await assert.rejects(gate.run(() => Promise.reject(new Error('boom'))), /boom/);
	assert.equal(await gate.run(() => 'ok'), 'ok');
});

test('SSE: mỗi user tối đa SSE_MAX_PER_USER kết nối, đóng 1 thì mở được lại', () => {
	const res = () => ({ write() {} });
	const a1 = res();
	const a2 = res();
	assert.equal(events.addClient(a1, 'U1'), true);
	assert.equal(events.addClient(a2, 'U1'), true);
	assert.equal(events.addClient(res(), 'U1'), false);
	assert.equal(events.addClient(res(), 'U2'), true); // user khác không bị ảnh hưởng

	events.removeClient(a1);
	events.removeClient(a1); // gọi trùng (lỗi ghi + 'close') không trừ 2 lần
	assert.equal(events.addClient(res(), 'U1'), true);
	assert.equal(events.addClient(res(), 'U1'), false);
});
