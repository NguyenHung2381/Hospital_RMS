// Nhập giảng viên giảng dạy theo buổi học của khóa từ Excel — xem sessionLecturerImportService.
const sessionLecturerImportService = require('./sessionLecturerImportService');
const teachingPlanService = require('./teachingPlanService');
const { success, sendWorkbook } = require('../../../utils/response');
const { asyncHandler } = require('../../../utils/asyncHandler');
const coursePolicy = require('./coursePolicy');

const sessionLecturerTemplate = asyncHandler(async (req, res) => {
	const { workbook, fileName } = await teachingPlanService.buildTemplate(req.params.id, {
		programId: typeof req.body?.program_id === 'string' ? req.body.program_id : null,
	});
	return sendWorkbook(res, workbook, fileName);
});

const importSessionLecturers = asyncHandler(async (req, res) => {
	if (!req.file) return res.status(400).json({ success: false, message: 'Chưa chọn file Excel.' });
	// router.param chỉ kiểm phạm vi ĐỌC cho POST — nhập là ghi buổi học ⇒ kiểm phạm vi sửa khóa
	await coursePolicy.assertCourseInScope(req.params.id, req.user, 'update');
	const out = await sessionLecturerImportService.importExcel(
		{
			courseId: req.params.id,
			buffer: req.file.buffer,
			dry_run: req.body.dry_run === '1' || req.body.dry_run === 'true',
		},
		req.user.id,
	);
	return success(res, out);
});

module.exports = { sessionLecturerTemplate, importSessionLecturers };
