const router = require('express').Router();
const portalService = require('./portalService');
const cmePersonalExport = require('../cme/cmePersonalExportController');
const { authenticate } = require('../../middlewares/auth');
const { success, created } = require('../../utils/response');
const { asyncHandler } = require('../../utils/asyncHandler');
const { body, param, query } = require('express-validator');
const { validate } = require('../../middlewares/errorHandler');
const classSessionService = require('../training/courses/classSessionService');
const traineeRecordService = require('../training/trainees/traineeRecordService');

router.use(authenticate);

router.get(
	'/training',
	asyncHandler(async (req, res) => {
		return success(res, await portalService.getMyTraining(req.user));
	}),
);

// Học viên xem lịch học / điểm danh / điểm của chính mình (tài khoản học viên hoặc nhân viên nội viện đã ghi danh — traineeOfUser) —
// cùng dữ liệu với hồ sơ học viên phía cán bộ.
router.get(
	'/training/schedule',
	[
		query('from').isISO8601().withMessage('Ngày bắt đầu không hợp lệ'),
		query('to').isISO8601().withMessage('Ngày kết thúc không hợp lệ'),
	],
	validate,
	asyncHandler(async (req, res) => {
		const { from, to } = req.query;
		return success(
			res,
			await classSessionService.listTraineeSessions({ from, to, userId: req.user.id }),
		);
	}),
);
router.get(
	'/training/attendance',
	asyncHandler(async (req, res) => {
		const traineeId = await traineeRecordService.myTraineeId(req.user.id);
		return success(res, await traineeRecordService.attendance(traineeId));
	}),
);
router.get(
	'/training/grades',
	asyncHandler(async (req, res) => {
		const traineeId = await traineeRecordService.myTraineeId(req.user.id);
		return success(res, await traineeRecordService.grades(traineeId));
	}),
);

router.get(
	'/courses/:id',
	asyncHandler(async (req, res) => {
		return success(res, await portalService.getMyCourse(req.params.id, req.user));
	}),
);

router.patch(
	'/documents/:docId/download',
	asyncHandler(async (req, res) => {
		return success(res, await portalService.openDocument(req.params.docId, req.user));
	}),
);

router.patch(
	'/lesson-documents/:docId/download',
	asyncHandler(async (req, res) => {
		return success(res, await portalService.openDocument(req.params.docId, req.user, 'lesson'));
	}),
);

router.post(
	'/courses/:id/register',
	asyncHandler(async (req, res) => {
		return created(
			res,
			await portalService.registerCourse(req.params.id, req.user, req.body?.program_id || null),
			'Đã gửi đăng ký, chờ duyệt',
		);
	}),
);

router.get(
	'/cme',
	asyncHandler(async (req, res) => {
		// ?year=all → toàn bộ các năm
		const year =
			req.query.year === 'all' ? null : Number(req.query.year) || new Date().getFullYear();
		return success(res, await portalService.getMyCme(req.user, year));
	}),
);

// Tự khai CME (chờ admin duyệt). Chỉ thao tác trên bản ghi của chính mình.
const cmeRecordService = require('../cme/cmeRecordService');
const { updateRules } = require('../cme/cmeRecordValidators');
const { createTrainingUpload } = require('../../middlewares/uploadTraining');
const uploadEvidence = createTrainingUpload('cme_evidence');
const handle = (fn) =>
	asyncHandler(async (req, res) => {
		return await fn(req, res);
	});

router.get(
	'/cme-categories',
	handle(async (_req, res) => success(res, await portalService.getCmeCategories())),
);
router.post(
	'/cme-records',
	[
		body('title').trim().notEmpty().withMessage('Vui lòng nhập tên hoạt động'),
		body('year')
			.custom((v, { req }) => !!v || !!req.body.activity_date)
			.withMessage('Vui lòng nhập năm hoặc ngày hoạt động'),
		...updateRules,
	],
	validate,
	handle(async (req, res) =>
		created(res, await cmeRecordService.createMine(req.body, req.user.id), 'Đã gửi, chờ duyệt'),
	),
);
router.put(
	'/cme-records/:id',
	updateRules,
	validate,
	handle(async (req, res) =>
		success(
			res,
			await cmeRecordService.updateMine(req.params.id, req.body, req.user.id),
			'Đã gửi lại, chờ duyệt',
		),
	),
);
router.delete(
	'/cme-records/:id',
	handle(async (req, res) => {
		await cmeRecordService.removeMine(req.params.id, req.user.id);
		return success(res, null, 'Đã xoá');
	}),
);
// kiểm tra quyền sở hữu TRƯỚC khi nhận file (multer ghi đĩa ngay)
const ownPendingRecord = asyncHandler(async (req, res, next) => {
	const rec = await cmeRecordService.getById(req.params.id);
	if (!rec || rec.user_id !== req.user.id || rec.approval_status === 'approved') {
		return res.status(404).json({ success: false, message: 'Không tìm thấy ghi nhận CME' });
	}
	next();
});
router.post(
	'/cme-records/:id/evidence',
	ownPendingRecord,
	uploadEvidence.single('file'),
	handle(async (req, res) => {
		if (!req.file)
			return res.status(400).json({ success: false, message: 'Vui lòng chọn file minh chứng' });
		return success(
			res,
			await cmeRecordService.addEvidenceMine(req.params.id, req.file, req.user.id),
		);
	}),
);

