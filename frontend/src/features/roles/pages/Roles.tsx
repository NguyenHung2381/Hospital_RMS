import { SelectionCount } from '@/shared/components/Table/TableToolbar';
import { Badge } from '@/shared/components';
import AdminLayout from '../../../layouts/AdminLayout';
import {
	CopySvg,
	EditSvg,
	KeySvg,
	LayersSvg,
	PlusSvg,
	SearchSvg,
	ShieldSvg,
	TrashSvg,
	UserCheckSvg,
	UsersSvg,
	XSvg,
} from '@/assets/icons';
import { usePermission } from '../../../shared/hooks/usePermission';
import { SkeletonTable } from '../../../shared/components/Loading';
import { Pagination } from '../../../shared/components/Table/Pagination';
import sel from '../../../shared/components/Table/RowSelect.module.css';
import { SelectCheckbox } from '../../../shared/components/Table/RowSelect';
import { useRowSelection } from '../../../shared/hooks/useRowSelection';
import { RoleDeleteModal, RoleFormModal } from '../components/RoleModals';
import { RolePermissionModal } from '../components/RolePermissionModal';
import { RoleUsersModal } from '../components/RoleUsersModal';
import { RoleCompareModal } from '../components/RoleCompareModal';
import { UserPermissionsModal } from '../components/UserPermissionsModal';
import { useRoles } from '../hooks/useRoles';
import { formatDateVN } from '../../../shared/utils/formatDate';
import styles from './Roles.module.css';
import tbl from '@/shared/components/Table/Table.module.css';

function getInitials(name: string) {
	const parts = name.trim().split(/\s+/);
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Roles() {
	const r = useRoles();
	const rowSel = useRowSelection(r.paged.map((x) => x.id));
	const { has } = usePermission();
	// Nhân bản = tạo vai trò + cấp quyền cho nó → cần cả 2 quyền (khớp backend)
	const canClone = has('roles:create') && has('roles:manage');

	const headerActions = (
		<div className={styles.headerBtns}>
			{has('users:read') && (
				<button className={styles.btnSecondaryHeader} onClick={() => r.setModal('userPermissions')}>
					<UserCheckSvg /> Tra cứu quyền người dùng
				</button>
			)}
			<button className={styles.btnSecondaryHeader} onClick={() => r.setModal('compare')}>
				<LayersSvg /> So sánh vai trò
			</button>
			<button
				className={styles.btnAddHeader}
				onClick={() => r.setModal('add')}
			>
				<PlusSvg /> Thêm vai trò
			</button>
		</div>
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

			{/* ── TABLE CARD ── */}
			<div className={styles.tableCard}>
				<div className={styles.tableHeader}>
					<div className={styles.tableHeaderLeft}>
						<span className={styles.tableTitle}>Danh sách vai trò</span>
						<SelectionCount
							rowSel={rowSel}
							itemLabel='vai trò'
							loading={r.loading}
							onBulkDelete={r.handleBulkDelete}
						>
							{r.total} vai trò
						</SelectionCount>
					</div>
					<div className={styles.tableControls}>
						<div className={styles.searchBox}>
							<SearchSvg className={styles.searchIcon} />
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
							<SkeletonTable
								rows={r.pageSize || 8}
								cols={8}
							/>
						) : r.total === 0 ? (
							<tr>
								<td colSpan={8}>
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
									(r.safePage - 1) * (r.pageSize || r.total) + i + 1;
								const pCount =
									r.permCountMap[role.id] ?? role.permission_count;
								return (
									<tr
										key={role.id}
										className={`${styles.tr} ${rowSel.isSelected(role.id) ? sel.rowSelected : ''}`}
									>
										<td className={sel.checkCol}>
											<SelectCheckbox
												title='Chọn vai trò'
												checked={rowSel.isSelected(role.id)}
												onChange={() => rowSel.toggleSelect(role.id)}
											/>
										</td>
										<td className={`${styles.td} ${styles.tdIdx}`}>{rowNum}</td>
										<td className={styles.td}>
											<div className={styles.roleCell}>
												<div className={styles.roleAvatar}>
													{getInitials(role.name)}
												</div>
												<div>
													<div className={styles.roleName}>
														{role.name}
														{role.is_superuser && (
															<Badge tone='red' style={{ marginLeft: 6 }} title='Bỏ qua mọi kiểm tra phân quyền'>
																Toàn quyền
															</Badge>
														)}
														{role.is_system && (
															<Badge tone='gray' style={{ marginLeft: 6 }} title='Vai trò gốc của hệ thống — không xoá được'>
																Hệ thống
															</Badge>
														)}
													</div>
													<div className={styles.roleId}>
														{role.id}
														{role.code ? ` · ${role.code}` : ''}
													</div>
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
											<button
												type='button'
												className={`${styles.statCell} ${styles.statCellLink}`}
												title='Xem danh sách người dùng mang vai trò này'
												disabled={!has('users:read')}
												onClick={() => {
													r.setActionRole(role);
													r.setModal('users');
												}}
											>
												<UsersSvg />
												{role.user_count ?? 0} người
											</button>
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
														whiteSpace: 'nowrap',
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
											<span className={styles.dateText}>{formatDateVN(role.created_at)}</span>
										</td>
										<td className={`${styles.td} ${styles.tdActions}`}>
											<div className={styles.actionBtns}>
												<div
													className={`${styles.actionBtn} ${styles.actionPerm}`}
													title='Phân quyền'
													onClick={() => {
														r.setPermRole(role);
														r.setModal('permissions');
													}}
												>
													<KeySvg />
												</div>
												{canClone && (
													<div
														className={styles.actionBtn}
														title='Nhân bản (vai trò mới cùng quyền)'
														onClick={() => {
															r.setActionRole(role);
															r.setModal('clone');
														}}
													>
														<CopySvg />
													</div>
												)}
												<div
													className={styles.actionBtn}
													title='Chỉnh sửa'
													onClick={() => {
														r.setEditingRole(role);
														r.setModal('edit');
													}}
												>
													<EditSvg />
												</div>
												{!role.is_system && (
													<div
														className={`${styles.actionBtn} ${styles.danger}`}
														title='Xoá'
														onClick={() => {
															r.setDeletingRole(role);
															r.setModal('delete');
														}}
													>
														<TrashSvg />
													</div>
												)}
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
					page={r.safePage}
					totalPages={r.totalPages}
					total={r.total}
					rowsPerPage={r.pageSize}
					onPageChange={r.setPage}
					onRowsPerPageChange={(n) => {
						r.setPageSize(n);
						r.setPage(1);
					}}
					itemLabel='vai trò'
				/>
			</div>


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

			{r.modal === 'clone' && r.actionRole && (
				<RoleFormModal
					mode='clone'
					role={r.actionRole}
					onClose={() => {
						r.setModal(null);
						r.setActionRole(null);
					}}
					onSave={r.handleClone}
					loading={r.loading}
				/>
			)}
			{r.modal === 'users' && r.actionRole && (
				<RoleUsersModal
					role={r.actionRole}
					onClose={() => {
						r.setModal(null);
						r.setActionRole(null);
					}}
				/>
			)}
			{r.modal === 'compare' && <RoleCompareModal onClose={() => r.setModal(null)} />}
			{r.modal === 'userPermissions' && (
				<UserPermissionsModal onClose={() => r.setModal(null)} />
			)}

		</AdminLayout>
	);
}
