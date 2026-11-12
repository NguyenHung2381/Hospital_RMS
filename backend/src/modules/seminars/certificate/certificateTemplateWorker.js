/**
 * Worker thread xử lý mẫu giấy chứng nhận rồi thoát — xem lý do ở
 * certificateTemplate.js (runInWorker). workerData = { mode, buffer, extra }:
 *   prepare     → làm sạch + dò ô + ảnh xem trước + dòng chữ
 *   preview     → chỉ ảnh xem trước
 *   texts       → chỉ danh sách dòng chữ
 *   removeTexts → xoá các dòng (extra = khung) khỏi bản gốc + ảnh xem trước mới
 * Trả { result } hoặc { error: { message, statusCode } }.
 */
const { isMainThread, parentPort, workerData } = require('worker_threads');
const T = require('./certificateTemplate');

const JOBS = {
	prepare: (buf) => T.prepareTemplateCore(buf),
	preview: (buf) => T.renderPreviewCore(buf),
	texts: (buf) => T.extractTextsCore(buf),
	removeTexts: (buf, extra) => T.removeTextsCore(buf, extra || []),
};

// Bị require() ở luồng chính (vd scripts/check-requires.js) thì không làm gì
if (!isMainThread && parentPort) {
	const job = JOBS[workerData.mode];
	Promise.resolve()
		.then(() => {
			if (!job) throw new Error(`Chế độ worker không hợp lệ: ${workerData.mode}`);
			return job(Buffer.from(workerData.buffer), workerData.extra);
		})
		.then((result) => parentPort.postMessage({ result }))
		.catch((err) =>
			parentPort.postMessage({
				// Lỗi không chủ đích (≠ httpError) → 500, không lộ chi tiết nội bộ ra client
				error: err.statusCode
					? { message: err.message, statusCode: err.statusCode }
					: { message: 'Không xử lý được file PDF mẫu.', statusCode: 500, detail: String(err) },
			}),
		);
}
