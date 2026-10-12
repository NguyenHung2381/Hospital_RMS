export type { StoredUser } from '../utils/storage';
export type { PermissionKey } from './permissions.generated';
export { PERMISSION_KEYS } from './permissions.generated';

export interface PaginatedResponse<T> {
	data: T[];
	total: number;
	page: number;
	limit: number;
}
