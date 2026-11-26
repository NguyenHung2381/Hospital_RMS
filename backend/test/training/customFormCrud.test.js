// createCustomFormCrud — 5 handler CRUD dùng chung cho khóa học / giảng viên / chương trình /
// học viên (trước đây mỗi controller tự viết 1 bản). Kiểm response giữ nguyên dạng cũ.
process.env.JWT_SECRET = 'test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');

const formCustom = require('../../src/modules/forms/formCustomValueService');
const calls = [];
formCustom.attachResult = async (entity, result) => {
	calls.push(['attach', entity]);
	return { ...result, attached: entity };
};
formCustom.get = async (entity, id) => (calls.push(['get', entity, id]), { f1: 'x' });
formCustom.save = async (entity, id, values) => (
	calls.push(['save', entity, id]),
	values ? { ...values } : null
);
formCustom.remove = async (entity, id) => calls.push(['remove', entity, id]);
const { createCustomFormCrud } = require('../../src/modules/training/customFormCrud');

const run = async (handler, req) => {
	const res = {
		statusCode: 200,
		status(c) {
			this.statusCode = c;
			return this;
		},
		json(b) {
			this.body = b;
			return this;
		},
	};
	let err = null;
	await handler({ user: { id: 'U1' }, params: {}, query: {}, body: {}, ...req }, res, (e) => {
		err = e;
	});
	if (err) throw err;
	return res;
};

const makeService = () => {
	const seen = [];
	return {
		seen,
		getAll: async (...a) => (seen.push(['getAll', a.length]), { data: [{ id: 'A' }] }),
		getById: async (id, ...rest) => (
			seen.push(['getById', rest.length]),
			id === 'X' ? null : { id }
		),
		create: async (body) => ({ id: 'NEW', ...body }),
		update: async (id) => (id === 'X' ? null : { id, name: 'n' }),
		remove: async () => {},
	};
};

test('scoped: truyền req.user cho getAll / getById; không scoped thì không truyền thêm', async () => {
	const svc = makeService();
	const scoped = createCustomFormCrud('course', svc, { scoped: true });
	await run(scoped.getAll, {});
	await run(scoped.getById, { params: { id: 'A' } });
	const plain = createCustomFormCrud('lecturer', svc);
	await run(plain.getAll, {});
	await run(plain.getById, { params: { id: 'A' } });
	assert.deepEqual(svc.seen, [
		['getAll', 2],
		['getById', 1],
		['getAll', 1],
		['getById', 0],
	]);
});

test('đọc: gắn custom; không thấy bản ghi ⇒ 404', async () => {
	const crud = createCustomFormCrud('training_program', makeService());
	const list = await run(crud.getAll, {});
	assert.equal(list.body.data.attached, 'training_program');
	const one = await run(crud.getById, { params: { id: 'A' } });
	assert.deepEqual(one.body.data, { id: 'A', custom: { f1: 'x' } });
	const missing = await run(crud.getById, { params: { id: 'X' } });
	assert.equal(missing.statusCode, 404);
});

test('ghi: lưu req.formCustom, response kèm custom khi có; sửa bản ghi không có ⇒ 404, không lưu', async () => {
	calls.length = 0;
	const crud = createCustomFormCrud('course', makeService());
	const c = await run(crud.createOne, { body: { name: 'K' }, formCustom: { f1: 'v' } });
	assert.equal(c.statusCode, 201);
	assert.deepEqual(c.body.data, { id: 'NEW', name: 'K', custom: { f1: 'v' } });
	const u = await run(crud.updateOne, { params: { id: 'A' } });
	assert.deepEqual(u.body.data, { id: 'A', name: 'n' });
	assert.equal(u.body.message, 'Cập nhật thành công');
	calls.length = 0;
	const miss = await run(crud.updateOne, { params: { id: 'X' }, formCustom: { f1: 'v' } });
	assert.equal(miss.statusCode, 404);
	assert.deepEqual(calls, []);
});

test('xóa: removeCustom quyết định có xóa giá trị trường tùy chỉnh hay không', async () => {
	calls.length = 0;
	await run(createCustomFormCrud('course', makeService(), { removeCustom: true }).removeOne, {
		params: { id: 'A' },
	});
	await run(createCustomFormCrud('lecturer', makeService()).removeOne, { params: { id: 'B' } });
	assert.deepEqual(calls, [['remove', 'course', 'A']]);
});
