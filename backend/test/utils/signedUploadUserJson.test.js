// L-07: JSON người dùng nhập (prerequisites/objectives) không bị ký link /uploads.
const test = require('node:test');
const assert = require('node:assert/strict');
process.env.UPLOAD_URL_SECRET = 'test-secret-test-secret-test-secret';
const { signDeep } = require('../../src/utils/signedUpload');

test('khóa url/image lồng trong prerequisites/objectives không được ký', () => {
	const body = {
		prerequisites: [{ url: '/uploads/seminars/HT1/certificate/template.pdf' }],
		objectives: [{ image: '/uploads/seminars/HT1/certificate/template.pdf' }],
	};
	assert.deepEqual(signDeep(body), body);
});

test('trường file do server ghi vẫn được ký', () => {
	const out = signDeep({ file_url: '/uploads/topics/DT1/a.pdf' });
	assert.match(out.file_url, /\?exp=\d+&sig=/);
});
