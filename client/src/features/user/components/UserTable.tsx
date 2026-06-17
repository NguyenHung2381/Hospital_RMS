import { EditSvg, KeySvg, TrashSvg, UsersSvg } from '@/assets/icons';
import styles from '../pages/UserList.module.css';
import type { User } from '../types/user.type';
import { ACCOUNT_TYPE_CFG, formatDate } from '../utils/userHelpers';
import { Avatar, Toggle } from './UserModal';

interface UserTableProps {
	pagedUsers: User[];
	filteredUsers: User[];
	currentPage: number;
	pageSize: number;
	totalPages: number;
	search: string;
	typeFilters: string[];
	deptFilters: string[];
	getRoleName: (id: string) => string;
	getDeptName: (id?: string) => string;
	setEditUser: (u: User) => void;
	setDeleteUser: (u: User) => void;
	setResetUser: (u: User) => void;
	setCurrentPage: (p: number) => void;
	setPageSize: (n: number) => void;
	handleToggleActive: (id: string) => Promise<void>;
	setShowCreate: (v: boolean) => void;
}

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

export function UserTable({
	pagedUsers,
	filteredUsers,
	currentPage,
	pageSize,
	totalPages,
	search,
	typeFilters,
	deptFilters,
	getRoleName,
	getDeptName,
	setEditUser,
	setDeleteUser,
	setResetUser,
	setCurrentPage,
	setPageSize,
	handleToggleActive,
	setShowCreate,
}: UserTableProps) {
	const isFiltered = !!(
		search ||
		typeFilters.length > 0 ||
		deptFilters.length > 0
	);

	return (
		<div
			className={styles.tableWrap}
			style={{ border: 'none', borderRadius: 0 }}
		>
			{filteredUsers.length === 0 ? (
				<div className={styles.emptyState}>
					<div className={styles.emptyIcon}>
						<UsersSvg />
					</div>
					<div className={styles.emptyTitle}>
						{isFiltered ? 'Không tìm thấy kết quả' : 'Chưa có tài khoản'}
					</div>
					<div className={styles.emptyDesc}>
						{isFiltered
							? 'Thử thay đổi bộ lọc hoặc từ khoá tìm kiếm'
							: 'Cấp tài khoản đầu tiên'}
					</div>
					{!isFiltered && (
						<button
							className={styles.btnGrantHeader}
							onClick={() => setShowCreate(true)}
							style={{ marginTop: 16 }}
						>
							<KeySvg /> Cấp tài khoản
						</button>
					)}
				</div>
			) : (
				<table className={styles.table}>
					<thead>
						<tr>
							<th className={styles.th}>#</th>
							<th className={styles.th}>Người dùng</th>
							<th className={styles.th}>Khoa / Phòng</th>
							<th className={styles.th}>Đăng nhập / Mã NV</th>
							<th className={styles.th}>Vai trò</th>
							<th className={styles.th}>Loại TK</th>
							<th className={styles.th}>Trạng thái</th>
							<th className={styles.th}>Ngày tạo</th>
							<th className={`${styles.th} ${styles.thRight}`}>Thao tác</th>
						</tr>
					</thead>
					<tbody>
						{pagedUsers.map((u, i) => {
							const rowNum = (currentPage - 1) * pageSize + i + 1;
							const typeCfg =
								ACCOUNT_TYPE_CFG[u.account_type] ?? ACCOUNT_TYPE_CFG.member;
							return (
								<tr
									key={u.id}
									className={styles.tr}
								>
									<td className={`${styles.td} ${styles.tdIdx}`}>{rowNum}</td>
									<td className={styles.td}>
										<div className={styles.memberCell}>
											<Avatar
												name={u.full_name}
												cls={typeCfg.avatarCls}
												size='md'
											/>
											<div>
												<div className={styles.memberName}>{u.full_name}</div>
												<div className={styles.memberId}>{u.id}</div>
											</div>
										</div>
									</td>
									<td className={styles.td}>
										<div
											style={{
												fontSize: 13,
												color: 'var(--color-gray-700)',
												fontWeight: 500,
											}}
										>
											{getDeptName(u.department_id)}
										</div>
									</td>
									<td className={styles.td}>
										<div>
											<div className={styles.usernameText}>{u.username}</div>
											<div className={styles.staffNum}>
												MNV: {u.staff_number ?? '—'}
											</div>
										</div>
									</td>
									<td className={styles.td}>
										<span className={styles.roleText}>
											{getRoleName(u.role_id)}
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
												onChange={() => void handleToggleActive(u.id)}
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
											{formatDate(u.created_at)}
										</span>
									</td>
									<td className={`${styles.td} ${styles.tdActions}`}>
										<button
											className={`${styles.actionBtn} ${styles.actionEdit}`}
											title='Chỉnh sửa'
											onClick={() => setEditUser(u)}
										>
											<EditSvg />
										</button>
										<button
											className={styles.actionBtn}
											title='Đặt lại mật khẩu về 123456'
											onClick={() => setResetUser(u)}
											style={{ color: '#b45309' }}
										>
											<KeySvg />
										</button>
										<button
											className={`${styles.actionBtn} ${styles.actionDelete}`}
											title='Xoá'
											onClick={() => setDeleteUser(u)}
										>
											<TrashSvg />
										</button>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			)}

			{/* PAGINATION */}
			{filteredUsers.length > 0 && (
				<div className={styles.paginationBar}>
					<div className={styles.paginationInfo}>
						Hiển thị <strong>{(currentPage - 1) * pageSize + 1}</strong>
						{' – '}
						<strong>
							{Math.min(currentPage * pageSize, filteredUsers.length)}
						</strong>
						{' / '}
						<strong>{filteredUsers.length}</strong> bản ghi
					</div>
					<div className={styles.paginationControls}>
						<div className={styles.pageSizeSelector}>
							<span className={styles.pageSizeLabel}>Hiển thị</span>
							<select
								className={styles.pageSizeSelect}
								value={pageSize}
								onChange={(e) => setPageSize(Number(e.target.value))}
							>
								{[10, 20, 50, 100].map((n) => (
									<option
										key={n}
										value={n}
									>
										{n}
									</option>
								))}
							</select>
							<span className={styles.pageSizeLabel}>/ trang</span>
						</div>
						<div className={styles.pageButtons}>
							<button
								className={styles.pageBtn}
								onClick={() => setCurrentPage(1)}
								disabled={currentPage === 1}
								title='Trang đầu'
							>
								«
							</button>
							<button
								className={styles.pageBtn}
								onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
								disabled={currentPage === 1}
								title='Trang trước'
							>
								‹
							</button>
							{Array.from({ length: totalPages }, (_, i) => i + 1)
								.filter(
									(p) =>
										p === 1 ||
										p === totalPages ||
										Math.abs(p - currentPage) <= 1,
								)
								.reduce<(number | 'ellipsis-start' | 'ellipsis-end')[]>(
									(acc, p, idx, arr) => {
										if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1)
											acc.push(idx === 1 ? 'ellipsis-start' : 'ellipsis-end');
										acc.push(p);
										return acc;
									},
									[],
								)
								.map((item, idx) =>
									typeof item === 'string' ? (
										<span
											key={item + idx}
											className={styles.pageEllipsis}
										>
											…
										</span>
									) : (
										<button
											key={item}
											className={`${styles.pageBtn} ${item === currentPage ? styles.pageBtnActive : ''}`}
											onClick={() => setCurrentPage(item)}
										>
											{item}
										</button>
									),
								)}
							<button
								className={styles.pageBtn}
								onClick={() =>
									setCurrentPage(Math.min(totalPages, currentPage + 1))
								}
								disabled={currentPage === totalPages}
								title='Trang sau'
							>
								›
							</button>
							<button
								className={styles.pageBtn}
								onClick={() => setCurrentPage(totalPages)}
								disabled={currentPage === totalPages}
								title='Trang cuối'
							>
								»
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
