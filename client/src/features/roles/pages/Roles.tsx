import AdminLayout from '../../../layouts/AdminLayout';
import {
	CheckSvg,
	EditSvg,
	KeySvg,
	PlusSvg,
	SearchSvg,
	ShieldSvg,
	TrashSvg,
	UsersSvg,
	XSvg,
} from '@/assets/icons';
import { Pagination } from '../../../shared/components/Table/Pagination';
import { RoleDeleteModal, RoleFormModal } from '../components/RoleModals';
import { RolePermissionModal } from '../components/RolePermissionModal';
import { useRoles } from '../hooks/useRoles';
import styles from './Roles.module.css';

const PAGE_SIZE_OPTIONS = [5, 10, 25, 0] as const;

function getInitials(name: string) {
	const parts = name.trim().split(/\s+/);
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Roles() {
	const r = useRoles();

	const headerActions = (
		<button
			className={styles.btnAddHeader}
			onClick={() => r.setModal('add')}
		>
			<PlusSvg /> Thêm vai trò
		</button>
	);

	return (
		<AdminLayout
			pageTitle='Quản lý Vai trò & Quyền'
			pageSubtitle='Danh sách vai trò và phân quyền người dùng'
			headerActions={headerActions}
		>
			{/* Stats */}
			<div className={styles.statsRow}>
				<div className={styles.statCard}>
					<div className={`${styles.statIcon} ${styles.iconGreen}`}>
						<ShieldSvg />
					</div>
					<div className={styles.statBody}>
						<div className={styles.statValue}>{r.stats.total}</div>
						<div className={styles.statLabel}>Tổng vai trò</div>
					</div>
				</div>
				<div className={styles.statCard}>
					<div className={`${styles.statIcon} ${styles.iconBlue}`}>
						<UsersSvg />
					</div>
					<div className={styles.statBody}>
						<div className={styles.statValue}>{r.stats.totalUsers}</div>
						<div className={styles.statLabel}>Người dùng đã phân vai trò</div>
					</div>
				</div>
				<div className={styles.statCard}>
					<div className={`${styles.statIcon} ${styles.iconAmber}`}>
						<KeySvg />
					</div>
					<div className={styles.statBody}>
						<div className={styles.statValue}>{r.stats.withUsers}</div>
						<div className={styles.statLabel}>Vai trò đang được sử dụng</div>
					</div>
				</div>
			</div>

			{/* Toolbar */}
			<div className={styles.toolbar}>
				<div className={styles.searchBox}>
					<SearchSvg />
					<input
						className={styles.searchInput}
						placeholder='Tìm theo tên, mô tả...'
						value={r.search}
						onChange={(e) => {
							r.setSearch(e.target.value);
							r.setPage(1);
						}}
					/>
					{r.search && (
						<button
							className={styles.searchClear}
							onClick={() => {
								r.setSearch('');
								r.setPage(1);
							}}
						>
							<XSvg />
						</button>
					)}
				</div>
				<span className={styles.resultCount}>{r.filtered.length} vai trò</span>
				<div className={styles.pageSizeWrap}>
					<label className={styles.pageSizeLabel}>Hiển thị</label>
					<select
						className={styles.pageSizeSelect}
						value={r.pageSize}
						onChange={(e) => {
							r.setPageSize(Number(e.target.value));
							r.setPage(1);
						}}
					>
						<option value={5}>5</option>
						<option value={10}>10</option>
						<option value={25}>25</option>
						<option value={0}>Tất cả</option>
					</select>
					<span className={styles.pageSizeLabel}>dòng</span>
				</div>
			</div>

			{/* Table */}
			<div className={styles.tableWrap}>
				<table className={styles.table}>
					<thead>
						<tr>
							<th className={styles.th}>#</th>
							<th className={styles.th}>Vai trò</th>
							<th className={styles.th}>Mô tả</th>
							<th className={styles.th}>Người dùng</th>
							<th className={styles.th}>Quyền</th>
							<th className={styles.th}>Ngày tạo</th>
							<th className={`${styles.th} ${styles.thRight}`}>Thao tác</th>
						</tr>
					</thead>
					<tbody>
						{r.isLoadingData ? (
							<tr>
								<td colSpan={7}>
									<div className={styles.emptyState}>
										<div className={styles.emptyDesc}>Đang tải dữ liệu...</div>
									</div>
								</td>
							</tr>
						) : r.filtered.length === 0 ? (
							<tr>
								<td colSpan={7}>
									<div className={styles.emptyState}>
										<ShieldSvg className={styles.emptyIcon} />
										<p className={styles.emptyTitle}>
											{r.search
												? 'Không tìm thấy vai trò nào'
												: 'Chưa có vai trò nào'}
										</p>
										<p className={styles.emptyDesc}>
											{r.search
												? 'Thử thay đổi từ khoá tìm kiếm'
												: 'Nhấn "Thêm vai trò" để bắt đầu'}
										</p>
									</div>
								</td>
							</tr>
						) : (
							r.paged.map((role, i) => {
								const rowNum =
									(r.safePage - 1) * (r.pageSize || r.filtered.length) + i + 1;
								const pCount = r.permCountMap[role.id];
								return (
									<tr
										key={role.id}
										className={styles.tr}
									>
										<td className={`${styles.td} ${styles.tdIdx}`}>{rowNum}</td>
										<td className={styles.td}>
											<div className={styles.roleCell}>
												<div className={styles.roleAvatar}>
													{getInitials(role.name)}
												</div>
												<div>
													<div className={styles.roleName}>{role.name}</div>
													<div className={styles.roleId}>{role.id}</div>
												</div>
											</div>
										</td>
										<td className={styles.td}>
											<span className={styles.descText}>
												{role.description ?? (
													<span style={{ color: 'var(--color-gray-300)' }}>
														—
													</span>
												)}
											</span>
										</td>
										<td className={styles.td}>
											<div className={styles.statCell}>
												<UsersSvg />
												{role.user_count ?? 0} người
											</div>
										</td>
										<td className={styles.td}>
											{pCount !== undefined ? (
												<span
													style={{
														display: 'inline-flex',
														alignItems: 'center',
														gap: 4,
														padding: '2px 9px',
														borderRadius: 'var(--radius-full)',
														background:
															pCount > 0 ? '#eeedfe' : 'var(--color-gray-100)',
														color:
															pCount > 0 ? '#3c3489' : 'var(--color-gray-400)',
														fontSize: 11,
														fontWeight: 600,
													}}
												>
													<KeySvg />
													{pCount} quyền
												</span>
											) : (
												<span
													style={{
														fontSize: 12,
														color: 'var(--color-gray-300)',
													}}
												>
													Chưa xem
												</span>
											)}
										</td>
										<td className={styles.td}>
											<span className={styles.dateText}>{role.created_at}</span>
										</td>
										<td className={`${styles.td} ${styles.tdActions}`}>
											<button
												className={`${styles.actionBtn} ${styles.actionPerm}`}
												title='Phân quyền'
												onClick={() => {
													r.setPermRole(role);
													r.setModal('permissions');
												}}
											>
												<KeySvg />
											</button>
											<button
												className={`${styles.actionBtn} ${styles.actionEdit}`}
												title='Chỉnh sửa'
												onClick={() => {
													r.setEditingRole(role);
													r.setModal('edit');
												}}
											>
												<EditSvg />
											</button>
											<button
												className={`${styles.actionBtn} ${styles.actionDelete}`}
												title='Xoá'
												onClick={() => {
													r.setDeletingRole(role);
													r.setModal('delete');
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

			{/* Pagination */}
			{r.filtered.length > 0 && r.totalPages > 1 && (
				<Pagination
					page={r.safePage}
					totalPages={r.totalPages}
					total={r.filtered.length}
					rowsPerPage={r.pageSize}
					pageSizeOptions={PAGE_SIZE_OPTIONS}
					onPageChange={r.setPage}
					onRowsPerPageChange={(n) => {
						r.setPageSize(n);
						r.setPage(1);
					}}
					itemLabel='vai trò'
					hideSizeSelect
				/>
			)}

			{/* Modals */}
			{r.modal === 'add' && (
				<RoleFormModal
					mode='add'
					onClose={() => r.setModal(null)}
					onSave={r.handleAdd}
					loading={r.loading}
				/>
			)}
			{r.modal === 'edit' && r.editingRole && (
				<RoleFormModal
					mode='edit'
					role={r.editingRole}
					onClose={() => {
						r.setModal(null);
						r.setEditingRole(null);
					}}
					onSave={r.handleEdit}
					loading={r.loading}
				/>
			)}
			{r.modal === 'delete' && r.deletingRole && (
				<RoleDeleteModal
					role={r.deletingRole}
					onClose={() => {
						r.setModal(null);
						r.setDeletingRole(null);
					}}
					onConfirm={r.handleDelete}
					loading={r.loading}
				/>
			)}
			{r.modal === 'permissions' && r.permRole && (
				<RolePermissionModal
					role={r.permRole}
					onClose={() => {
						r.setModal(null);
						r.setPermRole(null);
					}}
					onSaved={r.handlePermSaved}
				/>
			)}

			{/* Toast */}
			{r.toast && (
				<div
					className={`${styles.toast} ${styles[`toast${r.toast.type.charAt(0).toUpperCase() + r.toast.type.slice(1)}` as keyof typeof styles]}`}
				>
					{r.toast.type === 'success' ? <CheckSvg /> : <XSvg />}
					{r.toast.msg}
				</div>
			)}
		</AdminLayout>
	);
}
