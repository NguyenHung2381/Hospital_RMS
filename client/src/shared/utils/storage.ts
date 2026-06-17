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
	account_type?: string;
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

export function clearAuth(): void {
	Object.values(KEYS).forEach((key) => {
		localStorage.removeItem(key);
		sessionStorage.removeItem(key);
	});
}
