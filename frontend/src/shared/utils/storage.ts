// Refresh token KHÔNG còn lưu ở đây: server đặt trong cookie HttpOnly
// (backend utils/authCookie.js) — JavaScript của trang, kể cả mã độc chèn qua
// XSS, không đọc được. Storage chỉ giữ access token ngắn hạn (15 phút).
const KEYS = {
	token: 'access_token',
	user: 'rms_user',
} as const;

// Khoá refresh token của bản cũ — chỉ còn đọc 1 lần để chuyển phiên đang mở
// sang cookie (shared/api/interceptors.ts), rồi xoá.
export const LEGACY_REFRESH_KEY = 'refresh_token';

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
	// Đang dùng mật khẩu do người khác cấp — router chuyển tới /doi-mat-khau
	must_change_password?: boolean;
	// Tài khoản quản trị chưa bật 2FA: grace = nhắc (kèm hạn), required = bị chặn
	twofa_state?: 'grace' | 'required' | null;
	twofa_deadline?: string | null;
};

type AuthData = {
	access_token: string;
	user: StoredUser;
};

// Refresh token là 1 cookie dùng chung cả trình duyệt nên chỉ cho 1 tài khoản
// mỗi trình duyệt: đăng nhập tài khoản khác / đăng xuất ở một tab thì các tab
// còn lại đang giữ phiên cũ bị đưa về /login (nếu không, lần refresh tới sẽ
// nhận token của người kia trong khi giao diện vẫn hiện người cũ).
const authChannel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('rms_auth');

if (authChannel) {
	authChannel.onmessage = (e: MessageEvent<{ type: 'login' | 'logout'; id?: string }>) => {
		const mine = getStoredUser<StoredUser>();
		if (!mine) return;
		if (e.data.type === 'login' && e.data.id === mine.id) return;
		clearAuth();
		if (window.location.pathname !== '/login') window.location.href = '/login';
	};
}

export function broadcastLogout(): void {
	authChannel?.postMessage({ type: 'logout' });
}

export function saveAuth(data: AuthData, rememberMe: boolean): void {
	clearAuth();
	const storage = rememberMe ? localStorage : sessionStorage;
	storage.setItem(KEYS.token, data.access_token);
	storage.setItem(KEYS.user, JSON.stringify(data.user));
	authChannel?.postMessage({ type: 'login', id: data.user.id });
}

// id người dùng trong access token (JWT) — để phát hiện token làm mới thuộc về
// tài khoản khác với tài khoản đang hiển thị.
export function tokenUserId(token: string): string | null {
	try {
		const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
		return JSON.parse(atob(b64)).id ?? null;
	} catch {
		return null;
	}
}

// Thay access token của phiên hiện tại (làm mới, đổi mật khẩu...) — ghi vào
// đúng storage đang giữ phiên ("ghi nhớ đăng nhập" → local).
export function replaceAccessToken(accessToken: string): void {
	const storage = localStorage.getItem(KEYS.user) ? localStorage : sessionStorage;
	storage.setItem(KEYS.token, accessToken);
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

// Mã thiết bị cho điểm danh QR — backend chặn 1 thiết bị điểm danh cho nhiều
// tài khoản trong cùng buổi (checkin_device_id). Cũng không nằm trong KEYS:
// đăng xuất rồi đăng nhập tài khoản khác vẫn giữ nguyên mã. Dùng
// getRandomValues thay randomUUID vì randomUUID cần HTTPS.
// ponytail: xoá dữ liệu trình duyệt / tab ẩn danh là có mã mới — chỉ nâng rào,
// chặn chắc hơn thì kết hợp giới hạn IP mạng nội bộ.
const CHECKIN_DEVICE_KEY = 'rms_checkin_device';

export function getCheckInDeviceId(): string {
	let id: string | null = null;
	try {
		id = localStorage.getItem(CHECKIN_DEVICE_KEY);
	} catch {
		// localStorage bị chặn — mỗi lần quét 1 mã mới
	}
	if (id) return id;
	id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
	try {
		localStorage.setItem(CHECKIN_DEVICE_KEY, id);
	} catch {
		// như trên
	}
	return id;
}

// Chỉ xoá dữ liệu phía trình duyệt. Đăng xuất thật (thu hồi phiên trên server +
// xoá cookie refresh) dùng logout() ở features/auth/api/authApi.ts.
export function clearAuth(): void {
	[...Object.values(KEYS), LEGACY_REFRESH_KEY].forEach((key) => {
		localStorage.removeItem(key);
		sessionStorage.removeItem(key);
	});
}
