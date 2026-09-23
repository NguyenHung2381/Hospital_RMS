import { useState } from 'react';
import { CalendarSvg, CheckSvg, EditSvg, EyeSvg, PlusSvg, SearchSvg, TrashSvg, XSvg } from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { SkeletonTable } from '../../../shared/components/Loading';
import { Pagination } from '../../../shared/components/Table/Pagination';
import sel from '../../../shared/components/Table/RowSelect.module.css';
import { BulkButton, BulkDeleteModal, SelectCheckbox } from '../../../shared/components/Table/RowSelect';
import { useRowSelection } from '../../../shared/hooks/useRowSelection';
import { formatDate } from '../../../shared/utils/formatDate';
import { CourseDeleteModal } from '../components/CourseDeleteModal';
import { CourseDetailModal } from '../components/CourseDetailModal';
import { CourseFormModal } from '../components/CourseFormModal';
import { useCourses } from '../hooks/useCourses';
import type { DetailTab } from '../hooks/useCourseDetail';
import { DISPLAY_STATUS_CFG } from '../types/course.type';
import styles from './Courses.module.css';

const PAGE_SIZE_OPTIONS = [5, 10, 25, 50, 0] as const;

export default function Courses() {
	const d = useCourses();
	const [detailTab, setDetailTab] = useState<DetailTab>('enrollments');
	const rowSel = useRowSelection(d.paged.map((x) => x.id));
	const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

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
								{d.total} khóa học
							</span>
						)}
					</div>
					<div className={styles.tableControls}>
						<div className={styles.searchBox}>
							<SearchSvg className={styles.searchIcon} />
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
															? { background: '#e1f5ee', color: '#085041' }
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
												<span style={{ color: c.enrollment_open ? '#085041' : '#791f1f' }}>
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
											<div className={styles.actionBtns}>
												<div
													className={styles.actionBtn}
													title='Lịch học & điểm danh (QR)'
													onClick={() => {
														setDetailTab('sessions');
														d.setDetailCourse(c);
													}}
												>
													<CalendarSvg />
												</div>
												<div
													className={styles.actionBtn}
													title='Chi tiết khóa học (học viên, giảng viên, tài liệu, kết quả…)'
													onClick={() => {
														setDetailTab('enrollments');
														d.setDetailCourse(c);
													}}
												>
													<EyeSvg />
												</div>
												<div
													className={styles.actionBtn}
													title='Chỉnh sửa'
													onClick={() => {
														d.setEditingCourse(c);
														d.setModal('edit');
													}}
												>
													<EditSvg />
												</div>
												<div
													className={`${styles.actionBtn} ${styles.danger}`}
													title='Xoá'
													onClick={() => {
														d.setDeletingCourse(c);
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

				{d.total > 0 && d.totalPages > 1 && (
					<Pagination
						page={d.safePage}
						totalPages={d.totalPages}
						total={d.total}
						rowsPerPage={d.pageSize}
						pageSizeOptions={PAGE_SIZE_OPTIONS}
						onPageChange={d.setPage}
						onRowsPerPageChange={d.handlePageSize}
						itemLabel='khóa học'
						hideSizeSelect
					/>
				)}
			</div>

			<BulkDeleteModal
				open={confirmBulkDelete}
				count={rowSel.selectedCount}
				itemLabel='khóa học'
				loading={d.loading}
				onClose={() => setConfirmBulkDelete(false)}
				onConfirm={async () => {
					await d.handleBulkDelete([...rowSel.selectedIds]);
					rowSel.clearSelection();
					setConfirmBulkDelete(false);
				}}
			/>

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
