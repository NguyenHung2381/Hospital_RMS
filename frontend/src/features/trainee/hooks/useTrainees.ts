import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '../../../shared/api/axios';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { bulkToast, runBulk } from '../../../shared/utils/runBulk';
import {
	createTrainee,
	deleteTrainee,
	getTrainees,
	grantTraineeAccounts,
	updateTrainee,
	type GrantedTraineeAccount,
} from '../api/traineeApi';
import type { DetailTab } from './useTraineeDetail';
import { EMPTY_FORM, type ModalType, type Trainee, type TraineeFormData } from '../types/trainee.type';

export interface SimpleItem {
	id: string;
	name: string;
}

export function useTrainees() {
	const [trainees, setTrainees] = useState<Trainee[]>([]);
	const [traineeTypes, setTraineeTypes] = useState<SimpleItem[]>([]);
	const [departments, setDepartments] = useState<SimpleItem[]>([]);
	const [isLoadingData, setIsLoadingData] = useState(true);
	const [search, setSearch] = useState('');
	const [modal, setModal] = useState<ModalType>(null);
	const [editingTrainee, setEditingTrainee] = useState<Trainee | null>(null);
	const [deletingTrainee, setDeletingTrainee] = useState<Trainee | null>(null);
	const [viewingTrainee, setViewingTrainee] = useState<Trainee | null>(null);
	const [viewingTab, setViewingTab] = useState<DetailTab>('general');
	const [loading, setLoading] = useState(false);
	const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
	const [pageSize, setPageSize] = useState(10);
	const [page, setPage] = useState(1);
	const [refreshKey, setRefreshKey] = useState(0);
	const [grantedAccounts, setGrantedAccounts] = useState<GrantedTraineeAccount[]>([]);
	const [granting, setGranting] = useState(false);

	const refreshData = useCallback(() => setRefreshKey((prev) => prev + 1), []);
	useRealtimeUpdate('trainee', refreshData);

	const showToast = useCallback((type: 'success' | 'error', msg: string) => {
		setToast({ type, msg });
		setTimeout(() => setToast(null), 3000);
	}, []);

	useEffect(() => {
		getTrainees()
			.then((res) => setTrainees(res.data))
			.catch(() => showToast('error', 'Không thể tải danh sách học viên'))
			.finally(() => setIsLoadingData(false));
	}, [showToast, refreshKey]);

	useEffect(() => {
		apiClient
			.get<{ data: SimpleItem[] }>('/trainee-types?limit=0')
			.then((res) => setTraineeTypes(res.data))
			.catch(() => {});
		apiClient
			.get<{ data: SimpleItem[] }>('/departments?limit=0')
			.then((res) => setDepartments(res.data))
			.catch(() => {});
	}, []);

	const filtered = useMemo(() => {
		if (!search.trim()) return trainees;
		const q = search.toLowerCase();
		return trainees.filter(
			(t) =>
				t.full_name.toLowerCase().includes(q) ||
				(t.national_id ?? '').toLowerCase().includes(q) ||
				(t.phone ?? '').toLowerCase().includes(q) ||
				(t.email ?? '').toLowerCase().includes(q),
		);
	}, [trainees, search]);

	const totalPages = pageSize === 0 ? 1 : Math.ceil(filtered.length / pageSize);
	const safePage = Math.min(page, totalPages || 1);

	const paged = useMemo(() => {
		if (pageSize === 0) return filtered;
		const start = (safePage - 1) * pageSize;
		return filtered.slice(start, start + pageSize);
	}, [filtered, safePage, pageSize]);

	const openDetail = useCallback((trainee: Trainee, tab: DetailTab = 'general') => {
		setViewingTrainee(trainee);
		setViewingTab(tab);
	}, []);

	const handleSearch = useCallback((v: string) => {
		setSearch(v);
		setPage(1);
	}, []);

	const handlePageSize = useCallback((v: number) => {
		setPageSize(v);
		setPage(1);
	}, []);

	const handleAdd = useCallback(
		async (data: TraineeFormData) => {
			setLoading(true);
			try {
				const created = await createTrainee(data);
				setTrainees((prev) => [created, ...prev]);
				setModal(null);
				showToast('success', `Đã thêm "${created.full_name}"`);
			} catch (err) {
				showToast('error', err instanceof Error ? err.message : 'Thêm thất bại');
			} finally {
				setLoading(false);
			}
		},
		[showToast],
	);

	const handleEdit = useCallback(
		async (data: TraineeFormData) => {
			if (!editingTrainee) return;
			setLoading(true);
			try {
				const updated = await updateTrainee(editingTrainee.id, data);
				setTrainees((prev) => prev.map((t) => (t.id === editingTrainee.id ? updated : t)));
				setModal(null);
				setEditingTrainee(null);
				showToast('success', `Đã cập nhật "${updated.full_name}"`);
			} catch (err) {
				showToast('error', err instanceof Error ? err.message : 'Cập nhật thất bại');
			} finally {
				setLoading(false);
			}
		},
		[editingTrainee, showToast],
	);

	const handleDelete = useCallback(async () => {
		if (!deletingTrainee) return;
		setLoading(true);
		try {
			await deleteTrainee(deletingTrainee.id);
			setTrainees((prev) => prev.filter((t) => t.id !== deletingTrainee.id));
			setModal(null);
			setDeletingTrainee(null);
			showToast('success', `Đã xoá "${deletingTrainee.full_name}"`);
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Xoá thất bại');
		} finally {
			setLoading(false);
		}
	}, [deletingTrainee, showToast]);

	const handleBulkDelete = useCallback(
		async (ids: string[]) => {
			if (!ids.length) return;
			setLoading(true);
			try {
				const { okIds, failedCount } = await runBulk(ids, deleteTrainee);
				setTrainees((prev) => prev.filter((t) => !okIds.has(t.id)));
				setModal(null);
				showToast(failedCount ? 'error' : 'success', bulkToast('xoá', okIds.size, failedCount, 'học viên'));
			} finally {
				setLoading(false);
			}
		},
		[showToast],
	);

	const handleGrantAccounts = useCallback(
		async (ids?: string[]) => {
			setGranting(true);
			try {
				const result = await grantTraineeAccounts(ids);
				if (result.credentials.length > 0) {
					const grantedIds = new Set(result.credentials.map((c) => c.trainee_id));
					setTrainees((prev) =>
						prev.map((t) => (grantedIds.has(t.id) ? { ...t, account_granted: true } : t)),
					);
					setGrantedAccounts(result.credentials);
				}
				if (result.skipped.length > 0) {
					showToast(
						result.credentials.length > 0 ? 'success' : 'error',
						`Cấp được ${result.credentials.length} tài khoản, bỏ qua ${result.skipped.length} (đã có tài khoản hoặc lỗi).`,
					);
				} else if (result.credentials.length > 0) {
					showToast('success', `Đã cấp ${result.credentials.length} tài khoản mới.`);
				} else {
					showToast('error', 'Không có học viên nào cần cấp tài khoản.');
				}
			} catch (err) {
				showToast('error', err instanceof Error ? err.message : 'Cấp tài khoản thất bại');
			} finally {
				setGranting(false);
			}
		},
		[showToast],
	);

	return {
		trainees,
		traineeTypes,
		departments,
		isLoadingData,
		search,
		modal,
		editingTrainee,
		deletingTrainee,
		viewingTrainee,
		viewingTab,
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
		setEditingTrainee,
		setDeletingTrainee,
		setViewingTrainee,
		openDetail,
		setPage,
		handleSearch,
		handlePageSize,
		handleAdd,
		handleEdit,
		handleDelete,
		handleBulkDelete,
		refreshData,
		grantedAccounts,
		setGrantedAccounts,
		granting,
		handleGrantAccounts,
	};
}
