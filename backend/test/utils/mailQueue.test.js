const test = require('node:test');
const assert = require('node:assert/strict');

process.env.LOG_LEVEL = 'silent';
const mailQueue = require('../../src/modules/notifications/mailQueue');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('enqueue trả về ngay, job chạy ở nền', async () => {
	let done = false;
	mailQueue.enqueue('chậm', async () => {
		await sleep(30);
		done = true;
	});
	assert.equal(done, false); // người gọi không phải chờ SMTP
	await mailQueue.drain();
	assert.equal(done, true);
	assert.equal(mailQueue.size(), 0);
});

test('job chạy tuần tự đúng thứ tự xếp hàng, không chồng lên nhau', async () => {
	const log = [];
	let running = 0;
	let maxRunning = 0;
	for (const [name, ms] of [
		['a', 20],
		['b', 1],
		['c', 10],
	]) {
		mailQueue.enqueue(name, async () => {
			running++;
			maxRunning = Math.max(maxRunning, running);
			await sleep(ms);
			log.push(name);
			running--;
		});
	}
	await mailQueue.drain();
	assert.deepEqual(log, ['a', 'b', 'c']);
	assert.equal(maxRunning, 1);
});

test('job lỗi (ném hoặc reject) không làm hỏng job sau', async () => {
	const log = [];
	mailQueue.enqueue('ném', () => {
		throw new Error('SMTP sập');
	});
	mailQueue.enqueue('reject', () => Promise.reject(new Error('timeout')));
	mailQueue.enqueue('ok', async () => log.push('ok'));
	await mailQueue.drain();
	assert.deepEqual(log, ['ok']);
	assert.equal(mailQueue.size(), 0);
});
