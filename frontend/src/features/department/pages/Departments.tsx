import { useState } from 'react';
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
import { SkeletonTable } from '../../../shared/components/Loading';
import { Pagination } from '../../../shared/components/Table/Pagination';
import sel from '../../../shared/components/Table/RowSelect.module.css';
import {
	BulkButton,
	BulkDeleteModal,
	SelectCheckbox,
} from '../../../shared/components/Table/RowSelect';
import { useRowSelection } from '../../../shared/hooks/useRowSelection';
import { DeptDeleteModal } from '../components/DeptDeleteModal';
import { DeptFormModal } from '../components/DeptFormModal';
import { useDepartments } from '../hooks/useDepartments';
import styles from './Departments.module.css';

const PAGE_SIZE_OPTIONS = [5, 10, 25, 50, 0] as const;

const DEPT_COLORS = [
	{ bg: '#e1f5ea', color: '#085028' },
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
	const rowSel = useRowSelection(d.paged.map((x) => x.id));
	const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

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
			{/* ── TABLE CARD ── */}
			<div className={styles.tableCard}>
				<div className={styles.tableHeader}>
					<div className={styles.tableHeaderLeft}>
						<span className={styles.tableTitle}>Danh sách khoa phòng</span>
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
								{d.total} khoa phòng
							</span>
						)}
					</div>
					<div className={styles.tableControls}>
						<div className={styles.searchBox}>
							<SearchSvg className={styles.searchIcon} />
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
								<th className={styles.th}>Khoa phòng</th>
								<th className={styles.th}>Mã</th>
								<th className={styles.th}>Nhân sự</th>
								<th className={styles.th}>Đề tài</th>
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
										(d.safePage - 1) * (d.pageSize || d.total) + i + 1;
									return (
										<tr
											key={dept.id}
											className={`${styles.tr} ${rowSel.isSelected(dept.id) ? sel.rowSelected : ''}`}
										>
											<td className={sel.checkCol}>
												<SelectCheckbox
													title='Chọn khoa phòng'
													checked={rowSel.isSelected(dept.id)}
													onChange={() => rowSel.toggleSelect(dept.id)}
												/>
											</td>
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
												<div className={styles.actionBtns}>
													<div
														className={styles.actionBtn}
														title='Chỉnh sửa'
														onClick={() => {
															d.setEditingDept(dept);
															d.setModal('edit');
														}}
													>
														<EditSvg />
													</div>
													<div
														className={`${styles.actionBtn} ${styles.danger}`}
														title='Xoá'
														onClick={() => {
															d.setDeletingDept(dept);
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

				<Pagination
					page={d.safePage}
					totalPages={d.totalPages}
					total={d.total}
					rowsPerPage={d.pageSize}
					pageSizeOptions={PAGE_SIZE_OPTIONS}
					onPageChange={d.setPage}
					onRowsPerPageChange={d.handlePageSize}
					itemLabel='khoa phòng'
					hideSizeSelect
				/>
			</div>

			<BulkDeleteModal
				open={confirmBulkDelete}
				count={rowSel.selectedCount}
				itemLabel='khoa phòng'
				loading={d.loading}
				onClose={() => setConfirmBulkDelete(false)}
				onConfirm={async () => {
					await d.handleBulkDelete([...rowSel.selectedIds]);
					rowSel.clearSelection();
					setConfirmBulkDelete(false);
				}}
			/>

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
