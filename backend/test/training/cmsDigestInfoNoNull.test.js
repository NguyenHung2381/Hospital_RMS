// RSA PKCS#1 v1.5 với DigestInfo bỏ trường NULL (RFC 8017 §9.2 ghi chú 2) — dạng VIN-HSM ký.
// node:crypto từ chối dạng này; cms.verifyRaw phải nhận, nhưng chỉ đúng nguyên văn dạng đó.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const cms = require('../../src/modules/training/registration/docCheck/signature/cms');

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const RSA_ENCRYPTION = { algorithmId: '1.2.840.113549.1.1.1' };
const SHA256_WITH_RSA = { algorithmId: '1.2.840.113549.1.1.11' };
const SHA256 = '2.16.840.1.101.3.4.2.1';
const data = Buffer.from('noi dung duoc ky');

// Ký "tay": DigestInfo tùy ý, đệm PKCS#1 kiểu 1
const signDigestInfo = (/** @type {Buffer} */ digestInfo) =>
	crypto.privateEncrypt(
		{ key: privateKey, padding: crypto.constants.RSA_PKCS1_PADDING },
		digestInfo,
	);
const sha256 = (/** @type {Buffer} */ b) => crypto.createHash('sha256').update(b).digest();
const noNull = (/** @type {Buffer} */ h) =>
	Buffer.concat([Buffer.from('302f300b06096086480165030402010420', 'hex'), h]);

test('DigestInfo chuẩn (có NULL) vẫn ok như trước', () => {
	const sig = crypto.sign('sha256', data, privateKey);
	assert.equal(cms.verifyRaw(RSA_ENCRYPTION, SHA256, publicKey, data, sig), 'ok');
});

test('DigestInfo bỏ NULL: node:crypto từ chối, verifyRaw nhận', () => {
	const sig = signDigestInfo(noNull(sha256(data)));
	assert.equal(crypto.verify('sha256', data, publicKey, sig), false);
	assert.equal(cms.verifyRaw(RSA_ENCRYPTION, SHA256, publicKey, data, sig), 'ok');
	assert.equal(cms.verifyRaw(SHA256_WITH_RSA, null, publicKey, data, sig), 'ok');
});

test('bỏ NULL nhưng sai băm / dữ liệu bị sửa ⇒ bad', () => {
	const sig = signDigestInfo(noNull(sha256(data)));
	assert.equal(cms.verifyRaw(RSA_ENCRYPTION, SHA256, publicKey, Buffer.from('khac'), sig), 'bad');
});

test('chỉ nhận đúng dạng bỏ NULL — băm trần không bọc DigestInfo ⇒ bad', () => {
	const sig = signDigestInfo(sha256(data));
	assert.equal(cms.verifyRaw(RSA_ENCRYPTION, SHA256, publicKey, data, sig), 'bad');
});

test('khóa khác ⇒ bad', () => {
	const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey;
	const sig = signDigestInfo(noNull(sha256(data)));
	assert.equal(cms.verifyRaw(RSA_ENCRYPTION, SHA256, other, data, sig), 'bad');
});
