import { SearchInput, SelectionCount, RowAction, RowActions } from '@/shared/components/Table/TableToolbar';
import { useState } from 'react';
import { CalendarSvg, EyeSvg, PlusSvg } from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { SkeletonTable } from '../../../shared/components/Loading';
import { Pagination } from '../../../shared/components/Table/Pagination';
import sel from '../../../shared/components/Table/RowSelect.module.css';
import { DeleteAllButton, SelectCheckbox } from '../../../shared/components/Table/RowSelect';
import { useRowSelection } from '../../../shared/hooks/useRowSelection';
import { formatDate } from '../../../shared/utils/formatDate';
import { CourseDeleteModal } from '../components/CourseDeleteModal';
import { CourseDetailModal } from '../components/CourseDetailModal';
import { CourseFormModal } from '../components/CourseFormModal';
import { useCourses } from '../hooks/useCourses';
import type { DetailTab } from '../hooks/useCourseDetail';
import { DISPLAY_STATUS_CFG } from '../types/course.type';
import styles from './Courses.module.css';
import tbl from '@/shared/components/Table/Table.module.css';

export default function Courses() {
	const d = useCourses();
	const [detailTab, setDetailTab] = useState<DetailTab>('enrollments');
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
			<div className={styles.tableCard}>
				<div className={styles.tableHeader}>
					<div className={styles.tableHeaderLeft}>
						<span className={styles.tableTitle}>Danh sách khóa học</span>
						<SelectionCount
							rowSel={rowSel}
							itemLabel='khóa học'
							loading={d.loading}
							onBulkDelete={d.handleBulkDelete}
						>
							{d.total} khóa học
						</SelectionCount>
					</div>
					<div className={styles.tableControls}>
						<SearchInput
							value={d.search}
							onChange={d.handleSearch}
							placeholder='Tìm theo tên khóa học...'
						/>
						<DeleteAllButton
							count={d.total}
							itemLabel='khóa học'
							getIds={d.fetchAllIds}
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
							<th className={styles.th}>Khóa học</th>
							<th className={styles.th}>Chương trình</th>
							<th className={styles.th}>Đăng ký</th>
							<th className={styles.th}>Sĩ số</th>
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
						) : d.total === 0 ? (
							<tr>
								<td colSpan={8}>
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
								const rowNum = (d.safePage - 1) * (d.pageSize || d.total) + i + 1;
								const cfg = DISPLAY_STATUS_CFG[c.display_status];
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
												title='Xem chi tiết khóa học'
												onClick={() => {
													setDetailTab('enrollments');
													d.setDetailCourse(c);
												}}
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
											<span className={styles.descText}>{c.program_names ?? '—'}</span>
											<div>
												<span
													className={styles.badge}
													style={
														c.is_public_registration
															? { background: '#e1f5ea', color: '#085028' }
															: { background: 'var(--color-gray-100)', color: 'var(--color-gray-600)' }
													}
												>
													{c.is_public_registration ? 'Công khai' : 'Nội bộ'}
												</span>
											</div>
										</td>
										<td className={styles.td}>
											<span className={styles.descText}>
												{c.enrollment_start_date || c.enrollment_end_date
													? `${formatDate(c.enrollment_start_date) ?? '—'} — ${formatDate(c.enrollment_end_date) ?? '—'}`
													: 'Luôn mở'}
												{' · '}
												<span style={{ color: c.enrollment_open ? '#085028' : '#791f1f' }}>
													{c.enrollment_open ? 'Đang mở' : 'Đã đóng'}
												</span>
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
											<RowActions
												onEdit={() => {
													d.setEditingCourse(c);
													d.setModal('edit');
												}}
												onDelete={() => {
													d.setDeletingCourse(c);
													d.setModal('delete');
												}}
											>
												<RowAction
													title='Lịch học & điểm danh (QR)'
													onClick={() => {
														setDetailTab('sessions');
														d.setDetailCourse(c);
													}}
												>
													<CalendarSvg />
												</RowAction>
												<RowAction
													title='Chi tiết khóa học (học viên, giảng viên, tài liệu, kết quả…)'
													onClick={() => {
														setDetailTab('enrollments');
														d.setDetailCourse(c);
													}}
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
					total={d.total}
					rowsPerPage={d.pageSize}
					onPageChange={d.setPage}
					itemLabel='khóa học'
					onRowsPerPageChange={d.handlePageSize}
				/>
			</div>


			{d.modal === 'add' && (
				<CourseFormModal
					mode='add'
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
					initialTab={detailTab}
					onClose={() => d.setDetailCourse(null)}
				/>
			)}

		</AdminLayout>
	);
}
