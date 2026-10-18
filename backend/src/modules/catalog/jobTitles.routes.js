const router = require('express').Router();
const { authenticate } = require('../../middlewares/auth');
const { success } = require('../../utils/response');
const { asyncHandler } = require('../../utils/asyncHandler');
const jobTitleService = require('./jobTitleService');

// ─── Job titles (danh mục chỉ đọc) ─────────────────────────────────────────────
router.get(
	'/job-titles',
	authenticate,
	asyncHandler(async (req, res) => {
		return success(res, await jobTitleService.getAll());
	}),
);

module.exports = router;
