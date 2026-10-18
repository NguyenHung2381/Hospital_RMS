const router = require('express').Router();
const { authenticate } = require('../../middlewares/auth');
const { MODULES, isModuleEnabled } = require('../../middlewares/moduleGuard');
const { success } = require('../../utils/response');
const { asyncHandler } = require('../../utils/asyncHandler');

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

module.exports = router;
