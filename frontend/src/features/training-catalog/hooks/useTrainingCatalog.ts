import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { bulkToast, runBulk } from '../../../shared/utils/runBulk';
import { trainingCatalogApi } from '../api/trainingCatalogApi';
import type {
	ModalType,
	TrainingCatalogFormData,
	TrainingCatalogItem,
	TrainingCatalogTab,
} from '../types/trainingCatalog.type';

export const EMPTY_FORM: TrainingCatalogFormData = { name: '', description: '' };

export const TAB_CONFIG: Record<
	TrainingCatalogTab,
	{ label: string; subtitle: string; placeholder: string }
> = {
	'trainee-types': {
		label: 'Đối tượng học viên',
		subtitle: 'Danh mục đối tượng học viên (nội viện, ngoại viện...)',
		placeholder: 'VD: Nhân viên y tế',
	},
	'training-forms': {
		label: 'Hình thức học',
		subtitle: 'Danh mục hình thức học (trực tiếp, trực tuyến...)',
		placeholder: 'VD: Trực tuyến',
	},
	'training-types': {
		label: 'Loại hình đào tạo',
		subtitle: 'Danh mục loại hình đào tạo',
		placeholder: 'VD: Đào tạo liên tục',
	},
	subjects: {
		label: 'Môn học',
		subtitle: 'Danh mục môn học dùng trong các chương trình đào tạo',
		placeholder: 'VD: Cấp cứu cơ bản',
	},
};

const TAB_ORDER: TrainingCatalogTab[] = [
	'trainee-types',
	'training-forms',
	'training-types',
	'subjects',
];

// entity realtime khớp với cách services/crudService.js tự sinh tên (số ít
// thô bằng cách bỏ 's' cuối) — subjects -> subject.
const REALTIME_ENTITY: Record<TrainingCatalogTab, string> = {
	'trainee-types': 'trainee_type',
	'training-forms': 'training_form',
	'training-types': 'training_type',
	subjects: 'subject',
};

export function useTrainingCatalog() {
	const location = useLocation();
	const navigate = useNavigate();
	const tab: TrainingCatalogTab =
		TAB_ORDER.find((t) => location.pathname.includes(t)) ?? 'trainee-types';

	const [items, setItems] = useState<TrainingCatalogItem[]>([]);
	const [isLoadingData, setIsLoadingData] = useState(true);
	const [search, setSearch] = useState('');
	const [modal, setModal] = useState<ModalType>(null);
	const [editingItem, setEditingItem] = useState<TrainingCatalogItem | null>(null);
	const [deletingItem, setDeletingItem] = useState<TrainingCatalogItem | null>(null);
	const [loading, setLoading] = useState(false);
	const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
	const [pageSize, setPageSize] = useState(10);
	const [page, setPage] = useState(1);
	const [refreshKey, setRefreshKey] = useState(0);

	const cfg = TAB_CONFIG[tab];

	const refreshData = useCallback(() => setRefreshKey((k) => k + 1), []);
	useRealtimeUpdate(REALTIME_ENTITY[tab], refreshData);

	const showToast = useCallback((type: 'success' | 'error', msg: string) => {
		setToast({ type, msg });
		setTimeout(() => setToast(null), 3000);
	}, []);

	useEffect(() => {
		trainingCatalogApi
			.list(tab)
			.then((res) => setItems(res.data))
			.catch(() =>
				showToast('error', `Không thể tải danh sách ${TAB_CONFIG[tab].label.toLowerCase()}`),
			)
			.finally(() => setIsLoadingData(false));
	}, [tab, showToast, refreshKey]);

	const handleTabChange = useCallback(
		(next: TrainingCatalogTab) => {
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
			(d) => d.name.toLowerCase().includes(q) || (d.description ?? '').toLowerCase().includes(q),
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
		async (data: TrainingCatalogFormData) => {
			setLoading(true);
			try {
				const createdItem = await trainingCatalogApi.create(tab, data);
				setItems((prev) => [createdItem, ...prev]);
				setModal(null);
				showToast('success', `Đã thêm "${createdItem.name}"`);
			} catch (err) {
				showToast('error', err instanceof Error ? err.message : 'Thêm thất bại');
			} finally {
				setLoading(false);
			}
		},
		[tab, showToast],
	);

	const handleEdit = useCallback(
		async (data: TrainingCatalogFormData) => {
			if (!editingItem) return;
			setLoading(true);
			try {
				const updated = await trainingCatalogApi.update(tab, editingItem.id, data);
				setItems((prev) => prev.map((d) => (d.id === editingItem.id ? updated : d)));
				setModal(null);
				setEditingItem(null);
				showToast('success', `Đã cập nhật "${updated.name}"`);
			} catch (err) {
				showToast('error', err instanceof Error ? err.message : 'Cập nhật thất bại');
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
			await trainingCatalogApi.remove(tab, deletingItem.id);
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
				const { okIds, failedCount } = await runBulk(ids, (id) => trainingCatalogApi.remove(tab, id));
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
		tabOrder: TAB_ORDER,
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
