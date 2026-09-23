/**
 * Lỗi nghiệp vụ chuẩn hoá — tương thích ngược với `middlewares/errorHandler.js`
 * hiện có (đọc `err.statusCode` + `err.message`, coi statusCode < 500 là lỗi
 * chủ động nên message an toàn để hiển thị cho người dùng). Dùng dần trong
 * code TypeScript mới (Giai đoạn 1+); không bắt buộc thay thế `throw new
 * Error(...)` ở các service .js hiện có.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code?: string;
  readonly errors?: unknown;

  constructor(message: string, statusCode = 400, code?: string, errors?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.errors = errors;
    Error.captureStackTrace?.(this, AppError);
  }

  static badRequest(message: string, code?: string, errors?: unknown): AppError {
    return new AppError(message, 400, code, errors);
  }

  static unauthorized(message = 'Không có quyền truy cập', code?: string): AppError {
    return new AppError(message, 401, code);
  }

  static forbidden(message = 'Truy cập bị từ chối', code?: string): AppError {
    return new AppError(message, 403, code);
  }

  static notFound(message = 'Không tìm thấy dữ liệu', code?: string): AppError {
    return new AppError(message, 404, code);
  }

  static conflict(message: string, code?: string): AppError {
    return new AppError(message, 409, code);
  }
}
