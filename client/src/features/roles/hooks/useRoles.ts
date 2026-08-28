import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { bulkToast, runBulk } from '../../../shared/utils/runBulk';
import { createRole, deleteRole, getRoles, updateRole } from '../api/roleApi';
import type { ModalType, Role, RoleFormData } from '../types/role.type';

export function useRoles() {
	const [roles, setRoles] = useState<Role[]>([]);
	const [isLoadingData, setIsLoadingData] = useState(true);
	const [search, setSearch] = useState('');
	const [modal, setModal] = useState<ModalType>(null);
	const [editingRole, setEditingRole] = useState<Role | null>(null);
	const [deletingRole, setDeletingRole] = useState<Role | null>(null);
	const [permRole, setPermRole] = useState<Role | null>(null);
	const [loading, setLoading] = useState(false);
	const [pageSize, setPageSize] = useState(10);
	const [page, setPage] = useState(1);
	const [toast, setToast] = useState<{
		type: 'success' | 'error';
		msg: string;
	} | null>(null);
	const [refreshKey, setRefreshKey] = useState(0);
	const [permCountMap, setPermCountMap] = useState<Record<string, number>>({});

	const showToast = useCallback((type: 'success' | 'error', msg: string) => {
		setToast({ type, msg });
		setTimeout(() => setToast(null), 3000);
	}, []);

	const refreshData = useCallback(() => {
		setRefreshKey((prev) => prev + 1);
	}, []);

	useRealtimeUpdate('role', refreshData);

	useEffect(() => {
		getRoles({ limit: 0 })
			.then((res) => setRoles(res.data))
			.catch(() => showToast('error', 'Không thể tải danh sách vai trò'))
			.finally(() => setIsLoadingData(false));
	}, [showToast, refreshKey]);

	const filtered = useMemo(() => {
		if (!search.trim()) return roles;
		const q = search.toLowerCase();
		return roles.filter(
			(r) =>
				r.name.toLowerCase().includes(q) ||
				r.id.toLowerCase().includes(q) ||
				(r.description ?? '').toLowerCase().includes(q),
		);
	}, [roles, search]);

	const totalPages = pageSize === 0 ? 1 : Math.ceil(filtered.length / pageSize);
	const safePage = Math.min(page, totalPages || 1);

	const paged = useMemo(() => {
		if (pageSize === 0) return filtered;
		return filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
	}, [filtered, safePage, pageSize]);

	const stats = useMemo(
		() => ({
			total: roles.length,
			withUsers: roles.filter((r) => (r.user_count ?? 0) > 0).length,
			totalUsers: roles.reduce((s, r) => s + (r.user_count ?? 0), 0),
		}),
		[roles],
	);

	const handleAdd = useCallback(
		async (data: RoleFormData) => {
			setLoading(true);
			try {
				const created = await createRole(data);
				setRoles((prev) => [created, ...prev]);
				setModal(null);
				showToast('success', `Đã thêm vai trò "${created.name}"`);
			} catch (err) {
				showToast(
					'error',
					err instanceof Error ? err.message : 'Thêm thất bại',
				);
			} finally {
				setLoading(false);
			}
		},
		[showToast],
	);

	const handleEdit = useCallback(
		async (data: RoleFormData) => {
			if (!editingRole) return;
			setLoading(true);
			try {
				const updated = await updateRole(editingRole.id, data);
				setRoles((prev) =>
					prev.map((r) => (r.id === editingRole.id ? updated : r)),
				);
				setModal(null);
				setEditingRole(null);
				showToast('success', `Đã cập nhật "${updated.name}"`);
			} catch (err) {
				showToast(
					'error',
					err instanceof Error ? err.message : 'Cập nhật thất bại',
				);
			} finally {
				setLoading(false);
			}
		},
		[editingRole, showToast],
	);

	const handleDelete = useCallback(async () => {
		if (!deletingRole) return;
		setLoading(true);
		try {
			await deleteRole(deletingRole.id);
			setRoles((prev) => prev.filter((r) => r.id !== deletingRole.id));
			setModal(null);
			setDeletingRole(null);
			showToast('success', `Đã xoá "${deletingRole.name}"`);
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Xoá thất bại');
		} finally {
			setLoading(false);
		}
	}, [deletingRole, showToast]);

	const handleBulkDelete = useCallback(
		async (ids: string[]) => {
			if (!ids.length) return;
			setLoading(true);
			try {
				const { okIds, failedCount } = await runBulk(ids, deleteRole);
				setRoles((prev) => prev.filter((r) => !okIds.has(r.id)));
				setModal(null);
				showToast(
					failedCount ? 'error' : 'success',
					bulkToast('xoá', okIds.size, failedCount, 'vai trò'),
				);
			} finally {
				setLoading(false);
			}
		},
		[showToast],
	);

	const handlePermSaved = useCallback(
		(roleId: string, ids: string[]) => {
			setPermCountMap((prev) => ({ ...prev, [roleId]: ids.length }));
			showToast('success', 'Đã lưu phân quyền thành công');
		},
		[showToast],
	);

	return {
		roles,
		isLoadingData,
		search,
		setSearch,
		modal,
		setModal,
		editingRole,
		setEditingRole,
		deletingRole,
		setDeletingRole,
		permRole,
		setPermRole,
		loading,
		pageSize,
		setPageSize,
		page,
		setPage,
		toast,
		permCountMap,
		filtered,
		totalPages,
		safePage,
		paged,
		stats,
		handleAdd,
		handleEdit,
		handleDelete,
		handleBulkDelete,
		handlePermSaved,
	};
}
