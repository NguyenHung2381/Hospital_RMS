import {
	CheckSvg,
	ChevLSvg,
	ChevRSvg,
	EditSvg,
	LayersSvg,
	PlusSvg,
	SearchSvg,
	TagSvg,
	TrashSvg,
	XSvg,
} from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { CatalogDeleteModal } from '../components/CatalogDeleteModal';
import { CatalogFormModal } from '../components/CatalogFormModal';
import { useCatalog } from '../hooks/useCatalog';
import styles from './Catalog.module.css';

const ITEM_COLORS = [
	{ bg: '#e1f5ee', color: '#085041' },
	{ bg: '#e6f1fb', color: '#0c447c' },
	{ bg: '#eeedfe', color: '#3c3489' },
	{ bg: '#faeeda', color: '#633806' },
	{ bg: '#fce8fb', color: '#6b1a69' },
	{ bg: '#f1efe8', color: '#444441' },
];

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

export default function Catalog() {
	const d = useCatalog();

	const headerActions = (
		<button
			className={styles.btnAddHeader}
			onClick={() => d.setModal('add')}
		>
			<PlusSvg /> Thêm {d.cfg.label.toLowerCase()}
		</button>
	);

	return (
		<AdminLayout
			pageTitle='Quản lý Danh mục'
			pageSubtitle={d.cfg.subtitle}
			headerActions={headerActions}
		>
			{/* ── TABS ── */}
			<div className={styles.tabs}>
				<button
					className={`${styles.tabBtn} ${d.tab === 'categories' ? styles.tabBtnActive : ''}`}
					onClick={() => d.handleTabChange('categories')}
				>
					<TagSvg /> Phân loại
				</button>
				<button
					className={`${styles.tabBtn} ${d.tab === 'levels' ? styles.tabBtnActive : ''}`}
					onClick={() => d.handleTabChange('levels')}
				>
					<LayersSvg /> Cấp độ
				</button>
			</div>

			{/* ── TOOLBAR ── */}
			<div className={styles.toolbar}>
				<div className={styles.searchBox}>
					<SearchSvg />
					<input
						className={styles.searchInput}
						placeholder='Tìm theo tên, mô tả...'
						value={d.search}
						onChange={(e) => d.handleSearch(e.target.value)}
					/>
					{d.search && (
						<button
							className={styles.searchClear}
							onClick={() => d.handleSearch('')}
						>
							<XSvg />
						</button>
					)}
				</div>
				<span className={styles.resultCount}>
					{d.filtered.length} {d.cfg.label.toLowerCase()}
				</span>
				<div className={styles.pageSizeWrap}>
					<label className={styles.pageSizeLabel}>Hiển thị</label>
					<select
						className={styles.pageSizeSelect}
						value={d.pageSize}
						onChange={(e) => d.handlePageSize(Number(e.target.value))}
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
							<th className={styles.th}>{d.cfg.label}</th>
							<th className={styles.th}>Mô tả</th>
							<th className={`${styles.th} ${styles.thRight}`}>Thao tác</th>
						</tr>
					</thead>
					<tbody>
						{d.isLoadingData ? (
							<tr>
								<td colSpan={4}>
									<div className={styles.emptyState}>
										<div className={styles.emptyDesc}>Đang tải dữ liệu...</div>
									</div>
								</td>
							</tr>
						) : d.filtered.length === 0 ? (
							<tr>
								<td colSpan={4}>
									<div className={styles.emptyState}>
										<div className={styles.emptyTitle}>
											Không tìm thấy {d.cfg.label.toLowerCase()}
										</div>
										<div className={styles.emptyDesc}>
											{d.search
												? 'Thử thay đổi từ khoá tìm kiếm'
												: `Chưa có ${d.cfg.label.toLowerCase()} nào`}
										</div>
									</div>
								</td>
							</tr>
						) : (
							d.paged.map((item, i) => {
								const c = getItemColor(item.id);
								const rowNum =
									(d.safePage - 1) * (d.pageSize || d.filtered.length) + i + 1;
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
													d.setEditingItem(item);
													d.setModal('edit');
												}}
											>
												<EditSvg />
											</button>
											<button
												className={`${styles.actionBtn} ${styles.actionDelete}`}
												title='Xoá'
												onClick={() => {
													d.setDeletingItem(item);
													d.setModal('delete');
												}}
											>
												<TrashSvg />
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
			{d.filtered.length > 0 && d.totalPages > 1 && (
				<div className={styles.pagination}>
					<span className={styles.paginationInfo}>
						{d.pageSize === 0
							? `Hiển thị tất cả ${d.filtered.length} ${d.cfg.label.toLowerCase()}`
							: `${(d.safePage - 1) * d.pageSize + 1}–${Math.min(d.safePage * d.pageSize, d.filtered.length)} / ${d.filtered.length}`}
					</span>
					<div className={styles.paginationControls}>
						<button
							className={styles.pageBtn}
							onClick={() => d.setPage((p) => Math.max(1, p - 1))}
							disabled={d.safePage === 1}
						>
							<ChevLSvg />
						</button>
						{Array.from({ length: d.totalPages }, (_, idx) => idx + 1)
							.filter(
								(p) =>
									p === 1 ||
									p === d.totalPages ||
									Math.abs(p - d.safePage) <= 1,
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
										className={`${styles.pageBtn} ${p === d.safePage ? styles.pageBtnActive : ''}`}
										onClick={() => d.setPage(p as number)}
									>
										{p}
									</button>
								),
							)}
						<button
							className={styles.pageBtn}
							onClick={() => d.setPage((p) => Math.min(d.totalPages, p + 1))}
							disabled={d.safePage === d.totalPages}
						>
							<ChevRSvg />
						</button>
					</div>
				</div>
			)}

			{/* ── MODALS ── */}
			{d.modal === 'add' && (
				<CatalogFormModal
					mode='add'
					tab={d.tab}
					onClose={() => d.setModal(null)}
					onSave={d.handleAdd}
					loading={d.loading}
				/>
			)}
			{d.modal === 'edit' && d.editingItem && (
				<CatalogFormModal
					mode='edit'
					item={d.editingItem}
					tab={d.tab}
					onClose={() => {
						d.setModal(null);
						d.setEditingItem(null);
					}}
					onSave={d.handleEdit}
					loading={d.loading}
				/>
			)}
			{d.modal === 'delete' && d.deletingItem && (
				<CatalogDeleteModal
					item={d.deletingItem}
					tab={d.tab}
					onClose={() => {
						d.setModal(null);
						d.setDeletingItem(null);
					}}
					onConfirm={d.handleDelete}
					loading={d.loading}
				/>
			)}

			{/* ── TOAST ── */}
			{d.toast && (
				<div
					className={`${styles.toast} ${
						styles[
							`toast${
								d.toast.type.charAt(0).toUpperCase() + d.toast.type.slice(1)
							}` as keyof typeof styles
						]
					}`}
				>
					{d.toast.type === 'success' ? <CheckSvg /> : <XSvg />}
					{d.toast.msg}
				</div>
			)}
		</AdminLayout>
	);
}
