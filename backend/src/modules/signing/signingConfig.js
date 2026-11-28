/**
 * signingConfig.js — bật/tắt ký số (Quản trị → Ký số → Cấu hình). Lưu 1 khóa JSON
 * SIGNING_CONFIG ở Cấu hình hệ thống; rỗng / hỏng = mặc định (bật hết).
 *
 *   enabled      công tắc tổng — tắt thì không có lần ký nào gọi tới nhà cung cấp
 *   self_manage  cán bộ tự khai báo / đổi / xóa chứng thư cá nhân ở Hồ sơ cá nhân
 *                (tắt: chỉ quản trị ký số cấp; cán bộ vẫn đổi được ảnh chữ ký tay)
 *   features     theo từng nơi dùng (FEATURES)
 *   providers    theo từng nhà cung cấp (providers.js) — tắt thì tài khoản của nhà cung cấp đó
 *                không ký được, tài khoản vẫn giữ nguyên
 *
 * Chặn ở 2 tầng: callLogged (mọi lần ký, theo docType) và nơi bắt đầu luồng (tạo hồ sơ trình ký,
 * khai báo chứng thư) để báo sớm. Đổi cấu hình có hiệu lực sau tối đa 15 giây (cache của
 * systemSettingService ở các worker khác).
 */
const { httpError } = require('../../utils/httpError');
const settings = require('../settings/systemSettingService');
const providers = require('./providers');

const SETTING_KEY = 'SIGNING_CONFIG';

/**
 * @typedef {{ key: string, label: string, description: string, docTypes: string[] }} Feature
 * @type {readonly Feature[]}
 */
const FEATURES = Object.freeze([
	{
		key: 'sign_requests',
		label: 'Trình ký văn bản',
		description: 'Tạo hồ sơ trình ký, ký nối tiếp / song song, ký nhiều hồ sơ một lúc',
		docTypes: ['sign_request'],
	},
	{
		key: 'user_document',
		label: 'Ký tài liệu',
		description: 'Cán bộ tự tải file PDF lên, đặt khung chữ ký và ký',
		docTypes: ['user_document'],
	},
	{
		key: 'seminar_certificate',
		label: 'Giấy chứng nhận CME',
		description: 'Ký giấy chứng nhận hội thảo bằng chứng thư bệnh viện khi xuất',
		docTypes: ['seminar_certificate'],
	},
	{
		key: 'training_documents',
		label: 'Văn bản đào tạo',
		description: 'Giấy tờ thực hành, đơn đăng ký, tờ trình khóa học khi tải về',
		docTypes: ['practice_document', 'registration_document'],
	},
	{
		key: 'topic_approval',
		label: 'Phiếu phê duyệt đề tài',
		description: 'Người phê duyệt ký số phiếu khi duyệt đề tài',
		docTypes: ['topic_approval'],
	},
]);
const FEATURE_KEYS = FEATURES.map((f) => f.key);

/**
 * @typedef {{ enabled: boolean, self_manage: boolean, features: Record<string, boolean>,
 *   providers: Record<string, boolean> }} SigningConfig
 */

/** Chuẩn hoá cấu hình bất kỳ (thiếu khóa = bật). @param {any} raw @returns {SigningConfig} */
const normalize = (raw) => {
	const src = raw && typeof raw === 'object' ? raw : {};
	const flag = (v) => v !== false;
	const pick = (obj, keys) =>
		Object.fromEntries(keys.map((k) => [k, flag(obj && typeof obj === 'object' ? obj[k] : true)]));
	return {
		enabled: flag(src.enabled),
		self_manage: flag(src.self_manage),
		features: pick(src.features, FEATURE_KEYS),
		providers: pick(
			src.providers,
			providers.listProviders().map((p) => p.key),
		),
	};
};

/** @returns {Promise<SigningConfig>} */
const getConfig = async () => {
	const raw = await settings.getValue(SETTING_KEY, '');
	if (!raw) return normalize(null);
	try {
		return normalize(JSON.parse(String(raw)));
	} catch {
		return normalize(null);
	}
};

/** @param {any} input @param {string} actorId */
const saveConfig = async (input, actorId) => {
	const cfg = normalize(input);
	await settings.update(SETTING_KEY, JSON.stringify(cfg), actorId);
	return describe(cfg);
};

/** Cấu hình kèm nhãn cho trang quản trị. @param {SigningConfig} [cfg] */
const describe = async (cfg) => {
	const c = cfg ?? (await getConfig());
	return {
		...c,
		feature_list: FEATURES.map(({ docTypes: _d, ...f }) => f),
		provider_list: providers.listProviders().map((p) => ({
			key: p.key,
			label: p.label,
			description: p.description,
		})),
	};
};

/** Nơi dùng nào đang bật (đã tính công tắc tổng) — cho giao diện. */
const publicConfig = async () => {
	const c = await getConfig();
	return {
		enabled: c.enabled,
		self_manage: c.self_manage,
		features: Object.fromEntries(FEATURE_KEYS.map((k) => [k, c.enabled && c.features[k]])),
	};
};

const featureOfDocType = (docType) => FEATURES.find((f) => f.docTypes.includes(docType)) || null;

/** @param {string} key */
const isFeatureOn = async (key) => {
	const c = await getConfig();
	return c.enabled && c.features[key] !== false;
};

/** Báo lỗi 409 nếu nơi dùng `key` đang tắt. @param {string} key */
const assertFeature = async (key) => {
	const c = await getConfig();
	if (!c.enabled) throw httpError(409, 'Ký số đang tắt trên hệ thống.');
	if (c.features[key] === false) {
		const f = FEATURES.find((x) => x.key === key);
		throw httpError(409, `Ký số cho "${f?.label ?? key}" đang tắt.`);
	}
};

/**
 * Kiểm trước MỖI lần gọi nhà cung cấp. Ký thử ('test') chỉ cần nhà cung cấp còn bật — quản trị
 * vẫn kiểm được tài khoản khi đang tắt ký số.
 * @param {string} docType @param {string|null|undefined} providerKey
 */
const assertCall = async (docType, providerKey) => {
	const c = await getConfig();
	const key = providerKey || 'vin_hsm';
	if (c.providers[key] === false) {
		const p = providers.listProviders().find((x) => x.key === key);
		throw httpError(409, `Nhà cung cấp ký số ${p?.label ?? key} đang tắt.`);
	}
	if (docType === 'test') return;
	const f = featureOfDocType(docType);
	if (f) await assertFeature(f.key);
	else if (!c.enabled) throw httpError(409, 'Ký số đang tắt trên hệ thống.');
};

/** Cán bộ có được tự khai báo / đổi / xóa chứng thư không. */
const assertSelfManage = async () => {
	const c = await getConfig();
	if (!c.self_manage) {
		throw httpError(
			403,
			'Chứng thư cá nhân do quản trị viên cấp — liên hệ quản trị ký số để khai báo hoặc thay đổi.',
		);
	}
};

module.exports = {
	SETTING_KEY,
	FEATURES,
	normalize,
	getConfig,
	saveConfig,
	describe,
	publicConfig,
	isFeatureOn,
	assertFeature,
	assertCall,
	assertSelfManage,
};
