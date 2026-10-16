import type { ComponentType } from 'react';
import { CalendarSvg, LayersSvg, TagSvg, UserCheckSvg } from '@/assets/icons';
import { useClientPaging } from '@/shared/hooks/useClientPaging';
import { showToast } from '@/shared/utils/feedback';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { bulkToast, runBulk } from '../../../shared/utils/runBulk';
import { catalogApi } from '../api/catalogApi';
import type {
	CatalogFormData,
	CatalogGroup,
	CatalogItem,
	CatalogTab,
	ModalType,
} from '../types/catalog.type';

export const EMPTY_FORM: CatalogFormData = { name: '', description: '' };

// realtime: tên entity mà services/crudService.js phát ra (số ít, bỏ 's' cuối)
export const TAB_CONFIG: Record<
	CatalogTab,
	{ label: string; subtitle: string; placeholder: string; realtime: string; icon: ComponentType }
> = {
	categories: {
		label: 'Phân loại',
		subtitle: 'Danh mục phân loại đề tài nghiên cứu',
		placeholder: 'VD: Nghiên cứu lâm sàng',
		realtime: 'category',
		icon: TagSvg,
	},
	levels: {
		label: 'Cấp độ',
		subtitle: 'Danh mục cấp độ đề tài nghiên cứu',
		placeholder: 'VD: Cấp tỉnh',
		realtime: 'level',
		icon: LayersSvg,
	},
	'round-types': {
		label: 'Loại đợt',
		subtitle: 'Danh mục loại đợt nghiên cứu',
		placeholder: 'VD: Nghiên cứu khoa học',
		realtime: 'round_type',
		icon: CalendarSvg,
	},
	'trainee-types': {
		label: 'Đối tượng học viên',
		subtitle: 'Danh mục đối tượng học viên (nội viện, ngoại viện...)',
		placeholder: 'VD: Nhân viên y tế',
		realtime: 'trainee_type',
		icon: UserCheckSvg,
	},
	'training-forms': {
		label: 'Hình thức học',
		subtitle: 'Danh mục hình thức học (trực tiếp, trực tuyến...)',
		placeholder: 'VD: Trực tuyến',
		realtime: 'training_form',
		icon: LayersSvg,
	},
	'training-types': {
		label: 'Loại hình đào tạo',
		subtitle: 'Danh mục loại hình đào tạo',
		placeholder: 'VD: Đào tạo liên tục',
		realtime: 'training_type',
		icon: TagSvg,
	},
};

export const CATALOG_GROUPS: Record<CatalogGroup, { title: string; tabs: CatalogTab[]; breadcrumb?: string }> = {
	research: { title: 'Quản lý Danh mục', tabs: ['categories', 'levels', 'round-types'] },
	training: {
		title: 'Danh mục Đào tạo',
		tabs: ['trainee-types', 'training-forms', 'training-types'],
		breadcrumb: 'Đào tạo',
	},
};

export function useCatalog(group: CatalogGroup) {
	const location = useLocation();
	const navigate = useNavigate();
	const tabs = CATALOG_GROUPS[group].tabs;
	const tab = tabs.find((t) => location.pathname.endsWith('/' + t)) ?? tabs[0];

	const [items, setItems] = useState<CatalogItem[]>([]);
	const [isLoadingData, setIsLoadingData] = useState(true);
	const [search, setSearch] = useState('');
	const [modal, setModal] = useState<ModalType>(null);
	const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);
	const [deletingItem, setDeletingItem] = useState<CatalogItem | null>(null);
	const [loading, setLoading] = useState(false);
	const [refreshKey, setRefreshKey] = useState(0);

	const cfg = TAB_CONFIG[tab];

	const refreshData = useCallback(() => setRefreshKey((k) => k + 1), []);
	useRealtimeUpdate(cfg.realtime, refreshData);

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
	}, [tab, refreshKey]);

	const filtered = useMemo(() => {
		if (!search.trim()) return items;
		const q = search.toLowerCase();
		return items.filter(
			(d) =>
				d.name.toLowerCase().includes(q) ||
				(d.description ?? '').toLowerCase().includes(q),
		);
	}, [items, search]);

	const { page, setPage, pageSize, handlePageSize, totalPages, safePage, paged } =
		useClientPaging(filtered);

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
		[tab, navigate, setPage],
	);

	const handleSearch = useCallback((v: string) => {
		setSearch(v);
		setPage(1);
	}, [setPage]);


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
		[tab],
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
		[tab, editingItem],
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
	}, [tab, deletingItem]);

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
		[tab, cfg.label],
	);

	return {
		tab,
		refreshData,
		tabs,
		cfg,
		items,
		isLoadingData,
		search,
		modal,
		editingItem,
		deletingItem,
		loading,
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
