import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { getStoredUser, type StoredUser } from '../../../shared/utils/storage';
import {
	deleteUser as deleteUserApi,
	getUsers,
	resetUserPassword,
	updateUser as updateUserApi,
	type SimpleItem,
} from '../../user/api/userApi';
import type { User } from '../../user/types/user.type';
import { formatDate as _formatDate } from '../../../shared/utils/formatDate';
import { bulkToast, runBulk } from '../../../shared/utils/runBulk';
import type { EditForm } from '../utils/deptAccountsHelpers';

const formatDate = (s: string | null | undefined) => _formatDate(s) ?? '—';

export function useDepartmentAccounts() {
	const currentUser = getStoredUser<StoredUser>();
	const deptId = currentUser?.department_id ?? null;
	const deptName = currentUser?.department ?? 'Khoa của tôi';
	const fullName = currentUser?.full_name ?? currentUser?.username ?? 'Người dùng';
	const userRole = currentUser?.role ?? currentUser?.role_name ?? 'Thành viên';

	const [users, setUsers] = useState<User[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [search, setSearch] = useState('');
	const [roleFilter, setRoleFilter] = useState<string | 'all'>('all');
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
				// Vai trò lấy từ chính danh sách tài khoản (role_id + role_name) — không
				// gọi GET /roles: cần roles:read, tài khoản khoa không có quyền đó.
				const usersRes = await getUsers({ department_id: deptId, limit: 0 });
				setUsers(usersRes.data);
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
			if (roleFilter !== 'all' && u.role_id !== roleFilter) return false;
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
	}, [users, roleFilter, search]);

	// Các vai trò đang có trong khoa (bộ lọc theo vai trò), suy ra từ tài khoản
	const roles = useMemo<SimpleItem[]>(() => {
		const byId = new Map<string, string>();
		for (const u of users) if (u.role_id) byId.set(u.role_id, u.role_name ?? u.role_id);
		return [...byId].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
	}, [users]);

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

	const handleBulkDelete = useCallback(
		async (ids: string[]): Promise<void> => {
			if (!ids.length) return;
			const { okIds, failedCount } = await runBulk(ids, deleteUserApi);
			setUsers((prev) => prev.filter((u) => !okIds.has(u.id)));
			showToast(
				bulkToast('xoá', okIds.size, failedCount, 'tài khoản'),
				failedCount ? 'error' : 'info',
			);
		},
		[showToast],
	);

	const handleBulkSetActive = useCallback(
		async (ids: string[], isActive: boolean): Promise<void> => {
			if (!ids.length) return;
			const { okIds, failedCount } = await runBulk(ids, (id) =>
				updateUserApi(id, { is_active: isActive }),
			);
			setUsers((prev) =>
				prev.map((u) => (okIds.has(u.id) ? { ...u, is_active: isActive } : u)),
			);
			showToast(
				bulkToast(
					isActive ? 'kích hoạt' : 'khoá',
					okIds.size,
					failedCount,
					'tài khoản',
				),
				failedCount ? 'error' : 'info',
			);
		},
		[showToast],
	);

	return {
		deptName,
		fullName,
		userRole,
		users,
		isLoading,
		loadError,
		search,
		setSearch,
		roleFilter,
		setRoleFilter,
		roles,
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
		handleBulkDelete,
		handleBulkSetActive,
		formatDate,
	};
}
