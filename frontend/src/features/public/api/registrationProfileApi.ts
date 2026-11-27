// Hồ sơ điền sẵn form đăng ký khóa học cho nhân viên nội viện ĐÃ ĐĂNG NHẬP
// (/me/training/registration-profile). Form nằm ở cổng công khai nên KHÔNG dùng apiClient:
// phiên hết hạn / không làm mới được thì chỉ coi như chưa đăng nhập (trả null), không đẩy người
// đang đăng ký về trang /login và không xóa phiên.
import { BASE_URL } from '../../../shared/api/axios';
import { readJson, safeFetch } from '../../../shared/api/http';
import { refreshQueued } from '../../../shared/api/interceptors';
import { getStoredUser, getToken, type StoredUser } from '../../../shared/utils/storage';
import type { InfoKey } from '../utils/courseRegisterFields';
import type { RegistrationStaff } from './publicApi';

const PATH = '/me/training/registration-profile';

export interface MyRegistrationProfile {
	staff_number: string;
	staff: RegistrationStaff;
	/** Giá trị điền sẵn: hồ sơ học viên > bản khai gần nhất > tài khoản nhân sự */
	profile: Partial<Record<InfoKey, string>>;
	has_trainee_profile: boolean;
}

export interface ProfileUpdateResult {
	updated: string[];
	skipped: { key: string; reason: string }[];
}

/** Trình duyệt này đang giữ phiên của tài khoản nhân viên (có mã NV) không */
export const hasStaffSession = () => !!getStoredUser<StoredUser>()?.staff_number;

const refresh = () => refreshQueued().catch(() => null);

const call = async <T>(init: RequestInit): Promise<T | null> => {
	if (!hasStaffSession()) return null;
	const send = (token: string) =>
		safeFetch(`${BASE_URL}/api/v1${PATH}`, {
			...init,
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		});
	// Access token chỉ nằm trong bộ nhớ: tải lại trang thì làm mới bằng cookie trước
	const token = getToken() ?? (await refresh());
	if (!token) return null;
	let res = await send(token);
	if (res.status === 401) {
		const fresh = await refresh();
		if (!fresh) return null;
		res = await send(fresh);
	}
	const json = await readJson(res);
	if (!res.ok || !json?.success) {
		// Tài khoản không phải nhân viên (404) / phiên không còn hợp lệ: không điền sẵn
		if (res.status === 401 || res.status === 403 || res.status === 404) return null;
		const first = json?.errors?.[0]?.msg;
		throw new Error(typeof first === 'string' ? first : (json?.message ?? 'Có lỗi xảy ra, vui lòng thử lại'));
	}
	return json.data as T;
};

/** null = chưa đăng nhập / không phải tài khoản nhân viên */
export const getMyRegistrationProfile = () => call<MyRegistrationProfile>({ method: 'GET' });

/** Ghi lại hồ sơ học viên của chính tài khoản đang đăng nhập; null = phiên đã hết */
export const updateMyRegistrationProfile = (data: Partial<Record<InfoKey, string | number>>) =>
	call<ProfileUpdateResult>({ method: 'PUT', body: JSON.stringify(data) });
