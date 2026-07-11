import { clearAuth } from '../utils/storage';
import { BASE_URL } from './endpoints';

let isRefreshing = false;
let refreshQueue: Array<(token: string) => void> = [];

export async function tryRefresh(): Promise<string | null> {
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

export async function handle401<T>(
	path: string,
	options: RequestInit,
): Promise<T> {
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
				throw new Error(retryJson.message ?? 'Có lỗi xảy ra, vui lòng thử lại');
			}
			return retryJson.data as T;
		} else {
			refreshQueue = [];
			clearAuth();
			window.location.href = '/login';
			throw new Error('Phiên đăng nhập đã hết hạn');
		}
	} else {
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
