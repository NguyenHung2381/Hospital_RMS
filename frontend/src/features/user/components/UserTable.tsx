import { useState } from 'react';
import { EditSvg, KeySvg, TrashSvg, UsersSvg } from '@/assets/icons';
import {
	Badge,
	BulkBar,
	EmptyState,
	Pagination,
	SelectCheckbox,
	Skeleton,
	SkeletonTable,
} from '@/shared/components';
import { formatDateOr } from '@/shared/utils';
import { useRowSelection } from '@/shared/hooks/useRowSelection';
import sel from '@/shared/components/Table/RowSelect.module.css';
import styles from '../pages/UserList.module.css';
import type { SimpleItem, UpdateUserPayload } from '../api/userApi';
import type { User } from '../types/user.type';
import { roleCfg } from '@/shared/utils/roleDisplay';
import { Avatar, Toggle } from './UserModal';
import { UserBulkEditModal } from './UserBulkEditModal';

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
		<div className={styles.tableWrap}>
			{users.length === 0 && !loading ? (
				<EmptyState
					icon={<UsersSvg />}
					title={isFiltered ? 'Không tìm thấy kết quả' : 'Chưa có tài khoản'}
					desc={
						isFiltered
							? 'Thử thay đổi bộ lọc hoặc từ khoá tìm kiếm'
							: 'Cấp tài khoản đầu tiên'
					}
					action={
						!isFiltered && (
							<button
								className={styles.btnGrantHeader}
								onClick={() => setShowCreate(true)}
							>
								<KeySvg /> Cấp tài khoản
							</button>
						)
					}
				/>
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
							const rCfg = roleCfg(u);
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
											tone={rCfg.tone}
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
											{formatDateOr(u.created_at)}
										</span>
									</td>
									<td className={`${styles.td} ${styles.tdActions}`}>
										<div className={styles.actionBtns}>
											<div
												className={styles.actionBtn}
												title='Chỉnh sửa'
												onClick={() => setEditUser(u)}
											>
												<EditSvg />
											</div>
											<div
												className={styles.actionBtn}
												title='Đặt lại mật khẩu (tạo mật khẩu tạm ngẫu nhiên)'
												onClick={() => setResetUser(u)}
												style={{ color: '#b45309' }}
											>
												<KeySvg />
											</div>
											<div
												className={`${styles.actionBtn} ${styles.danger}`}
												title='Xoá'
												onClick={() => setDeleteUser(u)}
											>
												<TrashSvg />
											</div>
										</div>
									</td>
								</tr>
							);
						}))}
					</tbody>
				</table>
				</>
			)}

			{/* Giữ chỗ khi loading để tránh CLS khi thanh phân trang xuất hiện */}
			{loading ? (
				<div className={styles.paginationBar}>
					<Skeleton
						width={160}
						height={14}
						style={{ verticalAlign: 'middle' }}
					/>
				</div>
			) : (
				totalCount > 0 && (
					<Pagination
						page={currentPage}
						totalPages={totalPages}
						total={totalCount}
						rowsPerPage={pageSize}
						pageSizeOptions={[10, 20, 50, 100]}
						onPageChange={setCurrentPage}
						onRowsPerPageChange={setPageSize}
						itemLabel='bản ghi'
					/>
				)
			)}
		</div>
	);
}
