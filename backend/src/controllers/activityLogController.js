const svc = require('../services/activityLogService');
const { success } = require('../utils/response');

const getAll = async (req, res, next) => {
	try {
		const { limit = 50, cursor, actor_id, method, search } = req.query;
		const result = await svc.getAll({
			limit: Math.min(parseInt(limit) || 50, 100),
			cursor: cursor || undefined,
			actor_id: actor_id || undefined,
			method: method || undefined,
			search: search || undefined,
		});
		success(res, result);
	} catch (err) {
		next(err);
	}
};

module.exports = { getAll };
