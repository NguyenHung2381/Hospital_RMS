// Cache-aside 2 tầng (utils/cache.js). npm test trỏ Redis vào cổng 1 (không
// kết nối được) → các test này chạy đúng nhánh "Redis down": chỉ còn L1 RAM.
const test = require('node:test');
const assert = require('node:assert/strict');
const { remember, invalidate } = require('../../src/utils/cache');

let seq = 0;
const uniq = () => `test:cache:${++seq}:`;

test('trúng L1 thì không gọi lại fn()', async () => {
	const p = uniq();
	let calls = 0;
	const fn = async () => ({ n: ++calls });
	assert.deepEqual(await remember(`${p}a`, 60, fn), { n: 1 });
	assert.deepEqual(await remember(`${p}a`, 60, fn), { n: 1 });
	assert.equal(calls, 1);
});

test('nhiều request cùng trượt 1 key chỉ chạy fn() một lần', async () => {
	const p = uniq();
	let calls = 0;
	const fn = async () => {
		calls++;
		await new Promise((r) => setTimeout(r, 20));
		return { ok: true };
	};
	const results = await Promise.all(Array.from({ length: 10 }, () => remember(`${p}a`, 60, fn)));
	assert.equal(calls, 1);
	for (const r of results) assert.deepEqual(r, { ok: true });
	assert.notEqual(results[0], results[1]); // mỗi caller 1 bản riêng
});

test('sửa kết quả trả về không làm bẩn cache', async () => {
	const p = uniq();
	const first = await remember(`${p}a`, 60, async () => ({ list: [1, 2] }));
	first.list.push(3);
	assert.deepEqual(await remember(`${p}a`, 60, async () => ({ list: [] })), { list: [1, 2] });
});

test('kết quả luôn cùng dạng JSON dù trúng hay trượt (Date → chuỗi ISO)', async () => {
	const p = uniq();
	const d = new Date('2026-01-02T03:04:05.000Z');
	assert.equal(await remember(`${p}a`, 60, async () => d), d.toISOString());
	assert.equal(await remember(`${p}a`, 60, async () => d), d.toISOString());
});

test('invalidate(prefix) xoá đúng prefix, giữ key khác', async () => {
	const p = uniq();
	const other = uniq();
	let calls = 0;
	const fn = async () => ++calls;
	await remember(`${p}a`, 60, fn);
	await remember(`${other}a`, 60, async () => 'x');
	await invalidate(p);
	assert.equal(await remember(`${p}a`, 60, fn), 2);
	assert.equal(await remember(`${other}a`, 60, async () => 'y'), 'x');
});

test('lượt đọc bắt đầu trước invalidate không ghi bản cũ vào cache', async () => {
	const p = uniq();
	let release;
	const slow = remember(`${p}a`, 60, () => new Promise((r) => (release = r)));
	await new Promise((r) => setImmediate(r));
	await invalidate(p);
	release('cũ');
	assert.equal(await slow, 'cũ');
	assert.equal(await remember(`${p}a`, 60, async () => 'mới'), 'mới');
});

test('fn() lỗi thì không cache, lần sau gọi lại được', async () => {
	const p = uniq();
	await assert.rejects(remember(`${p}a`, 60, async () => { throw new Error('db'); }), /db/);
	assert.equal(await remember(`${p}a`, 60, async () => 'ok'), 'ok');
});

test('null được cache (vd getById không tìm thấy), undefined thì không', async () => {
	const p = uniq();
	let calls = 0;
	assert.equal(await remember(`${p}a`, 60, async () => (calls++, null)), null);
	assert.equal(await remember(`${p}a`, 60, async () => (calls++, null)), null);
	assert.equal(calls, 1);
	assert.equal(await remember(`${p}b`, 60, async () => undefined), undefined);
	assert.equal(await remember(`${p}b`, 60, async () => 'v'), 'v');
});
