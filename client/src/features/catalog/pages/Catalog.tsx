import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AdminLayout from '../../../layouts/AdminLayout';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { catalogApi } from '../api/catalogApi';
import { Ic } from '../components/icons';
import type {
	CatalogFormData,
	CatalogItem,
	CatalogTab,
	ModalType,
} from '../types/catalog.type';
import styles from './Catalog.module.css';

// ─── CONSTANTS ────────────────────────────
const EMPTY_FORM: CatalogFormData = { name: '', description: '' };

const ITEM_COLORS = [
	{ bg: '#e1f5ee', color: '#085041' },
	{ bg: '#e6f1fb', color: '#0c447c' },
	{ bg: '#eeedfe', color: '#3c3489' },
	{ bg: '#faeeda', color: '#633806' },
	{ bg: '#fce8fb', color: '#6b1a69' },
	{ bg: '#f1efe8', color: '#444441' },
];

const TAB_CONFIG: Record<
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
};

// ─── HELPERS ──────────────────────────────
function getItemColor(id: string) {
	let hash = 0;
	for (let i = 0; i < id.length; i++)
		hash = id.charCodeAt(i) + ((hash << 5) - hash);
	return ITEM_COLORS[Math.abs(hash) % ITEM_COLORS.length];
}

function getInitials(s: string) {
	const parts = s.trim().split(/\s+/);
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ─── FORM MODAL ───────────────────────────
function ItemFormModal({
	mode,
	item,
	tab,
	onClose,
	onSave,
	loading,
}: {
	mode: 'add' | 'edit';
	item?: CatalogItem;
	tab: CatalogTab;
	onClose: () => void;
	onSave: (d: CatalogFormData) => void;
	loading: boolean;
}) {
	const cfg = TAB_CONFIG[tab];
	const [form, setForm] = useState<CatalogFormData>(
		item
			? { name: item.name, description: item.description ?? '' }
			: EMPTY_FORM,
	);
	const [errors, setErrors] = useState<Partial<CatalogFormData>>({});

	const set =
		(k: keyof CatalogFormData) =>
		(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
			setForm((f) => ({ ...f, [k]: e.target.value }));
			setErrors((er) => ({ ...er, [k]: '' }));
		};

	const validate = () => {
		const err: Partial<CatalogFormData> = {};
		if (!form.name.trim())
			err.name = `Vui lòng nhập tên ${cfg.label.toLowerCase()}`;
		setErrors(err);
		return Object.keys(err).length === 0;
	};

	return (
		<div
			className={styles.modalBackdrop}
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<div className={styles.modal}>
				<div className={styles.modalHeader}>
					<div className={styles.modalHeaderIcon}>
						{tab === 'categories' ? <Ic.Tag /> : <Ic.Layers />}
					</div>
					<div>
						<div className={styles.modalTitle}>
							{mode === 'add'
								? `Thêm ${cfg.label.toLowerCase()}`
								: `Chỉnh sửa ${cfg.label.toLowerCase()}`}
						</div>
						<div className={styles.modalSub}>
							{mode === 'add'
								? `Thêm ${cfg.label.toLowerCase()} mới vào hệ thống`
								: `Cập nhật — ${item?.name}`}
						</div>
					</div>
					<button
						className={styles.modalClose}
						onClick={onClose}
					>
						<Ic.X />
					</button>
				</div>

				<div className={styles.modalBody}>
					<div className={styles.formGroup}>
						<label className={styles.formLabel}>
							Tên {cfg.label.toLowerCase()}{' '}
							<span className={styles.required}>*</span>
						</label>
						<input
							className={`${styles.formInput} ${errors.name ? styles.inputError : ''}`}
							value={form.name}
							onChange={set('name')}
							placeholder={cfg.placeholder}
						/>
						{errors.name && (
							<div className={styles.fieldError}>{errors.name}</div>
						)}
					</div>
					<div className={styles.formGroup}>
						<label className={styles.formLabel}>Mô tả</label>
						<textarea
							className={styles.formTextarea}
							value={form.description}
							onChange={set('description')}
							rows={3}
							placeholder='Mô tả ngắn...'
						/>
					</div>
				</div>

				<div className={styles.modalFooter}>
					<button
						className={styles.btnCancel}
						onClick={onClose}
						disabled={loading}
					>
						Huỷ
					</button>
					<button
						className={styles.btnConfirm}
						onClick={() => validate() && onSave(form)}
						disabled={loading}
					>
						{loading ? <span className={styles.spinner} /> : <Ic.Check />}
						{mode === 'add'
							? `Thêm ${cfg.label.toLowerCase()}`
							: 'Lưu thay đổi'}
					</button>
				</div>
			</div>
		</div>
	);
}

// ─── DELETE MODAL ─────────────────────────
function DeleteModal({
	item,
	tab,
	onClose,
	onConfirm,
	loading,
}: {
	item: CatalogItem;
	tab: CatalogTab;
	onClose: () => void;
	onConfirm: () => void;
	loading: boolean;
}) {
	const cfg = TAB_CONFIG[tab];
	return (
		<div
			className={styles.modalBackdrop}
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<div className={`${styles.modal} ${styles.modalSm}`}>
				<div className={styles.modalHeader}>
					<div className={styles.modalHeaderIconDanger}>
						<Ic.Trash />
					</div>
					<div>
						<div className={styles.modalTitle}>
							Xoá {cfg.label.toLowerCase()}
						</div>
						<div className={styles.modalSub}>{item.name}</div>
					</div>
					<button
						className={styles.modalClose}
						onClick={onClose}
					>
						<Ic.X />
					</button>
				</div>
				<div className={styles.modalBody}>
					<p className={styles.deleteDesc}>
						Bạn có chắc muốn xoá <strong>{item.name}</strong> khỏi hệ thống?
						Thao tác này không thể hoàn tác.
					</p>
				</div>
				<div className={styles.modalFooter}>
					<button
						className={styles.btnCancel}
						onClick={onClose}
						disabled={loading}
					>
						Huỷ
					</button>
					<button
						className={styles.btnDanger}
						onClick={onConfirm}
						disabled={loading}
					>
						{loading ? (
							<span className={`${styles.spinner} ${styles.spinnerDark}`} />
						) : (
							<Ic.Trash />
						)}
						Xác nhận xoá
					</button>
				</div>
			</div>
		</div>
	);
}

// ─── MAIN ─────────────────────────────────
export default function Catalog() {
	const location = useLocation();
	const navigate = useNavigate();
	const tab: CatalogTab = location.pathname.includes('levels')
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

	const headerActions = (
		<button
			className={styles.btnAddHeader}
			onClick={() => setModal('add')}
		>
			<Ic.Plus /> Thêm {cfg.label.toLowerCase()}
		</button>
	);

	return (
		<AdminLayout
			pageTitle='Quản lý Danh mục'
			pageSubtitle={cfg.subtitle}
			headerActions={headerActions}
		>
			{/* ── TABS ── */}
			<div className={styles.tabs}>
				<button
					className={`${styles.tabBtn} ${tab === 'categories' ? styles.tabBtnActive : ''}`}
					onClick={() => handleTabChange('categories')}
				>
					<Ic.Tag />
					Phân loại
				</button>
				<button
					className={`${styles.tabBtn} ${tab === 'levels' ? styles.tabBtnActive : ''}`}
					onClick={() => handleTabChange('levels')}
				>
					<Ic.Layers />
					Cấp độ
				</button>
			</div>

			{/* ── TOOLBAR ── */}
			<div className={styles.toolbar}>
				<div className={styles.searchBox}>
					<Ic.Search />
					<input
						className={styles.searchInput}
						placeholder='Tìm theo tên, mô tả...'
						value={search}
						onChange={(e) => handleSearch(e.target.value)}
					/>
					{search && (
						<button
							className={styles.searchClear}
							onClick={() => handleSearch('')}
						>
							<Ic.X />
						</button>
					)}
				</div>
				<span className={styles.resultCount}>
					{filtered.length} {cfg.label.toLowerCase()}
				</span>
				<div className={styles.pageSizeWrap}>
					<label className={styles.pageSizeLabel}>Hiển thị</label>
					<select
						className={styles.pageSizeSelect}
						value={pageSize}
						onChange={(e) => handlePageSize(Number(e.target.value))}
					>
						<option value={5}>5</option>
						<option value={10}>10</option>
						<option value={25}>25</option>
						<option value={50}>50</option>
						<option value={0}>Tất cả</option>
					</select>
					<span className={styles.pageSizeLabel}>dòng</span>
				</div>
			</div>

			{/* ── TABLE ── */}
			<div className={styles.tableWrap}>
				<table className={styles.table}>
					<thead>
						<tr>
							<th className={styles.th}>#</th>
							<th className={styles.th}>{cfg.label}</th>
							<th className={styles.th}>Mô tả</th>
							<th className={`${styles.th} ${styles.thRight}`}>Thao tác</th>
						</tr>
					</thead>
					<tbody>
						{isLoadingData ? (
							<tr>
								<td colSpan={4}>
									<div className={styles.emptyState}>
										<div className={styles.emptyDesc}>Đang tải dữ liệu...</div>
									</div>
								</td>
							</tr>
						) : filtered.length === 0 ? (
							<tr>
								<td colSpan={4}>
									<div className={styles.emptyState}>
										<div className={styles.emptyTitle}>
											Không tìm thấy {cfg.label.toLowerCase()}
										</div>
										<div className={styles.emptyDesc}>
											{search
												? 'Thử thay đổi từ khoá tìm kiếm'
												: `Chưa có ${cfg.label.toLowerCase()} nào`}
										</div>
									</div>
								</td>
							</tr>
						) : (
							paged.map((item, i) => {
								const c = getItemColor(item.id);
								const rowNum =
									(safePage - 1) * (pageSize || filtered.length) + i + 1;
								return (
									<tr
										key={item.id}
										className={styles.tr}
									>
										<td className={`${styles.td} ${styles.tdIdx}`}>{rowNum}</td>
										<td className={styles.td}>
											<div className={styles.itemCell}>
												<div
													className={styles.itemAvatar}
													style={{ background: c.bg, color: c.color }}
												>
													{getInitials(item.name)}
												</div>
												<span className={styles.itemName}>{item.name}</span>
											</div>
										</td>
										<td className={styles.td}>
											<span className={styles.descText}>
												{item.description ?? '—'}
											</span>
										</td>
										<td className={`${styles.td} ${styles.tdActions}`}>
											<button
												className={`${styles.actionBtn} ${styles.actionEdit}`}
												title='Chỉnh sửa'
												onClick={() => {
													setEditingItem(item);
													setModal('edit');
												}}
											>
												<Ic.Edit />
											</button>
											<button
												className={`${styles.actionBtn} ${styles.actionDelete}`}
												title='Xoá'
												onClick={() => {
													setDeletingItem(item);
													setModal('delete');
												}}
											>
												<Ic.Trash />
											</button>
										</td>
									</tr>
								);
							})
						)}
					</tbody>
				</table>
			</div>

			{/* ── PAGINATION ── */}
			{filtered.length > 0 && totalPages > 1 && (
				<div className={styles.pagination}>
					<span className={styles.paginationInfo}>
						{pageSize === 0
							? `Hiển thị tất cả ${filtered.length} ${cfg.label.toLowerCase()}`
							: `${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, filtered.length)} / ${filtered.length}`}
					</span>
					<div className={styles.paginationControls}>
						<button
							className={styles.pageBtn}
							onClick={() => setPage((p) => Math.max(1, p - 1))}
							disabled={safePage === 1}
						>
							<Ic.ChevronLeft />
						</button>
						{Array.from({ length: totalPages }, (_, idx) => idx + 1)
							.filter(
								(p) =>
									p === 1 || p === totalPages || Math.abs(p - safePage) <= 1,
							)
							.reduce<(number | 'ellipsis')[]>((acc, p, idx, arr) => {
								if (idx > 0 && p - (arr[idx - 1] as number) > 1)
									acc.push('ellipsis');
								acc.push(p);
								return acc;
							}, [])
							.map((p, idx) =>
								p === 'ellipsis' ? (
									<span
										key={`e${idx}`}
										className={styles.pageEllipsis}
									>
										…
									</span>
								) : (
									<button
										key={p}
										className={`${styles.pageBtn} ${p === safePage ? styles.pageBtnActive : ''}`}
										onClick={() => setPage(p as number)}
									>
										{p}
									</button>
								),
							)}
						<button
							className={styles.pageBtn}
							onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
							disabled={safePage === totalPages}
						>
							<Ic.ChevronRight />
						</button>
					</div>
				</div>
			)}

			{/* ── MODALS ── */}
			{modal === 'add' && (
				<ItemFormModal
					mode='add'
					tab={tab}
					onClose={() => setModal(null)}
					onSave={handleAdd}
					loading={loading}
				/>
			)}
			{modal === 'edit' && editingItem && (
				<ItemFormModal
					mode='edit'
					item={editingItem}
					tab={tab}
					onClose={() => {
						setModal(null);
						setEditingItem(null);
					}}
					onSave={handleEdit}
					loading={loading}
				/>
			)}
			{modal === 'delete' && deletingItem && (
				<DeleteModal
					item={deletingItem}
					tab={tab}
					onClose={() => {
						setModal(null);
						setDeletingItem(null);
					}}
					onConfirm={handleDelete}
					loading={loading}
				/>
			)}

			{/* ── TOAST ── */}
			{toast && (
				<div
					className={`${styles.toast} ${
						styles[
							`toast${
								toast.type.charAt(0).toUpperCase() + toast.type.slice(1)
							}` as keyof typeof styles
						]
					}`}
				>
					{toast.type === 'success' ? <Ic.Check /> : <Ic.X />}
					{toast.msg}
				</div>
			)}
		</AdminLayout>
	);
}
