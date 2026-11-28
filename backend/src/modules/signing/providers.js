/**
 * providers.js — danh mục nhà cung cấp ký số. Mỗi nhà cung cấp = 1 "trình ký" có cùng giao diện
 * (signPdf, signOffice, getCertificate) + mô tả các ô khai báo cho giao diện. Thêm nhà cung cấp
 * mới (VNPT SmartCA, Viettel MySign, USB token qua plugin...) = thêm 1 mục ở đây + file client
 * của nó; bảng signing_accounts đã có cột provider.
 */
const vinHsm = require('./vinHsmClient');

/**
 * @typedef {{ key: string, label: string, description: string, enabled: boolean,
 *   fields: { key: string, label: string, secret?: boolean, hint?: string }[], driver: any }} Provider
 */

/** @type {Provider[]} */
const PROVIDERS = [
	{
		key: 'vin_hsm',
		label: 'VIN-HSM',
		description:
			'Ký số từ xa qua HSM của VIN-HSM — chứng thư gắn với tài khoản dịch vụ (API key + secret)',
		enabled: true,
		fields: [
			{ key: 'region', label: 'Vùng máy chủ', hint: 'Phần sau "sign-" trong địa chỉ, vd hn10' },
			{ key: 'api_key', label: 'API key' },
			{ key: 'secret', label: 'Secret', secret: true },
		],
		driver: vinHsm,
	},
];

/** Trình ký của 1 tài khoản (mặc định VIN-HSM cho dữ liệu cũ) @param {string|null|undefined} key */
const driverOf = (key) => {
	const p = PROVIDERS.find((x) => x.key === (key || 'vin_hsm'));
	if (!p?.enabled) throw new Error(`Nhà cung cấp ký số không được hỗ trợ: ${key}`);
	return p.driver;
};

/** Danh mục cho giao diện (không kèm driver) */
const listProviders = () => PROVIDERS.map(({ driver: _d, ...p }) => p);

module.exports = { driverOf, listProviders };
