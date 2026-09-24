const svc = require('../services/activityLogService');
const { success } = require('../utils/response');

// Bộ lọc (from, to, actor, method, action, module, status, ip, search,
// min_duration, exclude_views) được service tự chuẩn hoá từ req.query.
const getAll = async (req, res, next) => {
	try {
		success(res, await svc.getAll(req.query));
	} catch (err) {
		next(err);
	}
};

const getStats = async (req, res, next) => {
	try {
		success(res, await svc.getStats(req.query));
	} catch (err) {
		next(err);
	}
};

module.exports = { getAll, getStats };
