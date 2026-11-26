// Đọc và kiểm chữ ký CMS/PKCS#7 (RFC 5652) và dấu thời gian RFC 3161. File thuần, đồng bộ:
// pkijs/asn1js chỉ dùng để giải mã ASN.1; băm và kiểm chữ ký bằng node:crypto.
const crypto = require('crypto');
const asn1js = require('asn1js');
const pkijs = require('pkijs');

const OID = {
	signedData: '1.2.840.113549.1.7.2',
	tstInfo: '1.2.840.113549.1.9.16.1.4',
	messageDigest: '1.2.840.113549.1.9.4',
	signingTime: '1.2.840.113549.1.9.5',
	timeStampToken: '1.2.840.113549.1.9.16.2.14',
	revocationInfoArchival: '1.2.840.113583.1.1.8',
	ocspResponseRevInfo: '1.3.6.1.5.5.7.16.2',
	ocspBasic: '1.3.6.1.5.5.7.48.1.1',
	subjectKeyIdentifier: '2.5.29.14',
};

const HASH_BY_OID = {
	'1.3.14.3.2.26': 'sha1',
	'2.16.840.1.101.3.4.2.4': 'sha224',
	'2.16.840.1.101.3.4.2.1': 'sha256',
	'2.16.840.1.101.3.4.2.2': 'sha384',
	'2.16.840.1.101.3.4.2.3': 'sha512',
};
// Thuật toán chữ ký đã gắn sẵn hàm băm (RSA PKCS#1 v1.5 và ECDSA)
const SIG_HASH = {
	'1.2.840.113549.1.1.5': 'sha1',
	'1.2.840.113549.1.1.14': 'sha224',
	'1.2.840.113549.1.1.11': 'sha256',
	'1.2.840.113549.1.1.12': 'sha384',
	'1.2.840.113549.1.1.13': 'sha512',
	'1.2.840.10045.4.1': 'sha1',
	'1.2.840.10045.4.3.1': 'sha224',
	'1.2.840.10045.4.3.2': 'sha256',
	'1.2.840.10045.4.3.3': 'sha384',
	'1.2.840.10045.4.3.4': 'sha512',
};
const RSA_ENCRYPTION = '1.2.840.113549.1.1.1';
const RSA_PSS = '1.2.840.113549.1.1.10';
const EC_PUBLIC_KEY = '1.2.840.10045.2.1';

const bytes = (/** @type {ArrayBufferView | ArrayBuffer} */ v) =>
	Buffer.from(
		v instanceof ArrayBuffer
			? new Uint8Array(v)
			: new Uint8Array(v.buffer, v.byteOffset, v.byteLength),
	);

/** Nội dung OCTET STRING (kể cả dạng constructed của BER). */
const octets = (/** @type {any} */ os) =>
	os?.idBlock?.isConstructed
		? Buffer.concat((os.valueBlock.value ?? []).map(octets))
		: bytes(os.valueBlock.valueHexView);

/** Giải mã DER → đối tượng asn1js; lỗi thì ném. */
const parseDer = (/** @type {Buffer} */ der) => {
	const r = asn1js.fromBER(new Uint8Array(der));
	if (r.offset === -1) throw new Error('asn1_decode_failed');
	return r.result;
};

/** Byte DER của một phần tử asn1js như trong file gốc. */
const rawOf = (/** @type {any} */ node) =>
	bytes(node.valueBeforeDecodeView?.byteLength ? node.valueBeforeDecodeView : node.toBER(false));

const hashOf = (/** @type {string} */ oid) => HASH_BY_OID[oid] ?? null;

/**
 * Kiểm một chữ ký thô.
 * @param {pkijs.AlgorithmIdentifier} sigAlg
 * @param {string | null} digestOid hàm băm dùng khi sigAlg không gắn sẵn (rsaEncryption, ecPublicKey)
 * @param {crypto.KeyObject} publicKey
 * @param {Buffer} data
 * @param {Buffer} signature
 * @returns {'ok' | 'bad' | 'unsupported'}
 */
function verifyRaw(sigAlg, digestOid, publicKey, data, signature) {
	const oid = sigAlg.algorithmId;
	let hash = SIG_HASH[oid] ?? null;
	/** @type {crypto.VerifyKeyObjectInput | crypto.VerifyPublicKeyInput | crypto.KeyObject} */
	let key = publicKey;
	if (oid === RSA_ENCRYPTION || oid === EC_PUBLIC_KEY) hash = digestOid ? hashOf(digestOid) : null;
	else if (oid === RSA_PSS) {
		const p = sigAlg.algorithmParams
			? new pkijs.RSASSAPSSParams({ schema: sigAlg.algorithmParams })
			: new pkijs.RSASSAPSSParams();
		hash = hashOf(p.hashAlgorithm.algorithmId);
		key = {
			key: publicKey,
			padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
			saltLength: p.saltLength,
		};
	}
	if (!hash) return 'unsupported';
	try {
		return crypto.verify(hash, data, key, signature) ? 'ok' : 'bad';
	} catch {
		return 'bad';
	}
}

