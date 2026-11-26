process.env.LOG_LEVEL = 'silent';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { broadcast, onUpdate } = require('../../src/modules/events/eventService');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('onUpdate: gọi người nghe đúng entity, 1 lần mỗi cửa sổ gộp, lỗi không lan ra', async () => {
	const seen = [];
	const offA = onUpdate('evt_test_a', (d) => seen.push(d.entity));
	const offBad = onUpdate('evt_test_a', () => {
		throw new Error('người nghe lỗi');
	});
	const offB = onUpdate('evt_test_b', (d) => seen.push(d.entity));
	broadcast('update', { entity: 'evt_test_a' });
	broadcast('update', { entity: 'evt_test_a' }); // gộp với lần trên
	broadcast('other', { entity: 'evt_test_b' }); // không phải 'update' ⇒ bỏ qua
	await wait(350);
	assert.deepEqual(seen, ['evt_test_a']);

	offA();
	offBad();
	offB();
	broadcast('update', { entity: 'evt_test_a' });
	await wait(350);
	assert.deepEqual(seen, ['evt_test_a']);
});
