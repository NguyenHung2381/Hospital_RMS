const { asyncHandler } = require('../../../utils/asyncHandler');
const { success } = require('../../../utils/response');
const courseCmeService = require('./courseCmeService');

// POST /courses/:id/cme-sync — ghi lại CME tự động của khóa (học viên + giảng viên)
const sync = asyncHandler(async (req, res) =>
	success(res, await courseCmeService.syncCourse(req.params.id, req.user.id), 'Đã ghi lại CME'),
);

module.exports = { sync };