// File kết quả bổ sung — chỉ khi ghi nhận ĐÃ duyệt; kiểm tra trước khi multer ghi file.
const uploadResult = createTrainingUpload('cme_result');
const ownApprovedRecord = asyncHandler(async (req, _res, next) => {
	await cmeRecordService.assertApprovedMine(req.params.id, req.user.id);
	next();
});
router.post(
	'/cme-records/:id/result-files',
	ownApprovedRecord,
	uploadResult.single('file'),
	handle(async (req, res) => {
		if (!req.file) return res.status(400).json({ success: false, message: 'Vui lòng chọn file' });
		return success(
			res,
			await cmeRecordService.addResultFileMine(req.params.id, req.file, req.user.id),
			'Đã tải lên file bổ sung',
		);
	}),
);
router.delete(
	'/cme-records/:id/result-files/:fileId',
	handle(async (req, res) => {
		await cmeRecordService.removeResultFileMine(req.params.id, req.params.fileId, req.user.id);
		return success(res, null, 'Đã xoá file');
	}),
);

// Phiếu theo dõi CME cá nhân (Excel) của chính mình — Body: { year }
router.post('/cme/export-excel', cmePersonalExport.exportMine);

// ─── Điểm danh của học viên (IP bệnh viện + GPS, theo khóa đang học) — staffAttendanceService ──
// GET không chặn theo module và nhận mọi tài khoản (is_trainee = false): trang Cấu hình cần
// nó để hiện IP hiện tại trước khi bật. POST chỉ nhận tài khoản học viên.
const staffAttendanceService = require('../attendance/staffAttendanceService');
const { requireModule } = require('../../middlewares/moduleGuard');
router.get(
	'/attendance',
	handle(async (req, res) =>
		success(res, await staffAttendanceService.getMine(req.user.id, req.ip)),
	),
);
router.post(
	'/attendance/check',
	requireModule('ATTENDANCE'),
	[
		body('lat').isFloat({ min: -90, max: 90 }).toFloat(),
		body('lng').isFloat({ min: -180, max: 180 }).toFloat(),
		body('accuracy').isFloat({ min: 0 }).toFloat(),
		// Ca cần điểm danh khi lúc đó có nhiều ca mở (vd hết ca sáng, vào ca chiều); shift_id null = điểm danh tự do
		body('work_date').optional({ values: 'null' }).isISO8601({ strict: true }),
		body('shift_id').optional({ values: 'null' }).isInt({ min: 1 }).toInt(),
	],
	validate,
	handle(async (req, res) => {
		const { lat, lng, accuracy, shift_id, work_date } = req.body;
		const data = await staffAttendanceService.check(req.user.id, {
			ip: req.ip,
			lat,
			lng,
			accuracy,
			shift_id,
			work_date,
		});
		return success(res, data, data.action === 'check_in' ? 'Đã điểm danh vào' : 'Đã điểm danh ra');
	}),
);

// ─── Đơn xin nghỉ / xin đi muộn của học viên — leaveRequestService ───────────
const leaveRequestService = require('../attendance/leaveRequestService');
router.get(
	'/attendance/leave-requests',
	handle(async (req, res) => success(res, await leaveRequestService.listMine(req.user.id))),
);
// Body: { type: 'absent'|'late', from_date, to_date?, shift_id?, arrive_time? (late), reason }
router.post(
	'/attendance/leave-requests',
	requireModule('ATTENDANCE'),
	[
		body('type').isIn(['absent', 'late']).withMessage('Loại đơn không hợp lệ'),
		body('from_date').isISO8601({ strict: true }).withMessage('Ngày không hợp lệ'),
		body('to_date').optional({ values: 'falsy' }).isISO8601({ strict: true }),
		body('shift_id').optional({ values: 'null' }).isInt({ min: 1 }).toInt(),
		body('arrive_time')
			.optional({ values: 'falsy' })
			.matches(/^([01]\d|2[0-3]):[0-5]\d$/)
			.withMessage('Giờ có mặt phải dạng HH:mm'),
		body('reason')
			.isString()
			.trim()
			.isLength({ min: 5, max: 1000 })
			.withMessage('Lý do 5–1000 ký tự'),
	],
	validate,
	handle(async (req, res) =>
		created(
			res,
			await leaveRequestService.createMine(req.user.id, req.body),
			'Đã gửi đơn xin phép',
		),
	),
);
router.patch(
	'/attendance/leave-requests/:id/cancel',
	requireModule('ATTENDANCE'),
	[param('id').isInt({ min: 1 }).toInt()],
	validate,
	handle(async (req, res) => {
		await leaveRequestService.cancelMine(req.user.id, req.params.id);
		return success(res, null, 'Đã huỷ đơn xin phép');
	}),
);

module.exports = router;
