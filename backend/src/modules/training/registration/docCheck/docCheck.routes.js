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
		const [queue, ocr, enabled, signatureEnabled, signatureRules] = await Promise.all([
			docCheckService.queueStats(),
			tesseractAvailable(),
			docCheckService.isEnabled(),
			docCheckService.isSignatureEnabled(),
			docCheckService.getSignatureConfig(),
		]);
		return success(res, {
			enabled,
			// Công tắc TRAINING_DOC_SIGNATURE_CHECK (mặc định tắt) — chỉ chạy khi `enabled` cũng bật
			signature_enabled: signatureEnabled,
			// Cấu hình chi tiết TRAINING_DOC_SIGNATURE_RULES đã chuẩn hoá (đủ mọi loại / mục, có mặc định)
			signature_rules: signatureRules,
			// DOC_CHECK_ENABLED=false trong .env tắt vòng xử lý trên mọi tiến trình — công tắc UI vô tác dụng
			worker_disabled: process.env.DOC_CHECK_ENABLED === 'false',
			ocr,
			queue,
		});
	}),
);

// Đưa lại hàng đợi: mặc định các file đã lỗi đủ số lần thử (sau khi admin sửa nguyên nhân);
// body { what: 'signature' } ⇒ mọi file thuộc loại có kiểm chữ ký (sau khi bật thêm mục kiểm
// trong cấu hình chi tiết — mục mới bật chưa có dữ liệu ở lần kiểm cũ).
router.post(
	'/doc-check/retry',
	...guard,
	asyncHandler(async (req, res) => {
		const signature = req.body?.what === 'signature';
		const n = signature
			? await docCheckService.requeueSignatures()
			: await docCheckService.retryFailed();
		docCheckWorker.kick();
		const none = signature
			? 'Không có file nào cần kiểm lại chữ ký'
			: 'Không có file lỗi cần kiểm tra lại';
		return success(res, { requeued: n }, n ? `Đã đưa ${n} file vào hàng đợi kiểm tra lại` : none);
	}),
);

module.exports = router;
