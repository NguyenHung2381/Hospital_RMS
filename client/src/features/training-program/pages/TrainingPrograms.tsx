import { CheckSvg, EditSvg, PlusSvg, SearchSvg, TrashSvg, XSvg } from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { SkeletonTable } from '../../../shared/components/Loading';
import { Pagination } from '../../../shared/components/Table/Pagination';
import sel from '../../../shared/components/Table/RowSelect.module.css';
import { BulkBar, SelectCheckbox } from '../../../shared/components/Table/RowSelect';
import { useRowSelection } from '../../../shared/hooks/useRowSelection';
import { TrainingProgramDeleteModal } from '../components/TrainingProgramDeleteModal';
import { TrainingProgramFormModal } from '../components/TrainingProgramFormModal';
import { useTrainingPrograms } from '../hooks/useTrainingPrograms';
import styles from './TrainingPrograms.module.css';

const PAGE_SIZE_OPTIONS = [5, 10, 25, 50, 0] as const;

const COLORS = [
	{ bg: '#e1f5ee', color: '#085041' },
	{ bg: '#e6f1fb', color: '#0c447c' },
	{ bg: '#eeedfe', color: '#3c3489' },
	{ bg: '#faeeda', color: '#633806' },
	{ bg: '#fce8fb', color: '#6b1a69' },
];
function getColor(id: string) {
	let hash = 0;
	for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
	return COLORS[Math.abs(hash) % COLORS.length];
}
function getInitials(s: string) {
	const parts = s.trim().split(/\s+/);
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

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
			<div className={styles.toolbar}>
				<div className={styles.searchBox}>
					<SearchSvg />
					<input
						className={styles.searchInput}
						placeholder='Tìm theo tên chương trình...'
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
				<span className={styles.resultCount}>{d.filtered.length} chương trình</span>
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

			<div className={styles.tableWrap}>
				<BulkBar
					rowSel={rowSel}
					itemLabel='chương trình'
					loading={d.loading}
					onBulkDelete={d.handleBulkDelete}
				/>
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
							<th className={styles.th}>Chương trình</th>
							<th className={styles.th}>Khoa / Phòng</th>
							<th className={styles.th}>Đối tượng</th>
							<th className={styles.th}>Loại hình</th>
							<th className={`${styles.th} ${styles.thRight}`}>Thao tác</th>
						</tr>
					</thead>
					<tbody>
						{d.isLoadingData ? (
							<SkeletonTable
								rows={d.pageSize || 8}
								cols={7}
							/>
						) : d.filtered.length === 0 ? (
							<tr>
								<td colSpan={7}>
									<div className={styles.emptyState}>
										<div className={styles.emptyTitle}>
											Không tìm thấy chương trình đào tạo
										</div>
										<div className={styles.emptyDesc}>
											{d.search ? 'Thử thay đổi từ khoá tìm kiếm' : 'Chưa có chương trình nào'}
										</div>
									</div>
								</td>
							</tr>
						) : (
							d.paged.map((p, i) => {
								const c = getColor(p.id);
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
											<div className={styles.itemCell}>
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
											<span className={styles.descText}>{p.training_type_name ?? '—'}</span>
										</td>
										<td className={`${styles.td} ${styles.tdActions}`}>
											<button
												className={`${styles.actionBtn} ${styles.actionEdit}`}
												title='Chỉnh sửa'
												onClick={() => {
													d.setEditingProgram(p);
													d.setModal('edit');
												}}
											>
												<EditSvg />
											</button>
											<button
												className={`${styles.actionBtn} ${styles.actionDelete}`}
												title='Xoá'
												onClick={() => {
													d.setDeletingProgram(p);
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

			{d.filtered.length > 0 && d.totalPages > 1 && (
				<Pagination
					page={d.safePage}
					totalPages={d.totalPages}
					total={d.filtered.length}
					rowsPerPage={d.pageSize}
					pageSizeOptions={PAGE_SIZE_OPTIONS}
					onPageChange={d.setPage}
					onRowsPerPageChange={d.handlePageSize}
					itemLabel='chương trình'
					hideSizeSelect
				/>
			)}

			{d.modal === 'add' && (
				<TrainingProgramFormModal
					mode='add'
					departments={d.departments}
					traineeTypes={d.traineeTypes}
					trainingTypes={d.trainingTypes}
					subjects={d.subjects}
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
					subjects={d.subjects}
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
