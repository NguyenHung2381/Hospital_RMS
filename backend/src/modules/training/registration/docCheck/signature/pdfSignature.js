// Xác thực chữ ký số trong file PDF (PAdES / adbe.pkcs7) — module thuần, không gọi mạng, không
// ghi đĩa. Chỉ để CẢNH BÁO người duyệt: kết quả không tự từ chối hồ sơ. Không lưu chữ trong file.
//
//   const { verifyPdfSignatures } = require('./signature/pdfSignature');
//   const r = await verifyPdfSignatures(buffer);           // bộ CA mặc định (src/assets/trust)
//   const r = await verifyPdfSignatures(buffer, { trust }); // bộ CA riêng (createTrustStore)
//
// Với mỗi chữ ký: toàn vẹn (băm vùng ByteRange khớp messageDigest + chữ ký CMS đúng), ByteRange có
// phủ hết file không, chuỗi chứng thư tới gốc tin cậy, hiệu lực chứng thư tại thời điểm ký (ưu tiên
// dấu thời gian RFC 3161, không có thì signingTime → 'claimed'), thu hồi (chỉ OCSP/CRL nhúng sẵn).
// Không bao giờ ném lỗi: file hỏng / có mật khẩu → verdict 'none' hoặc 'invalid' kèm cảnh báo.
const crypto = require('crypto');
const { normalize, fuzzyHas } = require('../docCheckRules');
const { loadTrustStore } = require('./trustStore');
const { buildChain, validAt } = require('./chain');
const { checkRevocation } = require('./revocation');
const cms = require('./cms');
const pdf = require('./pdfBytes');

/**
 * @typedef {'valid' | 'invalid' | 'modified' | 'untrusted' | 'none'} Verdict
 *   valid      mọi chữ ký nguyên vẹn, chuỗi tới gốc tin cậy, chứng thư còn hạn & chưa thu hồi lúc ký
 *   invalid    có chữ ký hỏng (nội dung bị sửa trong vùng ký, sai chữ ký), chứng thư hết hạn hoặc
 *              bị thu hồi tại thời điểm ký
 *   modified   chữ ký nguyên vẹn nhưng file có thêm nội dung sau khi ký (bản cập nhật tăng dần)
 *   untrusted  chữ ký nguyên vẹn nhưng chứng thư không nối được tới gốc tin cậy
 *   none       không có chữ ký số (hoặc không phải PDF đọc được)
 *
 * @typedef {object} SignatureResult
 * @property {'signature' | 'timestamp'} kind timestamp = dấu thời gian tài liệu (DocTimeStamp)
 * @property {string | null} sub_filter vd adbe.pkcs7.detached, ETSI.CAdES.detached
 * @property {boolean} covers_whole_file
 * @property {boolean} integrity
 * @property {'trusted' | 'untrusted' | 'incomplete'} chain
 * @property {boolean | null} cert_valid_at_signing null = không biết thời điểm ký
 * @property {'tsa' | 'claimed' | null} time_source
 * @property {'good' | 'revoked' | 'unknown'} revocation
 * @property {{ cn: string | null, o: string | null, serial: string, issuer_cn: string | null } | null} signer
 * @property {string | null} signed_at ISO 8601
 * @property {string[]} warnings
 *
 * @typedef {object} PdfSignatureResult
 * @property {Verdict} verdict
 * @property {string[]} warnings mã cảnh báo (gộp của cả file và từng chữ ký, không trùng)
 * @property {SignatureResult[]} signatures
 */

/** @param {SignatureResult} s */
const statusOf = (s) => {
	if (!s.integrity || s.revocation === 'revoked' || s.cert_valid_at_signing === false)
		return 'invalid';
	return s.chain === 'trusted' ? 'valid' : 'untrusted';
};

const toX509 = (/** @type {Buffer} */ der) => {
	try {
		return new crypto.X509Certificate(der);
	} catch {
		return null;
	}
};

/**
 * Chuỗi, hiệu lực lúc ký, thu hồi — dùng chung cho chữ ký và dấu thời gian tài liệu.
 * @param {SignatureResult} sig
 * @param {crypto.X509Certificate} leaf
 * @param {crypto.X509Certificate[]} pool
 * @param {Date | null} at
 * @param {{ ocsps: Buffer[], crls: Buffer[] }} rev
 * @param {import('./trustStore').TrustStore} trust
 */
function assessCert(sig, leaf, pool, at, rev, trust) {
	const w = sig.warnings;
	sig.signer = cms.describeSigner(leaf);
	const chain = buildChain(leaf, pool, trust);
	sig.chain = chain.status;
	if (chain.status === 'incomplete') w.push('chain_incomplete');
	else if (chain.status === 'untrusted') w.push('untrusted_root');
	if (at) {
		sig.cert_valid_at_signing = chain.path.every((c) => validAt(c, at));
		if (!sig.cert_valid_at_signing) w.push('cert_not_valid_at_signing');
	} else w.push('no_signing_time');
	const r = checkRevocation({ leaf, issuer: chain.path[1] ?? null, at, ...rev });
	sig.revocation = r.status;
	if (r.status === 'revoked') w.push('cert_revoked');
}

