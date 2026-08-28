import React from 'react';
import {
	CheckSvg,
	EditSvg,
	InfoSvg,
	KeySvg,
	SearchSvg,
	TrashSvg,
	UsersSvg,
	XSvg,
} from '@/assets/icons';
import UserLayout from '../../../layouts/UserLayout';
import sel from '../../../shared/components/Table/RowSelect.module.css';
import {
	BulkButton,
	BulkDeleteModal,
	SelectCheckbox,
	SelectionBar,
} from '../../../shared/components/Table/RowSelect';
import { useRowSelection } from '../../../shared/hooks/useRowSelection';
import {
	DeptAccountsDeleteModal,
	DeptAccountsResetPasswordModal,
} from '../components/DeptAccountsConfirmModals';
import { DeptAccountsEditModal } from '../components/DeptAccountsEditModal';
import { useDepartmentAccounts } from '../hooks/useDepartmentAccounts';
import { getInitials } from '../../../shared/utils/helper';
import { roleCfg } from '../utils/deptAccountsHelpers';
import styles from './DepartmentAccounts.module.css';

function Badge({
	cls,
	children,
	dot,
}: {
	cls: string;
	children: React.ReactNode;
	dot?: boolean;
}) {
	return (
		<span className={`${styles.badge} ${styles[cls as keyof typeof styles]}`}>
			{dot && <span className={styles.badgeDot} />}
			{children}
		</span>
	);
}

function Avatar({
	name,
	cls,
	size = 'md',
}: {
	name: string;
	cls: string;
	size?: 'sm' | 'md';
}) {
	const sizeCls = size === 'sm' ? styles.avatarSm : styles.avatarMd;
	return (
		<div
			className={`${styles.avatar} ${styles[cls as keyof typeof styles]} ${sizeCls}`}
		>
			{getInitials(name)}
		</div>
	);
}

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
	return (
		<button
			type='button'
			className={`${styles.toggleTrack} ${on ? styles.on : ''}`}
			onClick={onChange}
			aria-pressed={on}
		>
			<span className={styles.toggleThumb} />
		</button>
	);
}

