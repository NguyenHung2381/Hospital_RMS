import { useState } from 'react';
import { EditSvg, KeySvg, TrashSvg, UsersSvg } from '@/assets/icons';
import styles from '../pages/UserList.module.css';
import type { SimpleItem, UpdateUserPayload } from '../api/userApi';
import type { User } from '../types/user.type';
import { formatDate as _formatDate } from '../../../shared/utils/formatDate';
import { roleCfg } from '../utils/userHelpers';
const formatDate = (s: string | null | undefined) => _formatDate(s) ?? '—';
import { Avatar, Toggle } from './UserModal';
import { UserBulkEditModal } from './UserBulkEditModal';
import { Skeleton, SkeletonTable } from '../../../shared/components/Loading';
import sel from '../../../shared/components/Table/RowSelect.module.css';
import {
	BulkBar,
	SelectCheckbox,
} from '../../../shared/components/Table/RowSelect';
import { useRowSelection } from '../../../shared/hooks/useRowSelection';

interface UserTableProps {
	users: User[];
	totalCount: number;
	currentPage: number;
	pageSize: number;
	totalPages: number;
	search: string;
	roleFilters: string[];
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
	loading?: boolean;
	departments: SimpleItem[];
	roles: SimpleItem[];
	handleBulkDelete: (ids: string[]) => Promise<void>;
	handleBulkEdit: (ids: string[], payload: UpdateUserPayload) => Promise<void>;
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
	users,
	totalCount,
	currentPage,
	pageSize,
	totalPages,
	search,
	roleFilters,
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
	loading,
	departments,
	roles,
	handleBulkDelete,
	handleBulkEdit,
}: UserTableProps) {
	const rowSel = useRowSelection(users.map((u) => u.id));
	const [bulkEditOpen, setBulkEditOpen] = useState(false);
	const isFiltered = !!(
		search ||
		roleFilters.length > 0 ||
		deptFilters.length > 0
	);

	return (
		<div
			className={styles.tableWrap}
			style={{ border: 'none', borderRadius: 0 }}
		>
			{users.length === 0 && !loading ? (
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
				<>
				<BulkBar
					rowSel={rowSel}
					itemLabel='tài khoản'
					loading={loading}
					onBulkDelete={handleBulkDelete}
					onBulkEdit={() => setBulkEditOpen(true)}
				/>
				{bulkEditOpen && (
					<UserBulkEditModal
						count={rowSel.selectedCount}
						departments={departments}
						roles={roles}
						loading={!!loading}
						onClose={() => setBulkEditOpen(false)}
						onSave={async (payload) => {
							await handleBulkEdit([...rowSel.selectedIds], payload);
							rowSel.clearSelection();
							setBulkEditOpen(false);
						}}
					/>
				)}
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
							<th className={styles.th}>Khoa / Phòng</th>
							<th className={styles.th}>Đăng nhập / Mã NV</th>
							<th className={styles.th}>Vai trò</th>
							<th className={styles.th}>Trạng thái</th>
							<th className={styles.th}>Ngày tạo</th>
							<th className={`${styles.th} ${styles.thRight}`}>Thao tác</th>
						</tr>
					</thead>
					<tbody>
						{loading ? (
							<SkeletonTable rows={pageSize || 10} cols={9} />
						) : (
							users.map((u, i) => {
							const rowNum = (currentPage - 1) * pageSize + i + 1;
							const rCfg = roleCfg(u.role_id);
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
									<td className={`${styles.td} ${styles.tdIdx}`}>{rowNum}</td>
									<td className={styles.td}>
										<div className={styles.memberCell}>
											<Avatar
												name={u.full_name}
												cls={rCfg.avatarCls}
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
										<Badge
											cls={rCfg.cls}
											dot
										>
											{getRoleName(u.role_id) || rCfg.label}
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
						}))}
					</tbody>
				</table>
				</>
			)}

			{/* PAGINATION — reserve space during loading too, avoids the bar popping in and shifting the page (CLS) */}
			{(loading || totalCount > 0) && (
				<div className={styles.paginationBar}>
					<div className={styles.paginationInfo}>
						{loading ? (
							<Skeleton width={160} height={14} style={{ verticalAlign: 'middle' }} />
						) : (
							<>
								Hiển thị <strong>{(currentPage - 1) * pageSize + 1}</strong>
								{' – '}
								<strong>{Math.min(currentPage * pageSize, totalCount)}</strong>
								{' / '}
								<strong>{totalCount}</strong> bản ghi
							</>
						)}
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
