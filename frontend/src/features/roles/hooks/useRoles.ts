import { showToast } from '@/shared/utils/feedback';
import { useCallback, useEffect, useState } from 'react';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { bulkToast, runBulk } from '../../../shared/utils/runBulk';
import { cloneRole, createRole, deleteRole, getRoles, updateRole } from '../api/roleApi';
import type { ModalType, Role, RoleFormData, RoleStats } from '../types/role.type';
import { DEFAULT_PAGE_SIZE } from '@/shared/utils/constants';

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
	// Vai trò đang được nhân bản / xem danh sách người dùng
	const [actionRole, setActionRole] = useState<Role | null>(null);
	const [loading, setLoading] = useState(false);
	const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
	const [page, setPage] = useState(1);
	const [refreshKey, setRefreshKey] = useState(0);
	const [permCountMap, setPermCountMap] = useState<Record<string, number>>({});

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
	}, [page, pageSize, debouncedSearch, refreshKey]);

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
		[refreshData],
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
		[editingRole, refreshData],
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
	}, [deletingRole, refreshData]);

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
		[refreshData],
	);

	const handleClone = useCallback(
		async (data: RoleFormData) => {
			if (!actionRole) return;
			setLoading(true);
			try {
				const created = await cloneRole(actionRole.id, data);
				setModal(null);
				setActionRole(null);
				showToast('success', `Đã nhân bản thành "${created.name}" (${created.permission_count ?? 0} quyền)`);
				refreshData();
			} catch (err) {
				showToast('error', err instanceof Error ? err.message : 'Nhân bản thất bại');
			} finally {
				setLoading(false);
			}
		},
		[actionRole, refreshData],
	);

	const handlePermSaved = useCallback(
		(roleId: string, ids: string[]) => {
			setPermCountMap((prev) => ({ ...prev, [roleId]: ids.length }));
			showToast('success', 'Đã lưu phân quyền thành công');
		},
		[],
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
		actionRole,
		setActionRole,
		loading,
		pageSize,
		setPageSize,
		page,
		setPage,
		permCountMap,
		total,
		totalPages,
		safePage,
		paged: roles,
		stats,
		handleAdd,
		handleEdit,
		handleClone,
		handleDelete,
		handleBulkDelete,
		handlePermSaved,
	};
}
