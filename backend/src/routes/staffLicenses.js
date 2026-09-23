const router = require('express').Router();
const { body } = require('express-validator');
const staffLicenseService = require('../services/staffLicenseService');
const { createCrudController } = require('../controllers/crudController');
const { authenticate, authorizePermission } = require('../middlewares/auth');
const { validate } = require('../middlewares/errorHandler');

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

router.get('/by-user/:userId', authorizePermission(['staff_licenses', 'read']), async (req, res, next) => {
	try {
		const { success, notFound } = require('../utils/response');
		const item = await staffLicenseService.getByUserId(req.params.userId);
		if (!item) return notFound(res);
		return success(res, item);
	} catch (err) {
		next(err);
	}
});

router.post(
	'/',
	authorizePermission(['staff_licenses', 'create']),
	[body('user_id').trim().notEmpty().withMessage('Thiếu user_id')],
	validate,
	ctrl.createOne,
);

router.put('/:id', authorizePermission(['staff_licenses', 'update']), ctrl.updateOne);

router.delete('/:id', authorizePermission(['staff_licenses', 'delete']), ctrl.removeOne);

module.exports = router;
