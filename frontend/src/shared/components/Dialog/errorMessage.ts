/** Lấy câu lỗi đọc được từ giá trị reject (Error, chuỗi) — không có thì dùng câu dự phòng. */
export function errorMessage(err: unknown, fallback: string): string {
	if (err instanceof Error && err.message) return err.message;
	if (typeof err === 'string' && err) return err;
	return fallback;
}
