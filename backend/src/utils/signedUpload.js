// URL có chữ ký cho file trong /uploads (kiểu S3 presigned URL).
//
// File được mở bằng <a href>/<img src> nên không gắn được header Bearer —
// thay vào đó mọi đường dẫn /uploads/... trong response API được ký HMAC kèm
// hạn dùng. Kiểm tra quyền nằm ở API trả về đường dẫn (ai xem được danh sách
// file mới nhận được link); /uploads chỉ phục vụ khi chữ ký hợp lệ và còn hạn.
// Link lộ ra ngoài chỉ dùng được tới khi hết hạn, không còn vĩnh viễn như trước.
//
// Hạn dùng được làm tròn theo khung TTL để cùng một file cho ra cùng một URL
// trong suốt khung đó (trình duyệt cache được ảnh, React không re-render vô
// ích). Link luôn còn sống ít nhất TTL và tối đa 2×TTL.
const crypto = require('crypto');
const { keyFor } = require('./keys');

const TTL_SEC = Number(process.env.UPLOAD_URL_TTL_SEC) || 4 * 60 * 60;

// Không đặt UPLOAD_URL_SECRET thì dùng khoá dẫn xuất riêng (utils/keys.js), không
// dùng thẳng JWT_SECRET — chữ ký link file không được trùng khoá với token khác.
const secret = () => process.env.UPLOAD_URL_SECRET || keyFor('upload-url');

const hmac = (pathname, exp) =>
	crypto.createHmac('sha256', secret()).update(`${pathname}\n${exp}`).digest('base64url');

// pathname dạng "/uploads/topics/<id>/<file>" (đã bỏ query cũ nếu có).
const signPath = (pathname) => {
	const now = Math.floor(Date.now() / 1000);
	const exp = (Math.floor(now / TTL_SEC) + 2) * TTL_SEC;
	return `${pathname}?exp=${exp}&sig=${hmac(pathname, exp)}`;
};

// "/uploads/..." ở đầu chuỗi (file_url) hoặc trong src="/uploads/..." của HTML
// nhận xét. Query cũ (chữ ký hết hạn lỡ bị lưu lại) bị thay bằng chữ ký mới.
const WHOLE = /^(\/uploads\/[^?#\s"'<>]+)(\?[^#\s"'<>]*)?$/;
const IN_HTML = /(["'])(\/uploads\/[^?#\s"'<>]+)(\?[^#\s"'<>]*)?\1/g;

const signString = (s) => {
	const m = WHOLE.exec(s);
	if (m) return signPath(m[1]);
	if (!s.includes('/uploads/')) return s;
	return s.replace(IN_HTML, (_all, q, p) => `${q}${signPath(p)}${q}`);
};

const signDeep = (value) => {
	if (typeof value === 'string') return signString(value);
	if (Array.isArray(value)) return value.map(signDeep);
	if (value && typeof value === 'object' && !(value instanceof Date) && !Buffer.isBuffer(value)) {
		const out = {};
		for (const k of Object.keys(value)) out[k] = signDeep(value[k]);
		return out;
	}
	return value;
};

// Gắn trước các route API: ký mọi đường dẫn /uploads trong body JSON trả về.
const signUploadUrlsInJson = (_req, res, next) => {
	const json = res.json.bind(res);
	res.json = (body) => json(signDeep(body));
	next();
};

// Gắn trước express.static('/uploads'). req.path ở đây đã bỏ tiền tố mount.
const verifyUploadSignature = (req, res, next) => {
	const exp = Number(req.query.exp);
	const sig = typeof req.query.sig === 'string' ? req.query.sig : '';
	const now = Math.floor(Date.now() / 1000);
	if (!Number.isInteger(exp) || exp < now || exp > now + 2 * TTL_SEC || !sig) {
		return res
			.status(403)
			.json({ success: false, message: 'Link tải file không hợp lệ hoặc đã hết hạn' });
	}
	// Ký trên đường dẫn đúng như lưu trong DB; trình duyệt có thể percent-encode.
	let pathname;
	try {
		pathname = `/uploads${decodeURIComponent(req.path)}`;
	} catch {
		return res.status(400).end();
	}
	const expected = Buffer.from(hmac(pathname, exp));
	const given = Buffer.from(sig);
	if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
		return res
			.status(403)
			.json({ success: false, message: 'Link tải file không hợp lệ hoặc đã hết hạn' });
	}
	// Link có hạn — không để proxy/CDN dùng chung cache, trình duyệt cache tới lúc hết hạn.
	res.set('Cache-Control', `private, max-age=${exp - now}`);
	next();
};

// Bỏ chữ ký khỏi src="/uploads/...?exp=..&sig=.." trước khi lưu HTML vào DB.
const stripUploadSignatures = (html) =>
	html && html.replace(IN_HTML, (_all, q, p) => `${q}${p}${q}`);

module.exports = {
	signPath,
	signUploadUrlsInJson,
	verifyUploadSignature,
	stripUploadSignatures,
};
