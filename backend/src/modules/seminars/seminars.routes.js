const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('./seminarController');
const participantService = require('./seminarParticipantService');
const cmeRequirementService = require('../cme/cmeRequirementService');
const cmePersonalExport = require('../cme/cmePersonalExportController');
const { authenticate, authorizePermission } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/errorHandler');
const { success, created } = require('../../utils/response');
const { asyncHandler } = require('../../utils/asyncHandler');

const uploadExcel = require('../../middlewares/uploadExcel');
const { makeImageUpload, safeParam } = require('../../middlewares/uploadImage');

// Ảnh minh hoạ câu hỏi bài test cuối buổi — uploads/seminars/<id>/test/
const uploadTestImage = makeImageUpload((req) => ['seminars', safeParam(req, 'id'), 'test']);

const canRead = authorizePermission(['seminars', 'read']);
const canCreate = authorizePermission(['seminars', 'create']);
const canUpdate = authorizePermission(['seminars', 'update']);
const canDelete = authorizePermission(['seminars', 'delete']);
const canImport = authorizePermission(['seminars', 'import']);
const canExport = authorizePermission(['seminars', 'export']);
const canCme = authorizePermission(['seminars', 'cme_manage']);

// Số liệu tổng hợp nhập tay — cho phép để trống, nếu có phải là số nguyên ≥ 0.
const countFields = [
	'manual_participant_count',
	'manual_internal_count',
	'manual_external_count',
	'manual_foreign_count',
	'manual_cme_count',
].map((f) =>
	body(f).optional({ nullable: true }).isInt({ min: 0 }).withMessage(`${f} phải là số nguyên ≥ 0`),
);

// Trường riêng của tập huấn bệnh viện
const trainingFields = [
	body('lesson_hours')
		.optional({ values: 'null' })
		.isFloat({ min: 0, max: 999 })
		.withMessage('Số tiết phải là số từ 0 đến 999'),
	body('required_department_ids').optional().isArray(),
];

// ─── Thống kê & Sổ CME (đặt trước /:id) ──────────────────────────────────────

router.get('/stats', authenticate, canRead, ctrl.statsHosted);

router.get('/cme/stats', authenticate, canRead, ctrl.cmeStats);

router.get('/cme/register', authenticate, canRead, ctrl.cmeRegister);

router.put(
	'/cme/register/:year',
	authenticate,
	canCme,
	[body('last_seq').isInt({ min: 0 }).withMessage('Số cuối phải là số nguyên ≥ 0')],
	validate,
	ctrl.updateCmeRegister,
);

// ─── CRUD hội thảo ───────────────────────────────────────────────────────────

router.get('/', authenticate, canRead, ctrl.getAll);
router.post(
	'/',
	authenticate,
	canCreate,
	[
		body('title').trim().notEmpty().withMessage('Tên hội thảo/hội nghị không được để trống'),
		body('scope').optional().isIn(['external', 'hosted']),
		body('event_type')
			.optional()
			.isIn(['conference', 'sci_seminar', 'intl_seminar', 'sci_conference', 'training', 'other']),
		...countFields,
		...trainingFields,
	],
	validate,
	ctrl.createOne,
);

router.post('/export-excel', authenticate, canExport, ctrl.exportListExcel);
router.post('/import-template', authenticate, canImport, ctrl.importListTemplate);
// File mẫu nhập người tham dự (dùng chung mọi hội thảo, đặt trước /:id)
router.post(
	'/participant-import-template',
	authenticate,
	canImport,
	ctrl.participantImportTemplate,
);
router.post(
	'/import-excel',
	authenticate,
	canImport,
	uploadExcel.single('file'),
	ctrl.importListExcel,
);

// LƯU Ý: các route path cố định (/cme-requirements, /cme-compliance) PHẢI
// đăng ký TRƯỚC router.get('/:id', ...) bên dưới — nếu không Express sẽ khớp
// nhầm vào /:id (vd coi "cme-requirements" là 1 seminar id).
router.get(
	'/cme-requirements',
	authenticate,
	canCme,
	asyncHandler(async (req, res) => {
		return success(res, await cmeRequirementService.getAll(req.query));
	}),
);
router.post(
	'/cme-requirements',
	authenticate,
	canCme,
	[body('year').isInt({ min: 2000, max: 2100 }), body('required_credits').isFloat({ min: 0 })],
	validate,
	asyncHandler(async (req, res) => {
		return created(res, await cmeRequirementService.create(req.body, req.user.id));
	}),
);
router.put(
	'/cme-requirements/:id',
	authenticate,
	canCme,
	asyncHandler(async (req, res) => {
		await cmeRequirementService.update(req.params.id, req.body, req.user.id);
		return success(res, null, 'Đã cập nhật');
	}),
);
router.delete(
	'/cme-requirements/:id',
	authenticate,
	canCme,
	asyncHandler(async (req, res) => {
		await cmeRequirementService.remove(req.params.id);
		return success(res, null, 'Đã xoá');
	}),
);

