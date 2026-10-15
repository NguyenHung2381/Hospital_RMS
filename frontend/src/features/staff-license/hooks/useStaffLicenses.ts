import { showToast } from '@/shared/utils/feedback';
import { useCallback, useEffect, useState } from 'react';
import { useRealtimeUpdate } from '@/layouts/hooks/useRealtime';
import { DEFAULT_PAGE_SIZE } from '@/shared/utils/constants';
import { apiClient } from '@/shared/api/axios';
import {
	createStaffLicense,
	deleteStaffLicense,
	getStaffLicenses,
	updateStaffLicense,
} from '../api/staffLicenseApi';
import type { StaffLicense, StaffLicenseFormData } from '../types/staffLicense.type';

type Option = { id: string; name: string };

export function useStaffLicenses() {
	const [items, setItems] = useState<StaffLicense[]>([]);
	const [total, setTotal] = useState(0);
	const [isLoadingData, setIsLoadingData] = useState(true);
	const [search, setSearch] = useState('');
	const [debouncedSearch, setDebouncedSearch] = useState('');
	const [departmentId, setDepartmentId] = useState('');
	const [hasLicense, setHasLicense] = useState('');
	const [departments, setDepartments] = useState<Option[]>([]);
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
	const [refreshKey, setRefreshKey] = useState(0);
	const [loading, setLoading] = useState(false);

	const refreshData = useCallback(() => setRefreshKey((k) => k + 1), []);
	useRealtimeUpdate('staff_license', refreshData);

	useEffect(() => {
		apiClient
			.get<{ data: Option[] }>('/departments?limit=0')
			.then((r) => setDepartments(r.data))
			.catch(() => {});
	}, []);

	useEffect(() => {
		const t = setTimeout(() => setDebouncedSearch(search), 300);
		return () => clearTimeout(t);
	}, [search]);

	useEffect(() => {
		const controller = new AbortController();
		void (async () => {
			setIsLoadingData(true);
			try {
				const res = await getStaffLicenses({
					page,
					limit: pageSize,
					search: debouncedSearch,
					department_id: departmentId,
					has_license: hasLicense,
				});
				if (controller.signal.aborted) return;
				setItems(res.data);
				setTotal(res.pagination.total);
				if (page > Math.max(1, Math.ceil(res.pagination.total / pageSize))) setPage(1);
			} catch {
				if (!controller.signal.aborted) showToast('error', 'Không thể tải danh sách chứng chỉ hành nghề');
			} finally {
				if (!controller.signal.aborted) setIsLoadingData(false);
			}
		})();
		return () => controller.abort();
	}, [page, pageSize, debouncedSearch, departmentId, hasLicense, refreshKey]);

	// Đổi bộ lọc → về trang 1
	const withReset =
		<T,>(set: (v: T) => void) =>
		(v: T) => {
			set(v);
			setPage(1);
		};

	const save = useCallback(
		async (form: StaffLicenseFormData, editing: StaffLicense | null) => {
			setLoading(true);
			try {
				const saved = editing ? await updateStaffLicense(editing.id, form) : await createStaffLicense(form);
				showToast('success', `Đã lưu CCHN của "${saved.user_full_name}"`);
				refreshData();
				return true;
			} catch (err) {
				showToast('error', err instanceof Error ? err.message : 'Lưu thất bại');
				return false;
			} finally {
				setLoading(false);
			}
		},
		[refreshData],
	);

	const remove = useCallback(
		async (item: StaffLicense) => {
			await deleteStaffLicense(item.id);
			showToast('success', `Đã xoá hồ sơ CCHN của "${item.user_full_name}"`);
			refreshData();
		},
		[refreshData],
	);

	return {
		items,
		total,
		isLoadingData,
		loading,
		search,
		departmentId,
		hasLicense,
		departments,
		page,
		pageSize,
		totalPages: Math.max(1, Math.ceil(total / pageSize)),
		setPage,
		setSearch: withReset(setSearch),
		setDepartmentId: withReset(setDepartmentId),
		setHasLicense: withReset(setHasLicense),
		setPageSize: withReset(setPageSize),
		refreshData,
		save,
		remove,
	};
}
