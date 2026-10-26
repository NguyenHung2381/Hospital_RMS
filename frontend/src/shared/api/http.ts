/**
 * Lỗi hạ tầng — mất mạng, máy chủ không phản hồi, gateway trả trang HTML/body
 * rỗng (502/504 khi backend đang khởi động lại). Khác lỗi nghiệp vụ (server trả
 * JSON kèm message): không bao giờ đưa thông điệp kỹ thuật của trình duyệt
 * ("Failed to fetch", "Unexpected end of JSON input"...) ra giao diện.
 */
export class ServiceUnavailableError extends Error {
	constructor(message = 'Không kết nối được máy chủ. Vui lòng kiểm tra mạng hoặc thử lại sau ít phút.') {
		super(message);
		this.name = 'ServiceUnavailableError';
	}
}

/** fetch() nhưng lỗi mạng (TypeError) được đổi thành ServiceUnavailableError. */
export async function safeFetch(input: string, init?: RequestInit): Promise<Response> {
	try {
		return await fetch(input, init);
	} catch (err) {
		// Request bị hủy chủ động thì để nguyên cho nơi gọi xử lý
		if (err instanceof DOMException && err.name === 'AbortError') throw err;
		throw new ServiceUnavailableError();
	}
}

/**
 * Đọc body JSON của phản hồi. Body rỗng / không phải JSON:
 *   - phản hồi lỗi (5xx, gateway) → ServiceUnavailableError
 *   - phản hồi 2xx → null (vd 204 No Content)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function readJson(res: Response): Promise<any> {
	const text = await res.text().catch(() => '');
	if (text) {
		try {
			return JSON.parse(text);
		} catch {
			// rơi xuống xử lý như body rỗng
		}
	}
	if (!res.ok) throw new ServiceUnavailableError();
	return null;
}

/** Thông điệp an toàn để hiển thị cho người dùng từ một lỗi bất kỳ. */
export function userMessage(err: unknown, fallback = 'Có lỗi xảy ra, vui lòng thử lại'): string {
	if (err instanceof ServiceUnavailableError) return err.message;
	// Lỗi runtime của JS (TypeError, SyntaxError...) là lỗi kỹ thuật, không phải
	// thông điệp từ server — chỉ dùng message của Error thường (và lớp con giữ name 'Error').
	if (err instanceof Error && err.name === 'Error' && err.message) return err.message;
	return fallback;
}