router.get(
	'/cme-compliance',
	authenticate,
	canCme,
	asyncHandler(async (req, res) => {
		if (!req.query.year) {
			return res.status(400).json({ success: false, message: 'Thiếu tham số year' });
		}
		return success(res, await cmeRequirementService.getComplianceReport(req.query.year));
	}),
);

router.post(
	'/cme-personal/:userId/export-excel',
	authenticate,
	canCme,
	cmePersonalExport.exportPerson,
);

router.get('/:id', authenticate, canRead, ctrl.getById);

router.post('/:id/export-excel', authenticate, canExport, ctrl.exportDetailExcel);
router.put(
	'/:id',
	authenticate,
	canUpdate,
	[...countFields, ...trainingFields],
	validate,
	ctrl.updateOne,
);
router.delete('/:id', authenticate, canDelete, ctrl.removeOne);
// Tải ảnh trước, rồi gửi `image` trả về trong test_questions khi lưu bài test
router.post(
	'/:id/test-image',
	authenticate,
	canUpdate,
	uploadTestImage.single('image'),
	(req, res) => {
		if (!req.file) return res.status(400).json({ success: false, message: 'Chưa chọn ảnh' });
		return created(res, { url: `/uploads/seminars/${req.params.id}/test/${req.file.filename}` });
	},
);

// ─── Người tham dự ───────────────────────────────────────────────────────────

router.get('/:id/participants', authenticate, canRead, ctrl.listParticipants);
router.post(
	'/:id/participants',
	authenticate,
	canUpdate,
	[body('full_name').trim().notEmpty().withMessage('Họ tên không được để trống')],
	validate,
	ctrl.addParticipant,
);

router.post(
	'/:id/participants/import-excel',
	authenticate,
	canImport,
	uploadExcel.single('file'),
	ctrl.importParticipants,
);
// Tập huấn bệnh viện: chọn nhân sự theo khoa / "Thêm cả khoa"
router.get(
	'/:id/department-staff',
	authenticate,
	canUpdate,
	asyncHandler(async (req, res) =>
		success(
			res,
			await participantService.staffOfDepartment(req.params.id, req.query.department_id),
		),
	),
);
router.post(
	'/:id/participants/add-users',
	authenticate,
	canUpdate,
	[body('user_ids').isArray({ min: 1 }).withMessage('Chưa chọn nhân sự')],
	validate,
	asyncHandler(async (req, res) => {
		const out = await participantService.addUsers(req.params.id, req.body.user_ids, req.user.id);
		return created(res, out, `Đã thêm ${out.inserted} người`);
	}),
);
// Nhân sự thuộc khoa bắt buộc tham dự nhưng chưa tham dự
router.get(
	'/:id/required-absentees',
	authenticate,
	canRead,
	asyncHandler(async (req, res) =>
		success(res, await participantService.requiredAbsentees(req.params.id)),
	),
);
router.put('/:id/participants/:pid', authenticate, canUpdate, ctrl.updateParticipant);
router.delete('/:id/participants/:pid', authenticate, canUpdate, ctrl.removeParticipant);

// ─── Điểm danh QR ─────────────────────────────────────────────────────────────
// Sinh mã cần quyền seminars:update (ban tổ chức hiển thị lên màn hình hội
// trường); tự quét chỉ cần đăng nhập — participant tra theo user_id trong
// token, không cần quyền seminars riêng.
router.get('/:id/checkin-qr', authenticate, canUpdate, ctrl.getCheckInQrToken);
router.post(
	'/checkin',
	authenticate,
	[body('token').notEmpty(), body('device_id').isString().isLength({ min: 16, max: 64 })],
	validate,
	ctrl.checkInSelf,
);

// Ban tổ chức quét vé QR (cá nhân) của người tự đăng ký qua link công khai
router.post(
	'/:id/checkin-ticket',
	authenticate,
	canUpdate,
	[
		body('code')
			.isString()
			.matches(/^[a-f0-9]{32}$/)
			.withMessage('Mã QR không phải vé hội nghị hợp lệ.'),
	],
	validate,
	ctrl.checkInTicket,
);

// ─── Cấp CME ─────────────────────────────────────────────────────────────────

router.post(
	'/:id/participants/issue-cme',
	authenticate,
	canCme,
	[body('participant_ids').isArray({ min: 1 }).withMessage('Chưa chọn người để cấp CME')],
	validate,
	ctrl.issueCme,
);
router.post('/:id/participants/:pid/revoke-cme', authenticate, canCme, ctrl.revokeCme);

router.post(
	'/:id/participants/bulk-cme',
	authenticate,
	canUpdate,
	[body('participant_ids').isArray({ min: 1 }), body('status').isIn(['issued', 'signed'])],
	validate,
	ctrl.bulkCmeStatus,
);

module.exports = router;
