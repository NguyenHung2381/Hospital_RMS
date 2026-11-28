/**
 * signingAccountService.js — tài khoản ký số VIN-HSM: tài khoản tổ chức (quản trị cấu hình)
 * và tài khoản cá nhân (mỗi người tự khai báo API key / secret của chứng thư mình).
 *
 * Secret mã hóa AES-256-GCM bằng utils/secretBox (khóa ngoài DB, cùng khóa với secret 2FA);
 * API không bao giờ trả secret, kể cả bản che.
 */
const crypto = require('crypto');
const { httpError } = require('../../utils/httpError');
const secretBox = require('../../utils/secretBox');
const { VN_OFFSET_MS } = require('../../utils/vnDate');
// Gọi qua `repo.xxx` / `client.xxx` (không destructure) để test thay được từng hàm.
const repo = require('./signingRepository');
const client = require('./vinHsmClient');
const signatureImage = require('./signatureImage');
const providers = require('./providers');
const config = require('./signingConfig');
const notifSvc = require('../notifications/notificationService');

const REGION_RE = /^[a-z0-9]{1,20}$/;
const KINDS = ['organization', 'personal'];

const str = (v) => (v === undefined || v === null ? '' : String(v).trim());

// "CN=A\nO=B" (định dạng của X509Certificate) → "CN=A, O=B"
const oneLine = (dn) =>
	String(dn || '')
		.split('\n')
		.map((s) => s.trim())
		.filter(Boolean)
		.join(', ');

// Giờ thật (UTC) → "giờ VN dạng UTC giả" để ghi cột timestamp (quy ước pgParams)
const toVnWall = (d) => new Date(d.getTime() + VN_OFFSET_MS);

/**
 * Đọc chứng thư DER (hoặc PEM) → thông tin hiển thị.
 * @param {Buffer} der
 */
const parseCertificate = (der) => {
	let x;
	try {
		x = new crypto.X509Certificate(der);
	} catch {
		throw new client.VinHsmError('Chứng thư VIN-HSM trả về không đọc được', { code: 'BAD_CERT' });
	}
	return {
		subject: oneLine(x.subject),
		issuer: oneLine(x.issuer),
		serial: String(x.serialNumber || '').toUpperCase(),
		validFrom: new Date(x.validFrom),
		validTo: new Date(x.validTo),
	};
};

const decorate = (a) => {
	if (!a) return a;
	const now = Date.now() + VN_OFFSET_MS;
	const validTo = a.cert_valid_to ? new Date(a.cert_valid_to).getTime() : null;
	return {
		...a,
		// API key chỉ hiện đầu/cuối — đủ để nhận ra, không đủ để dùng lại ở nơi khác
		api_key: a.api_key ? `${a.api_key.slice(0, 4)}…${a.api_key.slice(-4)}` : '',
		cert_expired: validTo !== null && validTo < now,
		has_cert: !!a.cert_serial,
	};
};

const validateRegion = (region) => {
	const r = str(region).toLowerCase();
	if (!REGION_RE.test(r)) {
		throw httpError(400, 'Vùng máy chủ không hợp lệ — chỉ gồm chữ thường và số, vd: hn10');
	}
	return r;
};

const listAccounts = async () => (await repo.listAccounts()).map(decorate);

/** @param {number} id */
const getAccount = async (id) => {
	const a = await repo.findById(id);
	if (!a) throw httpError(404, 'Không tìm thấy tài khoản ký số.');
	return decorate(a);
};

/**
 * Đọc chứng thư từ VIN-HSM, lưu thông tin chứng thư (hoặc lỗi) vào tài khoản.
 * Không ném lỗi: kết quả kiểm tra nằm trong last_error của bản ghi trả về.
 * @param {number} id
 */
const checkAccount = async (id) => {
	const cred = await credentialOf(id, { allowInactive: true });
	try {
		const cert = parseCertificate(await providers.driverOf(cred.provider).getCertificate(cred));
		await repo.saveCheckResult(
			id,
			{ ...cert, validFrom: toVnWall(cert.validFrom), validTo: toVnWall(cert.validTo) },
			cert.validTo.getTime() < Date.now() ? 'Chứng thư số đã hết hạn' : null,
		);
	} catch (err) {
		if (!(err instanceof client.VinHsmError)) throw err;
		await repo.saveCheckResult(id, null, err.message);
	}
	return getAccount(id);
};

/**
 * @param {{ label?: string, kind?: string, user_id?: string|null, region?: string, api_key?: string,
 *   secret?: string, use_for_certificates?: boolean, is_active?: boolean }} data
 * @param {string} actorId
 */
