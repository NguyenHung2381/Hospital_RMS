const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('../controllers/seminarController');
const cmeRequirementService = require('../services/cmeRequirementService');
const { authenticate, authorizePermission } = require('../middlewares/auth');
const { validate } = require('../middlewares/errorHandler');
const { success, created } = require('../utils/response');

const uploadExcel = require('../middlewares/uploadExcel');

/**
 * @swagger
 * tags:
 *   - name: Seminars
 *     description: Quản lý Hội thảo, Hội nghị & cấp CME (độc lập với NCKH)
 */

const canRead = authorizePermission(['seminars', 'read']);
const canCreate = authorizePermission(['seminars', 'create']);
const canUpdate = authorizePermission(['seminars', 'update']);
const canDelete = authorizePermission(['seminars', 'delete']);
const canImport = authorizePermission(['seminars', 'import']);
const canCme = authorizePermission(['seminars', 'cme_manage']);

// Số liệu tổng hợp nhập tay — cho phép để trống, nếu có phải là số nguyên ≥ 0.
const countFields = [
	'manual_participant_count',
	'manual_internal_count',
	'manual_external_count',
	'manual_foreign_count',
	'manual_cme_count',
].map((f) =>
	body(f)
		.optional({ nullable: true })
		.isInt({ min: 0 })
		.withMessage(`${f} phải là số nguyên ≥ 0`),
);

// ─── Thống kê & Sổ CME (đặt trước /:id) ──────────────────────────────────────

/**
 * @swagger
 * /seminars/stats:
 *   get:
 *     summary: Thống kê hội thảo/hội nghị do bệnh viện tổ chức (mẫu file 1.4)
 *     tags: [Seminars]
 *     parameters:
 *       - in: query
 *         name: year
 *         schema: { type: integer }
 *     responses:
 *       200: { description: OK }
 */
router.get('/stats', authenticate, canRead, ctrl.statsHosted);

/**
 * @swagger
 * /seminars/cme/stats:
 *   get:
 *     summary: Thống kê cấp CME theo năm
 *     tags: [Seminars]
 *     parameters:
 *       - in: query
 *         name: year
 *         schema: { type: integer }
 */
router.get('/cme/stats', authenticate, canRead, ctrl.cmeStats);

/**
 * @swagger
 * /seminars/cme/register:
 *   get:
 *     summary: Sổ cấp CME của một năm (mọi lượt cấp, sắp theo số quyết định)
 *     tags: [Seminars]
 *     parameters:
 *       - in: query
 *         name: year
 *         schema: { type: integer }
 */
router.get('/cme/register', authenticate, canRead, ctrl.cmeRegister);

/**
 * @swagger
 * /seminars/cme/register/{year}:
 *   put:
 *     summary: Chỉnh "số cuối đã cấp" của sổ CME năm đó
 *     tags: [Seminars]
 *     parameters:
 *       - in: path
 *         name: year
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [last_seq]
 *             properties:
 *               last_seq: { type: integer, example: 330 }
 */
router.put(
	'/cme/register/:year',
	authenticate,
	canCme,
	[body('last_seq').isInt({ min: 0 }).withMessage('Số cuối phải là số nguyên ≥ 0')],
	validate,
	ctrl.updateCmeRegister,
);

// ─── CRUD hội thảo ───────────────────────────────────────────────────────────

/**
 * @swagger
 * /seminars:
 *   get:
 *     summary: Danh sách hội thảo/hội nghị
 *     tags: [Seminars]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: scope
 *         schema: { type: string, enum: [external, hosted] }
 *       - in: query
 *         name: event_type
 *         schema: { type: string }
 *       - in: query
 *         name: year
 *         schema: { type: integer }
 *       - in: query
 *         name: grants_cme
 *         schema: { type: string, enum: ['1'] }
 *   post:
 *     summary: Tạo hội thảo/hội nghị mới
 *     tags: [Seminars]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title]
 *             properties:
 *               title: { type: string }
 *               event_type: { type: string, enum: [conference, sci_seminar, intl_seminar, sci_conference, training, other] }
 *               scope: { type: string, enum: [external, hosted] }
 *               location: { type: string }
 *               start_date: { type: string, format: date }
 *               end_date: { type: string, format: date }
 *               date_text: { type: string }
 *               event_year: { type: integer }
 *               grants_cme: { type: boolean }
 *               cme_default_credits: { type: number }
 */
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
	],
	validate,
	ctrl.createOne,
);

/**
 * @swagger
 * /seminars/cme-requirements:
 *   get:
 *     summary: Ngưỡng tín chỉ CME theo năm (toàn viện hoặc theo khoa/phòng)
 *     tags: [Seminars]
 *   post:
 *     summary: Thêm ngưỡng tín chỉ CME
 *     tags: [Seminars]
 */