export default function DepartmentAccounts() {
	const d = useDepartmentAccounts();
	const rowSel = useRowSelection((d.filteredUsers ?? []).map((u) => u.id));
	const [bulkDeleteOpen, setBulkDeleteOpen] = React.useState(false);
	const [bulkBusy, setBulkBusy] = React.useState(false);
	const runBulkAction = async (fn: () => Promise<void>) => {
		setBulkBusy(true);
		try {
			await fn();
			rowSel.clearSelection();
			setBulkDeleteOpen(false);
		} finally {
			setBulkBusy(false);
		}
	};

	if (d.isLoading) {
		return (
			<UserLayout
				pageTitle='Tài khoản trong khoa'
				pageSubtitle={d.deptName}
			>
				<div className={styles.emptyState}>
					<div className={styles.emptyIcon}>
						<UsersSvg />
					</div>
					<div className={styles.emptyTitle}>Đang tải dữ liệu...</div>
				</div>
			</UserLayout>
		);
	}

	if (d.loadError) {
		return (
			<UserLayout
				pageTitle='Tài khoản trong khoa'
				pageSubtitle={d.deptName}
			>
				<div className={styles.emptyState}>
					<div className={styles.emptyIcon}>
						<InfoSvg />
					</div>
					<div className={styles.emptyTitle}>Không tải được dữ liệu</div>
					<div className={styles.emptyDesc}>{d.loadError}</div>
				</div>
			</UserLayout>
		);
	}

	return (
		<UserLayout
			pageTitle='Tài khoản trong khoa'
			pageSubtitle={`Xem và quản lý tài khoản — ${d.deptName}`}
		>
			{/* Stats */}
			<div className={styles.statsRow}>
				<div className={`${styles.statCard} ${styles.statGreen}`}>
					<div className={`${styles.statIcon} ${styles.iconGreen}`}>
						<UsersSvg />
					</div>
					<div className={styles.statBody}>
						<div className={styles.statValue}>{d.stats.total}</div>
						<div className={styles.statLabel}>Tổng tài khoản</div>
					</div>
				</div>
				<div className={`${styles.statCard} ${styles.statBlue}`}>
					<div className={`${styles.statIcon} ${styles.iconBlue}`}>
						<CheckSvg />
					</div>
					<div className={styles.statBody}>
						<div className={styles.statValue}>{d.stats.active}</div>
						<div className={styles.statLabel}>Đang hoạt động</div>
					</div>
				</div>
				<div className={`${styles.statCard} ${styles.statAmber}`}>
					<div className={`${styles.statIcon} ${styles.iconAmber}`}>
						<XSvg />
					</div>
					<div className={styles.statBody}>
						<div className={styles.statValue}>{d.stats.locked}</div>
						<div className={styles.statLabel}>Tạm khoá</div>
					</div>
				</div>
			</div>

			{/* Panel */}
			<div className={styles.panel}>
				{/* Toolbar */}
				<div className={styles.toolbar}>
					<div className={styles.toolbarLeft}>
						<div className={styles.searchBox}>
							<SearchSvg />
							<input
								className={styles.searchInput}
								placeholder='Tìm theo tên, username, email, mã NV...'
								value={d.search}
								onChange={(e) => d.setSearch(e.target.value)}
							/>
							{d.search && (
								<button
									className={styles.searchClear}
									onClick={() => d.setSearch('')}
								>
									<XSvg />
								</button>
							)}
						</div>
						<div className={styles.roleFilters}>
							<button
								className={`${styles.roleFilterBtn} ${d.roleFilter === 'all' ? styles.roleFilterActive : ''}`}
								onClick={() => d.setRoleFilter('all')}
							>
								Tất cả
								<span className={styles.roleFilterCount}>{d.users.length}</span>
							</button>
							{d.roles.map((t) => (
								<button
									key={t.id}
									className={`${styles.roleFilterBtn} ${d.roleFilter === t.id ? styles.roleFilterActive : ''}`}
									onClick={() => d.setRoleFilter(t.id)}
								>
									{t.name}
									<span className={styles.roleFilterCount}>
										{d.users.filter((u) => u.role_id === t.id).length}
									</span>
								</button>
							))}
						</div>
					</div>
					<div className={styles.toolbarRight}>
						<span className={styles.resultCount}>
							{d.filteredUsers.length} tài khoản
						</span>
					</div>
				</div>

				{/* Table */}
				<div className={styles.tableWrap}>
					{d.filteredUsers.length === 0 ? (
						<div className={styles.emptyState}>
							<div className={styles.emptyIcon}>
								<UsersSvg />
							</div>
							<div className={styles.emptyTitle}>
								{d.search || d.roleFilter !== 'all'
									? 'Không tìm thấy kết quả'
									: 'Chưa có tài khoản trong khoa'}
							</div>
							<div className={styles.emptyDesc}>
								{d.search || d.roleFilter !== 'all'
									? 'Thử thay đổi bộ lọc hoặc từ khoá tìm kiếm'
									: 'Liên hệ quản trị viên để cấp tài khoản'}
							</div>
						</div>
					) : (
						<>
						<SelectionBar
							count={rowSel.selectedCount}
							onClear={rowSel.clearSelection}
							itemLabel='tài khoản'
							actions={
								<>
									<BulkButton
										disabled={bulkBusy}
										onClick={() =>
											runBulkAction(() =>
												d.handleBulkSetActive([...rowSel.selectedIds], true),
											)
										}
									>
										<CheckSvg /> Kích hoạt
									</BulkButton>
									<BulkButton
										disabled={bulkBusy}
										onClick={() =>
											runBulkAction(() =>
												d.handleBulkSetActive([...rowSel.selectedIds], false),
											)
										}
									>
										<XSvg /> Khoá
									</BulkButton>
									<BulkButton
										danger
										disabled={bulkBusy}
										onClick={() => setBulkDeleteOpen(true)}
									>
										<TrashSvg /> Xoá đã chọn
									</BulkButton>
								</>
							}
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
									<th className={styles.th}>Người dùng</th>
									<th className={styles.th}>Đăng nhập / Mã NV</th>
									<th className={styles.th}>Vai trò</th>
									<th className={styles.th}>Loại TK</th>
									<th className={styles.th}>Trạng thái</th>
									<th className={styles.th}>Ngày tạo</th>
									<th className={`${styles.th} ${styles.thRight}`}>Thao tác</th>
								</tr>
							</thead>
							<tbody>
								{d.filteredUsers.map((u, i) => {
									const typeCfg = roleCfg(u.role_id);
									return (
										<tr
											key={u.id}
											className={`${styles.tr} ${rowSel.isSelected(u.id) ? sel.rowSelected : ''}`}
										>
											<td className={sel.checkCol}>
												<SelectCheckbox
													title='Chọn tài khoản'
													checked={rowSel.isSelected(u.id)}
													onChange={() => rowSel.toggleSelect(u.id)}
												/>
											</td>
											<td className={`${styles.td} ${styles.tdIdx}`}>
												{i + 1}
											</td>
											<td className={styles.td}>
												<div className={styles.memberCell}>
													<Avatar
														name={u.full_name}
														cls={typeCfg.avatarCls}
													/>
													<div>
														<div className={styles.memberName}>
															{u.full_name}
														</div>
														<div className={styles.memberId}>{u.id}</div>
													</div>
												</div>
											</td>
											<td className={styles.td}>
												<div>
													<div className={styles.usernameText}>
														{u.username}
													</div>
													<div className={styles.staffNum}>
														MNV: {u.staff_number ?? '—'}
													</div>
												</div>
											</td>
											<td className={styles.td}>
												<span className={styles.roleText}>
													{d.getRoleName(u.role_id)}
												</span>
											</td>
											<td className={styles.td}>
												<Badge
													cls={typeCfg.cls}
													dot
												>
													{typeCfg.label}
												</Badge>
											</td>
											<td className={styles.td}>
												<div className={styles.statusToggle}>
													<Toggle
														on={u.is_active}
														onChange={() => void d.handleToggleActive(u.id)}
													/>
													<span
														style={{
															fontSize: 11,
															fontWeight: 600,
															color: u.is_active
																? 'var(--color-primary-dark)'
																: 'var(--color-gray-400)',
														}}
													>
														{u.is_active ? 'Hoạt động' : 'Khoá'}
													</span>
												</div>
											</td>
											<td className={styles.td}>
												<span className={styles.dateText}>
													{d.formatDate(u.created_at)}
												</span>
											</td>
											<td className={`${styles.td} ${styles.tdActions}`}>
												<button
													className={`${styles.actionBtn} ${styles.actionEdit}`}
													title='Chỉnh sửa'
													onClick={() => d.setEditUser(u)}
												>
													<EditSvg />
												</button>
												<button
													className={styles.actionBtn}
													title='Đặt lại mật khẩu về 123456'
													onClick={() => d.setResetUser(u)}
													style={{ color: '#b45309' }}
												>
													<KeySvg />
												</button>
												<button
													className={`${styles.actionBtn} ${styles.actionDelete}`}
													title='Xoá'
													onClick={() => d.setDeleteUser(u)}
												>
													<TrashSvg />
												</button>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
						</>
					)}
				</div>
			</div>

			{/* Modals */}
			{d.editUser && (
				<DeptAccountsEditModal
					user={d.editUser}
					deptName={d.deptName}
					onClose={() => d.setEditUser(null)}
					onSave={d.handleEdit}
				/>
			)}
			{d.deleteUser && (
				<DeptAccountsDeleteModal
					user={d.deleteUser}
					onClose={() => d.setDeleteUser(null)}
					onConfirm={d.handleDelete}
				/>
			)}
			{d.resetUser && (
				<DeptAccountsResetPasswordModal
					user={d.resetUser}
					onClose={() => d.setResetUser(null)}
					onConfirm={d.handleResetPassword}
				/>
			)}
			<BulkDeleteModal
				open={bulkDeleteOpen}
				count={rowSel.selectedCount}
				itemLabel='tài khoản'
				loading={bulkBusy}
				onClose={() => setBulkDeleteOpen(false)}
				onConfirm={() =>
					runBulkAction(() =>
						d.handleBulkDelete([...rowSel.selectedIds]),
					)
				}
			/>

			{/* Toast */}
			{d.toast && (
				<div
					className={`${styles.toast} ${styles[`toast${d.toast.type.charAt(0).toUpperCase() + d.toast.type.slice(1)}` as keyof typeof styles]}`}
				>
					{d.toast.type === 'success' && <CheckSvg />}
					{d.toast.type === 'error' && <XSvg />}
					{d.toast.type === 'info' && <InfoSvg />}
					{d.toast.msg}
				</div>
			)}
		</UserLayout>
	);
}
