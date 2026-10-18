const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('./traineeController');
const { authenticate, authorizePermission } = require('../../../middlewares/auth');
const { validate } = require('../../../middlewares/errorHandler');
const { createTrainingUpload } = require('../../../middlewares/uploadTraining');

const uploadTraineeDoc = createTrainingUpload('trainee_document');
const uploadExcel = require('../../../middlewares/uploadExcel');

router.use(authenticate);

router.get('/', authorizePermission(['trainees', 'read']), ctrl.getAll);

router.post(
	'/import-excel',
	authorizePermission(['trainees', 'import']),
	uploadExcel.single('file'),
	ctrl.importExcel,
);

router.post('/grant-accounts', authorizePermission(['trainees', 'manage']), ctrl.grantAccounts);

router.get('/:id', authorizePermission(['trainees', 'read']), ctrl.getById);

router.post(
	'/',
	authorizePermission(['trainees', 'create']),
	[
		body('full_name').trim().notEmpty().withMessage('Họ tên không được để trống'),
		body('email').optional({ checkFalsy: true }).isEmail().withMessage('Email không hợp lệ'),
		body('dob').optional({ checkFalsy: true }).isISO8601(),
	],
	validate,
	ctrl.createOne,
);

router.put(
	'/:id',
	authorizePermission(['trainees', 'update']),
	[
		body('full_name').optional().trim().notEmpty(),
		body('email').optional({ checkFalsy: true }).isEmail().withMessage('Email không hợp lệ'),
		body('dob').optional({ checkFalsy: true }).isISO8601(),
	],
	validate,
	ctrl.updateOne,
);

router.delete('/:id', authorizePermission(['trainees', 'delete']), ctrl.removeOne);

router.get('/:id/enrollments', authorizePermission(['trainees', 'read']), ctrl.listEnrollments);

router.get(
	'/:id/documents',
	authorizePermission(['trainees', 'read_sensitive']),
	ctrl.listDocuments,
);
router.post(
	'/:id/documents',
	authorizePermission(['trainees', 'update']),
	uploadTraineeDoc.single('file'),
	ctrl.addDocument,
);
router.delete(
	'/documents/:docId',
	authorizePermission(['trainees', 'update']),
	ctrl.removeDocument,
);

module.exports = router;
