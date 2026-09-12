const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('../controllers/trainingProgramController');
const trainingProgramService = require('../services/trainingProgramService');
const { authenticate, authorizePermission } = require('../middlewares/auth');
const { validate } = require('../middlewares/errorHandler');
const { success } = require('../utils/response');

/**
 * @swagger
 * tags:
 *   name: TrainingPrograms
 *   description: Quản lý chương trình đào tạo & môn học (module Đào tạo)
 */

router.use(authenticate);

router.get('/', authorizePermission(['training_programs', 'read']), ctrl.getAll);
router.get('/:id', authorizePermission(['training_programs', 'read']), ctrl.getById);

router.post(
	'/',
	authorizePermission(['training_programs', 'create']),
	[
		body('name').trim().notEmpty().withMessage('Tên chương trình không được để trống'),
		body('subject_ids').optional().isArray(),
	],
	validate,
	ctrl.createOne,
);

router.put(
	'/:id',
	authorizePermission(['training_programs', 'update']),
	[
		body('name').optional().trim().notEmpty(),
		body('subject_ids').optional().isArray(),
	],
	validate,
	ctrl.updateOne,
);

router.delete('/:id', authorizePermission(['training_programs', 'delete']), ctrl.removeOne);

// Môn học của chương trình (N:N) — mirror /round-types/:id/levels
router.get('/:id/subjects', authorizePermission(['training_programs', 'read']), async (req, res, next) => {
	try {
		return success(res, await trainingProgramService.getSubjectIds(req.params.id));
	} catch (e) {
		next(e);
	}
});

router.put(
	'/:id/subjects',
	authorizePermission(['training_programs', 'update']),
	[body('subject_ids').isArray().withMessage('subject_ids phải là mảng')],
	validate,
	async (req, res, next) => {
		try {
			const ids = await trainingProgramService.setSubjectIds(req.params.id, req.body.subject_ids);
			return success(res, ids, 'Đã cập nhật môn học cho chương trình');
		} catch (e) {
			next(e);
		}
	},
);

module.exports = router;
