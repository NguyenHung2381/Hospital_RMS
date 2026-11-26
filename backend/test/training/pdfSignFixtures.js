// Dựng fixture cho test chữ ký số PDF: tự tạo CA / chứng thư (pkijs + WebCrypto), PDF có ô chữ ký
// (pdf-lib), ký CMS detached, dấu thời gian RFC 3161, CRL, OCSP. Không có file ký thật trong repo.
const crypto = require('crypto');
const asn1js = require('asn1js');
const pkijs = require('pkijs');
const { PDFDocument, PDFName, PDFHexString, PDFString, StandardFonts } = require('pdf-lib');

const SHA256 = '2.16.840.1.101.3.4.2.1';
const SIG_PLACEHOLDER_BYTES = 16384;
const BR_PLACEHOLDER = '/ByteRange [ 0 9999999999 9999999999 9999999999 ]';

let serialSeq = 1000;
const ab = (/** @type {Buffer} */ b) => new Uint8Array(b);
const sha256 = (/** @type {Buffer | Uint8Array} */ b) =>
	crypto.createHash('sha256').update(b).digest();
const day = 86400e3;

const name = (fields) => {
	const n = new pkijs.RelativeDistinguishedNames();
	for (const [type, value] of fields)
		n.typesAndValues.push(
			new pkijs.AttributeTypeAndValue({ type, value: new asn1js.Utf8String({ value }) }),
		);
	return n;
};

/**
 * Tạo chứng thư. issuer = { cert, keys } của CA cấp; không có thì tự ký.
 * @returns {Promise<{ cert: pkijs.Certificate, keys: CryptoKeyPair, der: Buffer, pem: string }>}
 */
async function makeCert({
	cn,
	o = 'Đơn vị thử nghiệm',
	issuer = null,
	ca = false,
	notBefore = new Date(Date.now() - 365 * day),
	notAfter = new Date(Date.now() + 365 * day),
	eku = null,
}) {
	const keys = await crypto.subtle.generateKey(
		{
			name: 'RSASSA-PKCS1-v1_5',
			modulusLength: 2048,
			publicExponent: new Uint8Array([1, 0, 1]),
			hash: 'SHA-256',
		},
		true,
		['sign', 'verify'],
	);
	const cert = new pkijs.Certificate();
	cert.version = 2;
	cert.serialNumber = new asn1js.Integer({ value: serialSeq++ });
	cert.subject = name([
		['2.5.4.6', 'VN'],
		['2.5.4.10', o],
		['2.5.4.3', cn],
	]);
	cert.issuer = issuer ? issuer.cert.subject : cert.subject;
	cert.notBefore.value = notBefore;
	cert.notAfter.value = notAfter;
	cert.extensions = [];
	if (ca) {
		const bc = new pkijs.BasicConstraints({ cA: true });
		cert.extensions.push(
			new pkijs.Extension({
				extnID: '2.5.29.19',
				critical: true,
				extnValue: bc.toSchema().toBER(false),
				parsedValue: bc,
			}),
		);
	}
	if (eku) {
		const e = new pkijs.ExtKeyUsage({ keyPurposes: eku });
		cert.extensions.push(
			new pkijs.Extension({
				extnID: '2.5.29.37',
				critical: true,
				extnValue: e.toSchema().toBER(false),
				parsedValue: e,
			}),
		);
	}
	await cert.subjectPublicKeyInfo.importKey(keys.publicKey);
	await cert.sign((issuer ?? { keys }).keys.privateKey, 'SHA-256');
	const der = Buffer.from(cert.toSchema(true).toBER(false));
	return { cert, keys, der, pem: new crypto.X509Certificate(der).toString() };
}

/** PDF 1 trang có ô chữ ký trống (placeholder /ByteRange + /Contents toàn số 0). */
async function makeUnsignedPdf({ withSignatureField = true, docTimeStamp = false } = {}) {
	const doc = await PDFDocument.create();
	const page = doc.addPage([300, 200]);
	page.drawText('Ho so dang ky khoa dao tao', {
		x: 20,
		y: 150,
		size: 12,
		font: await doc.embedFont(StandardFonts.Helvetica),
	});
	if (withSignatureField) {
		const sigRef = doc.context.register(
			doc.context.obj({
				Type: docTimeStamp ? 'DocTimeStamp' : 'Sig',
				Filter: 'Adobe.PPKLite',
				SubFilter: docTimeStamp ? 'ETSI.RFC3161' : 'adbe.pkcs7.detached',
				ByteRange: [0, 9999999999, 9999999999, 9999999999],
				Contents: PDFHexString.of('0'.repeat(SIG_PLACEHOLDER_BYTES * 2)),
				M: PDFString.fromDate(new Date()),
			}),
		);
		const widgetRef = doc.context.register(
			doc.context.obj({
				Type: 'Annot',
				Subtype: 'Widget',
				FT: 'Sig',
				Rect: [0, 0, 0, 0],
				V: sigRef,
				T: PDFString.of('Sig1'),
				F: 4,
				P: page.ref,
			}),
		);
		page.node.set(PDFName.of('Annots'), doc.context.obj([widgetRef]));
		doc.catalog.set(
			PDFName.of('AcroForm'),
			doc.context.register(doc.context.obj({ Fields: [widgetRef], SigFlags: 3 })),
		);
	}
	return Buffer.from(await doc.save({ useObjectStreams: false }));
}

