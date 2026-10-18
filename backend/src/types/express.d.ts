// Kiểu cho các trường middleware gắn thêm vào req (chỉ dùng khi tsc kiểm tra
// file JS — xem `npm run typecheck`). Không có code chạy.
declare global {
	namespace Express {
		interface Request {
			/** Người dùng đã xác thực — middlewares/auth.js (authenticate) */
			user?: any;
			/** Dữ liệu đã kiểm tra — middlewares/validateRequest.js */
			valid?: { body?: any; query?: any; params?: any };
		}
	}
}

export {};
