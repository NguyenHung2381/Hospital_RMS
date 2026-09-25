import {
	getStoredUser as getAuthUser,
	getToken,
	type StoredUser,
} from '../../shared/utils/storage';
import {
	hasPermission,
	hasAnyPermission,
	canAccessAdminPanel,
} from '../../shared/utils/permissions';

export function getStoredUser(): StoredUser | null {
	return getAuthUser<StoredUser>();
}

export function hasToken(): boolean {
	return Boolean(getToken());
}

// Kiểm tra quyền theo tập permissions "resource:action" trả về khi đăng nhập.
// Logic thật nằm ở shared/utils/permissions.ts (dùng chung với usePermission/Can
// và các layout) — re-export ở đây để không phá vỡ các chỗ đang import từ authHelpers.
export { hasPermission, hasAnyPermission, canAccessAdminPanel };

// Màn đổi mật khẩu bắt buộc (tài khoản dùng mật khẩu do người khác cấp). Server
// chặn mọi API khác cho tới khi đổi xong — xem backend middlewares/auth.js.
export const FORCE_PASSWORD_PATH = '/doi-mat-khau';

export function mustChangePassword(): boolean {
	return Boolean(getStoredUser()?.must_change_password);
}

// Tài khoản quản trị bắt buộc bật 2FA (backend permissions/twoFactorPolicy.js):
// quá hạn thì server chặn mọi API khác cho tới khi bật xong.
export const TWO_FACTOR_SETUP_PATH = '/bat-2fa';

export function mustSetupTwoFactor(): boolean {
	return getStoredUser()?.twofa_state === 'required';
}

export function canSetupTwoFactor(): boolean {
	const state = getStoredUser()?.twofa_state;
	return state === 'grace' || state === 'required';
}

// Màn phải tới trước khi vào hệ thống (null = không có): đổi mật khẩu trước,
// rồi mới tới bật 2FA.
export function blockingSetupPath(): string | null {
	if (mustChangePassword()) return FORCE_PASSWORD_PATH;
	if (mustSetupTwoFactor()) return TWO_FACTOR_SETUP_PATH;
	return null;
}

export function defaultPath(): string {
	return canAccessAdminPanel(getStoredUser()) ? '/admin' : '/user';
}