/**
 * Giải mã ContentInfo chứa SignedData. Phần thừa phía sau (số 0 đệm trong /Contents) được bỏ qua.
 * @param {Buffer} der
 */
function parseSignedData(der) {
	const ci = new pkijs.ContentInfo({ schema: parseDer(der) });
	if (ci.contentType !== OID.signedData) throw new Error('not_signed_data');
	return new pkijs.SignedData({ schema: ci.content });
}

/**
 * Chứng thư nhúng trong SignedData, kèm bản X509Certificate của node:crypto.
 * @param {pkijs.SignedData} sd
 * @returns {Array<{ pki: pkijs.Certificate, x509: crypto.X509Certificate }>}
 */
function embeddedCerts(sd) {
	const out = [];
	for (const c of sd.certificates ?? []) {
		if (!(c instanceof pkijs.Certificate)) continue;
		try {
			out.push({ pki: c, x509: new crypto.X509Certificate(bytes(c.toSchema(false).toBER(false))) });
		} catch {
			/* chứng thư hỏng — bỏ qua */
		}
	}
	return out;
}

/** pkijs.Certificate từ X509Certificate (để so tên / khóa theo cấu trúc ASN.1). */
const toPki = (/** @type {crypto.X509Certificate} */ x) =>
	new pkijs.Certificate({ schema: parseDer(x.raw) });

/**
 * Tìm chứng thư người ký theo sid (issuerAndSerialNumber hoặc subjectKeyIdentifier).
 * @param {pkijs.SignerInfo} si
 * @param {Array<{ pki: pkijs.Certificate, x509: crypto.X509Certificate }>} certs
 */
function findSignerCert(si, certs) {
	const sid = si.sid;
	if (sid instanceof pkijs.IssuerAndSerialNumber) {
		return (
			certs.find(
				(c) => c.pki.serialNumber.isEqual(sid.serialNumber) && c.pki.issuer.isEqual(sid.issuer),
			) ?? null
		);
	}
	const ski = sid?.valueBlock?.valueHexView ? bytes(sid.valueBlock.valueHexView) : null;
	if (!ski) return null;
	return (
		certs.find((c) => {
			const ext = (c.pki.extensions ?? []).find((e) => e.extnID === OID.subjectKeyIdentifier);
			return ext && octets(ext.parsedValue ?? parseDer(octets(ext.extnValue))).equals(ski);
		}) ?? null
	);
}

const attrValue = (/** @type {pkijs.SignedAndUnsignedAttributes | undefined} */ attrs, oid) =>
	attrs?.attributes?.find((a) => a.type === oid)?.values?.[0] ?? null;

/**
 * Kiểm toàn vẹn một SignerInfo: messageDigest khớp băm nội dung, chữ ký đúng khóa người ký.
 * @param {pkijs.SignerInfo} si
 * @param {Buffer} content nội dung được ký (vùng ByteRange, hoặc eContent nếu có)
 * @param {crypto.X509Certificate} signerCert
 * @returns {{ ok: boolean, reason: string | null }}
 */
function verifySignerInfo(si, content, signerCert) {
	const digestOid = si.digestAlgorithm.algorithmId;
	const hash = hashOf(digestOid);
	if (!hash) return { ok: false, reason: 'unsupported_algorithm' };
	let signed = content;
	if (si.signedAttrs) {
		const md = attrValue(si.signedAttrs, OID.messageDigest);
		const digest = crypto.createHash(hash).update(content).digest();
		if (!md || !octets(md).equals(digest)) return { ok: false, reason: 'digest_mismatch' };
		// Chữ ký tính trên DER của SET OF thuộc tính — đổi thẻ [0] IMPLICIT thành SET (0x31)
		signed = bytes(si.signedAttrs.encodedValue);
		signed[0] = 0x31;
	}
	const r = verifyRaw(
		si.signatureAlgorithm,
		digestOid,
		signerCert.publicKey,
		signed,
		octets(si.signature),
	);
	if (r === 'unsupported') return { ok: false, reason: 'unsupported_algorithm' };
	return r === 'ok' ? { ok: true, reason: null } : { ok: false, reason: 'bad_signature' };
}

/** signingTime (thời điểm người ký tự khai) hoặc null. */
function signingTime(/** @type {pkijs.SignerInfo} */ si) {
	const v = attrValue(si.signedAttrs, OID.signingTime);
	try {
		const d = v?.toDate?.();
		return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
	} catch {
		return null;
	}
}

/**
 * Đọc và kiểm một TimeStampToken (RFC 3161).
 * @param {any} contentInfoSchema asn1js của ContentInfo
 * @param {Buffer | null} imprintData dữ liệu mà dấu thời gian phải đóng (giá trị chữ ký, hoặc vùng
 *   ByteRange với dấu thời gian tài liệu)
 * @param {crypto.X509Certificate[]} [extraCerts] nơi tìm thêm chứng thư TSA khi token không nhúng
 *   (chứng thư trong file, bộ CA)
 * @returns {{ ok: boolean, reason: string | null, genTime: Date | null, signerCert: crypto.X509Certificate | null, certs: crypto.X509Certificate[], sd: pkijs.SignedData | null }}
 */
