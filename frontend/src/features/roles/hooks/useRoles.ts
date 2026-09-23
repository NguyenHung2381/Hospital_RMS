import { useCallback, useEffect, useState } from 'react';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { bulkToast, runBulk } from '../../../shared/utils/runBulk';
import { createRole, deleteRole, getRoles, updateRole } from '../api/roleApi';
import type { ModalType, Role, RoleFormData, RoleStats } from '../types/role.type';

const EMPTY_STATS: RoleStats = { total: 0, withUsers: 0, totalUsers: 0 };

export function useRoles() {
	// Chỉ chứa các dòng của TRANG hiện tại — server lo tìm kiếm & phân trang
	const [roles, setRoles] = useState<Role[]>([]);
	const [total, setTotal] = useState(0);
	// Tổng quan toàn bộ vai trò (server tính, không phụ thuộc search/phân trang)
	const [stats, setStats] = useState<RoleStats>(EMPTY_STATS);
	const [isLoadingData, setIsLoadingData] = useState(true);
	const [search, setSearch] = useState('');
	const [debouncedSearch, setDebouncedSearch] = useState('');
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

	// Debounce ô tìm kiếm 300ms rồi mới gọi API
	useEffect(() => {
		const t = setTimeout(() => setDebouncedSearch(search), 300);
		return () => clearTimeout(t);
	}, [search]);

	useEffect(() => {
		const controller = new AbortController();
		void (async () => {
			setIsLoadingData(true);
			try {
				const res = await getRoles({ page, limit: pageSize, search: debouncedSearch || undefined });
				if (controller.signal.aborted) return;
				setRoles(res.data);
				setTotal(res.pagination.total);
				setStats(res.stats);
				const lastPage = pageSize === 0 ? 1 : Math.max(1, Math.ceil(res.pagination.total / pageSize));
				if (page > lastPage) setPage(1);
			} catch {
				if (!controller.signal.aborted) showToast('error', 'Không thể tải danh sách vai trò');
			} finally {
				if (!controller.signal.aborted) setIsLoadingData(false);
			}
		})();
		return () => controller.abort();
	}, [page, pageSize, debouncedSearch, refreshKey, showToast]);

	const totalPages = pageSize === 0 ? 1 : Math.max(1, Math.ceil(total / pageSize));
	const safePage = Math.min(page, totalPages);

	const handleAdd = useCallback(
		async (data: RoleFormData) => {
			setLoading(true);
			try {
				const created = await createRole(data);
				setModal(null);
				showToast('success', `Đã thêm vai trò "${created.name}"`);
				refreshData();
			} catch (err) {
				showToast(
					'error',
					err instanceof Error ? err.message : 'Thêm thất bại',
				);
			} finally {
				setLoading(false);
			}
		},
		[showToast, refreshData],
	);

	const handleEdit = useCallback(
		async (data: RoleFormData) => {
			if (!editingRole) return;
			setLoading(true);
			try {
				const updated = await updateRole(editingRole.id, data);
				setModal(null);
				setEditingRole(null);
				showToast('success', `Đã cập nhật "${updated.name}"`);
				refreshData();
			} catch (err) {
				showToast(
					'error',
					err instanceof Error ? err.message : 'Cập nhật thất bại',
				);
			} finally {
				setLoading(false);
			}
		},
		[editingRole, showToast, refreshData],
	);

	const handleDelete = useCallback(async () => {
		if (!deletingRole) return;
		setLoading(true);
		try {
			await deleteRole(deletingRole.id);
			setModal(null);
			setDeletingRole(null);
			showToast('success', `Đã xoá "${deletingRole.name}"`);
			refreshData();
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Xoá thất bại');
		} finally {
			setLoading(false);
		}
	}, [deletingRole, showToast, refreshData]);

	const handleBulkDelete = useCallback(
		async (ids: string[]) => {
			if (!ids.length) return;
			setLoading(true);
			try {
				const { okIds, failedCount } = await runBulk(ids, deleteRole);
				setModal(null);
				showToast(
					failedCount ? 'error' : 'success',
					bulkToast('xoá', okIds.size, failedCount, 'vai trò'),
				);
				refreshData();
			} finally {
				setLoading(false);
			}
		},
		[showToast, refreshData],
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
		total,
		totalPages,
		safePage,
		paged: roles,
		stats,
		handleAdd,
		handleEdit,
		handleDelete,
		handleBulkDelete,
		handlePermSaved,
	};
}
