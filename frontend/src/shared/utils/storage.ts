const KEYS = {
	token: 'access_token',
	refresh: 'refresh_token',
	user: 'rms_user',
} as const;

export type StoredUser = {
	id?: string;
	username?: string;
	full_name?: string;
	email?: string;
	role?: string;
	role_name?: string;
	role_id?: string | null;
	permissions?: string[];
	permission_scopes?: Record<string, string>;
	staff_number?: string | null;
	department?: string | null;
	department_id?: string | null;
};

type AuthData = {
	access_token: string;
	refresh_token: string;
	user: StoredUser;
};

export function saveAuth(data: AuthData, rememberMe: boolean): void {
	clearAuth();
	const storage = rememberMe ? localStorage : sessionStorage;
	storage.setItem(KEYS.token, data.access_token);
	storage.setItem(KEYS.refresh, data.refresh_token);
	storage.setItem(KEYS.user, JSON.stringify(data.user));
}

// Thay cặp token của phiên hiện tại (refresh xoay vòng, đổi mật khẩu...) —
// ghi vào đúng storage đang giữ phiên ("ghi nhớ đăng nhập" → local).
export function replaceTokens(accessToken: string, refreshToken?: string | null): void {
	const storage = localStorage.getItem(KEYS.refresh) ? localStorage : sessionStorage;
	storage.setItem(KEYS.token, accessToken);
	if (refreshToken) storage.setItem(KEYS.refresh, refreshToken);
}

export function getToken(): string | null {
	return localStorage.getItem(KEYS.token) ?? sessionStorage.getItem(KEYS.token);
}

export function getStoredUser<T = unknown>(): T | null {
	try {
		const raw =
			localStorage.getItem(KEYS.user) ?? sessionStorage.getItem(KEYS.user);
		return raw ? (JSON.parse(raw) as T) : null;
	} catch {
		return null;
	}
}

// Ghi đè một phần thông tin user đang lưu (đúng storage đang giữ phiên:
// local nếu "ghi nhớ đăng nhập", ngược lại session). Trả về true nếu có thay đổi.
export function updateStoredUser(patch: Partial<StoredUser>): boolean {
	const storage = localStorage.getItem(KEYS.user) ? localStorage : sessionStorage;
	const current = getStoredUser<StoredUser>();
	if (!current) return false;
	const next = { ...current, ...patch };
	const changed = (Object.keys(patch) as (keyof StoredUser)[]).some(
		(k) => JSON.stringify(current[k]) !== JSON.stringify(next[k]),
	);
	if (changed) storage.setItem(KEYS.user, JSON.stringify(next));
	return changed;
}

// Device token "thiết bị quen" (backend: trustedDeviceService.js) — theo từng
// tài khoản đã đăng nhập thành công trên trình duyệt này (máy dùng chung có
// nhiều người). CỐ Ý không nằm trong KEYS: đăng xuất không xoá, để lần đăng
// nhập sau máy này vẫn không bị khoá tạm tài khoản chặn.
const DEVICE_TOKENS_KEY = 'rms_device_tokens';
const MAX_DEVICE_TOKENS = 20;

function readDeviceTokens(): Record<string, string> {
	try {
		const parsed = JSON.parse(localStorage.getItem(DEVICE_TOKENS_KEY) ?? '{}');
		return parsed && typeof parsed === 'object' ? parsed : {};
	} catch {
		return {};
	}
}

export function getDeviceToken(username: string): string | null {
	return readDeviceTokens()[username.trim().toLowerCase()] ?? null;
}

export function saveDeviceToken(username: string, token: string): void {
	const key = username.trim().toLowerCase();
	const tokens = readDeviceTokens();
	delete tokens[key]; // đưa lên cuối = dùng gần nhất
	tokens[key] = token;
	const entries = Object.entries(tokens).slice(-MAX_DEVICE_TOKENS);
	try {
		localStorage.setItem(DEVICE_TOKENS_KEY, JSON.stringify(Object.fromEntries(entries)));
	} catch {
		// localStorage đầy/bị chặn — chỉ mất lợi ích "thiết bị quen"
	}
}

export function clearAuth(): void {
	Object.values(KEYS).forEach((key) => {
		localStorage.removeItem(key);
		sessionStorage.removeItem(key);
	});
}
