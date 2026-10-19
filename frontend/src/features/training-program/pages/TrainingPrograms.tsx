import { avatarColor, getInitials } from '@/shared/utils';
import { SearchInput, SelectionCount, RowAction, RowActions } from '@/shared/components/Table/TableToolbar';
import { ListSvg, PlusSvg } from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { ExcelActions, type ExcelColumn } from '@/shared/components/Excel';
import { matchLabel, nameMap, numText } from '@/shared/components/Excel/excelHelpers';
import { createTrainingProgram } from '../api/trainingProgramApi';
import type { TrainingProgram } from '../types/trainingProgram.type';
import { Badge } from '../../../shared/components';
import { SkeletonTable } from '../../../shared/components/Loading';
import { Pagination } from '../../../shared/components/Table/Pagination';
import sel from '../../../shared/components/Table/RowSelect.module.css';
import { DeleteAllButton, SelectCheckbox } from '../../../shared/components/Table/RowSelect';
import { useRowSelection } from '../../../shared/hooks/useRowSelection';
import { TrainingProgramDeleteModal } from '../components/TrainingProgramDeleteModal';
import { TrainingProgramDetailModal } from '../components/TrainingProgramDetailModal';
import { TrainingProgramFormModal } from '../components/TrainingProgramFormModal';
import { ProgramCatalogImportModal } from '../components/ProgramCatalogImportModal';
import { useTrainingPrograms } from '../hooks/useTrainingPrograms';
import {
	EMPTY_FORM,
	getProgramStatus,
	PROGRAM_STATUS_LABELS,
	type ProgramStatusFilter,
} from '../types/trainingProgram.type';
import styles from './TrainingPrograms.module.css';
import tbl from '@/shared/components/Table/Table.module.css';

export default function TrainingPrograms() {
	const d = useTrainingPrograms();
	const rowSel = useRowSelection(d.paged.map((x) => x.id));

	const deptNames = nameMap(d.departments, (x) => x.name);
	const typeNames = nameMap(d.traineeTypes, (x) => x.name);
	const excelCols: ExcelColumn<TrainingProgram>[] = [
		{ header: 'Mã chương trình', key: 'code', value: (x) => x.code },
		{ header: 'Tên chương trình', key: 'name', required: true, value: (x) => x.name },
		{ header: 'Loại hình', value: (x) => x.training_type_name },
		{ header: 'Lý thuyết', value: (x) => x.theory_hours },
		{ header: 'Thực hành', value: (x) => x.practice_hours },
		{ header: 'Tổng số tiết', value: (x) => x.total_hours || null },
		{ header: 'Số giờ tín chỉ', value: (x) => x.credit_hours },
		{ header: 'Thời lượng', key: 'duration', value: (x) => x.duration },
		{ header: 'Đối tượng (ghi chú)', value: (x) => x.target_audience },
		{ header: 'Học phí', value: (x) => x.tuition_fee },
		{ header: 'Khoa phòng', key: 'department', value: (x) => x.department_name ?? x.department_note },
		{ header: 'Đối tượng học viên', key: 'trainee_type', value: (x) => x.trainee_type_name },
		{ header: 'Sĩ số tối đa', key: 'max_capacity', value: (x) => x.max_capacity },
		{ header: 'Thứ tự', key: 'display_order', value: (x) => x.display_order },
		{ header: 'Mô tả', key: 'description', value: (x) => x.description },
		{ header: 'Số bài học', value: (x) => x.lesson_count ?? 0 },
		{ header: 'Số khóa học', value: (x) => x.course_count ?? 0 },
	];

	const headerActions = (
		<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
			<ExcelActions
				fileName='chuong-trinh-dao-tao'
				itemLabel='chương trình'
				columns={excelCols}
				getRows={() => d.filtered}
				importRow={(r) =>
					createTrainingProgram({
						...EMPTY_FORM,
						name: r.name,
						code: r.code,
						duration: r.duration,
						department_id: matchLabel(deptNames, r.department, 'Khoa phòng') ?? '',
						trainee_type_id: matchLabel(typeNames, r.trainee_type, 'Đối tượng học viên') ?? '',
						max_capacity: numText(r.max_capacity),
						display_order: numText(r.display_order),
						description: r.description,
					})
				}
				onImported={d.refreshData}
			/>
			<button
				className={styles.btnGhost}
				onClick={() => d.setModal('import')}
				title='Nhập danh mục chương trình + vòng thực hành (sheet "Mã CT" và "Bài học")'
			>
				Nhập danh mục CT
			</button>
			<button
				className={styles.btnAddHeader}
				onClick={() => d.setModal('add')}
			>
				<PlusSvg /> Thêm chương trình
			</button>
		</div>
	);

	return (
		<AdminLayout
			pageTitle='Chương trình Đào tạo'
			pageSubtitle='Khung nội dung đào tạo: mỗi chương trình gồm các bài học, được áp dụng cho các khóa học'
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
							className={`${styles.filterSelect} ${d.trainingTypeFilter !== 'all' ? styles.filterActive : ''}`}
							value={d.trainingTypeFilter}
							onChange={(e) => d.handleTrainingTypeFilter(e.target.value)}
						>
							<option value='all'>Tất cả loại hình</option>
							{d.trainingTypes.map((t) => (
								<option
									key={t.id}
									value={t.id}
								>
									{t.name}
								</option>
							))}
							<option value='none'>Chưa gán loại hình</option>
						</select>
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
												<div>
													<span className={styles.itemName}>{p.name}</span>
													{(p.training_type_name || p.duration) && (
														<div className={styles.descText}>
															{[p.training_type_name, p.duration].filter(Boolean).join(' · ')}
														</div>
													)}
												</div>
											</div>
										</td>
										<td className={styles.td}>
											<span className={styles.descText}>{p.department_name ?? p.department_note ?? '—'}</span>
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


			{d.modal === 'import' && (
				<ProgramCatalogImportModal
					onClose={() => d.setModal(null)}
					onImported={d.refreshData}
				/>
			)}
			{d.modal === 'add' && (
				<TrainingProgramFormModal
					mode='add'
					departments={d.departments}
					traineeTypes={d.traineeTypes}
					trainingTypes={d.trainingTypes}
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
					trainingTypes={d.trainingTypes}
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
