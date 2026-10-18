const test = require('node:test');
const assert = require('node:assert/strict');
const { z } = require('zod');

const { validateRequest } = require('../../src/middlewares/validateRequest');

const fakeRes = () => {
	const res = { statusCode: 200, body: null };
	res.status = (c) => ((res.statusCode = c), res);
	res.json = (b) => ((res.body = b), res);
	return res;
};
const run = (mw, req) => {
	const res = fakeRes();
	let nexted = false;
	mw(req, res, () => {
		nexted = true;
	});
	return { res, nexted, req };
};

const mw = validateRequest({
	params: z.object({ id: z.string().regex(/^[A-Z0-9]+$/, 'Mã không hợp lệ') }),
	query: z.object({ page: z.coerce.number().int().min(1).default(1) }),
	body: z.object({ name: z.string().trim().min(1, 'Nhập tên'), password: z.string().min(8) }),
});

test('hợp lệ: next(), req.valid có dữ liệu đã parse, req.body thay bằng bản đã parse', () => {
	const { nexted, req, res } = run(mw, {
		params: { id: 'DT01' },
		query: { page: '3' },
		body: { name: '  Đề tài A ', password: '12345678', extra: 'bỏ' },
	});
	assert.equal(nexted, true);
	assert.equal(res.body, null);
	assert.deepEqual(req.valid.query, { page: 3 });
	assert.deepEqual(req.body, { name: 'Đề tài A', password: '12345678' });
});

test('không hợp lệ: 400, cùng dạng lỗi express-validator, không trả lại value', () => {
	const { nexted, res } = run(mw, {
		params: { id: 'dt-01' },
		query: {},
		body: { name: ' ', password: 'ngan' },
	});
	assert.equal(nexted, false);
	assert.equal(res.statusCode, 400);
	assert.equal(res.body.success, false);
	assert.equal(res.body.message, 'Dữ liệu đầu vào không hợp lệ');
	const byPath = Object.fromEntries(res.body.errors.map((e) => [`${e.location}.${e.path}`, e]));
	assert.deepEqual(Object.keys(byPath).sort(), ['body.name', 'body.password', 'params.id']);
	assert.equal(byPath['params.id'].msg, 'Mã không hợp lệ');
	assert.equal(byPath['body.name'].type, 'field');
	assert.ok(res.body.errors.every((e) => !('value' in e)));
});
