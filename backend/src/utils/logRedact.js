// Che dữ liệu nhạy cảm trước khi ghi log — dùng chung cho nhật ký hoạt động
// (middlewares/activityLogger.js), log lỗi (middlewares/errorHandler.js) và
// script che lại log cũ (scripts/redact-activity-logs.js).
//
// Hai loại cần che:
//   - Bí mật xác thực: mật khẩu, token, mã OTP / mã 2FA / mã khôi phục, vé SSE,
//     chữ ký link file, mã vé / link QR hội nghị (nằm ngay trên đường dẫn).
//   - Dữ liệu cá nhân (Nghị định 13/2023/NĐ-CP): số CCCD/CMND, ngày sinh, số
//     điện thoại, thông tin liên hệ dùng để tra cứu.
// Log vẫn giữ tên trường (biết request có gửi gì) nhưng không giữ giá trị.

const HIDDEN = '[hidden]';

// Khớp ở BẤT KỲ đâu trong tên trường (vd new_password, pre_auth_token,
// mentor_phone, national_id_number, date_of_birth).
const SENSITIVE_PART =
	/pass|token|secret|otp|authorization|cookie|ticket|national_id|cccd|cmnd|phone|birth/i;
// Khớp CẢ tên trường — chữ chung chung, so khớp một phần sẽ che nhầm (course_code,
// role_code, contact_person...).
const SENSITIVE_EXACT = /^(code|backup_code|recovery_code|dob|contact|sig)$/i;

const isSensitiveKey = (key) => SENSITIVE_PART.test(key) || SENSITIVE_EXACT.test(key);

const MAX_DEPTH = 6;

const redact = (value, depth = 0) => {
	if (value == null || typeof value !== 'object') return value;
	if (depth >= MAX_DEPTH) return '[…]';
	if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
	const clean = {};
	for (const [key, v] of Object.entries(value)) {
		clean[key] = isSensitiveKey(key) ? HIDDEN : redact(v, depth + 1);
	}
	return clean;
};

// Đoạn đường dẫn là mã bí mật: mã vé / token QR hội nghị (32 hex), link đăng
// ký theo đợt (/topic-rounds/by-token/<token>). Biết mã là xem / làm bài thay
// được, nên không để lại trong log.
const SECRET_SEGMENT = /^[a-f0-9]{32,}$/i;
const SECRET_AFTER = new Set(['by-token']);

const redactPathname = (pathname) =>
	pathname
		.split('/')
		.map((seg, i, all) =>
			SECRET_SEGMENT.test(seg) || (i > 0 && SECRET_AFTER.has(all[i - 1]) && seg) ? HIDDEN : seg,
		)
		.join('/');

// Cổng công khai: mọi tham số tra cứu đều là dữ liệu người dân tự nhập (CCCD,
// họ tên, ngày sinh, SĐT/email...) ⇒ che hết, chỉ giữ tên tham số.
const isPublicPortal = (pathname) => /\/api\/v1\/public\//.test(pathname);

const redactQuery = (query, hideAll) => {
	if (!query) return '';
	const parts = query.split('&').map((pair) => {
		if (!pair) return pair;
		const eq = pair.indexOf('=');
		const rawKey = eq < 0 ? pair : pair.slice(0, eq);
		let key = rawKey;
		try {
			key = decodeURIComponent(rawKey.replace(/\+/g, ' '));
		} catch {
			// giữ nguyên tên trường hỏng mã hóa
		}
		if (eq < 0) return pair;
		return hideAll || isSensitiveKey(key) ? `${rawKey}=${HIDDEN}` : pair;
	});
	return `?${parts.join('&')}`;
};

// URL tương đối (/api/v1/...?a=b) hoặc tuyệt đối (http://host/...) — che đoạn
// đường dẫn là mã bí mật và giá trị tham số nhạy cảm. Không phải chuỗi thì trả nguyên.
const redactUrl = (url) => {
	if (typeof url !== 'string' || !url) return url;
	const hashAt = url.indexOf('#');
	const noHash = hashAt < 0 ? url : url.slice(0, hashAt);
	const qAt = noHash.indexOf('?');
	const head = qAt < 0 ? noHash : noHash.slice(0, qAt);
	const query = qAt < 0 ? '' : noHash.slice(qAt + 1);
	// Giữ nguyên scheme://host của URL tuyệt đối (referer)
	const m = /^([a-z][a-z0-9+.-]*:\/\/[^/]*)(.*)$/i.exec(head);
	const origin = m ? m[1] : '';
	const pathname = m ? m[2] : head;
	return `${origin}${redactPathname(pathname)}${redactQuery(query, isPublicPortal(pathname))}`;
};

// req.params: che tham số có tên nhạy cảm (:token, :code) hoặc giá trị là mã bí mật.
const redactParams = (params) => {
	if (!params || typeof params !== 'object') return params;
	const out = {};
	for (const [k, v] of Object.entries(params)) {
		out[k] = isSensitiveKey(k) || (typeof v === 'string' && SECRET_SEGMENT.test(v)) ? HIDDEN : v;
	}
	return out;
};

// Che lại 1 dòng nhật ký hoạt động đã ghi (định dạng của activityLogger):
// path, referer, params, body (chuỗi JSON). Trả bản sao đã che.
const redactActivityRecord = (record) => {
	if (!record || typeof record !== 'object') return record;
	const out = { ...record };
	if (typeof out.path === 'string') out.path = redactUrl(out.path);
	if (typeof out.referer === 'string') out.referer = redactUrl(out.referer);
	if (out.params && typeof out.params === 'object') out.params = redactParams(out.params);
	if (typeof out.body === 'string' && out.body) {
		try {
			out.body = JSON.stringify(redact(JSON.parse(out.body)));
		} catch {
			// body bị cắt ngắn (…) nên không parse được — che theo mẫu "khóa":"giá trị"
			out.body = out.body.replace(/"([^"\\]{1,100})":("(?:[^"\\]|\\.)*"|-?[\d.]+)/g, (all, k) =>
				isSensitiveKey(k) ? `"${k}":"${HIDDEN}"` : all,
			);
		}
	}
	return out;
};

module.exports = { HIDDEN, isSensitiveKey, redact, redactUrl, redactParams, redactActivityRecord };
