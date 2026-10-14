import { avatarColor, getInitials } from '@/shared/utils';
import { SearchInput, SelectionCount, RowAction, RowActions } from '@/shared/components/Table/TableToolbar';
import { ListSvg, PlusSvg } from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { Badge } from '../../../shared/components';
import { SkeletonTable } from '../../../shared/components/Loading';
import { Pagination } from '../../../shared/components/Table/Pagination';
import sel from '../../../shared/components/Table/RowSelect.module.css';
import { DeleteAllButton, SelectCheckbox } from '../../../shared/components/Table/RowSelect';
import { useRowSelection } from '../../../shared/hooks/useRowSelection';
import { TrainingProgramDeleteModal } from '../components/TrainingProgramDeleteModal';
import { TrainingProgramDetailModal } from '../components/TrainingProgramDetailModal';
import { TrainingProgramFormModal } from '../components/TrainingProgramFormModal';
import { useTrainingPrograms } from '../hooks/useTrainingPrograms';
import { getProgramStatus, PROGRAM_STATUS_LABELS, type ProgramStatusFilter } from '../types/trainingProgram.type';
import styles from './TrainingPrograms.module.css';
import tbl from '@/shared/components/Table/Table.module.css';

export default function TrainingPrograms() {
	const d = useTrainingPrograms();
	const rowSel = useRowSelection(d.paged.map((x) => x.id));

	const headerActions = (
		<button
			className={styles.btnAddHeader}
			onClick={() => d.setModal('add')}
		>
			<PlusSvg /> Thêm chương trình
		</button>
	);

	return (
		<AdminLayout
			pageTitle='Chương trình Đào tạo'
			pageSubtitle='Danh sách chương trình đào tạo và môn học liên quan'
			breadcrumbs={[{ label: 'Đào tạo' }]}
			headerActions={headerActions}
		>
			<div className={styles.tableCard}>
				<div className={styles.tableHeader}>
					<div className={styles.tableHeaderLeft}>
						<span className={styles.tableTitle}>Danh sách chương trình</span>
						<SelectionCount
							rowSel={rowSel}
							itemLabel='chương trình'
							loading={d.loading}
							onBulkDelete={d.handleBulkDelete}
						>
							{d.filtered.length} chương trình
						</SelectionCount>
					</div>
					<div className={styles.tableControls}>
						<SearchInput
							value={d.search}
							onChange={d.handleSearch}
							placeholder='Tìm theo mã, tên chương trình...'
						/>
						<select
							className={`${styles.filterSelect} ${d.departmentFilter !== 'all' ? styles.filterActive : ''}`}
							value={d.departmentFilter}
							onChange={(e) => d.handleDepartmentFilter(e.target.value)}
						>
							<option value='all'>Tất cả khoa / phòng</option>
							{d.departmentOptions.map((dep) => (
								<option
									key={dep.id}
									value={dep.id}
								>
									{dep.name}
								</option>
							))}
							<option value='none'>Chưa gán khoa</option>
						</select>
						<select
							className={`${styles.filterSelect} ${d.traineeTypeFilter !== 'all' ? styles.filterActive : ''}`}
							value={d.traineeTypeFilter}
							onChange={(e) => d.handleTraineeTypeFilter(e.target.value)}
						>
							<option value='all'>Tất cả đối tượng</option>
							{d.traineeTypes.map((t) => (
								<option
									key={t.id}
									value={t.id}
								>
									{t.name}
								</option>
							))}
							<option value='none'>Chưa gán đối tượng</option>
						</select>
						<select
							className={`${styles.filterSelect} ${d.statusFilter !== 'all' ? styles.filterActive : ''}`}
							value={d.statusFilter}
							onChange={(e) => d.handleStatusFilter(e.target.value as ProgramStatusFilter)}
						>
							<option value='all'>Tất cả trạng thái</option>
							{Object.entries(PROGRAM_STATUS_LABELS).map(([v, label]) => (
								<option
									key={v}
									value={v}
								>
									{label}
								</option>
							))}
						</select>
						{d.hasActiveFilter && (
							<button
								type='button'
								className={styles.clearSelectionBtn}
								onClick={d.clearFilters}
							>
								Xoá lọc
							</button>
						)}
						<DeleteAllButton
							count={d.filtered.length}
							itemLabel='chương trình'
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
							<th className={styles.th}>Mã</th>
							<th className={styles.th}>Chương trình</th>
							<th className={styles.th}>Khoa / Phòng</th>
							<th className={styles.th}>Đối tượng</th>
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
										<div className={styles.emptyTitle}>
											Không tìm thấy chương trình đào tạo
										</div>
										<div className={styles.emptyDesc}>
											{d.hasActiveFilter ? 'Thử thay đổi từ khoá hoặc bộ lọc' : 'Chưa có chương trình nào'}
										</div>
									</div>
								</td>
							</tr>
						) : (
							d.paged.map((p, i) => {
								const c = avatarColor(p.id);
								const rowNum = (d.safePage - 1) * (d.pageSize || d.filtered.length) + i + 1;
								return (
									<tr
										key={p.id}
										className={`${styles.tr} ${rowSel.isSelected(p.id) ? sel.rowSelected : ''}`}
									>
										<td className={sel.checkCol}>
											<SelectCheckbox
												title='Chọn chương trình'
												checked={rowSel.isSelected(p.id)}
												onChange={() => rowSel.toggleSelect(p.id)}
											/>
										</td>
										<td className={`${styles.td} ${styles.tdIdx}`}>{rowNum}</td>
										<td className={styles.td}>
											<span className={styles.descText}>{p.code ?? '—'}</span>
										</td>
										<td className={styles.td}>
											<div
												className={styles.itemCell}
												style={{ cursor: 'pointer' }}
												onClick={() => d.openDetail(p, 'info')}
											>
												<div
													className={styles.itemAvatar}
													style={{ background: c.bg, color: c.color }}
												>
													{getInitials(p.name)}
												</div>
												<span className={styles.itemName}>{p.name}</span>
											</div>
										</td>
										<td className={styles.td}>
											<span className={styles.descText}>{p.department_name ?? '—'}</span>
										</td>
										<td className={styles.td}>
											{p.trainee_type_name ? (
												<span className={styles.badge}>{p.trainee_type_name}</span>
											) : (
												'—'
											)}
										</td>
										<td className={styles.td}>
											{getProgramStatus(p) === 'active' ? (
												<Badge
													tone='green'
													dot
												>
													{PROGRAM_STATUS_LABELS.active} · {p.course_count} khoá
												</Badge>
											) : (
												<Badge
													tone='gray'
													dot
												>
													{PROGRAM_STATUS_LABELS.unused}
												</Badge>
											)}
										</td>
										<td className={`${styles.td} ${styles.tdActions}`}>
											<RowActions
												onEdit={() => {
													d.setEditingProgram(p);
													d.setModal('edit');
												}}
												onDelete={() => {
													d.setDeletingProgram(p);
													d.setModal('delete');
												}}
											>
												<RowAction
													title='Bài học'
													onClick={() => d.openDetail(p, 'lessons')}
												>
													<ListSvg />
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
					itemLabel='chương trình'
					onRowsPerPageChange={d.handlePageSize}
				/>
			</div>


			{d.modal === 'add' && (
				<TrainingProgramFormModal
					mode='add'
					departments={d.departments}
					traineeTypes={d.traineeTypes}
					onClose={() => d.setModal(null)}
					onSave={d.handleAdd}
					loading={d.loading}
				/>
			)}
			{d.modal === 'edit' && d.editingProgram && (
				<TrainingProgramFormModal
					mode='edit'
					program={d.editingProgram}
					departments={d.departments}
					traineeTypes={d.traineeTypes}
					onClose={() => {
						d.setModal(null);
						d.setEditingProgram(null);
					}}
					onSave={d.handleEdit}
					loading={d.loading}
				/>
			)}
			{d.modal === 'delete' && d.deletingProgram && (
				<TrainingProgramDeleteModal
					program={d.deletingProgram}
					onClose={() => {
						d.setModal(null);
						d.setDeletingProgram(null);
					}}
					onConfirm={d.handleDelete}
					loading={d.loading}
				/>
			)}

			{d.detailProgram && (
				<TrainingProgramDetailModal
					program={d.detailProgram}
					programs={d.programs}
					initialTab={d.detailTab}
					onClose={() => d.setDetailProgram(null)}
					onEdit={() => {
						d.setEditingProgram(d.detailProgram);
						d.setDetailProgram(null);
						d.setModal('edit');
					}}
				/>
			)}

		</AdminLayout>
	);
}
