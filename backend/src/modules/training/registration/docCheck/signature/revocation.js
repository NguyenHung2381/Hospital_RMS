// Tình trạng thu hồi chứng thư người ký — CHỈ đọc OCSP/CRL nhúng sẵn trong file (CMS
// revocationInfoArchival, SignedData.crls, DSS của PDF). Không gọi mạng. File thuần, đồng bộ.
const crypto = require('crypto');
const pkijs = require('pkijs');
const { OID, bytes, octets, parseDer, hashOf, verifyRaw, toPki } = require('./cms');
const { issuedBy } = require('./chain');

const OCSP_SIGNING = '1.3.6.1.5.5.7.3.9';
// Thông tin "chưa thu hồi" lấy trước lúc ký tối đa ngần này vẫn được coi là phủ thời điểm ký
const FRESH_MS = 24 * 3600 * 1000;

/** @typedef {'good' | 'revoked' | 'unknown'} RevocationStatus */

/** EKU của chứng thư (Node 24: extKeyUsage; bản cũ: keyUsage). */
const extKeyUsage = (/** @type {any} */ x) => x.extKeyUsage ?? x.keyUsage ?? [];

/** Thông tin phát hành lúc thisUpdate (hạn tới nextUpdate) có phủ thời điểm at không. */
const covers = (/** @type {Date} */ thisUpdate, /** @type {Date | undefined} */ nextUpdate, at) =>
	thisUpdate.getTime() >= at.getTime() - FRESH_MS ||
	(nextUpdate instanceof Date && nextUpdate.getTime() >= at.getTime());

/**
 * @param {Buffer} der OCSPResponse
 * @param {{ leafPki: pkijs.Certificate, issuer: crypto.X509Certificate, issuerPki: pkijs.Certificate, at: Date }} ctx
 * @returns {RevocationStatus | null} null = phản hồi không dùng được / không nói về chứng thư này
 */
function fromOcsp(der, { leafPki, issuer, issuerPki, at }) {
	const resp = new pkijs.OCSPResponse({ schema: parseDer(der) });
	if (resp.responseStatus.valueBlock.valueDec !== 0 || !resp.responseBytes) return null;
	if (resp.responseBytes.responseType !== OID.ocspBasic) return null;
	const basic = new pkijs.BasicOCSPResponse({
		schema: parseDer(octets(resp.responseBytes.response)),
	});
	const tbs = bytes(basic.tbsResponseData.tbsView);
	const sig = octets(basic.signature);
	// Người ký phản hồi: chính CA cấp, hoặc chứng thư OCSP được CA đó ủy quyền (EKU OCSPSigning)
	const delegated = (basic.certs ?? [])
		.map((c) => {
			try {
				return new crypto.X509Certificate(bytes(c.toSchema(false).toBER(false)));
			} catch {
				return null;
			}
		})
		.filter((x) => x && issuedBy(x, issuer) && extKeyUsage(x).includes(OCSP_SIGNING));
	const signedOk = [issuer, ...delegated].some(
		(k) => verifyRaw(basic.signatureAlgorithm, null, k.publicKey, tbs, sig) === 'ok',
	);
	if (!signedOk) return null;
	for (const sr of basic.tbsResponseData.responses ?? []) {
		if (!sr.certID.serialNumber.isEqual(leafPki.serialNumber)) continue;
		const h = hashOf(sr.certID.hashAlgorithm.algorithmId);
		if (!h) continue;
		const keyHash = crypto
			.createHash(h)
			.update(bytes(issuerPki.subjectPublicKeyInfo.subjectPublicKey.valueBlock.valueHexView))
			.digest();
		if (!keyHash.equals(octets(sr.certID.issuerKeyHash))) continue;
		const tag = sr.certStatus?.idBlock?.tagNumber;
		if (tag === 1) {
			const revokedAt = sr.certStatus.valueBlock?.value?.[0]?.toDate?.();
			if (!(revokedAt instanceof Date) || revokedAt.getTime() <= at.getTime()) return 'revoked';
			return 'good'; // thu hồi sau thời điểm ký
		}
		if (tag === 0 && covers(sr.thisUpdate, sr.nextUpdate, at)) return 'good';
		return null;
	}
	return null;
}

/**
 * @param {Buffer} der CRL
 * @param {{ leafPki: pkijs.Certificate, issuer: crypto.X509Certificate, at: Date }} ctx
 * @returns {RevocationStatus | null}
 */
function fromCrl(der, { leafPki, issuer, at }) {
	const crl = new pkijs.CertificateRevocationList({ schema: parseDer(der) });
	if (!crl.issuer.isEqual(leafPki.issuer)) return null;
	const ok = verifyRaw(
		crl.signatureAlgorithm,
		null,
		issuer.publicKey,
		bytes(crl.tbsView),
		octets(crl.signatureValue),
	);
	if (ok !== 'ok') return null;
	const hit = (crl.revokedCertificates ?? []).find((r) =>
		r.userCertificate.isEqual(leafPki.serialNumber),
	);
	if (hit) return hit.revocationDate.value.getTime() <= at.getTime() ? 'revoked' : 'good';
	return covers(crl.thisUpdate.value, crl.nextUpdate?.value, at) ? 'good' : null;
}

/**
 * Tình trạng thu hồi của chứng thư người ký tại thời điểm ký.
 * @param {{ leaf: crypto.X509Certificate, issuer: crypto.X509Certificate | null, at: Date | null, ocsps: Buffer[], crls: Buffer[] }} input
 * @returns {{ status: RevocationStatus, source: 'ocsp' | 'crl' | null }}
 */
function checkRevocation({ leaf, issuer, at, ocsps, crls }) {
	if (!issuer || (!ocsps.length && !crls.length)) return { status: 'unknown', source: null };
	const when = at ?? new Date();
	let leafPki;
	let issuerPki;
	try {
		leafPki = toPki(leaf);
		issuerPki = toPki(issuer);
	} catch {
		return { status: 'unknown', source: null };
	}
	/** @type {{ status: RevocationStatus, source: 'ocsp' | 'crl' | null }} */
	let result = { status: 'unknown', source: null };
	const consider = (
		/** @type {RevocationStatus | null} */ s,
		/** @type {'ocsp' | 'crl'} */ source,
	) => {
		if (s === 'revoked') result = { status: 'revoked', source };
		else if (s === 'good' && result.status === 'unknown') result = { status: 'good', source };
	};
	for (const der of ocsps) {
		try {
			consider(fromOcsp(der, { leafPki, issuer, issuerPki, at: when }), 'ocsp');
		} catch {
			/* phản hồi hỏng — bỏ qua */
		}
	}
	for (const der of crls) {
		try {
			consider(fromCrl(der, { leafPki, issuer, at: when }), 'crl');
		} catch {
			/* CRL hỏng — bỏ qua */
		}
	}
	return result;
}

module.exports = { checkRevocation };
