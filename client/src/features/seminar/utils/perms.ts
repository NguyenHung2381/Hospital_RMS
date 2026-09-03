import type { LoginUser } from '../../auth/api/authApi';
import { getStoredUser } from '../../../shared/utils/storage';

// Kiểm tra quyền "seminars:<action>" của người đang đăng nhập.
// system:manage = toàn quyền; seminars:manage bao mọi action.
export function useSeminarPerms() {
	const perms = getStoredUser<LoginUser>()?.permissions ?? [];
	const can = (action: string) =>
		perms.includes('system:manage') ||
		perms.includes('seminars:manage') ||
		perms.includes(`seminars:${action}`);
	return {
		canCreate: can('create'),
		canUpdate: can('update'),
		canDelete: can('delete'),
		canImport: can('import'),
		canExport: can('export'),
		canCme: can('cme_manage'),
	};
}