const attr = (type, value) => new pkijs.Attribute({ type, values: [value] });

/** TimeStampToken (ContentInfo asn1js) đóng dấu `data` lúc genTime. */
async function makeTimeStampToken(data, tsa, genTime) {
	const tst = new pkijs.TSTInfo({
		version: 1,
		policy: '1.3.6.1.4.1.99999.1',
		messageImprint: new pkijs.MessageImprint({
			hashAlgorithm: new pkijs.AlgorithmIdentifier({ algorithmId: SHA256 }),
			hashedMessage: new asn1js.OctetString({ valueHex: ab(sha256(data)) }),
		}),
		serialNumber: new asn1js.Integer({ value: serialSeq++ }),
		genTime,
	});
	const eContent = Buffer.from(tst.toSchema().toBER(false));
	const sd = new pkijs.SignedData({
		version: 3,
		encapContentInfo: new pkijs.EncapsulatedContentInfo({
			eContentType: '1.2.840.113549.1.9.16.1.4',
			eContent: new asn1js.OctetString({ valueHex: ab(eContent) }),
		}),
		signerInfos: [
			new pkijs.SignerInfo({
				version: 1,
				sid: new pkijs.IssuerAndSerialNumber({
					issuer: tsa.cert.issuer,
					serialNumber: tsa.cert.serialNumber,
				}),
				signedAttrs: new pkijs.SignedAndUnsignedAttributes({
					type: 0,
					attributes: [
						attr(
							'1.2.840.113549.1.9.3',
							new asn1js.ObjectIdentifier({ value: '1.2.840.113549.1.9.16.1.4' }),
						),
						attr(
							'1.2.840.113549.1.9.4',
							new asn1js.OctetString({ valueHex: ab(sha256(eContent)) }),
						),
					],
				}),
			}),
		],
		certificates: [tsa.cert],
	});
	await sd.sign(tsa.keys.privateKey, 0, 'SHA-256');
	return new pkijs.ContentInfo({
		contentType: '1.2.840.113549.1.7.2',
		content: sd.toSchema(true),
	}).toSchema();
}

/** CRL do issuer ký; revoked = [{ cert: <kết quả makeCert>, at }]. */
async function makeCrl(
	issuer,
	{ revoked = [], thisUpdate = new Date(), nextUpdate = new Date(Date.now() + 7 * day) } = {},
) {
	const crl = new pkijs.CertificateRevocationList({
		version: 1,
		issuer: issuer.cert.subject,
		thisUpdate: new pkijs.Time({ type: 0, value: thisUpdate }),
		nextUpdate: new pkijs.Time({ type: 0, value: nextUpdate }),
	});
	if (revoked.length)
		crl.revokedCertificates = revoked.map(
			(r) =>
				new pkijs.RevokedCertificate({
					userCertificate: new asn1js.Integer({
						value: r.cert.cert.serialNumber.valueBlock.valueDec,
					}),
					revocationDate: new pkijs.Time({ type: 0, value: r.at }),
				}),
		);
	await crl.sign(issuer.keys.privateKey, 'SHA-256');
	return crl;
}

/** OCSPResponse "good" cho leaf, do chính CA cấp ký. */
async function makeOcspGood(leaf, issuer) {
	const basic = new pkijs.BasicOCSPResponse();
	basic.tbsResponseData.responderID = issuer.cert.subject;
	basic.tbsResponseData.producedAt = new Date();
	const certID = new pkijs.CertID();
	await certID.createForCertificate(leaf.cert, {
		hashAlgorithm: 'SHA-1',
		issuerCertificate: issuer.cert,
	});
	basic.tbsResponseData.responses.push(
		new pkijs.SingleResponse({
			certID,
			certStatus: new asn1js.Primitive({
				idBlock: { tagClass: 3, tagNumber: 0 },
				lenBlockLength: 1,
			}),
			thisUpdate: new Date(),
		}),
	);
	await basic.sign(issuer.keys.privateKey, 'SHA-256');
	return new pkijs.OCSPResponse({
		responseStatus: new asn1js.Enumerated({ value: 0 }),
		responseBytes: new pkijs.ResponseBytes({
			responseType: '1.3.6.1.5.5.7.48.1.1',
			response: new asn1js.OctetString({ valueHex: basic.toSchema().toBER(false) }),
		}),
	});
}

/**
 * Ký PDF có placeholder. chain = chứng thư nhúng thêm (CA trung gian…).
 * @param {Buffer} unsigned
 * @param {{ signer: any, chain?: any[], signingTime?: Date | null, tsa?: { cert: any, keys: any, genTime: Date } | null, crls?: any[], ocsps?: any[] }} opts
 */
