import {
	CheckSvg,
	BookOpenSvg,
	EditSvg,
	LayersSvg,
	PlusSvg,
	SearchSvg,
	TagSvg,
	TrashSvg,
	UserCheckSvg,
	XSvg,
} from '@/assets/icons';
import { useState } from 'react';
import AdminLayout from '../../../layouts/AdminLayout';
import { SkeletonTable } from '../../../shared/components/Loading';
import { Pagination } from '../../../shared/components/Table/Pagination';
import sel from '../../../shared/components/Table/RowSelect.module.css';
import { BulkButton, BulkDeleteModal, SelectCheckbox } from '../../../shared/components/Table/RowSelect';
import { useRowSelection } from '../../../shared/hooks/useRowSelection';
import { TrainingCatalogDeleteModal } from '../components/TrainingCatalogDeleteModal';
import { TrainingCatalogFormModal } from '../components/TrainingCatalogFormModal';
import { TAB_CONFIG, useTrainingCatalog } from '../hooks/useTrainingCatalog';
import type { TrainingCatalogTab } from '../types/trainingCatalog.type';
import styles from './TrainingCatalog.module.css';

const PAGE_SIZE_OPTIONS = [5, 10, 25, 50, 0] as const;

const ITEM_COLORS = [
	{ bg: '#e1f5ea', color: '#085028' },
	{ bg: '#e6f1fb', color: '#0c447c' },
	{ bg: '#eeedfe', color: '#3c3489' },
	{ bg: '#faeeda', color: '#633806' },
	{ bg: '#fce8fb', color: '#6b1a69' },
];

function getItemColor(id: string) {
	let hash = 0;
	for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
	return ITEM_COLORS[Math.abs(hash) % ITEM_COLORS.length];
}

function getInitials(s: string) {
	const parts = s.trim().split(/\s+/);
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const TAB_ICON: Record<TrainingCatalogTab, React.ReactNode> = {
	'trainee-types': <UserCheckSvg />,
	'training-forms': <LayersSvg />,
	'training-types': <TagSvg />,
	subjects: <BookOpenSvg />,
};

export default function TrainingCatalog() {
	const d = useTrainingCatalog();
	const rowSel = useRowSelection(d.paged.map((x) => x.id));
	const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

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
			pageTitle='Danh mục Đào tạo'
			pageSubtitle={d.cfg.subtitle}
			breadcrumbs={[{ label: 'Đào tạo' }]}
			headerActions={headerActions}
		>
			{/* ── TABS ── */}
			<div className={styles.tabs}>
				{d.tabOrder.map((t) => (
					<button
						key={t}
						className={`${styles.tabBtn} ${d.tab === t ? styles.tabBtnActive : ''}`}
						onClick={() => d.handleTabChange(t)}
					>
						{TAB_ICON[t]} {TAB_CONFIG[t].label}
					</button>
				))}
			</div>

			{/* ── TABLE CARD ── */}
			<div className={styles.tableCard}>
				<div className={styles.tableHeader}>
					<div className={styles.tableHeaderLeft}>
						<span className={styles.tableTitle}>Danh sách {d.cfg.label.toLowerCase()}</span>
						{rowSel.selectedCount > 0 ? (
							<span className={styles.tableCount}>
								Đã chọn {rowSel.selectedCount}
								<BulkButton
									danger
									onClick={() => setConfirmBulkDelete(true)}
								>
									<TrashSvg /> Xoá đã chọn
								</BulkButton>
								<button
									type='button'
									className={styles.clearSelectionBtn}
									onClick={rowSel.clearSelection}
								>
									Bỏ chọn
								</button>
							</span>
						) : (
							<span className={styles.tableCount}>
								{d.filtered.length} {d.cfg.label.toLowerCase()}
							</span>
						)}
					</div>
					<div className={styles.tableControls}>
						<div className={styles.searchBox}>
							<SearchSvg className={styles.searchIcon} />
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
				</div>

				<div className={styles.tableWrap}>
				<table className={styles.table}>
					<thead>
						<tr>
							<th className={sel.checkCol}>
								<SelectCheckbox
									title='Chọn tất cả'
									checked={rowSel.allPageSelected}
									indeterminate={rowSel.somePageSelected}
									onChange={rowSel.toggleSelectAll}
								/>
							</th>
							<th className={styles.th}>#</th>
							<th className={styles.th}>{d.cfg.label}</th>
							<th className={styles.th}>Mô tả</th>
							<th className={`${styles.th} ${styles.thRight}`}>Thao tác</th>
						</tr>
					</thead>
					<tbody>
						{d.isLoadingData ? (
							<SkeletonTable
								rows={d.pageSize || 8}
								cols={5}
							/>
						) : d.filtered.length === 0 ? (
							<tr>
								<td colSpan={5}>
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
								const rowNum = (d.safePage - 1) * (d.pageSize || d.filtered.length) + i + 1;
								return (
									<tr
										key={item.id}
										className={`${styles.tr} ${rowSel.isSelected(item.id) ? sel.rowSelected : ''}`}
									>
										<td className={sel.checkCol}>
											<SelectCheckbox
												title='Chọn dòng'
												checked={rowSel.isSelected(item.id)}
												onChange={() => rowSel.toggleSelect(item.id)}
											/>
										</td>
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
											<span className={styles.descText}>{item.description ?? '—'}</span>
										</td>
										<td className={`${styles.td} ${styles.tdActions}`}>
											<div className={styles.actionBtns}>
												<div
													className={styles.actionBtn}
													title='Chỉnh sửa'
													onClick={() => {
														d.setEditingItem(item);
														d.setModal('edit');
													}}
												>
													<EditSvg />
												</div>
												<div
													className={`${styles.actionBtn} ${styles.danger}`}
													title='Xoá'
													onClick={() => {
														d.setDeletingItem(item);
														d.setModal('delete');
													}}
												>
													<TrashSvg />
												</div>
											</div>
										</td>
									</tr>
								);
							})
						)}
					</tbody>
				</table>
				</div>

				{d.filtered.length > 0 && d.totalPages > 1 && (
					<Pagination
						page={d.safePage}
						totalPages={d.totalPages}
						total={d.filtered.length}
						rowsPerPage={d.pageSize}
						pageSizeOptions={PAGE_SIZE_OPTIONS}
						onPageChange={d.setPage}
						onRowsPerPageChange={d.handlePageSize}
						itemLabel={d.cfg.label.toLowerCase()}
						hideSizeSelect
					/>
				)}
			</div>

			<BulkDeleteModal
				open={confirmBulkDelete}
				count={rowSel.selectedCount}
				itemLabel={d.cfg.label.toLowerCase()}
				loading={d.loading}
				onClose={() => setConfirmBulkDelete(false)}
				onConfirm={async () => {
					await d.handleBulkDelete([...rowSel.selectedIds]);
					rowSel.clearSelection();
					setConfirmBulkDelete(false);
				}}
			/>

			{/* ── MODALS ── */}
			{d.modal === 'add' && (
				<TrainingCatalogFormModal
					mode='add'
					tab={d.tab}
					onClose={() => d.setModal(null)}
					onSave={d.handleAdd}
					loading={d.loading}
				/>
			)}
			{d.modal === 'edit' && d.editingItem && (
				<TrainingCatalogFormModal
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
				<TrainingCatalogDeleteModal
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
							`toast${d.toast.type.charAt(0).toUpperCase() + d.toast.type.slice(1)}` as keyof typeof styles
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