// LƯU Ý: các route path cố định (/cme-requirements, /cme-compliance) PHẢI
// đăng ký TRƯỚC router.get('/:id', ...) bên dưới — nếu không Express sẽ khớp
// nhầm vào /:id (vd coi "cme-requirements" là 1 seminar id).
router.get('/cme-requirements', authenticate, canCme, async (req, res, next) => {
	try {
		return success(res, await cmeRequirementService.getAll(req.query));
	} catch (e) {
		next(e);
	}
});
router.post(
	'/cme-requirements',
	authenticate,
	canCme,
	[
		body('year').isInt({ min: 2000, max: 2100 }),
		body('required_credits').isFloat({ min: 0 }),
	],
	validate,
	async (req, res, next) => {
		try {
			return created(res, await cmeRequirementService.create(req.body, req.user.id));
		} catch (e) {
			next(e);
		}
	},
);
router.put('/cme-requirements/:id', authenticate, canCme, async (req, res, next) => {
	try {
		await cmeRequirementService.update(req.params.id, req.body, req.user.id);
		return success(res, null, 'Đã cập nhật');
	} catch (e) {
		next(e);
	}
});
router.delete('/cme-requirements/:id', authenticate, canCme, async (req, res, next) => {
	try {
		await cmeRequirementService.remove(req.params.id);
		return success(res, null, 'Đã xoá');
	} catch (e) {
		next(e);
	}
});

/**
 * @swagger
 * /seminars/cme-compliance:
 *   get:
 *     summary: Danh sách nhân sự chưa đạt ngưỡng tín chỉ CME của năm
 *     tags: [Seminars]
 *     parameters:
 *       - in: query
 *         name: year
 *         required: true
 *         schema: { type: integer }
 */
router.get('/cme-compliance', authenticate, canCme, async (req, res, next) => {
	try {
		if (!req.query.year) {
			return res.status(400).json({ success: false, message: 'Thiếu tham số year' });
		}
		return success(res, await cmeRequirementService.getComplianceReport(req.query.year));
	} catch (e) {
		next(e);
	}
});

/**
 * @swagger
 * /seminars/{id}:
 *   get:
 *     summary: Chi tiết hội thảo + danh sách người tham dự
 *     tags: [Seminars]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *   put:
 *     summary: Cập nhật hội thảo/hội nghị
 *     tags: [Seminars]
 *   delete:
 *     summary: Xoá hội thảo/hội nghị (chặn nếu đã cấp số CME)
 *     tags: [Seminars]
 */
router.get('/:id', authenticate, canRead, ctrl.getById);
router.put('/:id', authenticate, canUpdate, countFields, validate, ctrl.updateOne);
router.delete('/:id', authenticate, canDelete, ctrl.removeOne);

// ─── Người tham dự ───────────────────────────────────────────────────────────

/**
 * @swagger
 * /seminars/{id}/participants:
 *   get:
 *     summary: Danh sách người tham dự
 *     tags: [Seminars]
 *   post:
 *     summary: Thêm người tham dự
 *     tags: [Seminars]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [full_name]
 *             properties:
 *               full_name: { type: string }
 *               user_id: { type: string }
 *               source: { type: string, enum: [internal, external] }
 *               participation_type: { type: string, enum: [attendee, speaker, chair, organizer, trainee] }
 */
router.get('/:id/participants', authenticate, canRead, ctrl.listParticipants);
router.post(
	'/:id/participants',
	authenticate,
	canUpdate,
	[body('full_name').trim().notEmpty().withMessage('Họ tên không được để trống')],
	validate,
	ctrl.addParticipant,
);

/**
 * @swagger
 * /seminars/{id}/participants/import-excel:
 *   post:
 *     summary: Nhập danh sách người tham dự từ file Excel (tự dò tiêu đề cột)
 *     tags: [Seminars]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file: { type: string, format: binary, description: File .xlsx }
 *               dry_run: { type: string, enum: ['0', '1'], description: '1 = chỉ xem trước' }
 *               issue_cme: { type: string, enum: ['0', '1'], description: '1 = cấp số CME ngay sau khi nhập' }
 *     responses:
 *       200:
 *         description: "dry_run: { rows[], summary, warnings[] }; commit: { inserted, cme_issued, cme_from, cme_to, cme_year, warnings[] }"
 *       400:
 *         description: File không hợp lệ hoặc thiếu cột bắt buộc
 */
router.post(
	'/:id/participants/import-excel',
	authenticate,
	canImport,
	uploadExcel.single('file'),
	ctrl.importParticipants,
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
	[body('token').notEmpty()],
	validate,
	ctrl.checkInSelf,
);

// ─── Cấp CME ─────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /seminars/{id}/participants/issue-cme:
 *   post:
 *     summary: Cấp số quyết định CME cho một/nhiều người (tuần tự theo năm)
 *     tags: [Seminars]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               participant_ids: { type: array, items: { type: string } }
 *               year: { type: integer, description: "Mặc định = năm sự kiện" }
 */
router.post(
	'/:id/participants/issue-cme',
	authenticate,
	canCme,
	[body('participant_ids').isArray({ min: 1 }).withMessage('Chưa chọn người để cấp CME')],
	validate,
	ctrl.issueCme,
);
router.post('/:id/participants/:pid/revoke-cme', authenticate, canCme, ctrl.revokeCme);

/**
 * @swagger
 * /seminars/{id}/participants/bulk-cme:
 *   post:
 *     summary: Đổi trạng thái CME hàng loạt (issued ↔ signed)
 *     tags: [Seminars]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [participant_ids, status]
 *             properties:
 *               participant_ids: { type: array, items: { type: string } }
 *               status: { type: string, enum: [issued, signed] }
 */
router.post(
	'/:id/participants/bulk-cme',
	authenticate,
	canUpdate,
	[
		body('participant_ids').isArray({ min: 1 }),
		body('status').isIn(['issued', 'signed']),
	],
	validate,
	ctrl.bulkCmeStatus,
);

module.exports = router;
