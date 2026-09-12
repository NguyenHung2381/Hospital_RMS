import { CheckSvg, EditSvg, PlusSvg, SearchSvg, TrashSvg, XSvg } from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { SkeletonTable } from '../../../shared/components/Loading';
import { Pagination } from '../../../shared/components/Table/Pagination';
import sel from '../../../shared/components/Table/RowSelect.module.css';
import { BulkBar, SelectCheckbox } from '../../../shared/components/Table/RowSelect';
import { useRowSelection } from '../../../shared/hooks/useRowSelection';
import { CourseDeleteModal } from '../components/CourseDeleteModal';
import { CourseDetailModal } from '../components/CourseDetailModal';
import { CourseFormModal } from '../components/CourseFormModal';
import { useCourses } from '../hooks/useCourses';
import { STATUS_CFG } from '../types/course.type';
import styles from './Courses.module.css';

const PAGE_SIZE_OPTIONS = [5, 10, 25, 50, 0] as const;

export default function Courses() {
	const d = useCourses();
	const rowSel = useRowSelection(d.paged.map((x) => x.id));

	const headerActions = (
		<button
			className={styles.btnAddHeader}
			onClick={() => d.setModal('add')}
		>
			<PlusSvg /> Thêm khóa học
		</button>
	);

	return (
		<AdminLayout
			pageTitle='Quản lý Khóa học'
			pageSubtitle='Khóa học, đăng ký học viên, phân công giảng viên, lịch học & điểm danh'
			breadcrumbs={[{ label: 'Đào tạo' }]}
			headerActions={headerActions}
		>
			<div className={styles.toolbar}>
				<div className={styles.searchBox}>
					<SearchSvg />
					<input
						className={styles.searchInput}
						placeholder='Tìm theo tên khóa học...'
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
				<span className={styles.resultCount}>{d.filtered.length} khóa học</span>
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
					itemLabel='khóa học'
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
							<th className={styles.th}>Khóa học</th>
							<th className={styles.th}>Chương trình / Đợt</th>
							<th className={styles.th}>Sĩ số</th>
							<th className={styles.th}>Trạng thái</th>
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
										<div className={styles.emptyTitle}>Không tìm thấy khóa học</div>
										<div className={styles.emptyDesc}>
											{d.search ? 'Thử thay đổi từ khoá tìm kiếm' : 'Chưa có khóa học nào'}
										</div>
									</div>
								</td>
							</tr>
						) : (
							d.paged.map((c, i) => {
								const rowNum = (d.safePage - 1) * (d.pageSize || d.filtered.length) + i + 1;
								const cfg = STATUS_CFG[c.status];
								const isFull = c.capacity != null && c.approved_count >= c.capacity;
								return (
									<tr
										key={c.id}
										className={`${styles.tr} ${rowSel.isSelected(c.id) ? sel.rowSelected : ''}`}
									>
										<td className={sel.checkCol}>
											<SelectCheckbox
												title='Chọn khóa học'
												checked={rowSel.isSelected(c.id)}
												onChange={() => rowSel.toggleSelect(c.id)}
											/>
										</td>
										<td className={`${styles.td} ${styles.tdIdx}`}>{rowNum}</td>
										<td className={styles.td}>
											<span
												className={styles.itemName}
												onClick={() => d.setDetailCourse(c)}
											>
												{c.name}
											</span>
											{c.pending_count > 0 && (
												<div className={styles.descText}>
													{c.pending_count} đăng ký chờ duyệt
												</div>
											)}
										</td>
										<td className={styles.td}>
											<span className={styles.descText}>
												{c.program_name ?? '—'} {c.training_round_name ? `· ${c.training_round_name}` : ''}
											</span>
										</td>
										<td className={styles.td}>
											<span className={`${styles.capacityText} ${isFull ? styles.capacityFull : ''}`}>
												{c.approved_count}
												{c.capacity != null ? `/${c.capacity}` : ''}
											</span>
										</td>
										<td className={styles.td}>
											<span
												className={styles.badge}
												style={{ background: cfg.bg, color: cfg.color }}
											>
												{cfg.label}
											</span>
										</td>
										<td className={`${styles.td} ${styles.tdActions}`}>
											<button
												className={`${styles.actionBtn} ${styles.actionEdit}`}
												title='Chỉnh sửa'
												onClick={() => {
													d.setEditingCourse(c);
													d.setModal('edit');
												}}
											>
												<EditSvg />
											</button>
											<button
												className={`${styles.actionBtn} ${styles.actionDelete}`}
												title='Xoá'
												onClick={() => {
													d.setDeletingCourse(c);
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
					itemLabel='khóa học'
					hideSizeSelect
				/>
			)}

			{d.modal === 'add' && (
				<CourseFormModal
					mode='add'
					programs={d.programs}
					rounds={d.rounds}
					forms={d.forms}
					onClose={() => d.setModal(null)}
					onSave={d.handleAdd}
					loading={d.loading}
				/>
			)}
			{d.modal === 'edit' && d.editingCourse && (
				<CourseFormModal
					mode='edit'
					course={d.editingCourse}
					programs={d.programs}
					rounds={d.rounds}
					forms={d.forms}
					onClose={() => {
						d.setModal(null);
						d.setEditingCourse(null);
					}}
					onSave={d.handleEdit}
					loading={d.loading}
				/>
			)}
			{d.modal === 'delete' && d.deletingCourse && (
				<CourseDeleteModal
					course={d.deletingCourse}
					onClose={() => {
						d.setModal(null);
						d.setDeletingCourse(null);
					}}
					onConfirm={d.handleDelete}
					loading={d.loading}
				/>
			)}
			{d.detailCourse && (
				<CourseDetailModal
					course={d.detailCourse}
					onClose={() => d.setDetailCourse(null)}
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
