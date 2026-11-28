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
 * POST FormData bằng XMLHttpRequest thay cho fetch(): fetch không báo được đã
 * gửi bao nhiêu byte, nên upload file lớn / mạng chậm chỉ hiện được hiệu ứng
 * chạy vô hạn, trông như treo. Trả về Response để nơi gọi xử lý y như fetch.
 *   - lỗi mạng / quá thời gian → ServiceUnavailableError (như safeFetch)
 *   - signal bị hủy → DOMException 'AbortError'
 */
export function postFormWithProgress(
	url: string,
	body: FormData,
	headers: Record<string, string>,
	opts: { onProgress?: (loaded: number, total: number) => void; signal?: AbortSignal } = {},
): Promise<Response> {
	return new Promise((resolve, reject) => {
		const aborted = () => new DOMException('Đã hủy tải lên', 'AbortError');
		if (opts.signal?.aborted) return reject(aborted());

		const xhr = new XMLHttpRequest();
		xhr.open('POST', url);
		for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
		xhr.responseType = 'text';

		const onAbort = () => xhr.abort();
		opts.signal?.addEventListener('abort', onAbort);
		const cleanup = () => opts.signal?.removeEventListener('abort', onAbort);

		xhr.upload.onprogress = (e) => {
			if (e.lengthComputable) opts.onProgress?.(e.loaded, e.total);
		};
		xhr.onload = () => {
			cleanup();
			// Response không nhận body với các mã "không có nội dung"
			const noBody = [204, 205, 304].includes(xhr.status);
			try {
				resolve(
					new Response(noBody ? null : xhr.responseText, {
						status: xhr.status,
						headers: { 'Content-Type': xhr.getResponseHeader('Content-Type') ?? '' },
					}),
				);
			} catch {
				reject(new ServiceUnavailableError());
			}
		};
		xhr.onerror = xhr.ontimeout = () => {
			cleanup();
			reject(new ServiceUnavailableError());
		};
		xhr.onabort = () => {
			cleanup();
			reject(aborted());
		};
		xhr.send(body);
	});
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

/**
 * Lỗi API kèm `errors` của server (vd lỗi theo từng ô: { SMTP_PORT: "Lớn nhất là 65535" }).
 * Nơi không cần thì vẫn dùng như Error thường.
 */
export class ApiError extends Error {
	errors?: unknown;
	constructor(message: string, errors?: unknown) {
		super(message);
		this.name = 'ApiError';
		if (errors != null) this.errors = errors;
	}
}

/** Dựng ApiError từ body lỗi `{ message, errors }` của backend. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const apiErrorFrom = (json: any) => new ApiError(json?.message ?? 'Có lỗi xảy ra, vui lòng thử lại', json?.errors);

/** Thông điệp an toàn để hiển thị cho người dùng từ một lỗi bất kỳ. */
export function userMessage(err: unknown, fallback = 'Có lỗi xảy ra, vui lòng thử lại'): string {
	if (err instanceof ServiceUnavailableError) return err.message;
	// Lỗi runtime của JS (TypeError, SyntaxError...) là lỗi kỹ thuật, không phải
	// thông điệp từ server — chỉ dùng message của Error thường (và lớp con giữ name 'Error').
	if (err instanceof Error && err.name === 'Error' && err.message) return err.message;
	return fallback;
}
