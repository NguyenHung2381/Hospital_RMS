import { CheckSvg, EditSvg, PlusSvg, SearchSvg, TrashSvg, XSvg } from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { SkeletonTable } from '../../../shared/components/Loading';
import { Pagination } from '../../../shared/components/Table/Pagination';
import sel from '../../../shared/components/Table/RowSelect.module.css';
import { BulkBar, SelectCheckbox } from '../../../shared/components/Table/RowSelect';
import { useRowSelection } from '../../../shared/hooks/useRowSelection';
import { LecturerDeleteModal } from '../components/LecturerDeleteModal';
import { LecturerFormModal } from '../components/LecturerFormModal';
import { useLecturers } from '../hooks/useLecturers';
import styles from './Lecturers.module.css';

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
			<div className={styles.toolbar}>
				<div className={styles.searchBox}>
					<SearchSvg />
					<input
						className={styles.searchInput}
						placeholder='Tìm theo tên, chuyên môn, email...'
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
				<span className={styles.resultCount}>{d.filtered.length} giảng viên</span>
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
					itemLabel='giảng viên'
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
						) : d.filtered.length === 0 ? (
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
								const c = getColor(l.id);
								const rowNum = (d.safePage - 1) * (d.pageSize || d.filtered.length) + i + 1;
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
											<button
												className={`${styles.actionBtn} ${styles.actionEdit}`}
												title='Chỉnh sửa'
												onClick={() => {
													d.setEditingLecturer(l);
													d.setModal('edit');
												}}
											>
												<EditSvg />
											</button>
											<button
												className={`${styles.actionBtn} ${styles.actionDelete}`}
												title='Xoá'
												onClick={() => {
													d.setDeletingLecturer(l);
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
					itemLabel='giảng viên'
					hideSizeSelect
				/>
			)}

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
