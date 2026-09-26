// Lá chắn đăng nhập (utils/loginShield.js). Trỏ Redis vào cổng không có ai
// nghe → mọi bộ đếm chạy bằng bộ nhớ, không ghi bẩn Redis dev.
process.env.REDIS_PORT = '1';
process.env.LOGIN_POW_AFTER_FAILS = '3';
process.env.LOGIN_POW_BITS = '8';
process.env.LOGIN_POW_ATTACK_BITS = '10';
process.env.LOGIN_ATTACK_THRESHOLD = '30';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'x'.repeat(64);
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const shield = require('../../src/utils/loginShield');

const solve = (token, bits) => {
	for (let n = 0; ; n++) {
		const nonce = n.toString(36);
		const d = crypto.createHash('sha256').update(`${token}:${nonce}`).digest();
		if (shield.leadingZeroBits(d) >= bits) return nonce;
	}
};

test.beforeEach(() => shield._memory.clear());

test('chưa sai lần nào: không cần thử thách', async () => {
	assert.deepEqual(await shield.assess({ ip: '10.0.0.1', username: 'bsA' }), { bits: 0, attack: false });
});

test('IP sai ≥ 3 lần: mọi username từ IP đó đều phải giải', async () => {
	for (let i = 0; i < 3; i++) await shield.recordFailure({ ip: '10.0.0.2', username: `u${i}` });
	assert.equal((await shield.assess({ ip: '10.0.0.2', username: 'khac' })).bits, 8);
	assert.equal((await shield.assess({ ip: '10.0.0.3', username: 'khac' })).bits, 0);
});

test('username bị dò từ nhiều IP: username đó phải giải, đăng nhập đúng thì xoá', async () => {
	for (let i = 0; i < 3; i++) await shield.recordFailure({ ip: `10.1.0.${i}`, username: 'BsB' });
	assert.equal((await shield.assess({ ip: '10.9.9.9', username: 'bsb' })).bits, 8); // không phân biệt hoa thường
	await shield.recordSuccess({ username: 'bsb' });
	assert.equal((await shield.assess({ ip: '10.9.9.9', username: 'bsb' })).bits, 0);
});

test('càng sai nhiều càng khó (+1 bit mỗi 10 lần)', async () => {
	for (let i = 0; i < 23; i++) await shield.recordFailure({ ip: '10.0.0.4', username: `v${i}` });
	assert.equal((await shield.assess({ ip: '10.0.0.4', username: 'x' })).bits, 10);
});

test('toàn hệ thống sai dồn dập: chế độ tấn công, ai cũng phải giải', async () => {
	for (let i = 0; i < 30; i++) await shield.recordFailure({ ip: `10.2.${i}.1`, username: `w${i}` });
	const r = await shield.assess({ ip: '10.3.3.3', username: 'nguoimoi' });
	assert.equal(r.attack, true);
	assert.equal(r.bits, 10);
});

test('lời giải: đúng thì qua, dùng lại / sai username / thiếu bit thì không', async () => {
	const { token, bits } = shield.issueChallenge({ username: 'bsC', bits: 8 });
	const nonce = solve(token, bits);
	const args = { token, nonce, username: 'bsC', requiredBits: 8 };

	assert.equal(await shield.verifyChallenge({ ...args, username: 'bsD' }), false);
	assert.equal(await shield.verifyChallenge({ ...args, requiredBits: 9 }), false);
	assert.equal(await shield.verifyChallenge({ ...args, nonce: 'zz!' }), false);
	assert.equal(await shield.verifyChallenge({ ...args, token: token + 'x' }), false);
	assert.equal(await shield.verifyChallenge(args), true);
	assert.equal(await shield.verifyChallenge(args), false); // chỉ dùng 1 lần
});

test('nonce không đạt đủ số bit thì bị từ chối', async () => {
	const { token } = shield.issueChallenge({ username: 'bsE', bits: 8 });
	let bad;
	for (let n = 0; ; n++) {
		const d = crypto.createHash('sha256').update(`${token}:${n.toString(36)}`).digest();
		if (shield.leadingZeroBits(d) < 8) {
			bad = n.toString(36);
			break;
		}
	}
	assert.equal(await shield.verifyChallenge({ token, nonce: bad, username: 'bsE', requiredBits: 8 }), false);
});
