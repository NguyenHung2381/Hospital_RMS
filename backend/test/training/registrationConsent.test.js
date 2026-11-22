// Bản ghi xác nhận điện tử của form đăng ký khóa ĐTLT (registrationConsent.js, file thuần):
//   - so họ tên ký với họ tên khai: bỏ khoảng trắng thừa, không phân biệt hoa thường, NFC = NFD
//   - bản ghi chứa nguyên văn nội quy + 3 câu cam kết, họ tên ký, IP, thiết bị; băm SHA-256
//   - sửa 1 ký tự trong bản ghi ⇒ verifyRecord = false
const test = require('node:test');
const assert = require('node:assert/strict');
const {
	signatureMatches,
	publicConsent,
	consentInput,
	clientOf,
	buildRecord,
	verifyRecord,
} = require('../../src/modules/training/registration/registrationConsent');
const {
	RULES_VERSION,
	CLASS_RULES,
	CONSENT_VERSION,
	COMMITMENTS,
} = require('../../src/modules/training/registration/registrationConstants');

test('signatureMatches: khoảng trắng / hoa thường / dạng Unicode không quan trọng; khác dấu là khác', () => {
	assert.ok(signatureMatches('  nguyễn   VĂN an ', 'Nguyễn Văn An'));
	assert.ok(signatureMatches('Nguyễn Văn An'.normalize('NFD'), 'Nguyễn Văn An'));
	assert.ok(!signatureMatches('Nguyen Van An', 'Nguyễn Văn An'));
	assert.ok(!signatureMatches('', ''), 'bỏ trống không phải chữ ký');
	assert.ok(!signatureMatches(null, 'A'));
	assert.ok(!signatureMatches('Nguyễn Văn', 'Nguyễn Văn An'));
});

test('publicConsent: đúng câu chữ máy chủ sẽ lưu', () => {
	const c = publicConsent();
	assert.equal(c.version, CONSENT_VERSION);
	assert.deepEqual(Object.keys(c.commitments), ['rules', 'declared', 'data']);
	assert.ok(c.commitments.rules.includes(RULES_VERSION));
	assert.match(c.signature_note, /Giao dịch điện tử/);
});

test('clientOf / consentInput: IP chuẩn hóa, thiết bị cắt 300 ký tự', () => {
	const req = { ip: '::ffff:10.0.0.5', get: (h) => (h === 'user-agent' ? 'U'.repeat(400) : null) };
	const c = clientOf(req);
	assert.equal(c.ip, '10.0.0.5');
	assert.equal(c.userAgent.length, 300);
	assert.deepEqual(clientOf({ ip: undefined, get: () => undefined }).userAgent, null);
	assert.deepEqual(consentInput({ signature_name: ' A ', full_name: 'A' }, c), {
		signatureName: 'A',
		fullName: 'A',
		client: c,
	});
});

test('buildRecord: nguyên văn nội quy + cam kết; băm khớp; sửa bản ghi ⇒ không còn nguyên vẹn', () => {
	const signedAt = new Date('2026-11-21T03:04:05.000Z');
	const { json, hash, record } = buildRecord({
		registrationCode: 'DK1',
		enrollmentId: 'E1',
		source: 'external',
		fullName: ' Nguyễn Văn An ',
		signatureName: 'nguyễn văn an',
		verifiedEmail: 'an@example.com',
		client: { ip: '1.2.3.4', userAgent: 'UA' },
		signedAt,
	});
	assert.equal(record.signed_at, '2026-11-21T03:04:05.000Z');
	assert.equal(record.full_name, 'Nguyễn Văn An');
	assert.equal(record.signature_name, 'nguyễn văn an');
	assert.equal(record.ip, '1.2.3.4');
	assert.equal(record.verified_email, 'an@example.com');
	assert.equal(record.rules_version, RULES_VERSION);
	assert.deepEqual(record.rules, CLASS_RULES);
	assert.deepEqual(record.commitments, [COMMITMENTS.rules, COMMITMENTS.declared, COMMITMENTS.data]);
	assert.match(hash, /^[0-9a-f]{64}$/);
	assert.deepEqual(JSON.parse(json), record);
	assert.ok(verifyRecord(json, hash));
	assert.ok(!verifyRecord(json.replace('1.2.3.4', '1.2.3.5'), hash));
	assert.ok(!verifyRecord(null, hash));
	assert.ok(!verifyRecord(json, null));
	// Cùng dữ liệu ⇒ cùng mã băm (có thể tính lại độc lập)
	assert.equal(
		buildRecord({
			registrationCode: 'DK1',
			enrollmentId: 'E1',
			source: 'external',
			fullName: 'Nguyễn Văn An',
			signatureName: 'nguyễn văn an',
			verifiedEmail: 'an@example.com',
			client: { ip: '1.2.3.4', userAgent: 'UA' },
			signedAt,
		}).hash,
		hash,
	);
});
