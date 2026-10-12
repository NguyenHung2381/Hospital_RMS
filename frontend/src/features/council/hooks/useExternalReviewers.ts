import { showToast } from '@/shared/utils/feedback';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { bulkToast, runBulk } from '../../../shared/utils/runBulk';
import {
	createExternalReviewer,
	deleteExternalReviewer,
	getExternalReviewers,
	patchExternalReviewer,
	updateExternalReviewer,
	type ExternalReviewerPatch,
} from '../api/externalReviewerApi';
import {
	EMPTY_EXTERNAL_REVIEWER_FORM,
	type ExternalReviewer,
	type ExternalReviewerForm,
} from '../types/council.type';

type ModalType = 'add' | 'edit' | 'delete' | null;

export function useExternalReviewers() {
	const [reviewers, setReviewers] = useState<ExternalReviewer[]>([]);
	const [isLoadingData, setIsLoadingData] = useState(true);
	const [search, setSearch] = useState('');
	const [modal, setModal] = useState<ModalType>(null);
	const [editingReviewer, setEditingReviewer] = useState<ExternalReviewer | null>(null);
	const [deletingReviewer, setDeletingReviewer] = useState<ExternalReviewer | null>(null);
	const [loading, setLoading] = useState(false);
	const [refreshKey, setRefreshKey] = useState(0);

	const refreshData = useCallback(() => setRefreshKey((prev) => prev + 1), []);
	useRealtimeUpdate('external_reviewer', refreshData);

	useEffect(() => {
		getExternalReviewers({ active_only: false })
			.then(setReviewers)
			.catch(() => showToast('error', 'Không thể tải danh sách người ngoài viện'))
			.finally(() => setIsLoadingData(false));
	}, [refreshKey]);

	const filtered = useMemo(() => {
		if (!search.trim()) return reviewers;
		const q = search.toLowerCase();
		return reviewers.filter(
			(r) =>
				r.full_name.toLowerCase().includes(q) ||
				(r.organization ?? '').toLowerCase().includes(q) ||
				(r.specialty_group ?? '').toLowerCase().includes(q),
		);
	}, [reviewers, search]);

	const handleAdd = useCallback(
		async (form: ExternalReviewerForm) => {
			setLoading(true);
			try {
				const created = await createExternalReviewer(form);
				setReviewers((prev) => [created, ...prev]);
				setModal(null);
				showToast('success', `Đã thêm "${created.full_name}"`);
			} catch (err) {
				showToast('error', err instanceof Error ? err.message : 'Thêm thất bại');
			} finally {
				setLoading(false);
			}
		},
		[],
	);

	const handleEdit = useCallback(
		async (form: ExternalReviewerForm) => {
			if (!editingReviewer) return;
			setLoading(true);
			try {
				const updated = await updateExternalReviewer(editingReviewer.id, form);
				setReviewers((prev) => prev.map((r) => (r.id === editingReviewer.id ? updated : r)));
				setModal(null);
				setEditingReviewer(null);
				showToast('success', `Đã cập nhật "${updated.full_name}"`);
			} catch (err) {
				showToast('error', err instanceof Error ? err.message : 'Cập nhật thất bại');
			} finally {
				setLoading(false);
			}
		},
		[editingReviewer],
	);

	const handleDelete = useCallback(async () => {
		if (!deletingReviewer) return;
		setLoading(true);
		try {
			await deleteExternalReviewer(deletingReviewer.id);
			setModal(null);
			setDeletingReviewer(null);
			refreshData();
			showToast('success', `Đã xoá "${deletingReviewer.full_name}"`);
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Xoá thất bại');
		} finally {
			setLoading(false);
		}
	}, [deletingReviewer, refreshData]);

	const handleBulkDelete = useCallback(
		async (ids: string[]) => {
			if (!ids.length) return;
			setLoading(true);
			try {
				const { okIds, failedCount } = await runBulk(
					ids,
					deleteExternalReviewer,
				);
				setModal(null);
				refreshData();
				showToast(
					failedCount ? 'error' : 'success',
					bulkToast('xoá', okIds.size, failedCount, 'người ngoài viện'),
				);
			} finally {
				setLoading(false);
			}
		},
		[refreshData],
	);

	const handleBulkEdit = useCallback(
		async (ids: string[], patch: ExternalReviewerPatch) => {
			if (!ids.length || !Object.keys(patch).length) return;
			setLoading(true);
			try {
				const { okIds, failedCount } = await runBulk(ids, (id) =>
					patchExternalReviewer(id, patch),
				);
				setModal(null);
				refreshData();
				showToast(
					failedCount ? 'error' : 'success',
					bulkToast('cập nhật', okIds.size, failedCount, 'người ngoài viện'),
				);
			} finally {
				setLoading(false);
			}
		},
		[refreshData],
	);

	return {
		reviewers,
		isLoadingData,
		search,
		setSearch,
		modal,
		setModal,
		editingReviewer,
		setEditingReviewer,
		deletingReviewer,
		setDeletingReviewer,
		loading,
		filtered,
		EMPTY_EXTERNAL_REVIEWER_FORM,
		handleAdd,
		handleEdit,
		handleDelete,
		handleBulkDelete,
		handleBulkEdit,
	};
}