const createAccount = async (data, actorId) => {
	const kind = str(data.kind) || 'organization';
	if (!KINDS.includes(kind)) throw httpError(400, 'Loại tài khoản ký không hợp lệ.');
	const userId = kind === 'personal' ? str(data.user_id) : null;
	if (kind === 'personal' && !userId) throw httpError(400, 'Chưa chọn người sở hữu chứng thư.');
	const label = str(data.label);
	if (!label) throw httpError(400, 'Tên tài khoản ký không được để trống.');
	const apiKey = str(data.api_key);
	const secret = str(data.secret);
	if (!apiKey || !secret) throw httpError(400, 'Cần nhập đủ API key và secret do VIN-HSM cấp.');
	if (kind === 'personal' && (await repo.findPersonalByUser(userId))) {
		throw httpError(409, 'Người này đã có tài khoản ký số cá nhân.');
	}
	const useCert = kind === 'organization' && !!data.use_for_certificates;
	const id = await repo.insertAccount({
		label,
		kind,
		userId,
		region: validateRegion(data.region),
		apiKey,
		secretEnc: secretBox.encrypt(secret),
		useForCertificates: false,
		isActive: data.is_active !== false,
		actorId,
	});
	if (useCert) await setCertificateDefault(id, actorId);
	// Quản trị cấp chứng thư cho cán bộ ⇒ báo người đó (không gửi secret)
	if (kind === 'personal' && userId !== actorId) {
		await notifSvc
			.push('signing_account', 'Bạn đã được cấp chứng thư số', [userId], {
				message: 'Quản trị đã khai báo tài khoản ký số cho bạn. Xem ở Hồ sơ cá nhân → Chữ ký số.',
				refType: 'signing',
			})
			.catch(() => {});
	}
	return checkAccount(id);
};

/**
 * Secret để trống = giữ secret cũ.
 * @param {number} id
 * @param {{ label?: string, region?: string, api_key?: string, secret?: string,
 *   use_for_certificates?: boolean, is_active?: boolean }} data
 * @param {string} actorId
 */
const updateAccount = async (id, data, actorId) => {
	const cur = await repo.findById(id);
	if (!cur) throw httpError(404, 'Không tìm thấy tài khoản ký số.');
	/** @type {Parameters<typeof repo.updateAccount>[1]} */
	const patch = {};
	if (data.label !== undefined) {
		const label = str(data.label);
		if (!label) throw httpError(400, 'Tên tài khoản ký không được để trống.');
		patch.label = label;
	}
	if (data.region !== undefined && str(data.region) !== cur.region) {
		patch.region = validateRegion(data.region);
	}
	// Ô API key hiển thị bản che (abcd…wxyz) — gửi lại nguyên bản che nghĩa là không đổi
	const apiKey = str(data.api_key);
	if (apiKey && !apiKey.includes('…') && apiKey !== cur.api_key) patch.apiKey = apiKey;
	if (str(data.secret)) patch.secretEnc = secretBox.encrypt(str(data.secret));
	if (data.is_active !== undefined) patch.isActive = !!data.is_active;
	const wantCert = data.use_for_certificates;
	if (wantCert !== undefined && cur.kind === 'organization' && !wantCert) {
		patch.useForCertificates = false;
	}
	await repo.updateAccount(id, patch, actorId);
	if (wantCert && cur.kind === 'organization') await setCertificateDefault(id, actorId);
	const credChanged = patch.region || patch.apiKey || patch.secretEnc;
	return credChanged ? checkAccount(id) : getAccount(id);
};

// Mỗi lúc chỉ 1 tài khoản tổ chức dùng ký giấy chứng nhận (UNIQUE uq_signacc_cert_default)
const setCertificateDefault = async (id, actorId) => {
	await repo.clearCertificateDefault(id);
	await repo.updateAccount(id, { useForCertificates: true }, actorId);
};

/** @param {number} id */
const removeAccount = async (id) => {
	if (!(await repo.deleteAccount(id))) throw httpError(404, 'Không tìm thấy tài khoản ký số.');
};

/**
 * Thông tin gọi VIN-HSM của 1 tài khoản (secret đã giải mã). Chỉ dùng trong backend.
 * @param {number} id
 * @param {{ allowInactive?: boolean }} [opts]
 * @returns {Promise<{ id: number, provider: string, apiKey: string, secret: string, region: string, certSerial: string|null,
 *   signatureImage: string|null, signatureShowText: boolean, signatureCaption: string|null,
 *   signatureDisplayName: string|null }>}
 */
