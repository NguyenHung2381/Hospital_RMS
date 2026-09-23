import {
	CheckSvg,
	ChevDSvg,
	InfoSvg,
	KeySvg,
	SearchSvg,
	XSvg,
} from '@/assets/icons';
import { EmptyState } from '@/shared/components';
import AdminLayout from '../../../layouts/AdminLayout';
import { ResetPasswordModal } from '../components/ResetPasswordModal';
import { UserDeleteModal } from '../components/UserDeleteModal';
import { UserModal } from '../components/UserModal';
import { UserStatsRow } from '../components/UserStatsRow';
import { UserTable } from '../components/UserTable';
import { useUserList } from '../hooks/useUserList';
import styles from './UserList.module.css';

export default function UserList() {
	const d = useUserList();

	const headerActions = (
		<button
			className={styles.btnGrantHeader}
			onClick={() => d.setShowCreate(true)}
		>
			<KeySvg /> Cấp tài khoản
		</button>
	);


	if (d.loadError) {
		return (
			<AdminLayout
				pageTitle='Quản lý người dùng'
				pageSubtitle='Quản lý tài khoản cán bộ, nhân viên'
				headerActions={headerActions}
			>
				<EmptyState
					icon={<InfoSvg />}
					title='Không tải được dữ liệu'
					desc={d.loadError}
				/>
			</AdminLayout>
		);
	}

	return (
		<AdminLayout
			pageTitle='Quản lý người dùng'
			pageSubtitle='Quản lý tài khoản cán bộ, nhân viên'
			headerActions={headerActions}
		>
			{/* ── GLOBAL STATS ── */}
			<UserStatsRow
				total={d.globalStats.total}
				active={d.globalStats.active}
				inactive={d.globalStats.inactive}
				pwdWarn={d.globalStats.pwdWarn}
				loading={d.isLoadingData}
			/>

			{/* ── TABLE CARD ── */}
			<div className={styles.tableCard}>
				<div className={styles.tableHeader}>
					<div className={styles.tableHeaderLeft}>
						<span className={styles.tableTitle}>Danh sách người dùng</span>
						<span className={styles.tableCount}>
							{d.totalCount} tài khoản
						</span>
					</div>
					<div className={styles.tableControls}>
						<div className={styles.searchBox}>
							<SearchSvg className={styles.searchIcon} />
							<input
								className={styles.searchInput}
								placeholder='Tìm theo tên, username, email...'
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

						{/* Multi-select Dept */}
						<div
							className='dept-dropdown-container'
							style={{ position: 'relative' }}
						>
							<button
								className={`${styles.filterSelect} ${d.deptFilters.length > 0 ? styles.filterActive : ''}`}
								onClick={() => d.setIsDeptDropdownOpen(!d.isDeptDropdownOpen)}
							>
								Khoa/Phòng{' '}
								{d.deptFilters.length > 0 ? `(${d.deptFilters.length})` : ''}
								<ChevDSvg
									style={{
										width: 14,
										marginLeft: 4,
										transform: d.isDeptDropdownOpen ? 'rotate(180deg)' : 'none',
										transition: 'transform 0.2s',
									}}
								/>
							</button>
							{d.isDeptDropdownOpen && (
								<div
									style={{
										position: 'absolute',
										top: 'calc(100% + 4px)',
										right: 0,
										width: 300,
										maxHeight: 350,
										overflowY: 'auto',
										background: 'var(--color-white)',
										border: '1px solid var(--color-gray-200)',
										borderRadius: 8,
										boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
										zIndex: 100,
										display: 'flex',
										flexDirection: 'column',
										padding: 8,
										gap: 4,
									}}
								>
									{d.departments.map((dept) => (
										<label
											key={dept.id}
											style={{
												display: 'flex',
												alignItems: 'center',
												gap: 8,
												padding: '6px 8px',
												cursor: 'pointer',
												borderRadius: 4,
											}}
											onMouseEnter={(e) =>
												(e.currentTarget.style.background =
													'var(--color-gray-50)')
											}
											onMouseLeave={(e) =>
												(e.currentTarget.style.background = 'transparent')
											}
										>
											<input
												type='checkbox'
												checked={d.deptFilters.includes(dept.id)}
												onChange={(e) => {
													if (e.target.checked)
														d.setDeptFilters((p) => [...p, dept.id]);
													else
														d.setDeptFilters((p) =>
															p.filter((id) => id !== dept.id),
														);
													d.setCurrentPage(1);
												}}
												style={{
													cursor: 'pointer',
													accentColor: 'var(--color-primary)',
												}}
											/>
											<span
												style={{
													fontSize: 13,
													color: 'var(--color-gray-800)',
													flex: 1,
												}}
											>
												{dept.name}
											</span>
											<span
												style={{
													fontSize: 11,
													color: 'var(--color-gray-400)',
													background: 'var(--color-gray-100)',
													padding: '2px 6px',
													borderRadius: 10,
												}}
											>
												{d.deptCounts[dept.id] ?? 0}
											</span>
										</label>
									))}
								</div>
							)}
						</div>
					</div>
				</div>

				<div className={styles.tabsRow}>
					<div
						className={`${styles.tab} ${d.roleFilters.length === 0 ? styles.tabActive : ''}`}
						onClick={() => {
							d.setRoleFilters([]);
							d.setCurrentPage(1);
						}}
					>
						Tất cả vai trò
						<span className={styles.tabBadge}>
							{Object.values(d.roleCounts).reduce((a, b) => a + b, 0)}
						</span>
					</div>
					{d.roles.map((r) => (
						<div
							key={r.id}
							className={`${styles.tab} ${d.roleFilters.includes(r.id) ? styles.tabActive : ''}`}
							onClick={() => {
								d.setRoleFilters((prev) =>
									prev.includes(r.id)
										? prev.filter((v) => v !== r.id)
										: [...prev, r.id],
								);
								d.setCurrentPage(1);
							}}
						>
							{r.name}
							<span className={styles.tabBadge}>
								{d.roleCounts[r.id] ?? 0}
							</span>
						</div>
					))}
				</div>

				{/* USER TABLE */}
				<UserTable
					users={d.users}
					totalCount={d.totalCount}
					currentPage={d.currentPage}
					pageSize={d.pageSize}
					totalPages={d.totalPages}
					search={d.search}
					roleFilters={d.roleFilters}
					deptFilters={d.deptFilters}
					getRoleName={d.getRoleName}
					getDeptName={d.getDeptName}
					setEditUser={d.setEditUser}
					setDeleteUser={d.setDeleteUser}
					setResetUser={d.setResetUser}
					setCurrentPage={d.setCurrentPage}
					setPageSize={d.setPageSize}
					handleToggleActive={d.handleToggleActive}
					setShowCreate={d.setShowCreate}
					loading={d.isLoadingData}
					departments={d.departments}
					roles={d.roles}
					handleBulkDelete={d.handleBulkDelete}
					handleBulkEdit={d.handleBulkEdit}
				/>
			</div>

			{/* ── MODALS ── */}
			{d.showCreate && (
				<UserModal
					mode='create'
					departments={d.departments}
					roles={d.roles}
					defaultDeptId={d.departments[0]?.id ?? ''}
					onClose={() => d.setShowCreate(false)}
					onSave={d.handleCreate}
				/>
			)}
			{d.editUser && (
				<UserModal
					mode='edit'
					user={d.editUser}
					departments={d.departments}
					roles={d.roles}
					onClose={() => d.setEditUser(null)}
					onSave={d.handleEdit}
				/>
			)}
			{d.deleteUser && (
				<UserDeleteModal
					user={d.deleteUser}
					onClose={() => d.setDeleteUser(null)}
					onConfirm={d.handleDelete}
				/>
			)}
			{d.resetUser && (
				<ResetPasswordModal
					user={d.resetUser}
					onClose={() => d.setResetUser(null)}
					onConfirm={d.handleResetPassword}
				/>
			)}

			{/* ── TOAST ── */}
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
		</AdminLayout>
	);
}
