// Xác thực chữ ký số PDF (docCheck/signature/) — fixture tự tạo CA và tự ký trong test
// (pdfSignFixtures.js), không dùng file ký thật.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { X509Certificate } = require('crypto');
const {
	verifyPdfSignatures,
	matchSignerOrganization,
} = require('../../src/modules/training/registration/docCheck/signature/pdfSignature');
const {
	createTrustStore,
	loadTrustStore,
	DEFAULT_DIR,
} = require('../../src/modules/training/registration/docCheck/signature/trustStore');
const fx = require('./pdfSignFixtures');

const TSA_EKU = ['1.3.6.1.5.5.7.3.8'];
let pki; // dựng một lần cho cả file

test.before(async () => {
	const longAgo = new Date('2015-01-01T00:00:00Z');
	const farAway = new Date('2045-01-01T00:00:00Z');
	const root = await fx.makeCert({
		cn: 'Test Root CA',
		o: 'Test PKI',
		ca: true,
		notBefore: longAgo,
		notAfter: farAway,
	});
	const sub = await fx.makeCert({
		cn: 'Test Sub CA',
		o: 'Test PKI',
		ca: true,
		issuer: root,
		notBefore: longAgo,
		notAfter: farAway,
	});
	const leaf = await fx.makeCert({
		cn: 'NGUYỄN VĂN AN',
		o: 'Bệnh viện Đa khoa Tỉnh Bắc Ninh',
		issuer: sub,
	});
	const old = await fx.makeCert({
		cn: 'TRẦN THỊ BÌNH',
		issuer: sub,
		notBefore: new Date('2019-01-01T00:00:00Z'),
		notAfter: new Date('2020-01-01T00:00:00Z'),
	});
	const tsa = await fx.makeCert({
		cn: 'Test TSA',
		issuer: sub,
		eku: TSA_EKU,
		notBefore: longAgo,
		notAfter: farAway,
	});
	const strangerRoot = await fx.makeCert({
		cn: 'Stranger Root',
		ca: true,
		notBefore: longAgo,
		notAfter: farAway,
	});
	const stranger = await fx.makeCert({ cn: 'Kẻ lạ', issuer: strangerRoot });
	const strangerTsa = await fx.makeCert({ cn: 'Stranger TSA', issuer: strangerRoot, eku: TSA_EKU });
	pki = {
		root,
		sub,
		leaf,
		old,
		tsa,
		strangerRoot,
		stranger,
		strangerTsa,
		trust: createTrustStore({ roots: [root.pem] }),
		unsigned: await fx.makeUnsignedPdf(),
	};
});

const sign = (opts) => fx.signPdf(pki.unsigned, { signer: pki.leaf, chain: [pki.sub], ...opts });
const verify = (buf) => verifyPdfSignatures(buf, { trust: pki.trust });

test('hợp lệ: chuỗi tới gốc tin cậy, phủ hết file, thời điểm ký do người ký khai', async () => {
	const r = await verify(await sign());
	assert.equal(r.verdict, 'valid', JSON.stringify(r));
	assert.equal(r.signatures.length, 1);
	const s = r.signatures[0];
	assert.equal(s.kind, 'signature');
	assert.equal(s.sub_filter, 'adbe.pkcs7.detached');
	assert.equal(s.integrity, true);
	assert.equal(s.covers_whole_file, true);
	assert.equal(s.chain, 'trusted');
	assert.equal(s.cert_valid_at_signing, true);
	assert.equal(s.time_source, 'claimed');
	assert.equal(s.revocation, 'unknown');
	assert.ok(s.signed_at);
	assert.deepEqual(s.signer, {
		cn: 'NGUYỄN VĂN AN',
		o: 'Bệnh viện Đa khoa Tỉnh Bắc Ninh',
		serial: new X509Certificate(pki.leaf.der).serialNumber.toUpperCase(),
		issuer_cn: 'Test Sub CA',
	});
});

test('sửa 1 byte trong vùng đã ký ⇒ invalid (băm không khớp)', async () => {
	const buf = await sign();
	const at = buf.indexOf('/MediaBox [ 0 0 300 200 ]');
	assert.ok(at > 0);
	buf.write('301', at + '/MediaBox [ 0 0 '.length, 'latin1');
	const r = await verify(buf);
	assert.equal(r.verdict, 'invalid');
	assert.equal(r.signatures[0].integrity, false);
	assert.ok(r.warnings.includes('digest_mismatch'));
});

