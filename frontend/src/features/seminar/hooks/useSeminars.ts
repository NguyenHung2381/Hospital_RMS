import { showToast } from '@/shared/utils/feedback';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import {
	createSeminar,
	deleteSeminar,
	getSeminars,
	updateSeminar,
} from '../api/seminarApi';
import type {
	Seminar,
	SeminarForm,
	SeminarModal,
} from '../types/seminar.type';
import { DEFAULT_PAGE_SIZE } from '@/shared/utils/constants';

/** hospitalTraining: trang Tập huấn bệnh viện (chỉ buổi tập huấn BV tổ chức); trang Hội thảo loại các buổi này ra. */
export function useSeminars(hospitalTraining = false) {
	const [rows, setRows] = useState<Seminar[]>([]);
	const [total, setTotal] = useState(0);
	const [loadingData, setLoadingData] = useState(true);
	const [loading, setLoading] = useState(false);

	const [search, setSearch] = useState('');
	const [scope, setScope] = useState('');
	const [eventType, setEventType] = useState('');
	const [year, setYear] = useState('');
	const [onlyCme, setOnlyCme] = useState(false);
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);

	const [modal, setModal] = useState<SeminarModal>(null);
	const [editing, setEditing] = useState<Seminar | null>(null);
	const [deleting, setDeleting] = useState<Seminar | null>(null);
	const [refreshKey, setRefreshKey] = useState(0);

	const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);
	useRealtimeUpdate('seminar', refresh);

	// debounce tìm kiếm
	const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const [debouncedSearch, setDebouncedSearch] = useState('');
	useEffect(() => {
		clearTimeout(searchTimer.current);
		searchTimer.current = setTimeout(() => {
			setDebouncedSearch(search);
			setPage(1);
		}, 350);
		return () => clearTimeout(searchTimer.current);
	}, [search]);

	useEffect(() => {
		let alive = true;
		const load = () => {
			setLoadingData(true);
			getSeminars({
				page,
				limit: pageSize,
				search: debouncedSearch || undefined,
				scope: scope || undefined,
				event_type: eventType || undefined,
				year: year || undefined,
				grants_cme: onlyCme ? '1' : undefined,
				hospital_training: hospitalTraining ? '1' : '0',
			})
				.then((res) => {
					if (!alive) return;
					setRows(res.data);
					setTotal(res.pagination.total);
				})
				.catch(() => alive && showToast('error', 'Không tải được danh sách hội thảo'))
				.finally(() => alive && setLoadingData(false));
		};
		load();
		return () => {
			alive = false;
		};
	}, [page, pageSize, debouncedSearch, scope, eventType, year, onlyCme, hospitalTraining, refreshKey]);

	const totalPages = Math.max(1, Math.ceil(total / pageSize));

	const handleAdd = useCallback(
		async (form: SeminarForm) => {
			setLoading(true);
			try {
				const s = await createSeminar(form);
				setModal(null);
				showToast('success', `Đã thêm "${s.title}"`);
				refresh();
				return s;
			} catch (e) {
				showToast('error', e instanceof Error ? e.message : 'Thêm thất bại');
				return null;
			} finally {
				setLoading(false);
			}
		},
		[refresh],
	);

	const handleEdit = useCallback(
		async (form: SeminarForm) => {
			if (!editing) return;
			setLoading(true);
			try {
				await updateSeminar(editing.id, form);
				setModal(null);
				setEditing(null);
				showToast('success', 'Đã cập nhật');
				refresh();
			} catch (e) {
				showToast('error', e instanceof Error ? e.message : 'Cập nhật thất bại');
			} finally {
				setLoading(false);
			}
		},
		[editing, refresh],
	);

	const handleDelete = useCallback(async () => {
		if (!deleting) return;
		setLoading(true);
		try {
			await deleteSeminar(deleting.id);
			setModal(null);
			setDeleting(null);
			showToast('success', `Đã xoá "${deleting.title}"`);
			refresh();
		} catch (e) {
			showToast('error', e instanceof Error ? e.message : 'Xoá thất bại');
		} finally {
			setLoading(false);
		}
	}, [deleting, refresh]);

	return {
		rows,
		total,
		totalPages,
		loadingData,
		loading,
		search,
		setSearch,
		scope,
		setScope,
		eventType,
		setEventType,
		year,
		setYear,
		onlyCme,
		setOnlyCme,
		page,
		setPage,
		pageSize,
		setPageSize,
		modal,
		setModal,
		editing,
		setEditing,
		deleting,
		setDeleting,
		refresh,
		handleAdd,
		handleEdit,
		handleDelete,
	};
}
