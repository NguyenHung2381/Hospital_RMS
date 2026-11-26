// Bộ chứng thư gốc tin cậy để kiểm chữ ký số trên PDF (xem src/assets/trust/README.md).
// File thuần: chỉ đọc đĩa lúc nạp lần đầu, nạp một lần cho mỗi tiến trình (cache theo thư mục).
const fs = require('fs');
const path = require('path');
const { X509Certificate } = require('crypto');

const DEFAULT_DIR = path.join(__dirname, '../../../../../assets/trust');

/**
 * @typedef {object} TrustStore
 * @property {X509Certificate[]} roots điểm tin cậy (chứng thư gốc)
 * @property {X509Certificate[]} intermediates CA trung gian — chỉ để nối chuỗi, không phải điểm tin cậy
 * @property {(cert: X509Certificate) => boolean} isRoot cùng chứng thư, hoặc cùng tên + khóa công khai với một gốc
 */

/** Tách mọi khối PEM CERTIFICATE trong chữ → mảng DER. Không có khối PEM thì coi cả đầu vào là DER. */
const splitCerts = (/** @type {Buffer | string} */ input) => {
	const text = Buffer.isBuffer(input) ? input.toString('latin1') : input;
	const blocks = [
		...text.matchAll(/-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/g),
	];
	if (blocks.length) return blocks.map((m) => Buffer.from(m[1].replace(/\s+/g, ''), 'base64'));
	return Buffer.isBuffer(input) ? [input] : [];
};

/** @param {X509Certificate | Buffer | string} c */
const toCerts = (c) =>
	c instanceof X509Certificate ? [c] : splitCerts(c).map((d) => new X509Certificate(d));

const spkiOf = (/** @type {X509Certificate} */ c) =>
	c.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');

/**
 * Dựng bộ CA từ danh sách chứng thư (PEM, DER hoặc X509Certificate). Dùng trong test hoặc khi cần
 * bộ CA riêng.
 * @param {{ roots?: Array<X509Certificate | Buffer | string>, intermediates?: Array<X509Certificate | Buffer | string> }} input
 * @returns {TrustStore}
 */
function createTrustStore({ roots = [], intermediates = [] } = {}) {
	const r = roots.flatMap(toCerts);
	const i = intermediates.flatMap(toCerts);
	const fingerprints = new Set(r.map((c) => c.fingerprint256));
	const bySubject = new Map(r.map((c) => [c.subject, spkiOf(c)]));
	return Object.freeze({
		roots: r,
		intermediates: i,
		isRoot: (cert) =>
			fingerprints.has(cert.fingerprint256) ||
			(bySubject.has(cert.subject) && bySubject.get(cert.subject) === spkiOf(cert)),
	});
}

const readDir = (/** @type {string} */ dir) =>
	fs.existsSync(dir)
		? fs
				.readdirSync(dir)
				.filter((f) => /\.(crt|cer|der)$/i.test(f))
				.sort()
				.map((f) => fs.readFileSync(path.join(dir, f)))
		: [];

/** @type {Map<string, TrustStore>} */
const cache = new Map();

/**
 * Nạp bộ CA từ thư mục (mặc định src/assets/trust): `roots/` và `intermediates/`. Nạp một lần mỗi
 * tiến trình; gọi lại trả bản đã nạp.
 * @param {string} [dir]
 * @returns {TrustStore}
 */
function loadTrustStore(dir = DEFAULT_DIR) {
	const key = path.resolve(dir);
	let store = cache.get(key);
	if (!store) {
		store = createTrustStore({
			roots: readDir(path.join(key, 'roots')),
			intermediates: readDir(path.join(key, 'intermediates')),
		});
		cache.set(key, store);
	}
	return store;
}

module.exports = { createTrustStore, loadTrustStore, splitCerts, DEFAULT_DIR };
