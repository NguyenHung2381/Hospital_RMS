const test = require('node:test');
const assert = require('node:assert');
const { evaluate, ipAllowed, validateSetting, distanceM } = require('../../src/utils/attendancePolicy');

const policy = {
	ipRanges: [
		{ address: '113.161.1.2', prefix: 32, type: 'ipv4' },
		{ address: '10.0.0.0', prefix: 8, type: 'ipv4' },
	],
	location: { lat: 10.7769, lng: 106.7009 },
	radiusM: 200,
	maxAccuracyM: 100,
};
const near = { lat: 10.7775, lng: 106.7009, accuracy: 20 }; // ~67m về phía bắc

test('distanceM: 0.0006° vĩ độ ≈ 67m', () => {
	assert.ok(Math.abs(distanceM(policy.location, near) - 67) < 2);
});

test('ipAllowed: IP lẻ, CIDR, IPv4-mapped IPv6', () => {
	assert.ok(ipAllowed('113.161.1.2', policy.ipRanges));
	assert.ok(ipAllowed('::ffff:10.20.30.40', policy.ipRanges));
	assert.ok(!ipAllowed('113.161.1.3', policy.ipRanges));
	assert.ok(!ipAllowed(undefined, policy.ipRanges));
});

test('evaluate: phải đủ CẢ IP lẫn GPS', () => {
	assert.ok(evaluate(policy, { ip: '10.1.1.1', ...near }).ok);

	const wrongIp = evaluate(policy, { ip: '1.2.3.4', ...near });
	assert.ok(!wrongIp.ok);
	assert.strictEqual(wrongIp.reasons.length, 1);

	const far = evaluate(policy, { ip: '10.1.1.1', lat: 10.79, lng: 106.7009, accuracy: 10 });
	assert.ok(!far.ok);
	assert.match(far.reasons[0], /cách bệnh viện/);

	const both = evaluate(policy, { ip: '1.2.3.4', lat: 10.79, lng: 106.7009, accuracy: 10 });
	assert.strictEqual(both.reasons.length, 2);

	const blurry = evaluate(policy, { ip: '10.1.1.1', ...near, accuracy: 500 });
	assert.match(blurry.reasons[0], /chưa đủ chính xác/);
});

test('evaluate: chưa cấu hình thì không cho chấm', () => {
	assert.ok(!evaluate({ ...policy, ipRanges: [] }, { ip: '10.1.1.1', ...near }).ok);
	assert.ok(!evaluate({ ...policy, location: null }, { ip: '10.1.1.1', ...near }).ok);
});

test('validateSetting', () => {
	assert.strictEqual(validateSetting('ATTENDANCE_ALLOWED_IPS', '113.161.1.2, 10.0.0.0/8 2001:db8::/32'), null);
	assert.match(validateSetting('ATTENDANCE_ALLOWED_IPS', '10.0.0.0/33, abc'), /10\.0\.0\.0\/33, abc/);
	assert.strictEqual(validateSetting('ATTENDANCE_LOCATION', '10.7769, 106.7009'), null);
	assert.ok(validateSetting('ATTENDANCE_LOCATION', '106.7, 200'));
	assert.ok(validateSetting('ATTENDANCE_RADIUS_M', '0'));
	assert.strictEqual(validateSetting('ATTENDANCE_RADIUS_M', '150'), null);
	assert.strictEqual(validateSetting('OTHER_KEY', 'x'), null);
});