test('thêm bản cập nhật tăng dần sau khi ký ⇒ modified', async () => {
	const signed = await sign();
	// Ghi đè luồng nội dung trang (đối tượng có sẵn) bằng nội dung khác
	const objNo = signed
		.toString('latin1')
		.match(/(\d+) 0 obj\s*<<[^>]*\/Length \d+[^>]*>>\s*stream/)[1];
	const body = `${objNo} 0 obj\n<< /Length 18 >>\nstream\nBT /F1 12 Tf ET\nendstream\nendobj\n`;
	const r = await verify(fx.appendUpdate(signed, body));
	assert.equal(r.verdict, 'modified');
	assert.equal(r.signatures[0].integrity, true);
	assert.equal(r.signatures[0].covers_whole_file, false);
	assert.ok(r.warnings.includes('modified_after_signing'));
});

test('bản cập nhật chỉ thêm /DSS (dữ liệu kiểm chứng) ⇒ vẫn valid, đọc CRL trong DSS', async () => {
	const signed = await sign();
	const s = signed.toString('latin1');
	const cat = s.match(
		/(\d+ 0) obj\s*<<((?:(?!endobj)[\s\S])*?\/Type \/Catalog(?:(?!endobj)[\s\S])*?)>>\s*endobj/,
	);
	const crl = Buffer.from((await fx.makeCrl(pki.sub)).toSchema().toBER(false));
	const body =
		`${cat[1]} obj\n<<${cat[2]}/DSS 150 0 R\n>>\nendobj\n` +
		`150 0 obj\n<< /CRLs [ 151 0 R ] /Certs [ 152 0 R ] >>\nendobj\n` +
		`151 0 obj\n<< /Length ${crl.length} >>\nstream\n${crl.toString('latin1')}\nendstream\nendobj\n` +
		`152 0 obj\n<< /Length ${pki.sub.der.length} >>\nstream\n${pki.sub.der.toString('latin1')}\nendstream\nendobj\n`;
	const r = await verify(fx.appendUpdate(signed, body));
	assert.equal(r.verdict, 'valid', JSON.stringify(r.warnings));
	assert.ok(r.warnings.includes('updated_after_signing_ltv'));
	assert.equal(r.signatures[0].revocation, 'good');
});

test('CA lạ ⇒ untrusted; thiếu chứng thư trung gian ⇒ chain incomplete', async () => {
	const r = await verify(
		await fx.signPdf(pki.unsigned, { signer: pki.stranger, chain: [pki.strangerRoot] }),
	);
	assert.equal(r.verdict, 'untrusted');
	assert.equal(r.signatures[0].integrity, true);
	assert.equal(r.signatures[0].chain, 'untrusted');
	assert.ok(r.warnings.includes('untrusted_root'));

	const r2 = await verify(await sign({ chain: [] }));
	assert.equal(r2.verdict, 'untrusted');
	assert.equal(r2.signatures[0].chain, 'incomplete');
	// Bộ CA có sẵn chứng thư trung gian thì nối được dù file không nhúng
	const withSub = createTrustStore({ roots: [pki.root.pem], intermediates: [pki.sub.pem] });
	const r3 = await verifyPdfSignatures(await sign({ chain: [] }), { trust: withSub });
	assert.equal(r3.verdict, 'valid');
});

test('chứng thư hết hạn tại thời điểm ký ⇒ invalid', async () => {
	const r = await verify(await sign({ signer: pki.old }));
	assert.equal(r.verdict, 'invalid');
	assert.equal(r.signatures[0].integrity, true);
	assert.equal(r.signatures[0].cert_valid_at_signing, false);
	assert.ok(r.warnings.includes('cert_not_valid_at_signing'));
});

