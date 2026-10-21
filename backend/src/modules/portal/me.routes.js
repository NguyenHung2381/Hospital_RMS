const router = require('express').Router();
const portalService = require('./portalService');
const cmePersonalExport = require('../cme/cmePersonalExportController');
const { authenticate } = require('../../middlewares/auth');
const { success, created } = require('../../utils/response');
const { asyncHandler } = require('../../utils/asyncHandler');

router.use(authenticate);

router.get(
	'/training',
	asyncHandler(async (req, res) => {
		return success(res, await portalService.getMyTraining(req.user));
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
const { body } = require('express-validator');
const { validate } = require('../../middlewares/errorHandler');
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
		body('title').trim().notEmpty().withMessage('Vui lòng nhập nội dung hoạt động'),
		body('year')
			.custom((v, { req }) => !!v || !!req.body.activity_date)
			.withMessage('Vui lòng nhập năm hoặc ngày hoạt động'),
		body('credits').isFloat({ min: 0 }).withMessage('Số tín chỉ không hợp lệ'),
	],
	validate,
	handle(async (req, res) =>
		created(res, await cmeRecordService.createMine(req.body, req.user.id), 'Đã gửi, chờ duyệt'),
	),
);
router.put(
	'/cme-records/:id',
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

// ─── Chấm công của chính mình (IP bệnh viện + GPS) — staffAttendanceService ──
// GET không chặn theo module: trang Cấu hình cần nó để hiện IP hiện tại trước khi bật.
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
		// Ca cần chấm khi lúc đó có nhiều ca mở (vd hết ca sáng, vào ca chiều); shift_id null = chấm tự do
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
		return success(res, data, data.action === 'check_in' ? 'Đã chấm công vào' : 'Đã chấm công ra');
	}),
);

module.exports = router;
