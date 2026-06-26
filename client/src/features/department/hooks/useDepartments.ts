import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
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

export function useDepartments() {
	const [depts, setDepts] = useState<Department[]>([]);
	const [isLoadingData, setIsLoadingData] = useState(true);
	const [search, setSearch] = useState('');
	const [modal, setModal] = useState<ModalType>(null);
	const [editingDept, setEditingDept] = useState<Department | null>(null);
	const [deletingDept, setDeletingDept] = useState<Department | null>(null);
	const [loading, setLoading] = useState(false);
	const [toast, setToast] = useState<{
		type: 'success' | 'error';
		msg: string;
	} | null>(null);
	const [pageSize, setPageSize] = useState<number>(10);
	const [page, setPage] = useState(1);
	const [refreshKey, setRefreshKey] = useState(0);

	const refreshData = useCallback(() => setRefreshKey((prev) => prev + 1), []);
	useRealtimeUpdate('department', refreshData);

	const showToast = useCallback((type: 'success' | 'error', msg: string) => {
		setToast({ type, msg });
		setTimeout(() => setToast(null), 3000);
	}, []);

	useEffect(() => {
		getDepartments()
			.then((res) => setDepts(res.data))
			.catch(() => showToast('error', 'Không thể tải danh sách khoa phòng'))
			.finally(() => setIsLoadingData(false));
	}, [showToast, refreshKey]);

	const filtered = useMemo(() => {
		if (!search.trim()) return depts;
		const q = search.toLowerCase();
		return depts.filter(
			(d) =>
				d.name.toLowerCase().includes(q) ||
				(d.code ?? '').toLowerCase().includes(q) ||
				(d.abbreviation ?? '').toLowerCase().includes(q),
		);
	}, [depts, search]);

	const totalPages = pageSize === 0 ? 1 : Math.ceil(filtered.length / pageSize);
	const safePage = Math.min(page, totalPages || 1);

	const paged = useMemo(() => {
		if (pageSize === 0) return filtered;
		const start = (safePage - 1) * pageSize;
		return filtered.slice(start, start + pageSize);
	}, [filtered, safePage, pageSize]);

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
				setDepts((prev) => [created, ...prev]);
				setModal(null);
				showToast('success', `Đã thêm "${created.name}"`);
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
		async (data: DeptFormData) => {
			if (!editingDept) return;
			setLoading(true);
			try {
				const updated = await updateDepartment(editingDept.id, data);
				setDepts((prev) =>
					prev.map((d) => (d.id === editingDept.id ? updated : d)),
				);
				setModal(null);
				setEditingDept(null);
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
		[editingDept, showToast],
	);

	const handleDelete = useCallback(async () => {
		if (!deletingDept) return;
		setLoading(true);
		try {
			await deleteDepartment(deletingDept.id);
			setDepts((prev) => prev.filter((d) => d.id !== deletingDept.id));
			setModal(null);
			setDeletingDept(null);
			showToast('success', `Đã xoá "${deletingDept.name}"`);
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Xoá thất bại');
		} finally {
			setLoading(false);
		}
	}, [deletingDept, showToast]);

	return {
		depts,
		isLoadingData,
		search,
		modal,
		editingDept,
		deletingDept,
		loading,
		toast,
		pageSize,
		page,
		filtered,
		totalPages,
		safePage,
		paged,
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
	};
}
