const svc = require('./activityLogService');
const { success } = require('../../utils/response');
const { asyncHandler } = require('../../utils/asyncHandler');

// Bộ lọc (from, to, actor, method, action, module, status, ip, search,
// min_duration, exclude_views) được service tự chuẩn hoá từ req.query.
const getAll = asyncHandler(async (req, res) => {
	success(res, await svc.getAll(req.query));
});

const getStats = asyncHandler(async (req, res) => {
	success(res, await svc.getStats(req.query));
});

module.exports = { getAll, getStats };
