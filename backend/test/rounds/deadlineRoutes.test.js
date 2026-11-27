// Hồi quy DELETE /research-rounds/:id/deadlines/:phase (01-tests mục 3 #6): phase
// phải là 1–9 như route POST. Thay middleware xác thực / công tắc module bằng bản
// cho qua để chỉ kiểm phần xử lý của route.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');

const pass = (_req, _res, next) => next();
const stub = (rel, exports) => {
	const file = require.resolve(path.join('../../src', rel));
	require.cache[file] = { id: file, filename: file, loaded: true, exports };
};
stub('middlewares/auth', {
	authenticate: (req, _res, next) => {
		req.user = { id: 'ADMIN' };
		next();
	},
	authorizePermission: () => pass,
});
stub('middlewares/moduleGuard', { requireModule: () => pass });

const deadlineSvc = require('../../src/modules/rounds/deadlineService');
const calls = [];
deadlineSvc.remove = async (...args) => {
	calls.push(args);
};
const router = require('../../src/modules/rounds/rounds.routes');

let srv;
let base;
test.before(async () => {
	const app = express();
	app.use(express.json());
	app.use(router);
	srv = app.listen(0, '127.0.0.1');
	await new Promise((r) => srv.once('listening', r));
	base = `http://127.0.0.1:${srv.address().port}`;
});
test.after(() => srv.close());

const del = (phase) =>
	fetch(`${base}/research-rounds/DOT20261/deadlines/${phase}`, { method: 'DELETE' });

test('#6 DELETE phase không phải số 1–9 ⇒ 400, không gọi service', async () => {
	for (const phase of ['abc', '0', '10', '-1']) {
		const res = await del(phase);
		assert.equal(res.status, 400, `phase=${phase}`);
	}
	assert.equal(calls.length, 0);
});

test('#6 DELETE phase hợp lệ vẫn xoá như cũ', async () => {
	const res = await del('3');
	assert.equal(res.status, 200);
	assert.deepEqual(calls.at(-1), ['DOT20261', 3, 'ADMIN']);
});
