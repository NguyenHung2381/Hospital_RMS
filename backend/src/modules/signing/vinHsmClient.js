/**
 * vinHsmClient.js — gọi dịch vụ ký số từ xa VIN-HSM (https://vin-hsm.com).
 *
 * Xác thực: tài liệu nhà cung cấp mô tả header "HmacSHA256 ..." nhưng mọi bộ
 * code mẫu (Node aws4-axios, .NET AWS4Signer, Postman "awsv4") đều ký request
 * theo AWS Signature V4 — service "sign", region = vùng máy chủ (hn1, hn4,
 * hn5, hn10...), host sign-<region>.vin-hsm.com. Ở đây ký SigV4 bằng
 * node:crypto, không thêm thư viện.
 *
 * Mọi hàm nhận `cred = { apiKey, secret, region }` (secret đã giải mã) và trả
 * `obj` của phản hồi { status, description, error, obj } khi status = 0; lỗi thì
 * ném VinHsmError (code = mã lỗi của VIN-HSM hoặc HTTP, message tiếng Việt).
 *
 * VIN_HSM_BASE_URL (tuỳ chọn) thay host thật — dùng cho máy chủ giả lập khi test.
 */
const crypto = require('crypto');

const SERVICE = 'sign';
const DEFAULT_TIMEOUT_MS = 60_000;
const REGION_RE = /^[a-z0-9]{1,20}$/;

// Mã lỗi theo tài liệu "Hướng dẫn tích hợp SignServer" v2.7, mục "Mô tả mã lỗi kí số"
const ERROR_MESSAGES = {
	100: 'Trường thông tin đã tồn tại',
	101: 'Không tìm thấy đối tượng',
	102: 'Lỗi không xác định ở máy chủ ký',
	103: 'Sai chữ ký xác thực — kiểm tra lại API key, secret và vùng máy chủ',
	204: 'Tài khoản yêu cầu kích hoạt xác thực nhiều lớp (MFA) ở VIN-HSM',
	205: 'Tài khoản yêu cầu xác thực nhiều lớp (MFA) cho lần ký này',
	1000: 'Dữ liệu chứng thư số không hợp lệ',
	1001: 'Dữ liệu chứng thư số không hợp lệ',
	1002: 'Chứng thư số đã hết hạn',
	1003: 'Dữ liệu đầu vào không hợp lệ',
	2002: 'Không tìm thấy yêu cầu đã tạo',
	2003: 'Thông tin khách hàng tồn tại nhưng không hợp lệ',
	2004: 'Dữ liệu ký hoặc tham số không hợp lệ',
	2005: 'Máy chủ ký không kết nối được tới dịch vụ phía sau',
	2006: 'Máy chủ ký lỗi truy xuất tài nguyên',
	2007: 'Máy chủ ký gặp lỗi nội bộ',
	2008: 'Máy chủ ký lỗi giao tiếp HTTP',
	2009: 'Token không hợp lệ',
	2010: 'Xác thực không thành công — kiểm tra lại API key và secret',
	2011: 'Tài khoản không có quyền dùng chức năng ký này',
	2012: 'Dịch vụ ký số đã hết hạn — liên hệ nhà cung cấp để gia hạn',
	3003: 'Lỗi trong quá trình ký',
	6100: 'Dữ liệu đầu vào không hợp lệ',
	7000: 'Sai mã OTP',
	7003: 'Lỗi gửi OTP qua SMS',
};

class VinHsmError extends Error {
	/**
	 * @param {string} message
	 * @param {{ code?: number|string|null, httpStatus?: number|null, detail?: string|null }} [info]
	 */
	constructor(message, { code = null, httpStatus = null, detail = null } = {}) {
		super(message);
		this.name = 'VinHsmError';
		this.code = code;
		this.httpStatus = httpStatus;
		this.detail = detail;
	}
}

const sha256Hex = (data) => crypto.createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

