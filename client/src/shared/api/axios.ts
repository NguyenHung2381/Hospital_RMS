import { clearAuth, getToken } from '../utils/storage';
import { BASE_URL } from './endpoints';
import { handle401, refreshQueued } from './interceptors';

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
		return handle401<T>(path, options);
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

	if (res.status === 401) {
		const newToken = await refreshQueued();
		if (newToken) {
			const retryRes = await fetch(`${BASE_URL}/api/v1${path}`, {
				method: 'POST',
				body: JSON.stringify(body),
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${newToken}`,
				},
			});
			if (!retryRes.ok) {
				const ct = retryRes.headers.get('Content-Type') ?? '';
				if (ct.includes('json')) {
					const json = await retryRes.json();
					throw new Error(json.message ?? 'Lỗi xuất file');
				}
				throw new Error(`Lỗi xuất file (${retryRes.status})`);
			}
			return retryRes.blob();
		}
		clearAuth();
		window.location.href = '/login';
		throw new Error('Phiên đăng nhập đã hết hạn');
	}

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

	if (res.status === 401) {
		const newToken = await refreshQueued();
		if (newToken) {
			const retryRes = await fetch(`${BASE_URL}/api/v1${path}`, {
				method: 'POST',
				body,
				headers: { Authorization: `Bearer ${newToken}` },
			});
			const retryJson = await retryRes.json();
			if (!retryRes.ok || !retryJson.success)
				throw new Error(retryJson.message ?? 'Có lỗi xảy ra, vui lòng thử lại');
			return retryJson.data as T;
		}
		clearAuth();
		window.location.href = '/login';
		throw new Error('Phiên đăng nhập đã hết hạn');
	}

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
	patch: <T>(path: string, body: unknown) =>
		request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
	delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
	postForm: <T>(path: string, body: FormData) => requestForm<T>(path, body),
	postBlob: (path: string, body: unknown) => requestBlob(path, body),
};

export { BASE_URL };
