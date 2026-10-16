import { showToast } from '@/shared/utils/feedback';
import { useCallback, useEffect, useState } from 'react';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { bulkToast, runBulk } from '../../../shared/utils/runBulk';
import {
	createDepartment,
	deleteDepartment,
	getDepartments,
	updateDepartment,
} from '../api/departmentApi';
import {
	EMPTY_FORM,
	type Department,
	type DeptFormData,
	type ModalType,
} from '../types/department.type';
import { DEFAULT_PAGE_SIZE } from '@/shared/utils/constants';

export function useDepartments() {
	// Chỉ chứa các dòng của TRANG hiện tại — server lo tìm kiếm & phân trang
	const [depts, setDepts] = useState<Department[]>([]);
	const [total, setTotal] = useState(0);
	const [isLoadingData, setIsLoadingData] = useState(true);
	const [search, setSearch] = useState('');
	const [debouncedSearch, setDebouncedSearch] = useState('');
	const [modal, setModal] = useState<ModalType>(null);
	const [editingDept, setEditingDept] = useState<Department | null>(null);
	const [deletingDept, setDeletingDept] = useState<Department | null>(null);
	const [loading, setLoading] = useState(false);
	const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
	const [page, setPage] = useState(1);
	const [refreshKey, setRefreshKey] = useState(0);

	const refreshData = useCallback(() => setRefreshKey((prev) => prev + 1), []);
	useRealtimeUpdate('department', refreshData);

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
				const res = await getDepartments({ page, limit: pageSize, search: debouncedSearch || undefined });
				if (controller.signal.aborted) return;
				setDepts(res.data);
				setTotal(res.pagination.total);
				const lastPage = pageSize === 0 ? 1 : Math.max(1, Math.ceil(res.pagination.total / pageSize));
				if (page > lastPage) setPage(1);
			} catch {
				if (!controller.signal.aborted) showToast('error', 'Không thể tải danh sách khoa phòng');
			} finally {
				if (!controller.signal.aborted) setIsLoadingData(false);
			}
		})();
		return () => controller.abort();
	}, [page, pageSize, debouncedSearch, refreshKey]);

	const totalPages = pageSize === 0 ? 1 : Math.max(1, Math.ceil(total / pageSize));
	const safePage = Math.min(page, totalPages);

	const handleSearch = useCallback((v: string) => {
		setSearch(v);
		setPage(1);
	}, []);

	const handlePageSize = useCallback((v: number) => {
		setPageSize(v);
		setPage(1);
	}, []);

	const handleAdd = useCallback(
		async (data: DeptFormData) => {
			setLoading(true);
			try {
				const created = await createDepartment(data);
				setModal(null);
				showToast('success', `Đã thêm "${created.name}"`);
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
		async (data: DeptFormData) => {
			if (!editingDept) return;
			setLoading(true);
			try {
				const updated = await updateDepartment(editingDept.id, data);
				setModal(null);
				setEditingDept(null);
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
		[editingDept, refreshData],
	);

	const handleDelete = useCallback(async () => {
		if (!deletingDept) return;
		setLoading(true);
		try {
			await deleteDepartment(deletingDept.id);
			setModal(null);
			setDeletingDept(null);
			showToast('success', `Đã xoá "${deletingDept.name}"`);
			refreshData();
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Xoá thất bại');
		} finally {
			setLoading(false);
		}
	}, [deletingDept, refreshData]);

	const handleBulkDelete = useCallback(
		async (ids: string[]) => {
			if (!ids.length) return;
			setLoading(true);
			try {
				const { okIds, failedCount } = await runBulk(ids, deleteDepartment);
				setModal(null);
				showToast(
					failedCount ? 'error' : 'success',
					bulkToast('xoá', okIds.size, failedCount, 'khoa phòng'),
				);
				refreshData();
			} finally {
				setLoading(false);
			}
		},
		[refreshData],
	);

	// Id toàn bộ bản ghi khớp từ khoá (mọi trang, limit=0) — cho nút "Xoá tất cả"
	const fetchAllIds = useCallback(
		async () => (await getDepartments({ search: debouncedSearch || undefined })).data.map((x) => x.id),
		[debouncedSearch],
	);

	return {
		depts,
		refreshData,
		fetchAllIds,
		isLoadingData,
		search,
		modal,
		editingDept,
		deletingDept,
		loading,
		pageSize,
		page,
		total,
		totalPages,
		safePage,
		paged: depts,
		EMPTY_FORM,
		setModal,
		setEditingDept,
		setDeletingDept,
		setPage,
		handleSearch,
		handlePageSize,
		handleAdd,
		handleEdit,
		handleDelete,
		handleBulkDelete,
	};
}
