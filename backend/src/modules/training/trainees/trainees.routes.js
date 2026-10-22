const router = require('express').Router();
const { body, query } = require('express-validator');
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
router.get('/:id/progress', authorizePermission(['trainees', 'read']), ctrl.getProgress);

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
// Hồ sơ đầy đủ (giai đoạn 3): checklist giấy tờ theo loại khóa, điểm danh, kết quả, CME
router.get(
	'/:id/document-checklist',
	authorizePermission(['trainees', 'read_sensitive']),
	ctrl.getDocumentChecklist,
);
router.put(
	'/documents/:docId/review',
	authorizePermission(['trainees', 'update']),
	[body('status').isIn(['approved', 'rejected']).withMessage('Trạng thái không hợp lệ')],
	validate,
	ctrl.reviewDocument,
);
router.get('/:id/attendance', authorizePermission(['trainees', 'read']), ctrl.getAttendance);
// Lịch học (dạng giống lịch toàn hệ thống) trong [from, to]
router.get(
	'/:id/schedule',
	authorizePermission(['trainees', 'read']),
	[
		query('from').isISO8601().withMessage('Ngày bắt đầu không hợp lệ'),
		query('to').isISO8601().withMessage('Ngày kết thúc không hợp lệ'),
	],
	validate,
	ctrl.getSchedule,
);
router.get('/:id/grades', authorizePermission(['trainees', 'read']), ctrl.getGrades);
router.get('/:id/cme', authorizePermission(['trainees', 'read']), ctrl.getCme);
router.delete(
	'/documents/:docId',
	authorizePermission(['trainees', 'update']),
	ctrl.removeDocument,
);

module.exports = router;
