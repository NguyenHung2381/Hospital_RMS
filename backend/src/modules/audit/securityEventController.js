const securityEventService = require('./securityEventService');
const { success } = require('../../utils/response');
const { asyncHandler } = require('../../utils/asyncHandler');

const getAll = asyncHandler(async (req, res) => {
	const { limit, cursor, event_type, actor_id } = req.query;
	const data = await securityEventService.getAll({
		limit,
		cursor,
		event_type,
		actor_id,
	});
	return success(res, data);
});

module.exports = { getAll };
