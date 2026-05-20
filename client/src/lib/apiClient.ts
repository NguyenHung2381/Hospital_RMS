import { getToken, clearAuth } from './authStorage';

const envHost = import.meta.env.VITE_API_HOST;
const envPort = import.meta.env.VITE_API_PORT || '3000';
export const BASE_URL = `http://${envHost || window.location.hostname}:${envPort}`;

let isRefreshing = false;
let refreshQueue: Array<(token: string) => void> = [];

async function tryRefresh(): Promise<string | null> {
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

	const rememberMe = Boolean(localStorage.getItem('refresh_token'));
	const storage = rememberMe ? localStorage : sessionStorage;
	storage.setItem('access_token', json.data.access_token);

	return json.data.access_token as string;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
	const token = getToken();
	const res = await fetch(`${BASE_URL}/api/v1${path}`, {
		...options,
		headers: {
			'Content-Type': 'application/json',
			...(token ? { Authorization: `Bearer ${token}` } : {}),
			...(options.headers ?? {}),
		},
	});

	const json = await res.json();

	if (res.status === 401) {
		if (!isRefreshing) {
			isRefreshing = true;
			const newToken = await tryRefresh().finally(() => {
				isRefreshing = false;
			});

			if (newToken) {
				refreshQueue.forEach((cb) => cb(newToken));
				refreshQueue = [];

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
					throw new Error(
						retryJson.message ?? 'Có lỗi xảy ra, vui lòng thử lại',
					);
				}
				return retryJson.data as T;
			} else {
				refreshQueue = [];
				clearAuth();
				window.location.href = '/login';
				throw new Error(json.message ?? 'Phiên đăng nhập đã hết hạn');
			}
		} else {
			// Đang refresh — xếp hàng chờ token mới
			return new Promise<T>((resolve, reject) => {
				refreshQueue.push(async (newToken: string) => {
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
						reject(
							new Error(retryJson.message ?? 'Có lỗi xảy ra, vui lòng thử lại'),
						);
					} else {
						resolve(retryJson.data as T);
					}
				});
			});
		}
	}

	if (!res.ok || !json.success) {
		throw new Error(json.message ?? 'Có lỗi xảy ra, vui lòng thử lại');
	}

	return json.data as T;
}

async function requestBlob(path: string, body: unknown): Promise<Blob> {
	const token = getToken();
	const res = await fetch(`${BASE_URL}/api/v1${path}`, {
		method: 'POST',
		body: JSON.stringify(body),
		headers: {
			'Content-Type': 'application/json',
			...(token ? { Authorization: `Bearer ${token}` } : {}),
		},
	});

	if (!res.ok) {
		const ct = res.headers.get('Content-Type') ?? '';
		if (ct.includes('json')) {
			const json = await res.json();
			throw new Error(json.message ?? 'Lỗi xuất file');
		}
		throw new Error(`Lỗi xuất file (${res.status})`);
	}

	return res.blob();
}

async function requestForm<T>(path: string, body: FormData): Promise<T> {
	const token = getToken();
	const res = await fetch(`${BASE_URL}/api/v1${path}`, {
		method: 'POST',
		body,
		headers: token ? { Authorization: `Bearer ${token}` } : {},
	});

	const json = await res.json();

	if (!res.ok || !json.success) {
		throw new Error(json.message ?? 'Có lỗi xảy ra, vui lòng thử lại');
	}

	return json.data as T;
}

export const apiClient = {
	get: <T>(path: string) => request<T>(path),
	post: <T>(path: string, body: unknown) =>
		request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
	put: <T>(path: string, body: unknown) =>
		request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
	delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
	postForm: <T>(path: string, body: FormData) => requestForm<T>(path, body),
	postBlob: (path: string, body: unknown) => requestBlob(path, body),
};
