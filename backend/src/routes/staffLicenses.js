const router = require('express').Router();
const { body } = require('express-validator');
const staffLicenseService = require('../services/staffLicenseService');
const { createCrudController } = require('../controllers/crudController');
const { authenticate, authorizePermission } = require('../middlewares/auth');
const { validate } = require('../middlewares/errorHandler');
const uploadExcel = require('../middlewares/uploadExcel');
const staffLicenseImportService = require('../services/staffLicenseImportService');
const { success } = require('../utils/response');

/**
 * @swagger
 * tags:
 *   name: StaffLicenses
 *   description: Chứng chỉ hành nghề (CCHN) & hồ sơ chuyên môn nhân sự
 */

const ctrl = createCrudController(staffLicenseService);

router.use(authenticate);

router.get('/', authorizePermission(['staff_licenses', 'read']), ctrl.getAll);
router.get('/:id', authorizePermission(['staff_licenses', 'read']), ctrl.getById);

router.get(
	'/by-user/:userId',
	authorizePermission(['staff_licenses', 'read']),
	async (req, res, next) => {
		try {
			const { success, notFound } = require('../utils/response');
			const item = await staffLicenseService.getByUserId(req.params.userId);
			if (!item) return notFound(res);
			return success(res, item);
		} catch (err) {
			next(err);
		}
	},
);

router.post(
	'/',
	authorizePermission(['staff_licenses', 'create']),
	[body('user_id').trim().notEmpty().withMessage('Thiếu user_id')],
	validate,
	ctrl.createOne,
);

/**
 * @swagger
 * /staff-licenses/import-excel:
 *   post:
 *     summary: Cập nhật CCHN hàng loạt từ file "Danh sách người hành nghề" (khớp MNV)
 *     tags: [StaffLicenses]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file: { type: string, format: binary }
 *               dry_run: { type: string, example: "1" }
 *     responses:
 *       200:
 *         description: "dry_run: { summary, rows[], skipped[], warnings[] }; commit: { summary, written, skipped[], warnings[] }"
 */
router.post(
	'/import-excel',
	authorizePermission(['staff_licenses', 'update']),
	uploadExcel.single('file'),
	async (req, res, next) => {
		try {
			if (!req.file)
				return res.status(400).json({ success: false, message: 'Chưa chọn file Excel.' });
			const dry_run = req.body.dry_run === '1' || req.body.dry_run === 'true';
			return success(
				res,
				await staffLicenseImportService.importExcel(
					{ buffer: req.file.buffer, dry_run },
					req.user.id,
				),
			);
		} catch (err) {
			next(err);
		}
	},
);

router.put('/:id', authorizePermission(['staff_licenses', 'update']), ctrl.updateOne);

router.delete('/:id', authorizePermission(['staff_licenses', 'delete']), ctrl.removeOne);

module.exports = router;