// RFC 3986: chỉ giữ A-Z a-z 0-9 - _ . ~ ; '/' giữ nguyên trong đường dẫn
const encodePath = (p) =>
	p
		.split('/')
		.map((seg) =>
			encodeURIComponent(seg).replace(
				/[!'()*]/g,
				(c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
			),
		)
		.join('/');

/**
 * Dựng header ký AWS Signature V4 cho 1 request (tách riêng để test với vector cố định).
 * `service` / `payloadHeader` chỉ để test với bộ vector mẫu của AWS (service khác, không có
 * header x-amz-content-sha256); khi gọi VIN-HSM luôn để mặc định.
 * @param {{ method: string, url: URL, body: string, contentType: string, apiKey: string, secret: string,
 *   region: string, now?: Date, service?: string, payloadHeader?: boolean }} p
 * @returns {Record<string, string>}
 */
const signRequest = ({
	method,
	url,
	body,
	contentType,
	apiKey,
	secret,
	region,
	now = new Date(),
	service = SERVICE,
	payloadHeader = true,
}) => {
	const amzDate = now
		.toISOString()
		.replace(/[-:]/g, '')
		.replace(/\.\d{3}/, ''); // yyyyMMddTHHmmssZ
	const dateStamp = amzDate.slice(0, 8);
	const payloadHash = sha256Hex(body);
	/** @type {Record<string, string>} */
	const headers = { 'content-type': contentType, host: url.host, 'x-amz-date': amzDate };
	if (payloadHeader) headers['x-amz-content-sha256'] = payloadHash;
	const names = Object.keys(headers).sort();
	const canonicalHeaders = names.map((n) => `${n}:${String(headers[n]).trim()}\n`).join('');
	const signedHeaders = names.join(';');
	const query = [...url.searchParams.entries()]
		.map(([k, v]) => [encodeURIComponent(k), encodeURIComponent(v)])
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
		.map(([k, v]) => `${k}=${v}`)
		.join('&');
	const canonicalRequest = [
		method,
		encodePath(url.pathname || '/'),
		query,
		canonicalHeaders,
		signedHeaders,
		payloadHash,
	].join('\n');
	const scope = `${dateStamp}/${region}/${service}/aws4_request`;
	const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
	const kDate = hmac(`AWS4${secret}`, dateStamp);
	const kSigning = hmac(hmac(hmac(kDate, region), service), 'aws4_request');
	const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
	/** @type {Record<string, string>} */
	const out = {
		'Content-Type': contentType,
		'X-Amz-Date': amzDate,
		Authorization: `AWS4-HMAC-SHA256 Credential=${apiKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
	};
	if (payloadHeader) out['X-Amz-Content-Sha256'] = payloadHash;
	return out;
};

const baseUrlOf = (region) => {
	const override = process.env.VIN_HSM_BASE_URL;
	if (override) return override.replace(/\/+$/, '');
	return `https://${SERVICE}-${region}.vin-hsm.com`;
};

/**
 * @param {{ apiKey: string, secret: string, region: string }} cred
 */
const assertCred = (cred) => {
	if (!cred?.apiKey || !cred?.secret)
		throw new VinHsmError('Thiếu API key hoặc secret của VIN-HSM');
	if (!REGION_RE.test(String(cred.region || ''))) {
		throw new VinHsmError('Vùng máy chủ VIN-HSM không hợp lệ (vd: hn10)');
	}
};

const messageOf = (code, fallback) =>
	ERROR_MESSAGES[Number(code)] || fallback || `Máy chủ ký trả lỗi (mã ${code})`;

/**
 * Gọi 1 API của VIN-HSM. Trả nguyên phản hồi JSON đã kiểm status = 0.
 * @param {{ apiKey: string, secret: string, region: string }} cred
 * @param {'GET'|'POST'} method
 * @param {string} path  vd '/api/v2/pdf/sign/originaldata'
 * @param {object|null} [payload]
 * @param {{ timeoutMs?: number }} [opts]
 */
const call = async (
	cred,
	method,
	path,
	payload = null,
	{ timeoutMs = DEFAULT_TIMEOUT_MS } = {},
) => {
	assertCred(cred);
	const url = new URL(path, `${baseUrlOf(cred.region)}/`);
	const body = method === 'GET' ? '' : JSON.stringify(payload ?? {});
	const headers = signRequest({
		method,
		url,
		body,
		contentType: 'application/json',
		apiKey: cred.apiKey,
		secret: cred.secret,
		region: cred.region,
	});
	let res;
	try {
		res = await fetch(url, {
			method,
			headers: { ...headers, Accept: 'application/json', 'Accept-Charset': 'utf-8' },
			body: method === 'GET' ? undefined : body,
			signal: AbortSignal.timeout(timeoutMs),
			redirect: 'error',
		});
	} catch (err) {
		const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
		throw new VinHsmError(
			timedOut
				? 'Máy chủ ký VIN-HSM không phản hồi kịp — thử lại sau'
				: 'Không kết nối được máy chủ ký VIN-HSM',
			{
				code: timedOut ? 'TIMEOUT' : 'NETWORK',
				detail: String(err?.cause?.code || err?.message || ''),
			},
		);
	}
	const text = await res.text();
	/** @type {any} */
	let json;
	try {
		json = text ? JSON.parse(text) : null;
	} catch {
		json = null;
	}
	if (res.status === 401 || res.status === 403) {
		throw new VinHsmError(messageOf(json?.status ?? 103), {
			code: json?.status ?? 103,
			httpStatus: res.status,
			detail: json?.error || null,
		});
	}
	if (!res.ok) {
		throw new VinHsmError(
			json?.status != null
				? messageOf(json.status, json.description)
				: `Máy chủ ký trả lỗi HTTP ${res.status}`,
			{ code: json?.status ?? null, httpStatus: res.status, detail: json?.error || null },
		);
	}
	// /api/v2/account/cert trả thẳng chuỗi base64 (không bọc { status, obj })
	if (json === null || typeof json !== 'object') {
		return { status: 0, obj: json ?? text.trim().replace(/^"|"$/g, '') };
	}
	if (json.status !== undefined && Number(json.status) !== 0) {
		throw new VinHsmError(messageOf(json.status, json.description), {
			code: Number(json.status),
			httpStatus: res.status,
			detail: json.error || json.description || null,
		});
	}
	return json;
};

const objBuffer = (r, what) => {
	if (typeof r.obj !== 'string' || !r.obj) {
		throw new VinHsmError(`Máy chủ ký không trả ${what} đã ký`, { code: 'EMPTY' });
	}
	return Buffer.from(r.obj, 'base64');
};

// Kiểu hiển thị chữ ký trên PDF (typesignature)
const PDF_SIGNATURE_TYPE = Object.freeze({ HIDDEN: 0, TEXT: 1, IMAGE: 2, IMAGE_TEXT: 3 });

/**
 * Ký PDF, khung chữ ký đặt theo tọa độ (/api/v2/pdf/sign/originaldata).
 * @param {{ apiKey: string, secret: string, region: string }} cred
 * @param {Buffer} pdf
 * @param {{ page?: number, x?: number, y?: number, width?: number, height?: number, type?: number,
 *   text?: string, imageBase64?: string, signatureName?: string, organization?: string,
 *   fontSize?: number, fontColor?: string, hashAlg?: string }} [opt]
 */
const signPdf = async (cred, pdf, opt = {}) => {
	const r = await call(cred, 'POST', '/api/v2/pdf/sign/originaldata', {
		base64pdf: pdf.toString('base64'),
		hashalg: opt.hashAlg || 'SHA256',
		typesignature: opt.type ?? PDF_SIGNATURE_TYPE.TEXT,
		signaturename: opt.signatureName || `sig-${crypto.randomUUID()}`,
		textout: opt.text || '',
		base64image: opt.imageBase64 || '',
		pagesign: opt.page ?? 1,
		xpoint: Math.round(opt.x ?? 0),
		ypoint: Math.round(opt.y ?? 0),
		width: Math.round(opt.width ?? 180),
		height: Math.round(opt.height ?? 60),
		organization: opt.organization || '',
		fontsize: opt.fontSize ?? 8,
		...(opt.fontColor ? { fontcolor: opt.fontColor } : {}),
	});
	return objBuffer(r, 'file PDF');
};

/**
 * Ký PDF, khung chữ ký đặt cạnh dòng chữ tìm được (/api/v2/pdf/sign/signbytext).
 * page: -1 mọi trang, 0 trang cuối, >0 trang chỉ định.
 * @param {{ apiKey: string, secret: string, region: string }} cred
 * @param {Buffer} pdf
 * @param {{ textSign: string, page?: number, offsetX?: number, offsetY?: number, width?: number,
 *   height?: number, text?: string, signer?: string, position?: string, stampBase64?: string,
 *   handSignBase64?: string, signatureName?: string, hashAlg?: string }} opt
 */
const signPdfByText = async (cred, pdf, opt) => {
	const r = await call(cred, 'POST', '/api/v2/pdf/sign/signbytext', {
		base64pdf: pdf.toString('base64'),
		hashalg: opt.hashAlg || 'SHA256',
		textsign: opt.textSign,
		pagesign: opt.page ?? 0,
		signaturename: opt.signatureName || `sig-${crypto.randomUUID()}`,
		textout: opt.text || '',
		typesignature: PDF_SIGNATURE_TYPE.IMAGE_TEXT,
		width: Math.round(opt.width ?? 180),
		height: Math.round(opt.height ?? 60),
		imgabsolutepositionx: Math.round(opt.offsetX ?? 0),
		imgabsolutepositiony: Math.round(opt.offsetY ?? 0),
		nguoiky: opt.signer || '',
		chucvu: opt.position || '',
		condau: opt.stampBase64 || '',
		chukytuoi: opt.handSignBase64 || '',
	});
	return objBuffer(r, 'file PDF');
};

/**
 * Ký file Office OpenXML (docx/xlsx/pptx) (/api/v2/office/sign/originaldata).
 * @param {{ apiKey: string, secret: string, region: string }} cred
 * @param {Buffer} file
 * @param {{ text?: string, role?: string, comment?: string, city?: string, address?: string, hashAlg?: string,
 *   imageBase64?: string }} [opt]
 */
const signOffice = async (cred, file, opt = {}) => {
	const r = await call(cred, 'POST', '/api/v2/office/sign/originaldata', {
		base64office: file.toString('base64'),
		hashalg: opt.hashAlg || 'SHA256',
		city: opt.city || '',
		countryname: 'VN',
		postalcode: '',
		textout: opt.text || '',
		base64image: opt.imageBase64 || '',
		comment: opt.comment || '',
		role: opt.role || '',
		address: opt.address || '',
	});
	return objBuffer(r, 'file Office');
};

/**
 * Chứng thư số của tài khoản (base64 DER) — dùng để kiểm tra kết nối.
 * @param {{ apiKey: string, secret: string, region: string }} cred
 * @returns {Promise<Buffer>}
 */
const getCertificate = async (cred) => {
	const r = await call(cred, 'POST', '/api/v2/account/cert', {});
	return objBuffer(r, 'chứng thư');
};

module.exports = {
	VinHsmError,
	PDF_SIGNATURE_TYPE,
	ERROR_MESSAGES,
	signRequest,
	call,
	signPdf,
	signPdfByText,
	signOffice,
	getCertificate,
};
