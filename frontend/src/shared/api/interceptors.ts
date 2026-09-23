import { clearAuth } from '../utils/storage';
import { BASE_URL } from './endpoints';

let isRefreshing = false;
let refreshQueue: Array<(token: string | null) => void> = [];

export async function tryRefresh(): Promise<string | null> {
	const rememberMe = Boolean(localStorage.getItem('refresh_token'));
	const refreshToken =
		localStorage.getItem('refresh_token') ??
		sessionStorage.getItem('refresh_token');
	if (!refreshToken) return null;

	const res = await fetch(`${BASE_URL}/api/v1/auth/refresh`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ refresh_token: refreshToken }),
	});

	if (!res.ok) return null;

	const json = await res.json();
	if (!json.success || !json.data?.access_token) return null;

	const storage = rememberMe ? localStorage : sessionStorage;
	storage.setItem('access_token', json.data.access_token);
	// Backend xoay (rotate) refresh token ở mỗi lần làm mới — token cũ bị xoá
	// ngay sau khi cấp token mới, nên phải lưu lại token mới nếu không lần
	// refresh kế tiếp sẽ thất bại (token cũ trong storage đã vô hiệu).
	if (json.data?.refresh_token) {
		storage.setItem('refresh_token', json.data.refresh_token);
	}

	return json.data.access_token as string;
}

// Đảm bảo nhiều request 401 đồng thời chỉ gọi /auth/refresh 1 lần — request nào
// tới sau sẽ chờ (queue) kết quả của lần refresh đang chạy thay vì tự gọi refresh riêng.
export async function refreshQueued(): Promise<string | null> {
	if (!isRefreshing) {
		isRefreshing = true;
		const newToken = await tryRefresh().finally(() => {
			isRefreshing = false;
		});
		const queue = refreshQueue;
		refreshQueue = [];
		queue.forEach((cb) => cb(newToken));
		return newToken;
	}
	return new Promise<string | null>((resolve) => {
		refreshQueue.push(resolve);
	});
}

export async function handle401<T>(
	path: string,
	options: RequestInit,
): Promise<T> {
	const newToken = await refreshQueued();
	if (newToken) {
		const retryRes = await fetch(`${BASE_URL}/api/v1${path}`, {
			...options,
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${newToken}`,
				...(options.headers ?? {}),
			},
		});
		const retryJson = await retryRes.json();
		if (!retryRes.ok || !retryJson.success) {
			throw new Error(retryJson.message ?? 'Có lỗi xảy ra, vui lòng thử lại');
		}
		return retryJson.data as T;
	}
	clearAuth();
	window.location.href = '/login';
	throw new Error('Phiên đăng nhập đã hết hạn');
}
