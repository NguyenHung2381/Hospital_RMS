const courseService = require('./courseService');
const coursePolicy = require('./coursePolicy');
const enrollmentExportService = require('./enrollmentExportService');
const { buildCourseEnrollmentWorkbook, fileNameOf } = require('./exports/courseEnrollmentWorkbook');
const { notFound, sendWorkbook } = require('../../../utils/response');
const { hasPermission } = require('../../../permissions/authz');
const { asyncHandler } = require('../../../utils/asyncHandler');

// POST /courses/:id/enrollments/export-excel — xuất danh sách học viên của khóa.
// Phạm vi: giống GET /courses/:id/enrollments (giảng viên chỉ khóa mình dạy — router.param('id')
// đã chặn; gọi lại assertCourseInScope ở đây để controller vẫn an toàn nếu bị gắn route khác).
const exportEnrollments = asyncHandler(async (req, res) => {
	await coursePolicy.assertCourseInScope(req.params.id, req.user);
	const course = await courseService.getById(req.params.id, req.user);
	if (!course) return notFound(res, 'Không tìm thấy khóa học');
	const data = await enrollmentExportService.getExportData(req.params.id, req.body);
	const wb = buildCourseEnrollmentWorkbook({
		...data,
		course,
		// Cột CCCD chỉ có khi người xuất được xem dữ liệu nhạy cảm
		includeNationalId: hasPermission(req.user, 'trainees', 'read_sensitive'),
	});
	return sendWorkbook(res, wb, fileNameOf(course.name));
});

module.exports = { exportEnrollments };
