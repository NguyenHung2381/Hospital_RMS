// Vòng chạy nền xử lý hàng đợi kiểm tra file hồ sơ (docCheckService.processOne).
//   - kick(): gọi ngay sau khi xếp hàng ⇒ thường có kết quả sau vài giây.
//   - Quét lại định kỳ (POLL_MS): bắt việc do tiến trình khác xếp, việc thử lại, việc bỏ dở.
// Mỗi tiến trình làm tuần tự 1 việc / lần; nhiều tiến trình (cluster) chia việc nhờ SKIP LOCKED.
// Tắt cả máy chủ: DOC_CHECK_ENABLED=false (hoặc JOBS_ENABLED=false — jobs/index.js không gọi start).
// Tạm dừng lúc chạy: công tắc TRAINING_REGISTRATION_DOC_CHECK (docCheckService.isEnabled) — mỗi
// lượt quét đọc lại nên bật / tắt có hiệu lực ngay, không cần khởi động lại.
const logger = require('../../../../config/logger');
const service = require('./docCheckService');
const runner = require('./docCheckRunner');
const { tesseractAvailable } = require('./docCheckAnalyzer');

const POLL_MS = 30_000;

let started = false;
let running = false;
let again = false;
/** @type {NodeJS.Timeout | null} */
let timer = null;

const tick = async () => {
	if (!started) return;
	if (running) {
		again = true;
		return;
	}
	running = true;
	try {
		// Admin tắt công tắc ⇒ để nguyên hàng đợi, bật lại thì chạy tiếp
		if (!(await service.isEnabled())) return;
		while (started && (await service.processOne())) {
			/* làm tới khi hàng đợi trống */
		}
	} catch (err) {
		logger.error('[doc_check] lỗi vòng xử lý:', err instanceof Error ? err.message : err);
	} finally {
		running = false;
	}
	if (again) {
		again = false;
		setImmediate(tick);
	}
};

const start = async () => {
	if (started || process.env.DOC_CHECK_ENABLED === 'false') return;
	started = true;
	timer = setInterval(tick, POLL_MS);
	timer.unref();
	try {
		if (await tesseractAvailable()) {
			const n = await service.requeueSkippedForOcr();
			if (n) logger.info(`[doc_check] đã có OCR — xếp hàng kiểm lại ${n} file.`);
		} else {
			logger.warn(
				'[doc_check] không thấy Tesseract (gói vie) — chỉ kiểm bằng lớp chữ PDF + mã QR.',
			);
		}
	} catch (err) {
		logger.warn('[doc_check] không kiểm được OCR:', err instanceof Error ? err.message : err);
	}
	setTimeout(tick, 5_000).unref();
};

/** Có việc mới — xử lý ngay (không chờ lượt quét). */
const kick = () => {
	if (started) setImmediate(tick);
};

const stop = async () => {
	started = false;
	if (timer) clearInterval(timer);
	timer = null;
	await runner.stop();
};

module.exports = { start, kick, stop };
