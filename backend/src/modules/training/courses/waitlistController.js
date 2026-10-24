// "Người chờ từ đợt trước" ở tab Học viên của khóa ĐTLT / CTCV (waitlistTransferService).
// Phạm vi khóa đích do router.param('id') kiểm; khóa nguồn của từng hồ sơ kiểm ở đây.
const { asyncHandler } = require('../../../utils/asyncHandler');
const { success } = require('../../../utils/response');
const coursePolicy = require('./coursePolicy');
const waitlistTransferService = require('./waitlistTransferService');

const listCandidates = asyncHandler(async (req, res) =>
	success(res, await waitlistTransferService.listCandidates(req.params.id)),
);

const transfer = asyncHandler(async (req, res) => {
	const ids = req.body.enrollment_ids;
	for (const id of ids) await coursePolicy.assertCourseChildInScope('enrollmentId', id, req.user);
	const r = await waitlistTransferService.transfer(req.params.id, ids, req.user.id);
	return success(res, r, `Đã chuyển ${r.moved} học viên vào đợt này`);
});

module.exports = { listCandidates, transfer };
