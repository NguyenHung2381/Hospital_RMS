import { PlusSvg } from '@/assets/icons';
import { PageSizeSelect, RowActions, SearchInput, SelectionCount } from '@/shared/components/Table/TableToolbar';
import styles from '@/shared/components/Table/CrudPage.module.css';
import { avatarColor, getInitials } from '@/shared/utils';
import AdminLayout from '../../../layouts/AdminLayout';
import { SkeletonTable } from '../../../shared/components/Loading';
import { Pagination } from '../../../shared/components/Table/Pagination';
import sel from '../../../shared/components/Table/RowSelect.module.css';
import { SelectCheckbox } from '../../../shared/components/Table/RowSelect';
import { useRowSelection } from '../../../shared/hooks/useRowSelection';
import { CatalogDeleteModal } from '../components/CatalogDeleteModal';
import { CatalogFormModal } from '../components/CatalogFormModal';
import { CATALOG_GROUPS, TAB_CONFIG, useCatalog } from '../hooks/useCatalog';
import type { CatalogGroup } from '../types/catalog.type';

/** Trang danh mục đơn giản (tên + mô tả) — dùng cho cả danh mục NCKH và Đào tạo. */
export default function Catalog({ group }: { group: CatalogGroup }) {
	const d = useCatalog(group);
	const rowSel = useRowSelection(d.paged.map((x) => x.id));
	const groupCfg = CATALOG_GROUPS[group];
	const label = d.cfg.label.toLowerCase();

	const headerActions = (
		<button
			className={styles.btnAddHeader}
			onClick={() => d.setModal('add')}
		>
			<PlusSvg /> Thêm {label}
		</button>
	);

	return (
		<AdminLayout
			pageTitle={groupCfg.title}
			pageSubtitle={d.cfg.subtitle}
			breadcrumbs={groupCfg.breadcrumb ? [{ label: groupCfg.breadcrumb }] : undefined}
			headerActions={headerActions}
		>
			<div className={styles.tabs}>
				{d.tabs.map((t) => {
					const { icon: Icon, label: tabLabel } = TAB_CONFIG[t];
					return (
						<button
							key={t}
							className={`${styles.tabBtn} ${d.tab === t ? styles.tabBtnActive : ''}`}
							onClick={() => d.handleTabChange(t)}
						>
							<Icon /> {tabLabel}
						</button>
					);
				})}
			</div>

			<div className={styles.tableCard}>
				<div className={styles.tableHeader}>
					<div className={styles.tableHeaderLeft}>
						<span className={styles.tableTitle}>Danh sách {label}</span>
						<SelectionCount
							rowSel={rowSel}
							itemLabel={label}
							loading={d.loading}
							onBulkDelete={d.handleBulkDelete}
						>
							{d.filtered.length} {label}
						</SelectionCount>
					</div>
					<div className={styles.tableControls}>
						<SearchInput
							value={d.search}
							onChange={d.handleSearch}
							placeholder='Tìm theo tên, mô tả...'
						/>
						<PageSizeSelect
							value={d.pageSize}
							onChange={d.handlePageSize}
						/>
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
											<div className={styles.emptyTitle}>Không tìm thấy {label}</div>
											<div className={styles.emptyDesc}>
												{d.search ? 'Thử thay đổi từ khoá tìm kiếm' : `Chưa có ${label} nào`}
											</div>
										</div>
									</td>
								</tr>
							) : (
								d.paged.map((item, i) => {
									const c = avatarColor(item.id);
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
												<RowActions
													onEdit={() => {
														d.setEditingItem(item);
														d.setModal('edit');
													}}
													onDelete={() => {
														d.setDeletingItem(item);
														d.setModal('delete');
													}}
												/>
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
						onPageChange={d.setPage}
						itemLabel={label}
						hideSizeSelect
					/>
				)}
			</div>

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
		</AdminLayout>
	);
}
