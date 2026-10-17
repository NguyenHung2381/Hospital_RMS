const securityEventService = require('./securityEventService');
const { success } = require('../../utils/response');

const getAll = async (req, res, next) => {
	try {
		const { limit, cursor, event_type, actor_id } = req.query;
		const data = await securityEventService.getAll({
			limit,
			cursor,
			event_type,
			actor_id,
		});
		return success(res, data);
	} catch (err) {
		next(err);
	}
};

module.exports = { getAll };
