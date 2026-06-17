import { getStoredUser as getAuthUser, getToken } from '../../shared/utils/storage';

export interface StoredUser {
	account_type?: string;
	role?: string;
}

export function getStoredUser(): StoredUser | null {
	return getAuthUser<StoredUser>();
}

export function hasToken(): boolean {
	return Boolean(getToken());
}

export function isAdmin(user: StoredUser | null): boolean {
	if (!user) return false;
	if (user.account_type === 'admin') return true;
	const role = (user.role ?? '').toLowerCase();
	return (
		role.includes('giám đốc') ||
		role.includes('giam_doc') ||
		role.includes('giam doc') ||
		role.includes('director')
	);
}

export function isMember(user: StoredUser | null): boolean {
	return user?.account_type === 'member';
}

export function defaultPath(): string {
	return isAdmin(getStoredUser()) ? '/admin' : '/user';
}
