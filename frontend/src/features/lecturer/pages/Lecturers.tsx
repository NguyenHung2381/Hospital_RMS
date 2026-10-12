import { avatarColor, getInitials } from '@/shared/utils';
import { SearchInput, PageSizeSelect, SelectionCount, RowActions } from '@/shared/components/Table/TableToolbar';
import { PlusSvg } from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { SkeletonTable } from '../../../shared/components/Loading';
import { Pagination } from '../../../shared/components/Table/Pagination';
import sel from '../../../shared/components/Table/RowSelect.module.css';
import { SelectCheckbox } from '../../../shared/components/Table/RowSelect';
import { useRowSelection } from '../../../shared/hooks/useRowSelection';
import { LecturerDeleteModal } from '../components/LecturerDeleteModal';
import { LecturerFormModal } from '../components/LecturerFormModal';
import { useLecturers } from '../hooks/useLecturers';
import styles from './Lecturers.module.css';

export default function Lecturers() {
	const d = useLecturers();
	const rowSel = useRowSelection(d.paged.map((x) => x.id));

	const headerActions = (
		<button
			className={styles.btnAddHeader}
			onClick={() => d.setModal('add')}
		>
			<PlusSvg /> Thêm giảng viên
		</button>
	);

	return (
		<AdminLayout
			pageTitle='Quản lý Giảng viên'
			pageSubtitle='Danh sách giảng viên tham gia đào tạo (nội viện & mời ngoài)'
			breadcrumbs={[{ label: 'Đào tạo' }]}
			headerActions={headerActions}
		>
			<div className={styles.tableCard}>
				<div className={styles.tableHeader}>
					<div className={styles.tableHeaderLeft}>
						<span className={styles.tableTitle}>Danh sách giảng viên</span>
						<SelectionCount
							rowSel={rowSel}
							itemLabel='giảng viên'
							loading={d.loading}
							onBulkDelete={d.handleBulkDelete}
						>
							{d.total} giảng viên
						</SelectionCount>
					</div>
					<div className={styles.tableControls}>
						<SearchInput
							value={d.search}
							onChange={d.handleSearch}
							placeholder='Tìm theo tên, chuyên môn, email...'
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
							<th className={styles.th}>Giảng viên</th>
							<th className={styles.th}>Chuyên môn</th>
							<th className={styles.th}>Liên hệ</th>
							<th className={styles.th}>Loại</th>
							<th className={`${styles.th} ${styles.thRight}`}>Thao tác</th>
						</tr>
					</thead>
					<tbody>
						{d.isLoadingData ? (
							<SkeletonTable
								rows={d.pageSize || 8}
								cols={7}
							/>
						) : d.total === 0 ? (
							<tr>
								<td colSpan={7}>
									<div className={styles.emptyState}>
										<div className={styles.emptyTitle}>Không tìm thấy giảng viên</div>
										<div className={styles.emptyDesc}>
											{d.search ? 'Thử thay đổi từ khoá tìm kiếm' : 'Chưa có giảng viên nào'}
										</div>
									</div>
								</td>
							</tr>
						) : (
							d.paged.map((l, i) => {
								const c = avatarColor(l.id);
								const rowNum = (d.safePage - 1) * (d.pageSize || d.total) + i + 1;
								return (
									<tr
										key={l.id}
										className={`${styles.tr} ${rowSel.isSelected(l.id) ? sel.rowSelected : ''}`}
									>
										<td className={sel.checkCol}>
											<SelectCheckbox
												title='Chọn giảng viên'
												checked={rowSel.isSelected(l.id)}
												onChange={() => rowSel.toggleSelect(l.id)}
											/>
										</td>
										<td className={`${styles.td} ${styles.tdIdx}`}>{rowNum}</td>
										<td className={styles.td}>
											<div className={styles.personCell}>
												<div
													className={styles.personAvatar}
													style={{ background: c.bg, color: c.color }}
												>
													{getInitials(l.full_name)}
												</div>
												<div>
													<div className={styles.personName}>{l.full_name}</div>
													{!l.is_active && (
														<div className={styles.personSub}>Đã vô hiệu hoá</div>
													)}
												</div>
											</div>
										</td>
										<td className={styles.td}>
											<span className={styles.descText}>{l.specialty ?? '—'}</span>
										</td>
										<td className={styles.td}>
											<span className={styles.descText}>
												{l.phone ?? l.email ?? '—'}
											</span>
										</td>
										<td className={styles.td}>
											<span
												className={`${styles.badge} ${l.is_external ? styles.badgeExternal : styles.badgeInternal}`}
											>
												{l.is_external ? 'Mời ngoài' : 'Nội viện'}
											</span>
										</td>
										<td className={`${styles.td} ${styles.tdActions}`}>
											<RowActions
												onEdit={() => {
													d.setEditingLecturer(l);
													d.setModal('edit');
												}}
												onDelete={() => {
													d.setDeletingLecturer(l);
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

				{d.total > 0 && d.totalPages > 1 && (
					<Pagination
						page={d.safePage}
						totalPages={d.totalPages}
						total={d.total}
						rowsPerPage={d.pageSize}
						onPageChange={d.setPage}
						itemLabel='giảng viên'
						hideSizeSelect
					/>
				)}
			</div>


			{d.modal === 'add' && (
				<LecturerFormModal
					mode='add'
					onClose={() => d.setModal(null)}
					onSave={d.handleAdd}
					loading={d.loading}
				/>
			)}
			{d.modal === 'edit' && d.editingLecturer && (
				<LecturerFormModal
					mode='edit'
					lecturer={d.editingLecturer}
					onClose={() => {
						d.setModal(null);
						d.setEditingLecturer(null);
					}}
					onSave={d.handleEdit}
					loading={d.loading}
				/>
			)}
			{d.modal === 'delete' && d.deletingLecturer && (
				<LecturerDeleteModal
					lecturer={d.deletingLecturer}
					onClose={() => {
						d.setModal(null);
						d.setDeletingLecturer(null);
					}}
					onConfirm={d.handleDelete}
					loading={d.loading}
				/>
			)}

		</AdminLayout>
	);
}
