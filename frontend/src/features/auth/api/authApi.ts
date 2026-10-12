import { BASE_URL } from '../../../shared/api/axios';
import { broadcastLogout, clearAuth, getDeviceToken, saveDeviceToken } from '../../../shared/utils/storage';
import { type LoginChallenge, solveChallenge } from '../utils/solveChallenge';

export interface LoginUser {
	id: string;
	username: string;
	staff_number: string | null;
	full_name: string;
	email: string;
	role: string;
	role_id: string | null;
	permissions: string[];
	permission_scopes?: Record<string, string>;
	department_id: string | null;
	must_change_password?: boolean;
	// Tài khoản quản trị chưa bật 2FA: grace = nhắc (kèm hạn), required = bị chặn
	twofa_state?: 'grace' | 'required' | null;
	twofa_deadline?: string | null;
}

export interface LoginResponse {
	user: LoginUser;
	access_token: string;
	device_token?: string;
}

export interface Requires2FAResponse {
	requires_2fa: true;
	pre_auth_token: string;
}

// Lỗi đăng nhập bị khoá tạm (sai mật khẩu nhiều lần / quá giới hạn theo IP) —
// kèm số giây còn lại để trang đăng nhập đếm ngược.
export class LoginLockedError extends Error {
	retryAfterSeconds: number;

	constructor(message: string, retryAfterSeconds: number) {
		super(message);
		this.retryAfterSeconds = retryAfterSeconds;
	}
}

// Server đang nghi bị dò mật khẩu (backend/src/utils/loginShield.js) thì trả 428
// kèm thử thách — trình duyệt tự giải rồi gửi lại, người dùng chỉ thấy đăng
// nhập chậm hơn một chút. Tối đa 2 lần (độ khó có thể tăng giữa 2 lượt gửi).
const MAX_CHALLENGE_ROUNDS = 2;

export async function loginApi(
	username: string,
	password: string,
	rememberMe = false,
	onVerifying?: () => void,
): Promise<LoginResponse | Requires2FAResponse> {
	let pow: { pow_token: string; pow_nonce: string } | undefined;
	let res: Response;
	let json;
	for (let round = 0; ; round++) {
		// Refresh token về trong cookie HttpOnly (Set-Cookie) — không có trong body.
		// remember_me: cookie sống 30 ngày thay vì mất khi đóng trình duyệt.
		res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
			method: 'POST',
			credentials: 'same-origin',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				username,
				password,
				device_token: getDeviceToken(username),
				remember_me: rememberMe,
				...pow,
			}),
		});
		json = await res.json();
		if (res.status !== 428 || json.code !== 'LOGIN_CHALLENGE' || round >= MAX_CHALLENGE_ROUNDS) break;
		onVerifying?.();
		const challenge = json.challenge as LoginChallenge;
		pow = { pow_token: challenge.token, pow_nonce: await solveChallenge(challenge) };
	}

	if (!res.ok || !json.success) {
		const message = json.message ?? 'Có lỗi xảy ra, vui lòng thử lại';
		if (json.retry_after_seconds > 0) {
			throw new LoginLockedError(message, json.retry_after_seconds);
		}
		throw new Error(message);
	}

	const data = json.data as LoginResponse | Requires2FAResponse;
	if ('device_token' in data && data.device_token) saveDeviceToken(username, data.device_token);
	return data;
}

export async function verify2FAApi(
	username: string,
	preAuthToken: string,
	code: string,
): Promise<LoginResponse> {
	const res = await fetch(`${BASE_URL}/api/v1/auth/2fa/verify`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			pre_auth_token: preAuthToken,
			code,
			device_token: getDeviceToken(username),
		}),
	});

	const json = await res.json();

	if (!res.ok || !json.success) {
		const message = json.message ?? 'Mã xác thực không đúng';
		if (json.retry_after_seconds > 0) {
			throw new LoginLockedError(message, json.retry_after_seconds);
		}
		throw new Error(message);
	}

	const data = json.data as LoginResponse;
	if (data.device_token) saveDeviceToken(username, data.device_token);
	return data;
}

export interface TwoFaSetup {
	secret: string;
	otpauth_uri: string;
}

export interface TwoFaStatus {
	enabled: boolean;
	/** Số mã khôi phục chưa dùng */
	backup_codes_remaining: number;
}

export async function get2FAStatusApi(accessToken: string): Promise<TwoFaStatus> {
	const res = await fetch(`${BASE_URL}/api/v1/auth/2fa/status`, {
		headers: { Authorization: `Bearer ${accessToken}` },
	});
	const json = await res.json();
	if (!res.ok || !json.success) throw new Error(json.message ?? 'Có lỗi xảy ra, vui lòng thử lại');
	return json.data as TwoFaStatus;
}

// Tạo lại bộ mã khôi phục (bộ cũ mất hiệu lực) — cần nhập lại mật khẩu.
export async function regenerateBackupCodesApi(
	accessToken: string,
	password: string,
): Promise<string[]> {
	const res = await fetch(`${BASE_URL}/api/v1/auth/2fa/backup-codes`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${accessToken}`,
		},
		body: JSON.stringify({ password }),
	});
	const json = await res.json();
	if (!res.ok || !json.success) throw new Error(json.message ?? 'Có lỗi xảy ra, vui lòng thử lại');
	return json.data.backup_codes as string[];
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

// Bật 2FA — trả bộ mã khôi phục (server chỉ trả đúng 1 lần này).
export async function verifySetup2FAApi(accessToken: string, code: string): Promise<string[]> {
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
	return (json.data?.backup_codes as string[]) ?? [];
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

// Đăng xuất thật: server thu hồi phiên (refresh token trong cookie) và xoá
// cookie; sau đó mới xoá dữ liệu phía trình duyệt. Lỗi mạng vẫn xoá dữ liệu
// cục bộ — người dùng bấm đăng xuất thì luôn phải ra khỏi hệ thống.
export async function logout(): Promise<void> {
	try {
		await fetch(`${BASE_URL}/api/v1/auth/logout`, {
			method: 'POST',
			credentials: 'same-origin',
			headers: { 'Content-Type': 'application/json' },
			body: '{}',
		});
	} catch {
		// bỏ qua — vẫn xoá phiên phía trình duyệt bên dưới
	}
	clearAuth();
	broadcastLogout();
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

async function postPublic(path: string, body: object): Promise<string> {
	const res = await fetch(`${BASE_URL}/api/v1/auth/${path}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});
	const json = await res.json();
	if (!res.ok || !json.success) {
		const detail = json.errors?.[0]?.message ?? json.errors?.[0]?.msg;
		throw new Error(detail ?? json.message ?? 'Có lỗi xảy ra, vui lòng thử lại');
	}
	return json.message as string;
}

export const forgotPasswordApi = (username: string) => postPublic('forgot-password', { username });

export const resetPasswordApi = (username: string, code: string, newPassword: string) =>
	postPublic('reset-password', { username, code, new_password: newPassword });
