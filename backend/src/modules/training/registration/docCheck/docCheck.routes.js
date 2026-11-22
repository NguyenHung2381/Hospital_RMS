// Tự kiểm tra file hồ sơ đăng ký khóa ĐTLT (OCR / QR) — phần hiện ở trang Cấu hình hệ thống.
// Gắn ở app.js dưới /system-settings (TRƯỚC router system-settings, vì router đó có route /:key).
// Quyền gắn theo từng route, không router.use: request khác của /system-settings đi tiếp qua đây.
// Đặt ở module training chứ không ở settings: settings là module lõi, không được phụ thuộc
// module nghiệp vụ (npm run check:deps).
const router = require('express').Router();
const { authenticate, authorizePermission } = require('../../../../middlewares/auth');
const { success } = require('../../../../utils/response');
const { asyncHandler } = require('../../../../utils/asyncHandler');
const docCheckService = require('./docCheckService');
const docCheckWorker = require('./docCheckWorker');
const { tesseractAvailable } = require('./docCheckAnalyzer');

// Cùng quyền với phần còn lại của Cấu hình hệ thống
const guard = [authenticate, authorizePermission(['system_settings', 'manage'])];

// Trạng thái máy chủ + hàng đợi, để admin biết công tắc TRAINING_REGISTRATION_DOC_CHECK
// có đang thực sự chạy không.
router.get(
	'/doc-check',
	...guard,
	asyncHandler(async (req, res) => {
		const [queue, ocr, enabled] = await Promise.all([
			docCheckService.queueStats(),
			tesseractAvailable(),
			docCheckService.isEnabled(),
		]);
		return success(res, {
			enabled,
			// DOC_CHECK_ENABLED=false trong .env tắt vòng xử lý trên mọi tiến trình — công tắc UI vô tác dụng
			worker_disabled: process.env.DOC_CHECK_ENABLED === 'false',
			ocr,
			queue,
		});
	}),
);

// Đưa lại hàng đợi các file đã lỗi đủ số lần thử (sau khi admin sửa nguyên nhân).
router.post(
	'/doc-check/retry',
	...guard,
	asyncHandler(async (req, res) => {
		const n = await docCheckService.retryFailed();
		docCheckWorker.kick();
		return success(
			res,
			{ requeued: n },
			n ? `Đã đưa ${n} file vào hàng đợi kiểm tra lại` : 'Không có file lỗi cần kiểm tra lại',
		);
	}),
);

module.exports = router;
