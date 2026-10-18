const router = require('express').Router();
const { body } = require('express-validator');
const staffLicenseService = require('./staffLicenseService');
const { createCrudController } = require('../../shared/crudController');
const { authenticate, authorizePermission } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/errorHandler');
const uploadExcel = require('../../middlewares/uploadExcel');
const staffLicenseImportService = require('./staffLicenseImportService');
const { success } = require('../../utils/response');
const { asyncHandler } = require('../../utils/asyncHandler');

const ctrl = createCrudController(staffLicenseService);

router.use(authenticate);

router.get('/', authorizePermission(['staff_licenses', 'read']), ctrl.getAll);
router.get('/:id', authorizePermission(['staff_licenses', 'read']), ctrl.getById);

router.get(
	'/by-user/:userId',
	authorizePermission(['staff_licenses', 'read']),
	asyncHandler(async (req, res) => {
		const { success, notFound } = require('../../utils/response');
		const item = await staffLicenseService.getByUserId(req.params.userId);
		if (!item) return notFound(res);
		return success(res, item);
	}),
);

router.post(
	'/',
	authorizePermission(['staff_licenses', 'create']),
	[body('user_id').trim().notEmpty().withMessage('Thiếu user_id')],
	validate,
	ctrl.createOne,
);

router.post(
	'/import-excel',
	authorizePermission(['staff_licenses', 'update']),
	uploadExcel.single('file'),
	asyncHandler(async (req, res) => {
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
	}),
);

router.put('/:id', authorizePermission(['staff_licenses', 'update']), ctrl.updateOne);

router.delete('/:id', authorizePermission(['staff_licenses', 'delete']), ctrl.removeOne);

module.exports = router;
