// Màn "Hồ sơ thực hành GPHN": danh sách hồ sơ trên mọi khóa + 1 hồ sơ.
// Tách khỏi courseController (đã quá dài). Phạm vi khóa của :enrollmentId do
// coursePolicy kiểm ở router (chống IDOR).
const { asyncHandler } = require('../../../utils/asyncHandler');
const { success } = require('../../../utils/response');
const practiceRecordService = require('./practiceRecordService');
const practiceResultService = require('./practiceResultService');
const courseEnrollmentService = require('./courseEnrollmentService');

const listPracticeRecords = asyncHandler(async (req, res) =>
	success(res, await practiceRecordService.list(req.user)),
);

const getEnrollment = asyncHandler(async (req, res) =>
	success(res, await courseEnrollmentService.getEnrollment(req.params.enrollmentId)),
);

// Nhập kết quả vòng hàng loạt — phạm vi khóa kiểm trong service (từng dòng).
const listAwaitingResults = asyncHandler(async (req, res) =>
	success(res, await practiceResultService.listAwaiting(req.user)),
);

const saveResultsBulk = asyncHandler(async (req, res) => {
	const r = await practiceResultService.saveBulk(req.user, req.body.rows);
	return success(res, r, `Đã lưu kết quả ${r.saved} vòng`);
});

module.exports = { listPracticeRecords, getEnrollment, listAwaitingResults, saveResultsBulk };