test('dấu thời gian RFC 3161 của TSA tin cậy: chứng thư nay đã hết hạn nhưng còn hạn lúc ký ⇒ valid', async () => {
	const genTime = new Date('2019-06-01T03:00:00Z');
	const r = await verify(
		await sign({ signer: pki.old, signingTime: null, tsa: { ...pki.tsa, genTime } }),
	);
	assert.equal(r.verdict, 'valid', JSON.stringify(r.warnings));
	assert.equal(r.signatures[0].time_source, 'tsa');
	assert.equal(r.signatures[0].signed_at, genTime.toISOString());
	assert.equal(r.signatures[0].cert_valid_at_signing, true);
});

test('token không nhúng chứng thư TSA: tìm trong bộ CA, không có thì cảnh báo', async () => {
	const genTime = new Date('2019-06-01T03:00:00Z');
	const buf = await sign({
		signer: pki.old,
		signingTime: null,
		tsa: { ...pki.tsa, genTime, embedCert: false },
	});
	const r = await verify(buf);
	assert.ok(r.warnings.includes('timestamp_signer_missing'), JSON.stringify(r.warnings));
	assert.equal(r.signatures[0].time_source, 'claimed'); // rơi về /M của PDF

	const trust = createTrustStore({ roots: [pki.root.pem], intermediates: [pki.tsa.pem] });
	const r2 = await verifyPdfSignatures(buf, { trust });
	assert.equal(r2.verdict, 'valid', JSON.stringify(r2.warnings));
	assert.equal(r2.signatures[0].time_source, 'tsa');
});

test('dấu thời gian của TSA lạ ⇒ không tin, dùng signingTime (claimed)', async () => {
	const r = await verify(await sign({ tsa: { ...pki.strangerTsa, genTime: new Date() } }));
	assert.equal(r.verdict, 'valid');
	assert.equal(r.signatures[0].time_source, 'claimed');
	assert.ok(r.warnings.includes('timestamp_untrusted'));
});

test('thu hồi: CRL nhúng (revocationInfoArchival) ghi thu hồi trước lúc ký ⇒ invalid; OCSP good ⇒ good', async () => {
	const crl = await fx.makeCrl(pki.sub, {
		revoked: [{ cert: pki.leaf, at: new Date(Date.now() - fx.day) }],
	});
	const r = await verify(await sign({ crls: [crl] }));
	assert.equal(r.verdict, 'invalid');
	assert.equal(r.signatures[0].revocation, 'revoked');
	assert.ok(r.warnings.includes('cert_revoked'));

	const ocsp = await fx.makeOcspGood(pki.leaf, pki.sub);
	const r2 = await verify(await sign({ ocsps: [ocsp] }));
	assert.equal(r2.verdict, 'valid');
	assert.equal(r2.signatures[0].revocation, 'good');

	// CRL do CA khác ký không được tin
	const fake = await fx.makeCrl(pki.strangerRoot, {
		revoked: [{ cert: pki.leaf, at: new Date(Date.now() - fx.day) }],
	});
	const r3 = await verify(await sign({ crls: [fake] }));
	assert.equal(r3.signatures[0].revocation, 'unknown');
});

test('dấu thời gian tài liệu (DocTimeStamp): kiểm messageImprint trên vùng ByteRange', async () => {
	const unsigned = await fx.makeUnsignedPdf({ docTimeStamp: true });
	const genTime = new Date('2026-01-02T03:04:05Z');
	const buf = await fx.timestampPdf(unsigned, pki.tsa, genTime);
	// Token chỉ nhúng chứng thư TSA ⇒ thiếu CA trung gian; bộ CA có sẵn thì nối được
	assert.equal((await verify(buf)).signatures[0].chain, 'incomplete');
	const trust = createTrustStore({ roots: [pki.root.pem], intermediates: [pki.sub.pem] });
	const r = await verifyPdfSignatures(buf, { trust });
	assert.equal(r.verdict, 'valid', JSON.stringify(r.warnings));
	const s = r.signatures[0];
	assert.equal(s.kind, 'timestamp');
	assert.equal(s.sub_filter, 'ETSI.RFC3161');
	assert.equal(s.time_source, 'tsa');
	assert.equal(s.signed_at, genTime.toISOString());
	assert.equal(s.signer.cn, 'Test TSA');

	buf.write('301', buf.indexOf('/MediaBox [ 0 0 300 200 ]') + '/MediaBox [ 0 0 '.length, 'latin1');
	const r2 = await verifyPdfSignatures(buf, { trust });
	assert.equal(r2.verdict, 'invalid');
	assert.ok(r2.warnings.includes('timestamp_imprint_mismatch'));
});

