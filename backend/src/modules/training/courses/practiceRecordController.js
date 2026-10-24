// Màn "Hồ sơ thực hành GPHN": danh sách hồ sơ trên mọi khóa + 1 hồ sơ.
// Tách khỏi courseController (đã quá dài). Phạm vi khóa của :enrollmentId do
// coursePolicy kiểm ở router (chống IDOR).
const { asyncHandler } = require('../../../utils/asyncHandler');
const { success } = require('../../../utils/response');
const practiceRecordService = require('./practiceRecordService');
const courseEnrollmentService = require('./courseEnrollmentService');

const listPracticeRecords = asyncHandler(async (req, res) =>
	success(res, await practiceRecordService.list(req.user)),
);

const getEnrollment = asyncHandler(async (req, res) =>
	success(res, await courseEnrollmentService.getEnrollment(req.params.enrollmentId)),
);

module.exports = { listPracticeRecords, getEnrollment };
