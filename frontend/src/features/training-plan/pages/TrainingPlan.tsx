import { SearchInput, PageSizeSelect, SelectionCount, RowActions } from '@/shared/components/Table/TableToolbar';
import { PlusSvg } from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { SkeletonTable } from '../../../shared/components/Loading';
import { Pagination } from '../../../shared/components/Table/Pagination';
import sel from '../../../shared/components/Table/RowSelect.module.css';
import { SelectCheckbox } from '../../../shared/components/Table/RowSelect';
import { useRowSelection } from '../../../shared/hooks/useRowSelection';
import { TrainingPlanDeleteModal } from '../components/TrainingPlanDeleteModal';
import { TrainingPlanFormModal } from '../components/TrainingPlanFormModal';
import { useTrainingPlan } from '../hooks/useTrainingPlan';
import type { TrainingPlanStatus } from '../types/trainingPlan.type';
import styles from './TrainingPlan.module.css';

const STATUS_CLASS: Record<TrainingPlanStatus, string> = {
	draft: 'statusDraft',
	active: 'statusActive',
	completed: 'statusCompleted',
	cancelled: 'statusCancelled',
};

export default function TrainingPlan() {
	const d = useTrainingPlan();
	const rowSel = useRowSelection(d.paged.map((x) => x.id));

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
						<SelectionCount
							rowSel={rowSel}
							itemLabel='kế hoạch'
							loading={d.loading}
							onBulkDelete={d.handleBulkDelete}
						>
							{d.filtered.length} kế hoạch
						</SelectionCount>
					</div>
					<div className={styles.tableControls}>
						<SearchInput
							value={d.search}
							onChange={d.handleSearch}
							placeholder='Tìm theo tên, năm, khoa...'
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
												<RowActions
													onEdit={() => {
														d.setEditingItem(plan);
														d.setModal('edit');
													}}
													onDelete={() => {
														d.setDeletingItem(plan);
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
						itemLabel='kế hoạch'
						hideSizeSelect
					/>
				)}
			</div>


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

		</AdminLayout>
	);
}
