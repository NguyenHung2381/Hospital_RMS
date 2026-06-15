import { BASE_URL } from '../../../lib/apiClient';

export interface LoginUser {
	id: string;
	username: string;
	staff_number: string | null;
	full_name: string;
	email: string;
	role: string;
	account_type: string;
	department_id: string | null;
}

export interface LoginResponse {
	user: LoginUser;
	access_token: string;
	refresh_token: string;
}

export async function loginApi(
	username: string,
	password: string,
): Promise<LoginResponse> {
	const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ username, password }),
	});

	const json = await res.json();

	if (!res.ok || !json.success) {
		throw new Error(json.message ?? 'Có lỗi xảy ra, vui lòng thử lại');
	}

	return json.data as LoginResponse;
}
