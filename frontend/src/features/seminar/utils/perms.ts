import type { LoginUser } from '../../auth/api/authApi';
import { hasPermission } from '../../../shared/utils/permissions';
import { getStoredUser } from '../../../shared/utils/storage';

// Quyền "seminars:<action>" của người đang đăng nhập (system:manage và
// seminars:manage bao mọi action — xem shared/utils/permissions.ts).
export function useSeminarPerms() {
	const user = getStoredUser<LoginUser>();
	return {
		canCreate: hasPermission(user, 'seminars:create'),
		canUpdate: hasPermission(user, 'seminars:update'),
		canDelete: hasPermission(user, 'seminars:delete'),
		canImport: hasPermission(user, 'seminars:import'),
		canExport: hasPermission(user, 'seminars:export'),
		canCme: hasPermission(user, 'seminars:cme_manage'),
	};
}
