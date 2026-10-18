// Bọc handler/middleware async của Express 4: Promise bị reject (lỗi ném ra
// trong handler) được chuyển cho errorHandler qua next(err) — thay cho khối
//   try { ... } catch (err) { next(err); }
// lặp lại ở mọi handler. Express 5 tự làm việc này; Express 4 thì không (lỗi
// async không bắt sẽ thành unhandledRejection, request treo tới timeout).
//
//   router.get('/', asyncHandler(async (req, res) => success(res, await svc.getAll())));
// Lỗi ném đồng bộ (fn không async) cũng chuyển cho next — handler vẫn chạy
// ngay trong lượt gọi, không bị đẩy sang microtask.
const asyncHandler = (fn) => (req, res, next) => {
	try {
		return Promise.resolve(fn(req, res, next)).catch(next);
	} catch (err) {
		return next(err);
	}
};

module.exports = { asyncHandler };
