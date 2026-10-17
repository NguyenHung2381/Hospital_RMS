const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('./cmeRecordController');
const { authenticate, authorizePermission } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/errorHandler');
const { createTrainingUpload } = require('../../middlewares/uploadTraining');

const uploadEvidence = createTrainingUpload('cme_evidence');
const uploadExcel = require('../../middlewares/uploadExcel');

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
		body('year').custom((v, { req }) => !!v || !!req.body.activity_date).withMessage('Vui lòng nhập năm hoặc ngày hoạt động'),
		body('credits').isFloat({ min: 0 }).withMessage('Số tín chỉ không hợp lệ'),
	],
	validate,
	ctrl.createOne,
);

router.post(
	'/bulk-delete',
	canManage,
	[body('ids').isArray({ min: 1 }).withMessage('Chưa chọn ghi nhận nào để xoá')],
	validate,
	ctrl.removeMany,
);
router.post('/:id/approve', canManage, ctrl.approve);
router.post('/:id/reject', canManage, ctrl.reject);
router.put('/:id', canManage, ctrl.updateOne);
router.delete('/:id', canManage, ctrl.removeOne);
router.post('/:id/evidence', canManage, uploadEvidence.single('file'), ctrl.addEvidence);
router.post('/import-excel', canManage, uploadExcel.single('file'), ctrl.importExcel);
// Nút "Thêm NV" trong hộp thoại nhập — controller kiểm tra thêm users:create
router.post('/staff', canManage, ctrl.createStaff);
router.post('/import-template', canManage, ctrl.importTemplate);
router.post('/export-excel', canManage, ctrl.exportExcel);

module.exports = router;