async function signPdf(
	unsigned,
	{ signer, chain = [], signingTime = new Date(), tsa = null, crls = [], ocsps = [] },
) {
	const { out, data, cStart } = fillByteRange(unsigned);

	const attrs = [
		attr('1.2.840.113549.1.9.3', new asn1js.ObjectIdentifier({ value: '1.2.840.113549.1.7.1' })),
		attr('1.2.840.113549.1.9.4', new asn1js.OctetString({ valueHex: ab(sha256(data)) })),
	];
	if (signingTime)
		attrs.push(attr('1.2.840.113549.1.9.5', new asn1js.UTCTime({ valueDate: signingTime })));
	if (crls.length || ocsps.length) {
		const tagged = (n, items) =>
			new asn1js.Constructed({
				idBlock: { tagClass: 3, tagNumber: n },
				value: [new asn1js.Sequence({ value: items.map((i) => i.toSchema()) })],
			});
		const parts = [];
		if (crls.length) parts.push(tagged(0, crls));
		if (ocsps.length) parts.push(tagged(1, ocsps));
		attrs.push(attr('1.2.840.113583.1.1.8', new asn1js.Sequence({ value: parts })));
	}
	const sd = new pkijs.SignedData({
		version: 1,
		encapContentInfo: new pkijs.EncapsulatedContentInfo({ eContentType: '1.2.840.113549.1.7.1' }),
		signerInfos: [
			new pkijs.SignerInfo({
				version: 1,
				sid: new pkijs.IssuerAndSerialNumber({
					issuer: signer.cert.issuer,
					serialNumber: signer.cert.serialNumber,
				}),
				signedAttrs: new pkijs.SignedAndUnsignedAttributes({ type: 0, attributes: attrs }),
			}),
		],
		certificates: [signer.cert, ...chain.map((c) => c.cert)],
	});
	await sd.sign(signer.keys.privateKey, 0, 'SHA-256', ab(data));
	if (tsa) {
		const sigValue = Buffer.from(sd.signerInfos[0].signature.valueBlock.valueHexView);
		const token = await makeTimeStampToken(sigValue, tsa, tsa.genTime);
		sd.signerInfos[0].unsignedAttrs = new pkijs.SignedAndUnsignedAttributes({
			type: 1,
			attributes: [attr('1.2.840.113549.1.9.16.2.14', token)],
		});
	}
	const der = Buffer.from(
		new pkijs.ContentInfo({ contentType: '1.2.840.113549.1.7.2', content: sd.toSchema(true) })
			.toSchema()
			.toBER(false),
	);
	return writeContents(out, cStart, der);
}

/** Điền /ByteRange thật vào placeholder; trả bản sao file + dữ liệu được ký. */
function fillByteRange(/** @type {Buffer} */ unsigned) {
	const s = unsigned.toString('latin1');
	const brAt = s.indexOf(BR_PLACEHOLDER);
	const cStart = s.indexOf('<' + '0'.repeat(64), brAt > 0 ? s.lastIndexOf('obj', brAt) : 0);
	const cEnd = s.indexOf('>', cStart) + 1;
	const br = [0, cStart, cEnd, unsigned.length - cEnd];
	const out = Buffer.from(unsigned);
	out.write(`/ByteRange [${br.join(' ')}]`.padEnd(BR_PLACEHOLDER.length, ' '), brAt, 'latin1');
	return { out, cStart, data: Buffer.concat([out.subarray(0, cStart), out.subarray(cEnd)]) };
}

function writeContents(/** @type {Buffer} */ out, cStart, /** @type {Buffer} */ der) {
	if (der.length > SIG_PLACEHOLDER_BYTES) throw new Error('chữ ký lớn hơn chỗ chừa sẵn');
	out.write(der.toString('hex').padEnd(SIG_PLACEHOLDER_BYTES * 2, '0'), cStart + 1, 'latin1');
	return out;
}

/** Đóng dấu thời gian tài liệu (DocTimeStamp, ETSI.RFC3161) lên PDF có placeholder tương ứng. */
async function timestampPdf(unsigned, tsa, genTime = new Date()) {
	const { out, data, cStart } = fillByteRange(unsigned);
	const token = await makeTimeStampToken(data, tsa, genTime);
	return writeContents(out, cStart, Buffer.from(token.toBER(false)));
}

/** Nối một bản cập nhật tăng dần (chữ thô) vào cuối file. */
const appendUpdate = (/** @type {Buffer} */ pdf, /** @type {string} */ body) => {
	const prev = Number(pdf.toString('latin1').match(/startxref\s+(\d+)\s+%%EOF\s*$/)?.[1] ?? 0);
	const root = pdf.toString('latin1').match(/\/Root\s+(\d+\s+\d+\s+R)/)?.[1];
	const xrefAt = pdf.length + body.length + 1;
	const tail = `\n${body}xref\n0 1\n0000000000 65535 f \ntrailer\n<< /Size 200 /Root ${root} /Prev ${prev} >>\nstartxref\n${xrefAt}\n%%EOF\n`;
	return Buffer.concat([pdf, Buffer.from(tail, 'latin1')]);
};

module.exports = {
	makeCert,
	makeUnsignedPdf,
	signPdf,
	timestampPdf,
	makeCrl,
	makeOcspGood,
	makeTimeStampToken,
	appendUpdate,
	day,
};
