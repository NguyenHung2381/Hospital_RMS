// Client VIN-HSM (modules/signing/vinHsmClient.js): chữ ký AWS SigV4 và cách đọc phản hồi.
// Gọi máy chủ HTTP giả lập trên localhost qua VIN_HSM_BASE_URL — không ra mạng ngoài.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');

const client = require('../../src/modules/signing/vinHsmClient');

const CRED = { apiKey: 'AKTEST', secret: 'c2VjcmV0LXRlc3Q=', region: 'hn10' };

test('signRequest khớp vector mẫu chính thức của AWS (IAM ListUsers)', () => {
	const h = client.signRequest({
		method: 'GET',
		url: new URL('https://iam.amazonaws.com/?Action=ListUsers&Version=2010-05-08'),
		body: '',
		contentType: 'application/x-www-form-urlencoded; charset=utf-8',
		apiKey: 'AKIDEXAMPLE',
		secret: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
		region: 'us-east-1',
		service: 'iam',
		payloadHeader: false,
		now: new Date('2015-08-30T12:36:00Z'),
	});
	assert.equal(
		h.Authorization,
		'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/iam/aws4_request, ' +
			'SignedHeaders=content-type;host;x-amz-date, ' +
			'Signature=5d672d79c15b13162d9279b0855cfba6789a8edb4c82c400e06b5924a6f2b5d7',
	);
});

test('signRequest gọi VIN-HSM: service "sign", ký cả x-amz-content-sha256 của body', () => {
	const body = '{"a":1}';
	const h = client.signRequest({
		method: 'POST',
		url: new URL('https://sign-hn10.vin-hsm.com/api/v2/pdf/sign/originaldata'),
		body,
		contentType: 'application/json',
		...CRED,
		now: new Date('2026-11-27T01:02:03Z'),
	});
	assert.match(h.Authorization, /Credential=AKTEST\/20261127\/hn10\/sign\/aws4_request/);
	assert.match(h.Authorization, /SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date/);
	assert.equal(h['X-Amz-Date'], '20261127T010203Z');
	assert.equal(h['X-Amz-Content-Sha256'], crypto.createHash('sha256').update(body).digest('hex'));
});

// Máy chủ giả: trả theo `reply` của từng test, ghi lại request nhận được
let reply = () => ({ status: 200, body: { status: 0, obj: '' } });
const seen = [];
const server = http.createServer((req, res) => {
	let data = '';
	req.on('data', (c) => (data += c));
	req.on('end', () => {
		seen.push({ method: req.method, url: req.url, headers: req.headers, body: data });
		const r = reply(req, data);
		res.writeHead(r.status, { 'Content-Type': 'application/json' });
		res.end(typeof r.body === 'string' ? r.body : JSON.stringify(r.body));
	});
});

test.before(async () => {
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	process.env.VIN_HSM_BASE_URL = `http://127.0.0.1:${/** @type {any} */ (server.address()).port}`;
});
test.after(() => {
	delete process.env.VIN_HSM_BASE_URL;
	server.close();
});

test('signPdf: gửi base64 + tham số, nhận file đã ký từ obj', async () => {
	const signed = Buffer.from('%PDF-signed');
	reply = () => ({ status: 200, body: { status: 0, obj: signed.toString('base64') } });
	const out = await client.signPdf(CRED, Buffer.from('%PDF-1.7'), {
		type: client.PDF_SIGNATURE_TYPE.TEXT,
		page: 1,
		x: 10.4,
		y: 20.6,
		text: 'Ký bởi: A',
	});
	assert.deepEqual(out, signed);
	const req = seen.at(-1);
	assert.equal(req.method, 'POST');
	assert.equal(req.url, '/api/v2/pdf/sign/originaldata');
	assert.match(String(req.headers.authorization), /^AWS4-HMAC-SHA256 Credential=AKTEST\//);
	const body = JSON.parse(req.body);
	assert.equal(body.base64pdf, Buffer.from('%PDF-1.7').toString('base64'));
	assert.equal(body.hashalg, 'SHA256');
	assert.equal(body.typesignature, 1);
	assert.equal(body.xpoint, 10);
	assert.equal(body.ypoint, 21);
	assert.equal(body.textout, 'Ký bởi: A');
	// Hash trong header đúng là hash của body gửi đi
	assert.equal(
		req.headers['x-amz-content-sha256'],
		crypto.createHash('sha256').update(req.body).digest('hex'),
	);
});

test('status khác 0 ⇒ VinHsmError mang mã lỗi + thông báo tiếng Việt', async () => {
	reply = () => ({ status: 200, body: { status: 2012, description: 'SERVICE_EXPIRED' } });
	await assert.rejects(client.signOffice(CRED, Buffer.from('PK')), (err) => {
		assert.ok(err instanceof client.VinHsmError);
		assert.equal(err.code, 2012);
		assert.match(err.message, /hết hạn/);
		return true;
	});
});

test('HTTP 401 ⇒ lỗi xác thực (mã 103)', async () => {
	reply = () => ({ status: 401, body: '' });
	await assert.rejects(client.getCertificate(CRED), (err) => {
		assert.equal(err.code, 103);
		assert.equal(err.httpStatus, 401);
		assert.match(err.message, /API key/);
		return true;
	});
});

test('account/cert trả thẳng chuỗi base64 (không bọc status/obj)', async () => {
	reply = () => ({ status: 200, body: JSON.stringify('AQID') });
	assert.deepEqual(await client.getCertificate(CRED), Buffer.from([1, 2, 3]));
});

test('obj rỗng ⇒ báo lỗi, không trả file rỗng', async () => {
	reply = () => ({ status: 200, body: { status: 0, obj: '' } });
	await assert.rejects(client.signPdf(CRED, Buffer.from('x')), /không trả file PDF/);
});

test('vùng máy chủ sai định dạng bị chặn trước khi gọi mạng', async () => {
	const before = seen.length;
	await assert.rejects(
		client.signPdf({ ...CRED, region: 'hn10.evil.com/' }, Buffer.from('x')),
		/Vùng máy chủ/,
	);
	assert.equal(seen.length, before);
});
