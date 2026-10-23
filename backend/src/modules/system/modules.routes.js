const router = require('express').Router();
const { authenticate } = require('../../middlewares/auth');
const { MODULES, isModuleEnabled } = require('../../middlewares/moduleGuard');
const systemSettingService = require('../settings/systemSettingService');
const { success } = require('../../utils/response');
const { asyncHandler } = require('../../utils/asyncHandler');

// Cổng có menu tuỳ chỉnh được ở Cấu hình hệ thống → key MENU_HIDDEN_<LAYOUT>.
const MENU_LAYOUTS = ['admin', 'user', 'trainee'];

// Mọi người dùng đăng nhập đều cần biết module nào đang bật để ẩn menu.
router.get(
	'/',
	authenticate,
	asyncHandler(async (req, res) => {
		const entries = await Promise.all(
			MODULES.map(async (m) => [m.toLowerCase(), await isModuleEnabled(m)]),
		);
		return success(res, Object.fromEntries(entries));
	}),
);

// Mục menu nào bị quản trị ẩn, theo từng cổng: { admin: ['surveys', ...], user: [...], trainee: [...] }.
// Chỉ là ẩn giao diện — quyền dữ liệu vẫn do vai trò + module quyết định.
router.get(
	'/menus',
	authenticate,
	asyncHandler(async (req, res) => {
		const entries = await Promise.all(
			MENU_LAYOUTS.map(async (l) => {
				const raw = await systemSettingService.getValue(`MENU_HIDDEN_${l.toUpperCase()}`, '');
				return [
					l,
					String(raw ?? '')
						.split(',')
						.map((k) => k.trim())
						.filter(Boolean),
				];
			}),
		);
		return success(res, Object.fromEntries(entries));
	}),
);

module.exports = router;
