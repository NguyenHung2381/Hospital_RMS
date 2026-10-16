import { useState } from 'react';
import { SearchInput, SelectionCount, RowAction, RowActions } from '@/shared/components/Table/TableToolbar';
import { EyeSvg, PlusSvg } from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { ExcelActions, type ExcelColumn } from '@/shared/components/Excel';
import { matchLabel, nameMap } from '@/shared/components/Excel/excelHelpers';
import { trainingPlanApi } from '../api/trainingPlanApi';
import type { TrainingPlan as Plan } from '../types/trainingPlan.type';
import { SkeletonTable } from '../../../shared/components/Loading';
import { Pagination } from '../../../shared/components/Table/Pagination';
import sel from '../../../shared/components/Table/RowSelect.module.css';
import { DeleteAllButton, SelectCheckbox } from '../../../shared/components/Table/RowSelect';
import { useRowSelection } from '../../../shared/hooks/useRowSelection';
import { PlanDetailModal } from '../components/PlanDetailModal';
import { TrainingPlanDeleteModal } from '../components/TrainingPlanDeleteModal';
import { TrainingPlanFormModal } from '../components/TrainingPlanFormModal';
import { useTrainingPlan } from '../hooks/useTrainingPlan';
import type { TrainingPlanStatus } from '../types/trainingPlan.type';
import styles from './TrainingPlan.module.css';
import tbl from '@/shared/components/Table/Table.module.css';

const STATUS_CLASS: Record<TrainingPlanStatus, string> = {
	draft: 'statusDraft',
	active: 'statusActive',
	completed: 'statusCompleted',
	cancelled: 'statusCancelled',
};

export default function TrainingPlan() {
	const d = useTrainingPlan();
	const rowSel = useRowSelection(d.paged.map((x) => x.id));
	const [detailId, setDetailId] = useState<string | null>(null);

	const deptNames = nameMap(d.departments, (x) => x.name);
	const excelCols: ExcelColumn<Plan>[] = [
		{ header: 'Năm', key: 'year', required: true, value: (x) => x.year },
		{ header: 'Tên kế hoạch', key: 'title', required: true, value: (x) => x.title },
		{ header: 'Khoa phòng', key: 'department', value: (x) => x.department_name },
		{ header: 'Trạng thái', key: 'status', value: (x) => d.statusLabel[x.status] },
		{ header: 'Mô tả', key: 'description', value: (x) => x.description },
		{ header: 'Số hạng mục', value: (x) => x.item_count },
		{ header: 'Hạng mục đã mở khóa', value: (x) => x.done_item_count },
		// Chỉ để nhập: tên các hạng mục, cách nhau bằng dấu ;
		{ header: 'Hạng mục', key: 'items' },
	];

	const headerActions = (
		<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
			<ExcelActions
				fileName='ke-hoach-dao-tao'
				itemLabel='kế hoạch'
				columns={excelCols}
				getRows={() => d.filtered}
				importHint='Cột Hạng mục ghi tên các hạng mục, cách nhau bằng dấu chấm phẩy (;).'
				importRow={(r) => {
					const year = Number(r.year);
					if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error(`Năm "${r.year}" không hợp lệ`);
					return trainingPlanApi.create({
						year,
						title: r.title,
						department_id: matchLabel(deptNames, r.department, 'Khoa phòng') ?? null,
						status: matchLabel(d.statusLabel, r.status, 'Trạng thái') ?? 'draft',
						description: r.description || null,
						items: r.items
							.split(/[;\n]/)
							.map((t) => t.trim())
							.filter(Boolean)
							.map((title) => ({ title })),
					});
				}}
				onImported={d.refreshData}
			/>
			<button
				className={styles.btnAddHeader}
				onClick={() => d.setModal('add')}
			>
				<PlusSvg /> Thêm kế hoạch
			</button>
		</div>
	);

	return (
		<AdminLayout
			pageTitle='Kế hoạch đào tạo'
			pageSubtitle='Lập kế hoạch theo năm, mở khóa học cho từng hạng mục và theo dõi tiến độ thực hiện'
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
						<DeleteAllButton
							count={d.filtered.length}
							itemLabel='kế hoạch'
							getIds={() => d.filtered.map((x) => x.id)}
							onDelete={d.handleBulkDelete}
							onDone={rowSel.clearSelection}
							disabled={d.loading}
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
								<th className={`${styles.th} ${tbl.thIdx}`}>STT</th>
								<th className={styles.th}>Kế hoạch</th>
								<th className={styles.th}>Năm</th>
								<th className={styles.th}>Khoa / Phòng ban</th>
								<th className={styles.th}>Tiến độ</th>
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
												<div
													className={styles.itemName}
													title='Xem hạng mục & tiến độ'
													onClick={() => setDetailId(plan.id)}
												>
													{plan.title}
												</div>
												{plan.description && (
													<div className={styles.descText}>{plan.description}</div>
												)}
											</td>
											<td className={styles.td}>{plan.year}</td>
											<td className={styles.td}>{plan.department_name ?? 'Toàn viện'}</td>
											<td className={styles.td}>
												<div className={styles.progressCell}>
													<span className={styles.descText}>
														{plan.done_item_count}/{plan.item_count} hạng mục đã mở khóa
													</span>
													{plan.item_count > 0 && (
														<div className={styles.progress}>
															<span style={{ width: `${Math.round((plan.done_item_count / plan.item_count) * 100)}%` }} />
														</div>
													)}
												</div>
											</td>
											<td className={styles.td}>
												<span className={`${styles.statusBadge} ${styles[STATUS_CLASS[plan.status]]}`}>
													{d.statusLabel[plan.status]}
												</span>
											</td>
											<td className={`${styles.td} ${styles.tdActions}`}>
												<RowActions
													onEdit={() => void d.openEdit(plan)}
													onDelete={() => {
														d.setDeletingItem(plan);
														d.setModal('delete');
													}}
												>
													<RowAction
														title='Hạng mục & tiến độ'
														onClick={() => setDetailId(plan.id)}
													>
														<EyeSvg />
													</RowAction>
												</RowActions>
											</td>
										</tr>
									);
								})
							)}
						</tbody>
					</table>
				</div>

								<Pagination
					page={d.safePage}
					totalPages={d.totalPages}
					total={d.filtered.length}
					rowsPerPage={d.pageSize}
					onPageChange={d.setPage}
					itemLabel='kế hoạch'
					onRowsPerPageChange={d.handlePageSize}
				/>
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
			{detailId && (
				<PlanDetailModal
					planId={detailId}
					onClose={() => setDetailId(null)}
					onEdit={(plan) => {
						setDetailId(null);
						d.setEditingItem(plan);
						d.setModal('edit');
					}}
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
