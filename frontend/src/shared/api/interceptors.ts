import {
	clearAuth,
	getStoredUser,
	LEGACY_REFRESH_KEY,
	replaceAccessToken,
	tokenUserId,
} from '../utils/storage';
import { BASE_URL } from './endpoints';

let isRefreshing = false;
let refreshQueue: Array<(token: string | null) => void> = [];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Làm mới access token bằng refresh token trong cookie HttpOnly — trình duyệt
// tự gửi cookie (cùng origin), JS không cần và không đọc được token đó.
export async function tryRefresh(): Promise<string | null> {
	// Chưa từng đăng nhập ở trình duyệt này thì không gọi (tránh 401 thừa)
	if (!getStoredUser()) return null;

	// Phiên mở từ bản cũ còn refresh token trong storage: gửi 1 lần để server
	// chuyển sang cookie, rồi xoá khỏi storage.
	const legacy =
		localStorage.getItem(LEGACY_REFRESH_KEY) ?? sessionStorage.getItem(LEGACY_REFRESH_KEY);

	for (let attempt = 0; attempt < 3; attempt++) {
		const res = await fetch(`${BASE_URL}/api/v1/auth/refresh`, {
			method: 'POST',
			credentials: 'same-origin',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(legacy ? { refresh_token: legacy } : {}),
		});
		const json = await res.json().catch(() => null);

		// Tab khác vừa làm mới bằng cùng cookie — chờ chút, cookie mới đã về
		if (res.status === 401 && json?.code === 'REFRESH_RACE') {
			await sleep(800 * (attempt + 1));
			continue;
		}
		if (!res.ok || !json?.success || !json.data?.access_token) return null;

		localStorage.removeItem(LEGACY_REFRESH_KEY);
		sessionStorage.removeItem(LEGACY_REFRESH_KEY);
		// Cookie đã thuộc tài khoản khác (đăng nhập ở tab/cửa sổ khác lúc tab này
		// không nhận được thông báo) — không trộn token của họ vào giao diện này.
		const storedId = getStoredUser<{ id?: string }>()?.id;
		const newId = tokenUserId(json.data.access_token);
		if (storedId && newId && storedId !== newId) return null;
		replaceAccessToken(json.data.access_token);
		return json.data.access_token as string;
	}
	return null;
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