test('PDF không có chữ ký ⇒ none', async () => {
	const r = await verify(await fx.makeUnsignedPdf({ withSignatureField: false }));
	assert.deepEqual(r, { verdict: 'none', warnings: [], signatures: [] });
});

test('file hỏng / không phải PDF / có mật khẩu: không ném lỗi', async () => {
	assert.equal((await verify(Buffer.from('không phải pdf'))).verdict, 'none');
	assert.deepEqual((await verify(Buffer.alloc(0))).warnings, ['pdf_unreadable']);
	// @ts-ignore cố ý truyền sai kiểu
	assert.equal((await verify(null)).verdict, 'none');

	// /Contents bị hỏng (không còn là CMS) ⇒ invalid
	const buf = await sign();
	const at = buf.indexOf('/Contents <') + '/Contents <'.length;
	buf.write('ffff', at, 'latin1');
	const r = await verify(buf);
	assert.equal(r.verdict, 'invalid');
	assert.ok(r.warnings.includes('signature_malformed'));

	// Cắt cụt file ⇒ ByteRange vượt quá file ⇒ invalid
	const cut = (await sign()).subarray(0, 4000);
	assert.equal((await verify(cut)).verdict, 'invalid');

	// PDF có /Encrypt trong trailer ⇒ cảnh báo, vẫn chạy
	const enc = Buffer.from(
		(await fx.makeUnsignedPdf({ withSignatureField: false }))
			.toString('latin1')
			.replace('trailer\n<<', 'trailer\n<< /Encrypt 99 0 R'),
		'latin1',
	);
	const r2 = await verify(enc);
	assert.equal(r2.verdict, 'none');
	assert.ok(r2.warnings.includes('pdf_encrypted'));
});

test('matchSignerOrganization: so mờ tên tổ chức người ký với tên đơn vị', () => {
	const signer = { cn: 'NGUYỄN VĂN AN', o: 'BENH VIEN DA KHOA TINH BAC NINH' };
	assert.equal(matchSignerOrganization(signer, 'Bệnh viện Đa khoa tỉnh Bắc Ninh'), true);
	assert.equal(matchSignerOrganization(signer, 'Benh vien Da khoa tinh Bac Nlnh'), true); // gõ sai 1 ký tự
	assert.equal(matchSignerOrganization(signer, 'Bệnh viện Bạch Mai'), false);
	// Chứng thư của tổ chức: tên ở CN; đơn vị ghi kèm cấp trên
	assert.equal(
		matchSignerOrganization({ cn: 'Sở Y tế Hà Nội', o: null }, 'Bệnh viện X - Sở Y tế Hà Nội'),
		true,
	);
	assert.equal(matchSignerOrganization(signer, ''), null);
	assert.equal(matchSignerOrganization(null, 'Bệnh viện Bạch Mai'), null);
});

test('bộ CA mặc định: đủ 9 gốc + 34 trung gian, README ghi đúng vân tay, nạp một lần', () => {
	const store = loadTrustStore();
	assert.equal(store, loadTrustStore());
	assert.equal(store.roots.length, 9);
	assert.equal(store.intermediates.length, 34);
	const readme = fs.readFileSync(path.join(DEFAULT_DIR, 'README.md'), 'utf8');
	for (const sub of ['roots', 'intermediates']) {
		for (const f of fs.readdirSync(path.join(DEFAULT_DIR, sub))) {
			const x = new X509Certificate(fs.readFileSync(path.join(DEFAULT_DIR, sub, f)));
			const fp = x.fingerprint256.replace(/:/g, '');
			assert.ok(
				readme.includes(`\`${sub}/${f}\``) && readme.includes(fp),
				`${sub}/${f} thiếu trong README`,
			);
			if (sub === 'roots') assert.ok(x.checkIssued(x) && x.verify(x.publicKey), `${f} không tự ký`);
			else
				assert.ok(
					store.roots.some((r) => x.checkIssued(r) && x.verify(r.publicKey)),
					`${f} không nối được tới gốc`,
				);
		}
	}
});
