const router = require('express').Router();
const { param } = require('express-validator');
const ctrl = require('./tuitionController');
const tuitionService = require('./tuitionService');
const { authenticate } = require('../../../middlewares/auth');
const { validate } = require('../../../middlewares/errorHandler');
const { createTrainingUpload } = require('../../../middlewares/uploadTraining');
const { asyncHandler } = require('../../../utils/asyncHandler');

// Học phí của học viên đang đăng nhập (/me/tuition) — mọi thao tác lọc theo hồ sơ
// học viên gắn với tài khoản (trainees.user_id / staff_user_id). Chứng từ lưu ở
// uploads/training/tuition_payment/<mã ghi danh>/.
// Chứng từ là ảnh chụp giao dịch hoặc PDF — không theo danh sách đuôi tài liệu chung
// (Cấu hình hệ thống thường không có ảnh); nội dung vẫn được secureUpload kiểm + quét virus.
const uploadProof = createTrainingUpload('tuition_payment', {
	extensions: ['.pdf', '.jpg', '.jpeg', '.png'],
});

router.use(authenticate);

router.get('/', ctrl.listMine);

// Kiểm lượt ghi danh là của mình + đã duyệt TRƯỚC khi multer ghi file xuống đĩa
const ownEnrollment = asyncHandler(async (req, _res, next) => {
	await tuitionService.assertCanSubmit(req.user.id, req.params.id);
	next();
});

router.post(
	'/:id/payments',
	[param('id').isString().isLength({ min: 1, max: 20 })],
	validate,
	ownEnrollment,
	uploadProof.single('file'),
	ctrl.submitMine,
);
router.delete('/payments/:paymentId', ctrl.cancelMine);
router.post('/payments/:paymentId/receipt', ctrl.myReceipt);

module.exports = router;
