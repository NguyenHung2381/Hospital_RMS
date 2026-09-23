import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { bulkToast, runBulk } from '../../../shared/utils/runBulk';
import { catalogApi } from '../api/catalogApi';
import type {
	CatalogFormData,
	CatalogItem,
	CatalogTab,
	ModalType,
} from '../types/catalog.type';

export const EMPTY_FORM: CatalogFormData = { name: '', description: '' };

export const TAB_CONFIG: Record<
	CatalogTab,
	{ label: string; subtitle: string; placeholder: string }
> = {
	categories: {
		label: 'Phân loại',
		subtitle: 'Danh mục phân loại đề tài nghiên cứu',
		placeholder: 'VD: Nghiên cứu lâm sàng',
	},
	levels: {
		label: 'Cấp độ',
		subtitle: 'Danh mục cấp độ đề tài nghiên cứu',
		placeholder: 'VD: Cấp tỉnh',
	},
	'round-types': {
		label: 'Loại đợt',
		subtitle: 'Danh mục loại đợt nghiên cứu',
		placeholder: 'VD: Nghiên cứu khoa học',
	},
};

export function useCatalog() {
	const location = useLocation();
	const navigate = useNavigate();
	const tab: CatalogTab = location.pathname.includes('round-types')
		? 'round-types'
		: location.pathname.includes('levels')
			? 'levels'
			: 'categories';

	const [items, setItems] = useState<CatalogItem[]>([]);
	const [isLoadingData, setIsLoadingData] = useState(true);
	const [search, setSearch] = useState('');
	const [modal, setModal] = useState<ModalType>(null);
	const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);
	const [deletingItem, setDeletingItem] = useState<CatalogItem | null>(null);
	const [loading, setLoading] = useState(false);
	const [toast, setToast] = useState<{
		type: 'success' | 'error';
		msg: string;
	} | null>(null);
	const [pageSize, setPageSize] = useState(10);
	const [page, setPage] = useState(1);
	const [refreshKey, setRefreshKey] = useState(0);

	const cfg = TAB_CONFIG[tab];

	const refreshData = useCallback(() => setRefreshKey((k) => k + 1), []);
	useRealtimeUpdate('category', refreshData);
	useRealtimeUpdate('level', refreshData);
	useRealtimeUpdate('round_type', refreshData);

	const showToast = useCallback((type: 'success' | 'error', msg: string) => {
		setToast({ type, msg });
		setTimeout(() => setToast(null), 3000);
	}, []);

	useEffect(() => {
		catalogApi
			.list(tab)
			.then((res) => setItems(res.data))
			.catch(() =>
				showToast(
					'error',
					`Không thể tải danh sách ${TAB_CONFIG[tab].label.toLowerCase()}`,
				),
			)
			.finally(() => setIsLoadingData(false));
	}, [tab, showToast, refreshKey]);

	const handleTabChange = useCallback(
		(next: CatalogTab) => {
			if (next === tab) return;
			setItems([]);
			setIsLoadingData(true);
			setSearch('');
			setPage(1);
			setModal(null);
			setEditingItem(null);
			setDeletingItem(null);
			navigate(`/admin/${next}`);
		},
		[tab, navigate],
	);

	const filtered = useMemo(() => {
		if (!search.trim()) return items;
		const q = search.toLowerCase();
		return items.filter(
			(d) =>
				d.name.toLowerCase().includes(q) ||
				(d.description ?? '').toLowerCase().includes(q),
		);
	}, [items, search]);

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
		async (data: CatalogFormData) => {
			setLoading(true);
			try {
				const created = await catalogApi.create(tab, data);
				if (tab === 'round-types' && data.level_ids?.length)
					await catalogApi.setRoundTypeLevels(created.id, data.level_ids);
				setItems((prev) => [created, ...prev]);
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
		[tab, showToast],
	);

	const handleEdit = useCallback(
		async (data: CatalogFormData) => {
			if (!editingItem) return;
			setLoading(true);
			try {
				const updated = await catalogApi.update(tab, editingItem.id, data);
				if (tab === 'round-types')
					await catalogApi.setRoundTypeLevels(
						editingItem.id,
						data.level_ids ?? [],
					);
				setItems((prev) =>
					prev.map((d) => (d.id === editingItem.id ? updated : d)),
				);
				setModal(null);
				setEditingItem(null);
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
		[tab, editingItem, showToast],
	);

	const handleDelete = useCallback(async () => {
		if (!deletingItem) return;
		setLoading(true);
		try {
			await catalogApi.remove(tab, deletingItem.id);
			setItems((prev) => prev.filter((d) => d.id !== deletingItem.id));
			setModal(null);
			setDeletingItem(null);
			showToast('success', `Đã xoá "${deletingItem.name}"`);
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Xoá thất bại');
		} finally {
			setLoading(false);
		}
	}, [tab, deletingItem, showToast]);

	const handleBulkDelete = useCallback(
		async (ids: string[]) => {
			if (!ids.length) return;
			setLoading(true);
			try {
				const { okIds, failedCount } = await runBulk(ids, (id) =>
					catalogApi.remove(tab, id),
				);
				setItems((prev) => prev.filter((d) => !okIds.has(d.id)));
				setModal(null);
				showToast(
					failedCount ? 'error' : 'success',
					bulkToast('xoá', okIds.size, failedCount, cfg.label.toLowerCase()),
				);
			} finally {
				setLoading(false);
			}
		},
		[tab, cfg.label, showToast],
	);

	return {
		tab,
		cfg,
		items,
		isLoadingData,
		search,
		modal,
		editingItem,
		deletingItem,
		loading,
		toast,
		pageSize,
		page,
		filtered,
		totalPages,
		safePage,
		paged,
		setModal,
		setEditingItem,
		setDeletingItem,
		setPage,
		handleTabChange,
		handleSearch,
		handlePageSize,
		handleAdd,
		handleEdit,
		handleDelete,
		handleBulkDelete,
	};
}
