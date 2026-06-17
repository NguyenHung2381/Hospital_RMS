import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { getStoredUser, type StoredUser } from '../../../shared/utils/storage';
import {
	deleteUser as deleteUserApi,
	getRolesList,
	getUsers,
	resetUserPassword,
	updateUser as updateUserApi,
	type SimpleItem,
} from '../../user/api/userApi';
import type { AccountType, User } from '../../user/types/user.type';
import { type EditForm, formatDate } from '../utils/deptAccountsHelpers';

export function useDepartmentAccounts() {
	const currentUser = getStoredUser<StoredUser>();
	const deptId = currentUser?.department_id ?? null;
	const deptName = currentUser?.department ?? 'Khoa của tôi';

	const [users, setUsers] = useState<User[]>([]);
	const [roles, setRoles] = useState<SimpleItem[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [search, setSearch] = useState('');
	const [typeFilter, setTypeFilter] = useState<AccountType | 'all'>('all');
	const [refreshKey, setRefreshKey] = useState(0);
	const [editUser, setEditUser] = useState<User | null>(null);
	const [deleteUser, setDeleteUser] = useState<User | null>(null);
	const [resetUser, setResetUser] = useState<User | null>(null);
	const [toast, setToast] = useState<{
		msg: string;
		type: 'success' | 'error' | 'info';
	} | null>(null);

	const showToast = useCallback(
		(msg: string, type: 'success' | 'error' | 'info' = 'success') => {
			setToast({ msg, type });
		},
		[],
	);

	useEffect(() => {
		if (!toast) return;
		const t = setTimeout(() => setToast(null), 3000);
		return () => clearTimeout(t);
	}, [toast]);

	const refreshData = useCallback(() => setRefreshKey((k) => k + 1), []);
	useRealtimeUpdate('user', refreshData);

	useEffect(() => {
		const load = async () => {
			if (!deptId) {
				setIsLoading(false);
				setLoadError('Tài khoản của bạn chưa được gán vào khoa/phòng ban nào.');
				return;
			}
			setIsLoading(true);
			setLoadError(null);
			try {
				const [usersRes, rolesRes] = await Promise.all([
					getUsers({ department_id: deptId, limit: 200 }),
					getRolesList(),
				]);
				setUsers(usersRes.data);
				setRoles(rolesRes.data);
			} catch (err) {
				setLoadError(err instanceof Error ? err.message : 'Có lỗi xảy ra');
			} finally {
				setIsLoading(false);
			}
		};
		void load();
	}, [deptId, refreshKey]);

	const stats = useMemo(
		() => ({
			total: users.length,
			active: users.filter((u) => u.is_active).length,
			locked: users.filter((u) => !u.is_active).length,
		}),
		[users],
	);

	const filteredUsers = useMemo(() => {
		return users.filter((u) => {
			if (typeFilter !== 'all' && u.account_type !== typeFilter) return false;
			if (search) {
				const q = search.toLowerCase();
				return (
					u.full_name.toLowerCase().includes(q) ||
					u.username.toLowerCase().includes(q) ||
					(u.email ?? '').toLowerCase().includes(q) ||
					(u.staff_number ?? '').toLowerCase().includes(q)
				);
			}
			return true;
		});
	}, [users, typeFilter, search]);

	const getRoleName = useCallback(
		(id: string) => roles.find((r) => r.id === id)?.name ?? '—',
		[roles],
	);

	const handleEdit = useCallback(
		async (form: EditForm): Promise<void> => {
			if (!editUser) return;
			const updated = await updateUserApi(editUser.id, {
				staff_number: form.staff_number || undefined,
				full_name: form.full_name,
				email: form.email || undefined,
				role_id: form.role_id || undefined,
				account_type: form.account_type,
				is_active: form.is_active,
			});
			if (form.password) await resetUserPassword(editUser.id, form.password);
			setUsers((prev) => prev.map((u) => (u.id === editUser.id ? updated : u)));
			setEditUser(null);
			showToast('Đã cập nhật thông tin tài khoản');
		},
		[editUser, showToast],
	);

	const handleDelete = useCallback(async (): Promise<void> => {
		if (!deleteUser) return;
		await deleteUserApi(deleteUser.id);
		setUsers((prev) => prev.filter((u) => u.id !== deleteUser.id));
		setDeleteUser(null);
		showToast(`Đã xoá tài khoản ${deleteUser.full_name}`, 'info');
	}, [deleteUser, showToast]);

	const handleResetPassword = useCallback(async (): Promise<void> => {
		if (!resetUser) return;
		await resetUserPassword(resetUser.id, '123456');
		setResetUser(null);
		showToast(
			`Đã đặt lại mật khẩu của ${resetUser.full_name} về mặc định`,
			'info',
		);
	}, [resetUser, showToast]);

	const handleToggleActive = useCallback(
		async (id: string) => {
			const target = users.find((u) => u.id === id);
			if (!target) return;
			try {
				const updated = await updateUserApi(id, {
					is_active: !target.is_active,
				});
				setUsers((prev) => prev.map((u) => (u.id === id ? updated : u)));
				showToast(
					updated.is_active ? 'Đã kích hoạt tài khoản' : 'Đã khoá tài khoản',
					'info',
				);
			} catch {
				showToast('Không thể cập nhật trạng thái', 'error');
			}
		},
		[users, showToast],
	);

	return {
		deptName,
		users,
		isLoading,
		loadError,
		search,
		setSearch,
		typeFilter,
		setTypeFilter,
		filteredUsers,
		stats,
		editUser,
		setEditUser,
		deleteUser,
		setDeleteUser,
		resetUser,
		setResetUser,
		toast,
		getRoleName,
		handleEdit,
		handleDelete,
		handleResetPassword,
		handleToggleActive,
		formatDate,
	};
}