/**
 * @param {import('./pdfBytes').SignatureField} f
 * @param {{ trust: import('./trustStore').TrustStore, dss: { certs: Buffer[], ocsps: Buffer[], crls: Buffer[] } | null, dssCerts: Array<{ pki: any, x509: crypto.X509Certificate }> }} ctx
 * @returns {SignatureResult}
 */
function verifyField(f, { trust, dss, dssCerts }) {
	/** @type {string[]} */
	const w = [];
	const timestamp = f.docTimeStamp || f.subFilter === 'ETSI.RFC3161';
	/** @type {SignatureResult} */
	const sig = {
		kind: timestamp ? 'timestamp' : 'signature',
		sub_filter: f.subFilter,
		covers_whole_file: f.coversToEnd,
		integrity: false,
		chain: 'incomplete',
		cert_valid_at_signing: null,
		time_source: null,
		revocation: 'unknown',
		signer: null,
		signed_at: null,
		warnings: w,
	};
	if (!f.signedData || !f.contents) {
		w.push('signature_malformed');
		return sig;
	}
	if (f.byteRange[0] !== 0) w.push('byterange_not_from_start');
	const dssX509 = dssCerts.map((c) => c.x509);
	const dssRev = { ocsps: dss?.ocsps ?? [], crls: dss?.crls ?? [] };

	if (timestamp) {
		const ts = cms.verifyTimeStampToken(cms.parseDer(f.contents), f.signedData, [
			...dssX509,
			...trust.intermediates,
		]);
		if (!ts.signerCert) {
			w.push(ts.reason ?? 'timestamp_malformed');
			return sig;
		}
		sig.integrity = ts.ok;
		if (!ts.ok) w.push(ts.reason);
		sig.signed_at = ts.genTime?.toISOString() ?? null;
		sig.time_source = ts.genTime ? 'tsa' : null;
		const emb = ts.sd.signerInfos[0] ? cms.embeddedRevocation(ts.sd, ts.sd.signerInfos[0]) : null;
		assessCert(
			sig,
			ts.signerCert,
			[...ts.certs, ...dssX509],
			ts.genTime,
			{
				ocsps: [...(emb?.ocsps ?? []), ...dssRev.ocsps],
				crls: [...(emb?.crls ?? []), ...dssRev.crls],
			},
			trust,
		);
		return sig;
	}

	const sd = cms.parseSignedData(f.contents);
	const si = sd.signerInfos?.[0];
	if (!si) {
		w.push('signature_malformed');
		return sig;
	}
	if (sd.signerInfos.length > 1) w.push('multiple_signer_infos');
	const certs = cms.embeddedCerts(sd);
	const signer = cms.findSignerCert(si, [...certs, ...dssCerts]);
	if (!signer) {
		w.push('signer_cert_missing');
		return sig;
	}

	// adbe.pkcs7.sha1: nội dung được ký là SHA-1 của vùng ByteRange, nằm trong eContent
	let content = f.signedData;
	const ec = sd.encapContentInfo?.eContent;
	if (ec) {
		const inner = cms.octets(ec);
		if (!crypto.createHash('sha1').update(f.signedData).digest().equals(inner)) {
			w.push('digest_mismatch');
			sig.signer = cms.describeSigner(signer.x509);
			return sig;
		}
		content = inner;
	}
	const v = cms.verifySignerInfo(si, content, signer.x509);
	sig.integrity = v.ok;
	if (!v.ok) w.push(v.reason);

	// Thời điểm ký: dấu thời gian RFC 3161 của TSA tin cậy; không thì thời điểm người ký tự khai
	/** @type {Date | null} */
	let at = null;
	const pool = [...certs.map((c) => c.x509), ...dssX509];
	const token = cms.attrValue(si.unsignedAttrs, cms.OID.timeStampToken);
	if (token) {
		const ts = cms.verifyTimeStampToken(token, cms.octets(si.signature), [
			...pool,
			...trust.intermediates,
		]);
		if (!ts.ok) w.push(ts.reason);
		else if (
			buildChain(ts.signerCert, [...ts.certs, ...pool], trust).status === 'trusted' &&
			validAt(ts.signerCert, ts.genTime)
		) {
			at = ts.genTime;
			sig.time_source = 'tsa';
		} else w.push('timestamp_untrusted');
	}
	if (!at) {
		at = cms.signingTime(si) ?? f.pdfTime;
		if (at) sig.time_source = 'claimed';
	}
	sig.signed_at = at ? at.toISOString() : null;

	const emb = cms.embeddedRevocation(sd, si);
	assessCert(
		sig,
		signer.x509,
		pool,
		at,
		{
			ocsps: [...emb.ocsps, ...dssRev.ocsps],
			crls: [...emb.crls, ...dssRev.crls],
		},
		trust,
	);
	return sig;
}

