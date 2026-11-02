import {
	clearAuth,
	getStoredUser,
	LEGACY_REFRESH_KEY,
	replaceAccessToken,
	tokenUserId,
} from '../utils/storage';
import { BASE_URL } from './endpoints';
import { readJson, safeFetch, ServiceUnavailableError } from './http';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Làm mới access token bằng refresh token trong cookie HttpOnly — trình duyệt
// tự gửi cookie (cùng origin), JS không cần và không đọc được token đó.
export async function tryRefresh(): Promise<string | null> {
	// Chưa từng đăng nhập ở trình duyệt này thì không gọi (tránh 401 thừa)
	if (!getStoredUser()) return null;

	// Phiên mở từ bản cũ còn refresh token trong storage: gửi 1 lần để server
	// chuyển sang cookie, rồi xóa khỏi storage.
	const legacy =
		localStorage.getItem(LEGACY_REFRESH_KEY) ?? sessionStorage.getItem(LEGACY_REFRESH_KEY);

	for (let attempt = 0; attempt < 3; attempt++) {
		const res = await safeFetch(`${BASE_URL}/api/v1/auth/refresh`, {
			method: 'POST',
			credentials: 'same-origin',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(legacy ? { refresh_token: legacy } : {}),
		});
		const json = await readJson(res).catch(() => null);

		// Tab khác vừa làm mới bằng cùng cookie — chờ chút, cookie mới đã về
		if (res.status === 401 && json?.code === 'REFRESH_RACE') {
			await sleep(800 * (attempt + 1));
			continue;
		}
		// Quá giới hạn / máy chủ lỗi: phiên vẫn còn — báo lỗi tạm thời, KHÔNG coi
		// là hết phiên (null ⇒ nơi gọi xóa phiên, đưa về đăng nhập).
		if (res.status === 429 || res.status >= 500) {
			throw new ServiceUnavailableError(json?.message);
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

// Khóa dùng chung giữa các tab (Web Locks): mỗi lần làm mới XOAY refresh token
// trong cookie, nên 2 tab cùng làm mới (cùng mở / tải lại trang lúc khởi động,
// vì access token chỉ nằm trong bộ nhớ) sẽ gửi cùng 1 cookie — tab chậm hơn bị
// server coi là dùng lại token đã xoay. Xếp hàng qua khóa thì tab sau làm mới
// bằng cookie mới của tab trước. Không có Web Locks (HTTP thường, trình duyệt
// cũ) thì vẫn còn đường thử lại khi server báo REFRESH_RACE ở tryRefresh.
const REFRESH_LOCK = 'rms_auth_refresh';

function refreshAcrossTabs(): Promise<string | null> {
	const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
	if (!locks) return tryRefresh();
	return locks.request(REFRESH_LOCK, () => tryRefresh());
}

// Nhiều request 401 đồng thời trong 1 tab chỉ gọi /auth/refresh 1 lần — mọi nơi
// gọi dùng chung 1 promise. Lỗi mạng (ServiceUnavailableError) được ném cho TẤT
// CẢ nơi đang chờ (trước đây các request xếp hàng phía sau bị treo mãi).
let inflight: Promise<string | null> | null = null;

export function refreshQueued(): Promise<string | null> {
	inflight ??= refreshAcrossTabs().finally(() => {
		inflight = null;
	});
	return inflight;
}

export async function handle401<T>(
	path: string,
	options: RequestInit,
): Promise<T> {
	const newToken = await refreshQueued();
	if (newToken) {
		const retryRes = await safeFetch(`${BASE_URL}/api/v1${path}`, {
			...options,
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${newToken}`,
				...(options.headers ?? {}),
			},
		});
		const retryJson = await readJson(retryRes);
		if (!retryRes.ok || !retryJson?.success) {
			throw new Error(retryJson?.message ?? 'Có lỗi xảy ra, vui lòng thử lại');
		}
		return retryJson.data as T;
	}
	clearAuth();
	window.location.href = '/login';
	throw new Error('Phiên đăng nhập đã hết hạn');
}