function verifyTimeStampToken(contentInfoSchema, imprintData, extraCerts = []) {
	const fail = (reason, extra = {}) => ({
		ok: false,
		reason,
		genTime: null,
		signerCert: null,
		certs: [],
		sd: null,
		...extra,
	});
	try {
		const ci = new pkijs.ContentInfo({ schema: contentInfoSchema });
		if (ci.contentType !== OID.signedData) return fail('timestamp_malformed');
		const sd = new pkijs.SignedData({ schema: ci.content });
		if (sd.encapContentInfo.eContentType !== OID.tstInfo || !sd.encapContentInfo.eContent)
			return fail('timestamp_malformed');
		const eContent = octets(sd.encapContentInfo.eContent);
		const tst = new pkijs.TSTInfo({ schema: parseDer(eContent) });
		const certs = embeddedCerts(sd);
		const genTime = tst.genTime instanceof Date ? tst.genTime : null;
		const base = { genTime, certs: certs.map((c) => c.x509), sd };
		const imprintHash = hashOf(tst.messageImprint.hashAlgorithm.algorithmId);
		if (!imprintHash) return fail('timestamp_unsupported_algorithm', base);
		if (
			imprintData &&
			!crypto
				.createHash(imprintHash)
				.update(imprintData)
				.digest()
				.equals(octets(tst.messageImprint.hashedMessage))
		)
			return fail('timestamp_imprint_mismatch', base);
		const si = sd.signerInfos[0];
		const extra = () =>
			extraCerts.flatMap((x) => {
				try {
					return [{ pki: toPki(x), x509: x }];
				} catch {
					return [];
				}
			});
		const signer = si && (findSignerCert(si, certs) ?? findSignerCert(si, extra()));
		if (!signer) return fail('timestamp_signer_missing', base);
		const v = verifySignerInfo(si, eContent, signer.x509);
		if (!v.ok) return fail('timestamp_invalid', { ...base, signerCert: signer.x509 });
		return { ok: true, reason: null, ...base, signerCert: signer.x509 };
	} catch {
		return fail('timestamp_malformed');
	}
}

/**
 * Thông tin thu hồi nhúng sẵn trong CMS: thuộc tính adbe-revocationInfoArchival và trường crls của
 * SignedData. Trả về DER của từng OCSPResponse / CRL.
 * @param {pkijs.SignedData} sd
 * @param {pkijs.SignerInfo} si
 * @returns {{ ocsps: Buffer[], crls: Buffer[] }}
 */
function embeddedRevocation(sd, si) {
	const ocsps = [];
	const crls = [];
	const archival = attrValue(si.signedAttrs, OID.revocationInfoArchival);
	for (const tagged of archival?.valueBlock?.value ?? []) {
		const list = tagged.valueBlock?.value?.[0]?.valueBlock?.value ?? [];
		const n = tagged.idBlock?.tagNumber;
		for (const item of list) {
			if (n === 0) crls.push(rawOf(item));
			else if (n === 1) ocsps.push(rawOf(item));
		}
	}
	for (const c of sd.crls ?? []) {
		try {
			if (c instanceof pkijs.CertificateRevocationList)
				crls.push(bytes(c.toSchema(false).toBER(false)));
			else if (
				c instanceof pkijs.OtherRevocationInfoFormat &&
				c.otherRevInfoFormat === OID.ocspResponseRevInfo
			)
				ocsps.push(rawOf(c.otherRevInfo));
		} catch {
			/* bỏ qua mục hỏng */
		}
	}
	return { ocsps, crls };
}

/**
 * Tên người ký từ chứng thư: CN, O, số serial (hex in hoa), CN của bên cấp.
 * @param {crypto.X509Certificate} x
 */
function describeSigner(x) {
	const pick = (/** @type {pkijs.RelativeDistinguishedNames} */ name, oid) => {
		const tv = name.typesAndValues.find((t) => t.type === oid);
		const v = tv?.value?.valueBlock?.value;
		return typeof v === 'string' && v.trim() ? v.trim() : null;
	};
	const pki = toPki(x);
	return {
		cn: pick(pki.subject, '2.5.4.3'),
		o: pick(pki.subject, '2.5.4.10'),
		serial: x.serialNumber.toUpperCase(),
		issuer_cn: pick(pki.issuer, '2.5.4.3'),
	};
}

module.exports = {
	OID,
	bytes,
	octets,
	parseDer,
	rawOf,
	hashOf,
	verifyRaw,
	parseSignedData,
	embeddedCerts,
	toPki,
	findSignerCert,
	attrValue,
	verifySignerInfo,
	signingTime,
	verifyTimeStampToken,
	embeddedRevocation,
	describeSigner,
};
