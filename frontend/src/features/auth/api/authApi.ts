import { BASE_URL } from '../../../shared/api/axios';

export interface LoginUser {
	id: string;
	username: string;
	staff_number: string | null;
	full_name: string;
	email: string;
	role: string;
	role_id: string | null;
	permissions: string[];
	department_id: string | null;
}

export interface LoginResponse {
	user: LoginUser;
	access_token: string;
	refresh_token: string;
}

export interface Requires2FAResponse {
	requires_2fa: true;
	pre_auth_token: string;
}

export async function loginApi(
	username: string,
	password: string,
): Promise<LoginResponse | Requires2FAResponse> {
	const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ username, password }),
	});

	const json = await res.json();

	if (!res.ok || !json.success) {
		throw new Error(json.message ?? 'Có lỗi xảy ra, vui lòng thử lại');
	}

	return json.data as LoginResponse | Requires2FAResponse;
}

export async function verify2FAApi(
	preAuthToken: string,
	code: string,
): Promise<LoginResponse> {
	const res = await fetch(`${BASE_URL}/api/v1/auth/2fa/verify`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ pre_auth_token: preAuthToken, code }),
	});

	const json = await res.json();

	if (!res.ok || !json.success) {
		throw new Error(json.message ?? 'Mã xác thực không đúng');
	}

	return json.data as LoginResponse;
}

export interface TwoFaSetup {
	secret: string;
	otpauth_uri: string;
}

export async function get2FAStatusApi(accessToken: string): Promise<{ enabled: boolean }> {
	const res = await fetch(`${BASE_URL}/api/v1/auth/2fa/status`, {
		headers: { Authorization: `Bearer ${accessToken}` },
	});
	const json = await res.json();
	if (!res.ok || !json.success) throw new Error(json.message ?? 'Có lỗi xảy ra, vui lòng thử lại');
	return json.data as { enabled: boolean };
}

export async function setup2FAApi(accessToken: string): Promise<TwoFaSetup> {
	const res = await fetch(`${BASE_URL}/api/v1/auth/2fa/setup`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${accessToken}` },
	});
	const json = await res.json();
	if (!res.ok || !json.success) throw new Error(json.message ?? 'Có lỗi xảy ra, vui lòng thử lại');
	return json.data as TwoFaSetup;
}

export async function verifySetup2FAApi(accessToken: string, code: string): Promise<void> {
	const res = await fetch(`${BASE_URL}/api/v1/auth/2fa/verify-setup`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${accessToken}`,
		},
		body: JSON.stringify({ code }),
	});
	const json = await res.json();
	if (!res.ok || !json.success) throw new Error(json.message ?? 'Mã xác thực không đúng');
}

export async function disable2FAApi(accessToken: string, password: string): Promise<void> {
	const res = await fetch(`${BASE_URL}/api/v1/auth/2fa/disable`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${accessToken}`,
		},
		body: JSON.stringify({ password }),
	});
	const json = await res.json();
	if (!res.ok || !json.success) throw new Error(json.message ?? 'Có lỗi xảy ra, vui lòng thử lại');
}

export interface SessionInfo {
	id: string;
	ip_address: string | null;
	user_agent: string | null;
	created_at: string | null;
	expires_at: string;
}

export async function logoutAllApi(accessToken: string): Promise<void> {
	const res = await fetch(`${BASE_URL}/api/v1/auth/logout-all`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${accessToken}`,
		},
	});
	const json = await res.json();
	if (!res.ok || !json.success) {
		throw new Error(json.message ?? 'Có lỗi xảy ra, vui lòng thử lại');
	}
}
