const router = require('express').Router();
const { authenticate } = require('../../middlewares/auth');
const { MODULES, isModuleEnabled } = require('../../middlewares/moduleGuard');
const systemSettingService = require('../settings/systemSettingService');
const signingConfig = require('../signing/signingConfig');
const { success } = require('../../utils/response');
const { asyncHandler } = require('../../utils/asyncHandler');

// Cổng có menu tùy chỉnh được ở Cấu hình hệ thống → key MENU_HIDDEN_<LAYOUT>.
const MENU_LAYOUTS = ['admin', 'user', 'trainee'];

// Mọi người dùng đăng nhập đều cần biết module nào đang bật để ẩn menu.
router.get(
	'/',
	authenticate,
	asyncHandler(async (req, res) => {
		const entries = await Promise.all(
			MODULES.map(async (m) => [m.toLowerCase(), await isModuleEnabled(m)]),
		);
		const modules = Object.fromEntries(entries);
		// Thu học phí là phân hệ con của Đào tạo: Đào tạo tắt thì coi như tắt luôn (API cũng chặn cả hai)
		modules.tuition = modules.tuition && modules.training;
		return success(res, modules);
	}),
);

// Mục menu nào bị quản trị ẩn, theo từng cổng: { admin: ['surveys', ...], user: [...], trainee: [...] }.
// Chỉ là ẩn giao diện — quyền dữ liệu vẫn do vai trò + module quyết định.
router.get(
	'/menus',
	authenticate,
	asyncHandler(async (req, res) => {
		// Ký số tắt ở Quản trị → Ký số → Cấu hình ⇒ ẩn luôn mục menu tương ứng (cổng quản trị + cán bộ)
		const signing = (await signingConfig.publicConfig()).features;
		const signingHidden = [
			...(signing.sign_requests ? [] : ['signRequests']),
			...(signing.user_document ? [] : ['signDocument']),
		];
		const entries = await Promise.all(
			MENU_LAYOUTS.map(async (l) => {
				const raw = await systemSettingService.getValue(`MENU_HIDDEN_${l.toUpperCase()}`, '');
				const keys = String(raw ?? '')
					.split(',')
					.map((k) => k.trim())
					.filter(Boolean);
				return [l, l === 'trainee' ? keys : [...new Set([...keys, ...signingHidden])]];
			}),
		);
		return success(res, Object.fromEntries(entries));
	}),
);

module.exports = router;
