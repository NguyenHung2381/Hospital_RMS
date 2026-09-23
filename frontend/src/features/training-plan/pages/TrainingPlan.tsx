import { CheckSvg, EditSvg, PlusSvg, SearchSvg, TrashSvg, XSvg } from '@/assets/icons';
import { useState } from 'react';
import AdminLayout from '../../../layouts/AdminLayout';
import { SkeletonTable } from '../../../shared/components/Loading';
import { Pagination } from '../../../shared/components/Table/Pagination';
import sel from '../../../shared/components/Table/RowSelect.module.css';
import { BulkButton, BulkDeleteModal, SelectCheckbox } from '../../../shared/components/Table/RowSelect';
import { useRowSelection } from '../../../shared/hooks/useRowSelection';
import { TrainingPlanDeleteModal } from '../components/TrainingPlanDeleteModal';
import { TrainingPlanFormModal } from '../components/TrainingPlanFormModal';
import { useTrainingPlan } from '../hooks/useTrainingPlan';
import type { TrainingPlanStatus } from '../types/trainingPlan.type';
import styles from './TrainingPlan.module.css';

const PAGE_SIZE_OPTIONS = [5, 10, 25, 50, 0] as const;

const STATUS_CLASS: Record<TrainingPlanStatus, string> = {
	draft: 'statusDraft',
	active: 'statusActive',
	completed: 'statusCompleted',
	cancelled: 'statusCancelled',
};

export default function TrainingPlan() {
	const d = useTrainingPlan();
	const rowSel = useRowSelection(d.paged.map((x) => x.id));
	const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

	const headerActions = (
		<button
			className={styles.btnAddHeader}
			onClick={() => d.setModal('add')}
		>
			<PlusSvg /> Thêm kế hoạch
		</button>
	);

	return (
		<AdminLayout
			pageTitle='Kế hoạch đào tạo'
			pageSubtitle='Lập kế hoạch đào tạo theo năm và các hạng mục cần tổ chức'
			breadcrumbs={[{ label: 'Đào tạo' }]}
			headerActions={headerActions}
		>
			<div className={styles.tableCard}>
				<div className={styles.tableHeader}>
					<div className={styles.tableHeaderLeft}>
						<span className={styles.tableTitle}>Danh sách kế hoạch</span>
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
							<span className={styles.tableCount}>{d.filtered.length} kế hoạch</span>
						)}
					</div>
					<div className={styles.tableControls}>
						<div className={styles.searchBox}>
							<SearchSvg className={styles.searchIcon} />
							<input
								className={styles.searchInput}
								placeholder='Tìm theo tên, năm, khoa...'
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
								<th className={styles.th}>Kế hoạch</th>
								<th className={styles.th}>Năm</th>
								<th className={styles.th}>Khoa / Phòng ban</th>
								<th className={styles.th}>Hạng mục</th>
								<th className={styles.th}>Trạng thái</th>
								<th className={`${styles.th} ${styles.thRight}`}>Thao tác</th>
							</tr>
						</thead>
						<tbody>
							{d.isLoadingData ? (
								<SkeletonTable
									rows={d.pageSize || 8}
									cols={8}
								/>
							) : d.filtered.length === 0 ? (
								<tr>
									<td colSpan={8}>
										<div className={styles.emptyState}>
											<div className={styles.emptyTitle}>Không tìm thấy kế hoạch</div>
											<div className={styles.emptyDesc}>
												{d.search ? 'Thử thay đổi từ khoá tìm kiếm' : 'Chưa có kế hoạch nào'}
											</div>
										</div>
									</td>
								</tr>
							) : (
								d.paged.map((plan, i) => {
									const rowNum = (d.safePage - 1) * (d.pageSize || d.filtered.length) + i + 1;
									return (
										<tr
											key={plan.id}
											className={`${styles.tr} ${rowSel.isSelected(plan.id) ? sel.rowSelected : ''}`}
										>
											<td className={sel.checkCol}>
												<SelectCheckbox
													title='Chọn dòng'
													checked={rowSel.isSelected(plan.id)}
													onChange={() => rowSel.toggleSelect(plan.id)}
												/>
											</td>
											<td className={`${styles.td} ${styles.tdIdx}`}>{rowNum}</td>
											<td className={styles.td}>
												<div className={styles.itemName}>{plan.title}</div>
												{plan.description && (
													<div className={styles.descText}>{plan.description}</div>
												)}
											</td>
											<td className={styles.td}>{plan.year}</td>
											<td className={styles.td}>{plan.department_name ?? 'Toàn viện'}</td>
											<td className={styles.td}>{plan.items?.length ?? 0}</td>
											<td className={styles.td}>
												<span className={`${styles.statusBadge} ${styles[STATUS_CLASS[plan.status]]}`}>
													{d.statusLabel[plan.status]}
												</span>
											</td>
											<td className={`${styles.td} ${styles.tdActions}`}>
												<div className={styles.actionBtns}>
													<div
														className={styles.actionBtn}
														title='Chỉnh sửa'
														onClick={() => {
															d.setEditingItem(plan);
															d.setModal('edit');
														}}
													>
														<EditSvg />
													</div>
													<div
														className={`${styles.actionBtn} ${styles.danger}`}
														title='Xoá'
														onClick={() => {
															d.setDeletingItem(plan);
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
						itemLabel='kế hoạch'
						hideSizeSelect
					/>
				)}
			</div>

			<BulkDeleteModal
				open={confirmBulkDelete}
				count={rowSel.selectedCount}
				itemLabel='kế hoạch'
				loading={d.loading}
				onClose={() => setConfirmBulkDelete(false)}
				onConfirm={async () => {
					await d.handleBulkDelete([...rowSel.selectedIds]);
					rowSel.clearSelection();
					setConfirmBulkDelete(false);
				}}
			/>

			{d.modal === 'add' && (
				<TrainingPlanFormModal
					mode='add'
					departments={d.departments}
					onClose={() => d.setModal(null)}
					onSave={d.handleAdd}
					loading={d.loading}
				/>
			)}
			{d.modal === 'edit' && d.editingItem && (
				<TrainingPlanFormModal
					mode='edit'
					item={d.editingItem}
					departments={d.departments}
					onClose={() => {
						d.setModal(null);
						d.setEditingItem(null);
					}}
					onSave={d.handleEdit}
					loading={d.loading}
				/>
			)}
			{d.modal === 'delete' && d.deletingItem && (
				<TrainingPlanDeleteModal
					item={d.deletingItem}
					onClose={() => {
						d.setModal(null);
						d.setDeletingItem(null);
					}}
					onConfirm={d.handleDelete}
					loading={d.loading}
				/>
			)}

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
