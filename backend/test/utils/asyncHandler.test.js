const test = require('node:test');
const assert = require('node:assert/strict');

const { asyncHandler } = require('../../src/utils/asyncHandler');

// Gọi middleware như Express, chờ promise do asyncHandler trả về rồi xem next nhận gì
const run = async (handler) => {
	const calls = [];
	await handler({}, {}, (arg) => calls.push(arg));
	return calls;
};

test('lỗi ném ra trong handler async ⇒ next(err)', async () => {
	const err = new Error('boom');
	const calls = await run(
		asyncHandler(async () => {
			throw err;
		}),
	);
	assert.deepEqual(calls, [err]);
});

test('hàm không async ném lỗi đồng bộ ⇒ cũng next(err)', async () => {
	const err = new Error('sync');
	const calls = await run(
		asyncHandler(() => {
			throw err;
		}),
	);
	assert.deepEqual(calls, [err]);
});

test('handler chạy xong không lỗi ⇒ không gọi next', async () => {
	let ran = false;
	const calls = await run(
		asyncHandler(async (_req, res) => {
			ran = true;
			return res;
		}),
	);
	assert.equal(ran, true);
	assert.deepEqual(calls, []);
});

test('handler tự gọi next() (middleware) vẫn giữ nguyên', async () => {
	const calls = await run(asyncHandler(async (_req, _res, next) => next()));
	assert.deepEqual(calls, [undefined]);
});

test('qua Express thật: lỗi trong handler tới errorHandler, trả đúng mã + thông điệp', async (t) => {
	const express = require('express');
	const { errorHandler } = require('../../src/middlewares/errorHandler');
	const { httpError } = require('../../src/utils/httpError');
	const app = express();
	app.get(
		'/conflict',
		asyncHandler(async () => {
			await Promise.resolve();
			throw httpError(409, 'Đã tồn tại');
		}),
	);
	app.get(
		'/ok',
		asyncHandler(async (_req, res) => res.json({ success: true })),
	);
	app.use(errorHandler);
	const server = app.listen(0, '127.0.0.1');
	await new Promise((r) => server.once('listening', r));
	t.after(() => server.close());
	const base = `http://127.0.0.1:${server.address().port}`;

	const bad = await fetch(`${base}/conflict`, { signal: AbortSignal.timeout(5000) });
	assert.equal(bad.status, 409);
	assert.deepEqual(await bad.json(), { success: false, message: 'Đã tồn tại' });
	const ok = await fetch(`${base}/ok`, { signal: AbortSignal.timeout(5000) });
	assert.equal(ok.status, 200);
});