/**
 * @param {Buffer} buf
 * @param {import('./trustStore').TrustStore} trust
 * @returns {Promise<PdfSignatureResult>}
 */
async function run(buf, trust) {
	/** @type {Set<string>} */
	const warnings = new Set();
	const done = (/** @type {Verdict} */ verdict, signatures = []) => ({
		verdict,
		warnings: [...warnings, ...signatures.flatMap((s) => s.warnings)].filter(
			(x, i, a) => a.indexOf(x) === i,
		),
		signatures,
	});
	if (!Buffer.isBuffer(buf) || !pdf.isPdf(buf)) {
		warnings.add('pdf_unreadable');
		return done('none');
	}
	if (pdf.isEncrypted(buf.toString('latin1'))) warnings.add('pdf_encrypted');
	const { fields, malformed } = pdf.findSignatureFields(buf);
	if (malformed) warnings.add('signature_malformed');
	if (!fields.length) return done(malformed ? 'invalid' : 'none');

	let dss = null;
	try {
		dss = await pdf.readDss(buf);
	} catch {
		warnings.add('dss_unreadable');
	}
	const dssCerts = (dss?.certs ?? [])
		.map(toX509)
		.filter(Boolean)
		.flatMap((x509) => {
			try {
				return [{ pki: cms.toPki(x509), x509 }];
			} catch {
				return [];
			}
		});

	/** @type {SignatureResult[]} */
	const signatures = fields.map((f) => {
		try {
			return verifyField(f, { trust, dss, dssCerts });
		} catch {
			return /** @type {SignatureResult} */ ({
				kind: 'signature',
				sub_filter: f.subFilter,
				covers_whole_file: f.coversToEnd,
				integrity: false,
				chain: 'incomplete',
				cert_valid_at_signing: null,
				time_source: null,
				revocation: 'unknown',
				signer: null,
				signed_at: null,
				warnings: ['signature_malformed'],
			});
		}
	});

	// Nội dung thêm sau chữ ký cuối: chỉ bỏ qua khi trông như chỉ bổ sung dữ liệu kiểm chứng (/DSS)
	let modified = signatures.some((s) => s.warnings.includes('byterange_not_from_start'));
	if (!signatures.some((s) => s.covers_whole_file)) {
		const signedEnd = Math.max(
			...fields.filter((f) => f.signedData).map((f) => f.byteRange[2] + f.byteRange[3]),
			0,
		);
		if (pdf.classifyAppendedUpdate(buf, signedEnd) === 'ltv')
			warnings.add('updated_after_signing_ltv');
		else {
			modified = true;
			warnings.add('modified_after_signing');
		}
	}

	const statuses = signatures.map(statusOf);
	if (malformed || statuses.includes('invalid')) return done('invalid', signatures);
	if (modified) return done('modified', signatures);
	if (statuses.includes('untrusted')) return done('untrusted', signatures);
	return done('valid', signatures);
}

/**
 * Xác thực mọi chữ ký số trong PDF. Không ném lỗi.
 * @param {Buffer} buf nội dung file PDF
 * @param {{ trust?: import('./trustStore').TrustStore }} [opts] trust mặc định: loadTrustStore()
 * @returns {Promise<PdfSignatureResult>}
 */
async function verifyPdfSignatures(buf, { trust } = {}) {
	try {
		return await run(buf, trust ?? loadTrustStore());
	} catch {
		return { verdict: 'invalid', warnings: ['verify_failed'], signatures: [] };
	}
}

/**
 * So mờ tên tổ chức trên chứng thư người ký (O, hoặc CN với chứng thư của tổ chức) với tên đơn vị
 * cho trước. Bỏ dấu, không phân biệt hoa thường, chịu sai ~20% ký tự; khớp cả khi tên trên chứng
 * thư nằm trong tên đơn vị (đơn vị ghi kèm cấp trên) và ngược lại.
 * @param {{ cn?: string | null, o?: string | null } | null | undefined} signer
 * @param {string | null | undefined} unitName
 * @returns {boolean | null} null = thiếu dữ liệu để so
 */
function matchSignerOrganization(signer, unitName) {
	const unit = normalize(unitName);
	const parts = [signer?.o, signer?.cn].map((p) => normalize(p)).filter(Boolean);
	if (!unit || !parts.length) return null;
	const text = parts.join(' ');
	if (fuzzyHas(text, text.split(' '), unit)) return true;
	const unitWords = unit.split(' ');
	return parts.some((p) => p.split(' ').length >= 2 && fuzzyHas(unit, unitWords, p));
}

module.exports = { verifyPdfSignatures, matchSignerOrganization };
