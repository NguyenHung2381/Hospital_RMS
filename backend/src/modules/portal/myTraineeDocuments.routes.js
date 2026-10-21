const router = require('express').Router();
const traineeRecordService = require('../training/trainees/traineeRecordService');
const { authenticate } = require('../../middlewares/auth');
const { createTrainingUpload } = require('../../middlewares/uploadTraining');
const { success, created } = require('../../utils/response');
const { asyncHandler } = require('../../utils/asyncHandler');

// Học viên tự nộp giấy tờ còn thiếu (/me/trainee-documents) — giai đoạn 3. Mọi thao
// tác theo hồ sơ học viên gắn với tài khoản đăng nhập (trainees.user_id), file nộp
// ở trạng thái 'pending' chờ cán bộ duyệt (PUT /trainees/documents/:docId/review).
const uploadDoc = createTrainingUpload('trainee_document');

router.use(authenticate);

router.get(
	'/',
	asyncHandler(async (req, res) =>
		success(res, await traineeRecordService.myChecklist(req.user.id)),
	),
);

// Thư mục lưu file theo mã học viên (multer đọc req.params.id) — xác định TRƯỚC khi nhận file
const ownTrainee = asyncHandler(async (req, _res, next) => {
	req.params.id = await traineeRecordService.traineeIdOfUser(req.user.id);
	next();
});

router.post(
	'/',
	ownTrainee,
	uploadDoc.single('file'),
	asyncHandler(async (req, res) => {
		if (!req.file) {
			return res.status(400).json({ success: false, message: 'Vui lòng chọn file để tải lên' });
		}
		return created(
			res,
			await traineeRecordService.addMyDocument(req.user.id, req.body.doc_type, req.file),
			'Đã nộp, chờ phòng Đào tạo duyệt',
		);
	}),
);

router.delete(
	'/:docId',
	asyncHandler(async (req, res) =>
		success(
			res,
			await traineeRecordService.removeMyDocument(req.user.id, req.params.docId),
			'Đã rút lại',
		),
	),
);

module.exports = router;
