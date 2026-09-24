const router = require('express').Router();
const multer = require('multer');
const { body } = require('express-validator');
const ctrl = require('../controllers/cmeRecordController');
const { authenticate, authorizePermission } = require('../middlewares/auth');
const { validate } = require('../middlewares/errorHandler');
const { createTrainingUpload } = require('../middlewares/uploadTraining');

const uploadEvidence = createTrainingUpload('cme_evidence');
const uploadExcel = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

/**
 * @swagger
 * tags:
 *   name: CmeRecords
 *   description: Ghi nhận tín chỉ CME độc lập, không qua seminar (module Đào tạo)
 */

router.use(authenticate);
const canManage = authorizePermission(['cme_records', 'manage']);

router.get('/', canManage, ctrl.getAll);
router.get('/:id', canManage, ctrl.getById);

router.post(
	'/',
	canManage,
	[
		body('user_id').notEmpty().withMessage('Vui lòng chọn nhân viên'),
		body('title').trim().notEmpty().withMessage('Vui lòng nhập nội dung hoạt động'),
		body('activity_date').notEmpty().withMessage('Vui lòng chọn ngày hoạt động'),
		body('credits').isFloat({ min: 0 }).withMessage('Số tín chỉ không hợp lệ'),
	],
	validate,
	ctrl.createOne,
);

router.put('/:id', canManage, ctrl.updateOne);
router.delete('/:id', canManage, ctrl.removeOne);
router.post('/:id/evidence', canManage, uploadEvidence.single('file'), ctrl.addEvidence);
router.post('/import-excel', canManage, uploadExcel.single('file'), ctrl.importExcel);

module.exports = router;
