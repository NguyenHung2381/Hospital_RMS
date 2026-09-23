import { trackRequest } from '../utils/feedback';
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

// ─── GET: gộp request trùng + cache danh mục ─────────────────────────────────
// Mỗi trang tự fetch trong useEffect, nên layout + trang + modal thường gọi
// cùng một URL gần như đồng thời (vd /departments?limit=0 ở 4 nơi). Request
// trùng URL đang bay sẽ dùng chung 1 promise. Riêng các bảng danh mục (ít đổi,
// trang nào cũng cần) được giữ thêm LOOKUP_TTL_MS để điều hướng không phải chờ.
// Mọi thao tác ghi + mọi sự kiện realtime đều xoá sạch cache → không đọc dữ
// liệu cũ sau khi chính mình (hoặc người khác) vừa sửa.
const LOOKUP_TTL_MS = 60_000;
const LOOKUP_RESOURCES = new Set([
	'departments',
	'categories',
	'levels',
	'round-types',
	'research-rounds',
	'roles',
	'permissions',
	'job-titles',
	'cme-credit-categories',
	'trainee-types',
	'training-forms',
	'training-types',
	'subjects',
]);

const inflight = new Map<string, Promise<unknown>>();
const lookupCache = new Map<string, { at: number; data: unknown }>();
let cacheEpoch = 0;

const isLookup = (path: string) => LOOKUP_RESOURCES.has(path.split(/[/?]/)[1] ?? '');

// Dữ liệu dùng chung giữa nhiều nơi gọi — trả bản sao để một nơi lỡ sửa tại chỗ
// (sort/splice mảng) không làm hỏng dữ liệu của nơi khác.
const share = <T>(data: T): T => structuredClone(data);

export function invalidateApiCache() {
	cacheEpoch++;
	inflight.clear();
	lookupCache.clear();
}

function cachedGet<T>(path: string): Promise<T> {
	const hit = lookupCache.get(path);
	if (hit && Date.now() - hit.at < LOOKUP_TTL_MS) return Promise.resolve(share(hit.data as T));

	const pending = inflight.get(path);
	if (pending) return pending.then((d) => share(d as T));

	const epoch = cacheEpoch;
	const p = trackRequest('read', () => request<T>(path)).finally(() => {
		if (inflight.get(path) === p) inflight.delete(path);
	});
	inflight.set(path, p);
	if (isLookup(path)) {
		p.then((data) => {
			// Đã có thao tác ghi trong lúc request bay → kết quả có thể đã cũ, không lưu
			if (epoch === cacheEpoch) lookupCache.set(path, { at: Date.now(), data: share(data) });
		}).catch(() => {});
	}
	return p;
}

function write<T>(run: () => Promise<T>): Promise<T> {
	return trackRequest('write', run).finally(invalidateApiCache);
}

export const apiClient = {
	get: <T>(path: string) => cachedGet<T>(path),
	post: <T>(path: string, body: unknown) =>
		write(() => request<T>(path, { method: 'POST', body: JSON.stringify(body) })),
	put: <T>(path: string, body: unknown) =>
		write(() => request<T>(path, { method: 'PUT', body: JSON.stringify(body) })),
	patch: <T>(path: string, body: unknown) =>
		write(() => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) })),
	delete: <T>(path: string) => write(() => request<T>(path, { method: 'DELETE' })),
	postForm: <T>(path: string, body: FormData) => write(() => requestForm<T>(path, body)),
	postBlob: (path: string, body: unknown) => trackRequest('write', () => requestBlob(path, body)),
};

export { BASE_URL };
