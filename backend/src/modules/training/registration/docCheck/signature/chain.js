// Dựng chuỗi chứng thư từ chứng thư người ký tới một gốc tin cậy. File thuần, không gọi mạng:
// chỉ dùng chứng thư nhúng trong chữ ký / DSS của PDF và bộ CA (trustStore).
const MAX_DEPTH = 8;

/** @typedef {import('crypto').X509Certificate} X509Certificate */
/** @typedef {import('./trustStore').TrustStore} TrustStore */
/** @typedef {'trusted' | 'untrusted' | 'incomplete'} ChainStatus */

const RANK = { trusted: 3, untrusted: 2, incomplete: 1 };

const issuedBy = (/** @type {X509Certificate} */ child, /** @type {X509Certificate} */ parent) => {
	try {
		return child.checkIssued(parent) && child.verify(parent.publicKey);
	} catch {
		return false;
	}
};

/** Gộp, bỏ trùng theo vân tay. */
const uniq = (/** @type {X509Certificate[]} */ certs) => {
	const seen = new Map();
	for (const c of certs) if (c && !seen.has(c.fingerprint256)) seen.set(c.fingerprint256, c);
	return [...seen.values()];
};

/**
 * @param {X509Certificate} leaf
 * @param {X509Certificate[]} pool chứng thư nhúng trong file (CMS, DSS)
 * @param {TrustStore} trust
 * @returns {{ status: ChainStatus, path: X509Certificate[] }} path bắt đầu bằng leaf; trusted thì
 *   phần tử cuối là gốc tin cậy
 */
function buildChain(leaf, pool, trust) {
	const candidates = uniq([...pool, ...trust.intermediates, ...trust.roots]);
	/** @returns {{ status: ChainStatus, path: X509Certificate[] }} */
	const visit = (/** @type {X509Certificate[]} */ path) => {
		const cert = path[path.length - 1];
		if (trust.isRoot(cert)) return { status: 'trusted', path };
		/** @type {{ status: ChainStatus, path: X509Certificate[] }} */
		let best = { status: issuedBy(cert, cert) ? 'untrusted' : 'incomplete', path };
		if (best.status === 'untrusted' || path.length > MAX_DEPTH) return best;
		for (const parent of candidates) {
			if (path.includes(parent) || parent.fingerprint256 === cert.fingerprint256) continue;
			// CA trung gian phải là CA (basicConstraints); gốc tin cậy là điểm neo nên được miễn
			if (!parent.ca && !trust.isRoot(parent)) continue;
			if (!issuedBy(cert, parent)) continue;
			const r = visit([...path, parent]);
			if (r.status === 'trusted') return r;
			if (RANK[r.status] > RANK[best.status]) best = r;
		}
		return best;
	};
	return visit([leaf]);
}

/** Chứng thư còn hiệu lực tại thời điểm t. */
const validAt = (/** @type {X509Certificate} */ c, /** @type {Date} */ t) =>
	new Date(c.validFrom).getTime() <= t.getTime() && t.getTime() <= new Date(c.validTo).getTime();

module.exports = { buildChain, validAt, issuedBy, uniq };
