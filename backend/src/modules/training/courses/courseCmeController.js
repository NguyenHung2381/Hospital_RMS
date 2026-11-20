const { asyncHandler } = require('../../../utils/asyncHandler');
const { success } = require('../../../utils/response');
const courseCmeService = require('./courseCmeService');
const { hasPermission } = require('../../../permissions/authz');

// POST /courses/:id/cme-sync — ghi lại CME tự động của khóa (học viên + giảng viên)
// Dòng CME giảng viên chỉ được 'approved' khi người gọi có cme_records:manage; thiếu quyền thì
// dòng ghi 'pending' và kết quả có lecturers_pending = true để giao diện báo chờ duyệt.
const sync = asyncHandler(async (req, res) =>
	success(
		res,
		await courseCmeService.syncCourse(req.params.id, req.user.id, {
			canApprove: hasPermission(req.user, 'cme_records', 'manage'),
		}),
		'Đã ghi lại CME',
	),
);

module.exports = { sync };
