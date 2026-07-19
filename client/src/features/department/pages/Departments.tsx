import {
	BookOpenSvg,
	CheckSvg,
	EditSvg,
	PlusSvg,
	SearchSvg,
	TrashSvg,
	UsersSvg,
	XSvg,
} from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { Pagination } from '../../../shared/components/Table/Pagination';
import { DeptDeleteModal } from '../components/DeptDeleteModal';
import { DeptFormModal } from '../components/DeptFormModal';
import { useDepartments } from '../hooks/useDepartments';
import styles from './Departments.module.css';

const PAGE_SIZE_OPTIONS = [5, 10, 25, 50, 0] as const;

const DEPT_COLORS = [
	{ bg: '#e1f5ee', color: '#085041' },
	{ bg: '#e6f1fb', color: '#0c447c' },
	{ bg: '#eeedfe', color: '#3c3489' },
	{ bg: '#faeeda', color: '#633806' },
	{ bg: '#fce8fb', color: '#6b1a69' },
	{ bg: '#f1efe8', color: '#444441' },
];
function getDeptColor(id: string) {
	let hash = 0;
	for (let i = 0; i < id.length; i++)
		hash = id.charCodeAt(i) + ((hash << 5) - hash);
	return DEPT_COLORS[Math.abs(hash) % DEPT_COLORS.length];
}
function getInitials(s: string) {
	const parts = s.trim().split(/\s+/);
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Departments() {
	const d = useDepartments();

	const headerActions = (
		<button
			className={styles.btnAddHeader}
			onClick={() => d.setModal('add')}
		>
			<PlusSvg /> Thêm khoa phòng
		</button>
	);

	return (
		<AdminLayout
			pageTitle='Quản lý Khoa Phòng'
			pageSubtitle='Danh sách khoa phòng và đơn vị trong bệnh viện'
			headerActions={headerActions}
		>
			{/* ── TOOLBAR ── */}
			<div className={styles.toolbar}>
				<div className={styles.searchBox}>
					<SearchSvg />
					<input
						className={styles.searchInput}
						placeholder='Tìm theo tên, mã, viết tắt...'
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
				<span className={styles.resultCount}>
					{d.filtered.length} khoa phòng
				</span>
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

			{/* ── TABLE ── */}
			<div className={styles.tableWrap}>
				<table className={styles.table}>
					<thead>
						<tr>
							<th className={styles.th}>#</th>
							<th className={styles.th}>Khoa phòng</th>
							<th className={styles.th}>Mã</th>
							<th className={styles.th}>Nhân sự</th>
							<th className={styles.th}>Đề tài</th>
							<th className={`${styles.th} ${styles.thRight}`}>Thao tác</th>
						</tr>
					</thead>
					<tbody>
						{d.isLoadingData ? (
							<tr>
								<td colSpan={6}>
									<div className={styles.emptyState}>
										<div className={styles.emptyDesc}>Đang tải dữ liệu...</div>
									</div>
								</td>
							</tr>
						) : d.filtered.length === 0 ? (
							<tr>
								<td colSpan={6}>
									<div className={styles.emptyState}>
										<div className={styles.emptyTitle}>
											Không tìm thấy khoa phòng
										</div>
										<div className={styles.emptyDesc}>
											Thử thay đổi từ khoá tìm kiếm
										</div>
									</div>
								</td>
							</tr>
						) : (
							d.paged.map((dept, i) => {
								const c = getDeptColor(dept.id);
								const rowNum =
									(d.safePage - 1) * (d.pageSize || d.filtered.length) + i + 1;
								return (
									<tr
										key={dept.id}
										className={styles.tr}
									>
										<td className={`${styles.td} ${styles.tdIdx}`}>{rowNum}</td>
										<td className={styles.td}>
											<div className={styles.deptCell}>
												<div
													className={styles.deptAvatar}
													style={{ background: c.bg, color: c.color }}
												>
													{getInitials(dept.abbreviation || dept.name)}
												</div>
												<span className={styles.deptName}>{dept.name}</span>
											</div>
										</td>
										<td className={styles.td}>
											<span className={styles.codeTag}>{dept.code}</span>
										</td>
										<td className={styles.td}>
											<div className={styles.statCell}>
												<UsersSvg />
												{dept.user_count ?? 0}
											</div>
										</td>
										<td className={styles.td}>
											<div className={styles.statCell}>
												<BookOpenSvg />
												{dept.topic_count ?? 0}
											</div>
										</td>
										<td className={`${styles.td} ${styles.tdActions}`}>
											<button
												className={`${styles.actionBtn} ${styles.actionEdit}`}
												title='Chỉnh sửa'
												onClick={() => {
													d.setEditingDept(dept);
													d.setModal('edit');
												}}
											>
												<EditSvg />
											</button>
											<button
												className={`${styles.actionBtn} ${styles.actionDelete}`}
												title='Xoá'
												onClick={() => {
													d.setDeletingDept(dept);
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

			{/* ── PAGINATION ── */}
			{d.filtered.length > 0 && d.totalPages > 1 && (
				<Pagination
					page={d.safePage}
					totalPages={d.totalPages}
					total={d.filtered.length}
					rowsPerPage={d.pageSize}
					pageSizeOptions={PAGE_SIZE_OPTIONS}
					onPageChange={d.setPage}
					onRowsPerPageChange={d.handlePageSize}
					itemLabel='khoa phòng'
					hideSizeSelect
				/>
			)}

			{/* ── MODALS ── */}
			{d.modal === 'add' && (
				<DeptFormModal
					mode='add'
					onClose={() => d.setModal(null)}
					onSave={d.handleAdd}
					loading={d.loading}
				/>
			)}
			{d.modal === 'edit' && d.editingDept && (
				<DeptFormModal
					mode='edit'
					dept={d.editingDept}
					onClose={() => {
						d.setModal(null);
						d.setEditingDept(null);
					}}
					onSave={d.handleEdit}
					loading={d.loading}
				/>
			)}
			{d.modal === 'delete' && d.deletingDept && (
				<DeptDeleteModal
					dept={d.deletingDept}
					onClose={() => {
						d.setModal(null);
						d.setDeletingDept(null);
					}}
					onConfirm={d.handleDelete}
					loading={d.loading}
				/>
			)}

			{/* ── TOAST ── */}
			{d.toast && (
				<div
					className={`${styles.toast} ${styles[`toast${d.toast.type.charAt(0).toUpperCase() + d.toast.type.slice(1)}` as keyof typeof styles]}`}
				>
					{d.toast.type === 'success' ? <CheckSvg /> : <XSvg />}
					{d.toast.msg}
				</div>
			)}
		</AdminLayout>
	);
}