const credentialOf = async (id, { allowInactive = false } = {}) => {
	const row = await repo.findCredential(id);
	if (!row) throw httpError(404, 'Không tìm thấy tài khoản ký số.');
	if (!row.is_active && !allowInactive) throw httpError(409, 'Tài khoản ký số đang tạm ngưng.');
	let secret;
	try {
		secret = secretBox.decrypt(row.secret_enc);
	} catch {
		throw httpError(
			500,
			'Không giải mã được secret của tài khoản ký số (khóa mã hóa trên máy chủ đã đổi?) — nhập lại secret.',
		);
	}
	return {
		id: row.id,
		provider: row.provider || 'vin_hsm',
		apiKey: row.api_key,
		secret,
		region: row.region,
		certSerial: row.cert_serial,
		signatureImage: row.signature_image ?? null,
		signatureShowText: !!row.signature_show_text,
		signatureCaption: row.signature_caption ?? null,
		signatureDisplayName: row.signature_display_name ?? null,
	};
};

// ─── Tài khoản cá nhân của người đang đăng nhập ──────────────────────────

/** @param {string} userId */
const getMine = async (userId) => decorate(await repo.findPersonalByUser(userId));

/**
 * Tạo hoặc cập nhật tài khoản ký cá nhân. Lần đầu bắt buộc đủ API key + secret.
 * @param {string} userId
 * @param {{ region?: string, api_key?: string, secret?: string, label?: string }} data
 * @param {string} fullName  tên hiển thị mặc định của tài khoản
 */
const saveMine = async (userId, data, fullName) => {
	await config.assertSelfManage();
	const cur = await repo.findPersonalByUser(userId);
	if (!cur) {
		return createAccount(
			{
				kind: 'personal',
				user_id: userId,
				label: str(data.label) || `Chứng thư cá nhân — ${fullName || userId}`,
				region: data.region,
				api_key: data.api_key,
				secret: data.secret,
			},
			userId,
		);
	}
	return updateAccount(
		cur.id,
		{ region: data.region, api_key: data.api_key, secret: data.secret, label: data.label },
		userId,
	);
};

/** @param {string} userId */
const checkMine = async (userId) => {
	const cur = await repo.findPersonalByUser(userId);
	if (!cur) throw httpError(404, 'Bạn chưa khai báo tài khoản ký số cá nhân.');
	return checkAccount(cur.id);
};

const mineOrThrow = async (userId) => {
	const cur = await repo.findPersonalByUser(userId);
	if (!cur) {
		throw httpError(404, 'Bạn chưa khai báo tài khoản ký số cá nhân — lưu API key / secret trước.');
	}
	return cur;
};

/**
 * Ảnh chữ ký tay của chính mình: `image` (data URL / base64) được chuẩn hóa rồi lưu;
 * `image: null` = xóa ảnh. `show_text`: in chức vụ dưới ảnh; `caption`: chữ chức vụ
 * (rỗng / null = lấy chức vụ trong hồ sơ).
 * @param {string} userId
 * @param {{ image?: string|null, show_text?: boolean, caption?: string|null, display_name?: string|null }} data
 */
const saveMySignatureImage = async (userId, data) => {
	const cur = await mineOrThrow(userId);
	/** @type {{ image?: string|null, showText?: boolean, caption?: string|null, displayName?: string|null }} */
	const patch = {};
	const clean = (v) =>
		String(v ?? '')
			.replace(/\s+/g, ' ')
			.trim()
			.slice(0, 150) || null;
	if (data.caption !== undefined) patch.caption = clean(data.caption);
	if (data.display_name !== undefined) patch.displayName = clean(data.display_name);
	if (data.image === null) patch.image = null;
	else if (data.image !== undefined)
		patch.image = await signatureImage.normalizeSignatureImage(data.image);
	if (data.show_text !== undefined) patch.showText = !!data.show_text;
	await repo.updateSignatureImage(cur.id, patch, userId);
	return getMine(userId);
};

/** Ảnh chữ ký của chính mình dạng data URL (null nếu chưa có). @param {string} userId */
const getMySignatureImage = async (userId) => {
	const cur = await mineOrThrow(userId);
	const b64 = await repo.findSignatureImage(cur.id);
	return b64 ? `data:image/png;base64,${b64}` : null;
};

/** @param {string} userId */
const removeMine = async (userId) => {
	await config.assertSelfManage();
	const cur = await repo.findPersonalByUser(userId);
	if (!cur) throw httpError(404, 'Bạn chưa khai báo tài khoản ký số cá nhân.');
	await repo.deleteAccount(cur.id);
};

module.exports = {
	parseCertificate,
	listAccounts,
	getAccount,
	checkAccount,
	createAccount,
	updateAccount,
	removeAccount,
	credentialOf,
	getMine,
	saveMine,
	checkMine,
	removeMine,
	saveMySignatureImage,
	getMySignatureImage,
};
