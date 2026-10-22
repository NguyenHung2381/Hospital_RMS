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

// Tài khoản học viên (vai trò "trainee" — cấp cho học viên, chủ yếu ngoại viện)
// dùng cổng học viên riêng /hoc-vien thay cho cổng người dùng /user.
export function isTraineeAccount(): boolean {
	return getStoredUser()?.role_code === 'trainee';
}

export const TRAINEE_HOME = '/hoc-vien';

// /user/... → trang tương ứng trong cổng học viên (link cũ, thông báo, QR điểm danh).
export function traineePathFor(pathname: string): string {
	const rest = pathname.replace(/^\/user\/?/, '');
	if (rest === 'profile') return `${TRAINEE_HOME}/ho-so`;
	if (rest === 'notifications') return `${TRAINEE_HOME}/thong-bao`;
	if (/^(khoa-hoc|diem-danh|khao-sat)(\/|$)/.test(rest)) return `${TRAINEE_HOME}/${rest}`;
	return TRAINEE_HOME;
}

export function defaultPath(): string {
	const user = getStoredUser();
	if (canAccessAdminPanel(user)) return '/admin';
	return isTraineeAccount() ? TRAINEE_HOME : '/user';
}
