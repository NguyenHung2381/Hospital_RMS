import React, { useCallback, useEffect, useMemo, useState } from 'react';
import AdminLayout from '../../../layouts/AdminLayout';
import {
	createRole,
	deleteRole,
	getRolePermissions,
	getRoles,
	setRolePermissions,
	updateRole,
} from '../api/roleApi';
import { useRealtimeUpdate } from '../../../hooks/useRealtime';
import {
	EMPTY_FORM,
	MATRIX_ACTION_LABELS,
	MATRIX_ACTIONS,
	PERMISSION_MATRIX,
	type ModalType,
	type Role,
	type RoleFormData,
} from '../types/Role.type';
import styles from './Roles.module.css';

// ─── ICONS ────────────────────────────────
const Ic = {
	Shield: () => (
		<svg
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='2'
			strokeLinecap='round'
			strokeLinejoin='round'
		>
			<path d='M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' />
		</svg>
	),
	Key: () => (
		<svg
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='2'
			strokeLinecap='round'
			strokeLinejoin='round'
		>
			<path d='M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4' />
		</svg>
	),
	Plus: () => (
		<svg
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='2.5'
			strokeLinecap='round'
			strokeLinejoin='round'
		>
			<line
				x1='12'
				y1='5'
				x2='12'
				y2='19'
			/>
			<line
				x1='5'
				y1='12'
				x2='19'
				y2='12'
			/>
		</svg>
	),
	Edit: () => (
		<svg
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='2'
			strokeLinecap='round'
			strokeLinejoin='round'
		>
			<path d='M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7' />
			<path d='M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z' />
		</svg>
	),
	Trash: () => (
		<svg
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='2'
			strokeLinecap='round'
			strokeLinejoin='round'
		>
			<polyline points='3 6 5 6 21 6' />
			<path d='M19 6l-1 14H6L5 6' />
			<path d='M10 11v6' />
			<path d='M14 11v6' />
			<path d='M9 6V4h6v2' />
		</svg>
	),
	Search: () => (
		<svg
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='2'
			strokeLinecap='round'
			strokeLinejoin='round'
		>
			<circle
				cx='11'
				cy='11'
				r='8'
			/>
			<line
				x1='21'
				y1='21'
				x2='16.65'
				y2='16.65'
			/>
		</svg>
	),
	X: () => (
		<svg
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='2.5'
			strokeLinecap='round'
		>
			<line
				x1='18'
				y1='6'
				x2='6'
				y2='18'
			/>
			<line
				x1='6'
				y1='6'
				x2='18'
				y2='18'
			/>
		</svg>
	),
	Check: () => (
		<svg
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='2.5'
			strokeLinecap='round'
			strokeLinejoin='round'
		>
			<polyline points='20 6 9 17 4 12' />
		</svg>
	),
	Users: () => (
		<svg
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='2'
			strokeLinecap='round'
			strokeLinejoin='round'
		>
			<path d='M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' />
			<circle
				cx='9'
				cy='7'
				r='4'
			/>
			<path d='M23 21v-2a4 4 0 0 0-3-3.87' />
			<path d='M16 3.13a4 4 0 0 1 0 7.75' />
		</svg>
	),
	Info: () => (
		<svg
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='2'
			strokeLinecap='round'
			strokeLinejoin='round'
		>
			<circle
				cx='12'
				cy='12'
				r='10'
			/>
			<line
				x1='12'
				y1='16'
				x2='12'
				y2='12'
			/>
			<line
				x1='12'
				y1='8'
				x2='12.01'
				y2='8'
			/>
		</svg>
	),
	Layers: () => (
		<svg
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='2'
			strokeLinecap='round'
			strokeLinejoin='round'
		>
			<polygon points='12 2 2 7 12 12 22 7 12 2' />
			<polyline points='2 17 12 22 22 17' />
			<polyline points='2 12 12 17 22 12' />
		</svg>
	),
	ChevronLeft: () => (
		<svg
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='2.5'
			strokeLinecap='round'
			strokeLinejoin='round'
		>
			<polyline points='15 18 9 12 15 6' />
		</svg>
	),
	ChevronRight: () => (
		<svg
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='2.5'
			strokeLinecap='round'
			strokeLinejoin='round'
		>
			<polyline points='9 18 15 12 9 6' />
		</svg>
	),
};

// ─── RESOURCE ICON MAP ────────────────────
const RESOURCE_ICON: Record<string, React.ReactNode> = {
	topics: <Ic.Layers />,
	users: <Ic.Users />,
	departments: <Ic.Info />,
	roles: <Ic.Shield />,
	rounds: <Ic.Info />,
	files: <Ic.Info />,
	reports: <Ic.Info />,
};

// ─── HELPERS ──────────────────────────────
function getInitials(name: string) {
	const parts = name.trim().split(/\s+/);
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ─── PERMISSION MATRIX MODAL ──────────────
function PermissionModal({
	role,
	onClose,
	onSaved,
}: {
	role: Role;
	onClose: () => void;
	onSaved: (roleId: string, ids: string[]) => void;
}) {
	const [granted, setGranted] = useState<Set<string>>(new Set());
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');

	useEffect(() => {
		getRolePermissions(role.id)
			.then((ids) => setGranted(new Set(ids)))
			.catch(() => setError('Không thể tải quyền hiện tại'))
			.finally(() => setLoading(false));
	}, [role.id]);

	const toggle = (permId: string) => {
		setGranted((prev) => {
			const next = new Set(prev);
			if (next.has(permId)) {
				next.delete(permId);
			} else {
				next.add(permId);
			}
			return next;
		});
	};

	const toggleRow = (rowActionIds: string[]) => {
		const allOn = rowActionIds.every((id) => granted.has(id));
		setGranted((prev) => {
			const next = new Set(prev);
			rowActionIds.forEach((id) => {
				if (allOn) {
					next.delete(id);
				} else {
					next.add(id);
				}
			});
			return next;
		});
	};

	const handleSave = async () => {
		setSaving(true);
		setError('');
		try {
			const ids = [...granted];
			await setRolePermissions(role.id, ids);
			onSaved(role.id, ids);
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Lưu thất bại');
		} finally {
			setSaving(false);
		}
	};

	return (
		<div
			className={styles.modalBackdrop}
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<div className={`${styles.modal} ${styles.modalLg}`}>
				{/* Header */}
				<div className={styles.modalHeader}>
					<div className={styles.modalHeaderIcon}>
						<Ic.Key />
					</div>
					<div>
						<div className={styles.modalTitle}>Phân quyền — {role.name}</div>
						<div className={styles.modalSub}>
							Chọn các quyền được phép thực hiện
						</div>
					</div>
					{!loading && (
						<span className={styles.permCount}>{granted.size} quyền</span>
					)}
					<button
						className={styles.modalClose}
						onClick={onClose}
					>
						<Ic.X />
					</button>
				</div>

				{/* Body */}
				<div className={styles.permModalBody}>
					{loading ? (
						<div className={styles.permLoading}>
							<span
								className={styles.spinner}
								style={{
									borderTopColor: '#3c3489',
									borderColor: 'rgba(60,52,137,0.2)',
								}}
							/>
							Đang tải quyền...
						</div>
					) : (
						<table className={styles.permMatrix}>
							<thead>
								<tr>
									<th>Nhóm chức năng</th>
									{MATRIX_ACTIONS.map((a) => (
										<th key={a}>{MATRIX_ACTION_LABELS[a]}</th>
									))}
									<th>Chọn tất cả</th>
								</tr>
							</thead>
							<tbody>
								{PERMISSION_MATRIX.map((row) => {
									const rowIds = row.actions.map((a) => a.id);
									const allSelected = rowIds.every((id) => granted.has(id));

									return (
										<tr key={row.resource}>
											{/* Resource label */}
											<td className={styles.permResourceCell}>
												<div className={styles.permResourceName}>
													{RESOURCE_ICON[row.resource]}
													{row.resourceLabel}
												</div>
											</td>

											{/* Action cells */}
											{MATRIX_ACTIONS.map((action) => {
												const perm = row.actions.find(
													(a) => a.action === action,
												);
												if (!perm) {
													return (
														<td
															key={action}
															className={styles.permCellEmpty}
														>
															<div className={styles.permCellDash} />
														</td>
													);
												}
												return (
													<td
														key={action}
														className={styles.permCell}
													>
														<label className={styles.permCheck}>
															<input
																type='checkbox'
																checked={granted.has(perm.id)}
																onChange={() => toggle(perm.id)}
															/>
															<div className={styles.permCheckBox}>
																<svg
																	viewBox='0 0 24 24'
																	fill='none'
																	stroke='currentColor'
																	strokeWidth='3'
																	strokeLinecap='round'
																	strokeLinejoin='round'
																>
																	<polyline points='20 6 9 17 4 12' />
																</svg>
															</div>
														</label>
													</td>
												);
											})}

											{/* Select-all toggle */}
											<td className={styles.permCell}>
												<button
													className={`${styles.permSelectAll} ${allSelected ? styles.allSelected : ''}`}
													onClick={() => toggleRow(rowIds)}
												>
													{allSelected ? 'Bỏ tất cả' : 'Chọn tất cả'}
												</button>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					)}
				</div>

				{/* Footer */}
				<div className={styles.modalFooter}>
					{error && (
						<span style={{ fontSize: 12, color: '#e24b4a', flex: 1 }}>
							{error}
						</span>
					)}
					<button
						className={styles.btnCancel}
						onClick={onClose}
						disabled={saving}
					>
						Huỷ
					</button>
					<button
						className={styles.btnSave}
						onClick={handleSave}
						disabled={saving || loading}
					>
						{saving ? <span className={styles.spinner} /> : <Ic.Check />}
						Lưu phân quyền
					</button>
				</div>
			</div>
		</div>
	);
}

// ─── ROLE FORM MODAL ──────────────────────
function RoleFormModal({
	mode,
	role,
	onClose,
	onSave,
	loading,
}: {
	mode: 'add' | 'edit';
	role?: Role;
	onClose: () => void;
	onSave: (data: RoleFormData) => void;
	loading: boolean;
}) {
	const [form, setForm] = useState<RoleFormData>(
		role
			? { name: role.name, description: role.description ?? '' }
			: EMPTY_FORM,
	);
	const [errors, setErrors] = useState<Partial<RoleFormData>>({});

	const set =
		(k: keyof RoleFormData) =>
		(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
			setForm((f) => ({ ...f, [k]: e.target.value }));
			setErrors((er) => ({ ...er, [k]: '' }));
		};

	const validate = () => {
		const err: Partial<RoleFormData> = {};
		if (!form.name.trim()) err.name = 'Vui lòng nhập tên vai trò';
		else if (form.name.trim().length < 2)
			err.name = 'Tên vai trò ít nhất 2 ký tự';
		setErrors(err);
		return Object.keys(err).length === 0;
	};

	return (
		<div
			className={styles.modalBackdrop}
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<div className={styles.modal}>
				<div className={styles.modalHeader}>
					<div className={styles.modalHeaderIcon}>
						<Ic.Shield />
					</div>
					<div>
						<div className={styles.modalTitle}>
							{mode === 'add' ? 'Thêm vai trò mới' : 'Chỉnh sửa vai trò'}
						</div>
						<div className={styles.modalSub}>
							{mode === 'add'
								? 'Tạo vai trò mới để phân quyền người dùng'
								: `Cập nhật — ${role?.id}`}
						</div>
					</div>
					<button
						className={styles.modalClose}
						onClick={onClose}
					>
						<Ic.X />
					</button>
				</div>

				<div className={styles.modalBody}>
					<div className={styles.formGroup}>
						<label className={styles.formLabel}>
							Tên vai trò <span className={styles.required}>*</span>
						</label>
						<input
							className={`${styles.formInput} ${errors.name ? styles.inputError : ''}`}
							value={form.name}
							onChange={set('name')}
							placeholder='VD: Bác sĩ điều trị, Trưởng khoa...'
							autoFocus
						/>
						{errors.name && (
							<div className={styles.fieldError}>{errors.name}</div>
						)}
					</div>

					<div className={styles.formGroup}>
						<label className={styles.formLabel}>Mô tả</label>
						<textarea
							className={styles.formTextarea}
							value={form.description}
							onChange={set('description')}
							rows={3}
							placeholder='Mô tả ngắn về vai trò và trách nhiệm...'
						/>
					</div>
				</div>

				<div className={styles.modalFooter}>
					<button
						className={styles.btnCancel}
						onClick={onClose}
						disabled={loading}
					>
						Huỷ
					</button>
					<button
						className={styles.btnSave}
						onClick={() => validate() && onSave(form)}
						disabled={loading}
					>
						{loading ? <span className={styles.spinner} /> : <Ic.Check />}
						{mode === 'add' ? 'Thêm vai trò' : 'Lưu thay đổi'}
					</button>
				</div>
			</div>
		</div>
	);
}

// ─── DELETE MODAL ─────────────────────────
function DeleteModal({
	role,
	onClose,
	onConfirm,
	loading,
}: {
	role: Role;
	onClose: () => void;
	onConfirm: () => void;
	loading: boolean;
}) {
	return (
		<div
			className={styles.modalBackdrop}
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<div className={`${styles.modal} ${styles.modalSm}`}>
				<div className={styles.modalHeader}>
					<div className={styles.modalHeaderIconDanger}>
						<Ic.Trash />
					</div>
					<div>
						<div className={styles.modalTitle}>Xoá vai trò</div>
						<div className={styles.modalSub}>{role.name}</div>
					</div>
					<button
						className={styles.modalClose}
						onClick={onClose}
					>
						<Ic.X />
					</button>
				</div>

				<div className={styles.modalBody}>
					<p className={styles.deleteDesc}>
						Bạn có chắc muốn xoá vai trò <strong>"{role.name}"</strong>? Tất cả
						phân quyền liên kết cũng sẽ bị xoá. Hành động này không thể hoàn
						tác.
					</p>
					{(role.user_count ?? 0) > 0 && (
						<div className={styles.warnBox}>
							<Ic.Info />
							<span>
								Có <strong>{role.user_count} người dùng</strong> đang sử dụng
								vai trò này và sẽ bị mất vai trò sau khi xoá.
							</span>
						</div>
					)}
				</div>

				<div className={styles.modalFooter}>
					<button
						className={styles.btnCancel}
						onClick={onClose}
						disabled={loading}
					>
						Huỷ
					</button>
					<button
						className={styles.btnDanger}
						onClick={onConfirm}
						disabled={loading}
					>
						{loading ? (
							<span className={`${styles.spinner} ${styles.spinnerDark}`} />
						) : (
							<Ic.Trash />
						)}
						Xác nhận xoá
					</button>
				</div>
			</div>
		</div>
	);
}

// ─── MAIN ─────────────────────────────────
export default function Roles() {
	const [roles, setRoles] = useState<Role[]>([]);
	const [isLoadingData, setIsLoadingData] = useState(true);
	const [search, setSearch] = useState('');
	const [modal, setModal] = useState<ModalType>(null);
	const [editingRole, setEditingRole] = useState<Role | null>(null);
	const [deletingRole, setDeletingRole] = useState<Role | null>(null);
	const [permRole, setPermRole] = useState<Role | null>(null);
	const [loading, setLoading] = useState(false);
	const [pageSize, setPageSize] = useState(10);
	const [page, setPage] = useState(1);
	const [toast, setToast] = useState<{
		type: 'success' | 'error';
		msg: string;
	} | null>(null);
	const [refreshKey, setRefreshKey] = useState(0);

	const refreshData = useCallback(() => {
		setRefreshKey((prev) => prev + 1);
	}, []);

	useRealtimeUpdate('role', refreshData);

	// Lưu số quyền đã gán theo roleId (hiển thị trên bảng)
	const [permCountMap, setPermCountMap] = useState<Record<string, number>>({});

	const showToast = useCallback((type: 'success' | 'error', msg: string) => {
		setToast({ type, msg });
		setTimeout(() => setToast(null), 3000);
	}, []);

	useEffect(() => {
		getRoles({ limit: 200 })
			.then((res) => setRoles(res.data))
			.catch(() => showToast('error', 'Không thể tải danh sách vai trò'))
			.finally(() => setIsLoadingData(false));
	}, [showToast, refreshKey]);

	const filtered = useMemo(() => {
		if (!search.trim()) return roles;
		const q = search.toLowerCase();
		return roles.filter(
			(r) =>
				r.name.toLowerCase().includes(q) ||
				r.id.toLowerCase().includes(q) ||
				(r.description ?? '').toLowerCase().includes(q),
		);
	}, [roles, search]);

	const totalPages = pageSize === 0 ? 1 : Math.ceil(filtered.length / pageSize);
	const safePage = Math.min(page, totalPages || 1);
	const paged = useMemo(() => {
		if (pageSize === 0) return filtered;
		return filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
	}, [filtered, safePage, pageSize]);

	const stats = useMemo(
		() => ({
			total: roles.length,
			withUsers: roles.filter((r) => (r.user_count ?? 0) > 0).length,
			totalUsers: roles.reduce((s, r) => s + (r.user_count ?? 0), 0),
		}),
		[roles],
	);

	const handleAdd = useCallback(
		async (data: RoleFormData) => {
			setLoading(true);
			try {
				const created = await createRole(data);
				setRoles((prev) => [created, ...prev]);
				setModal(null);
				showToast('success', `Đã thêm vai trò "${created.name}"`);
			} catch (err) {
				showToast(
					'error',
					err instanceof Error ? err.message : 'Thêm thất bại',
				);
			} finally {
				setLoading(false);
			}
		},
		[showToast],
	);

	const handleEdit = useCallback(
		async (data: RoleFormData) => {
			if (!editingRole) return;
			setLoading(true);
			try {
				const updated = await updateRole(editingRole.id, data);
				setRoles((prev) =>
					prev.map((r) => (r.id === editingRole.id ? updated : r)),
				);
				setModal(null);
				setEditingRole(null);
				showToast('success', `Đã cập nhật "${updated.name}"`);
			} catch (err) {
				showToast(
					'error',
					err instanceof Error ? err.message : 'Cập nhật thất bại',
				);
			} finally {
				setLoading(false);
			}
		},
		[editingRole, showToast],
	);

	const handleDelete = useCallback(async () => {
		if (!deletingRole) return;
		setLoading(true);
		try {
			await deleteRole(deletingRole.id);
			setRoles((prev) => prev.filter((r) => r.id !== deletingRole.id));
			setModal(null);
			setDeletingRole(null);
			showToast('success', `Đã xoá "${deletingRole.name}"`);
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Xoá thất bại');
		} finally {
			setLoading(false);
		}
	}, [deletingRole, showToast]);

	// Callback sau khi lưu phân quyền thành công
	const handlePermSaved = useCallback(
		(roleId: string, ids: string[]) => {
			setPermCountMap((prev) => ({ ...prev, [roleId]: ids.length }));
			showToast('success', 'Đã lưu phân quyền thành công');
		},
		[showToast],
	);

	const headerActions = (
		<button
			className={styles.btnAddHeader}
			onClick={() => setModal('add')}
		>
			<Ic.Plus /> Thêm vai trò
		</button>
	);

	return (
		<AdminLayout
			pageTitle='Quản lý Vai trò & Quyền'
			pageSubtitle='Danh sách vai trò và phân quyền người dùng — bảng roles & permissions'
			headerActions={headerActions}
		>
			{/* ── STATS ── */}
			<div className={styles.statsRow}>
				<div className={styles.statCard}>
					<div className={`${styles.statIcon} ${styles.iconGreen}`}>
						<Ic.Shield />
					</div>
					<div className={styles.statBody}>
						<div className={styles.statValue}>{stats.total}</div>
						<div className={styles.statLabel}>Tổng vai trò</div>
					</div>
				</div>
				<div className={styles.statCard}>
					<div className={`${styles.statIcon} ${styles.iconBlue}`}>
						<Ic.Users />
					</div>
					<div className={styles.statBody}>
						<div className={styles.statValue}>{stats.totalUsers}</div>
						<div className={styles.statLabel}>Người dùng đã phân vai trò</div>
					</div>
				</div>
				<div className={styles.statCard}>
					<div className={`${styles.statIcon} ${styles.iconAmber}`}>
						<Ic.Key />
					</div>
					<div className={styles.statBody}>
						<div className={styles.statValue}>{stats.withUsers}</div>
						<div className={styles.statLabel}>Vai trò đang được sử dụng</div>
					</div>
				</div>
			</div>

			{/* ── TOOLBAR ── */}
			<div className={styles.toolbar}>
				<div className={styles.searchBox}>
					<Ic.Search />
					<input
						className={styles.searchInput}
						placeholder='Tìm theo tên, mô tả...'
						value={search}
						onChange={(e) => {
							setSearch(e.target.value);
							setPage(1);
						}}
					/>
					{search && (
						<button
							className={styles.searchClear}
							onClick={() => {
								setSearch('');
								setPage(1);
							}}
						>
							<Ic.X />
						</button>
					)}
				</div>
				<span className={styles.resultCount}>{filtered.length} vai trò</span>
				<div className={styles.pageSizeWrap}>
					<label className={styles.pageSizeLabel}>Hiển thị</label>
					<select
						className={styles.pageSizeSelect}
						value={pageSize}
						onChange={(e) => {
							setPageSize(Number(e.target.value));
							setPage(1);
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

			{/* ── TABLE ── */}
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
						{isLoadingData ? (
							<tr>
								<td colSpan={7}>
									<div className={styles.emptyState}>
										<div className={styles.emptyDesc}>Đang tải dữ liệu...</div>
									</div>
								</td>
							</tr>
						) : filtered.length === 0 ? (
							<tr>
								<td colSpan={7}>
									<div className={styles.emptyState}>
										<svg
											className={styles.emptyIcon}
											viewBox='0 0 24 24'
											fill='none'
											stroke='currentColor'
											strokeWidth='1.5'
											strokeLinecap='round'
											strokeLinejoin='round'
										>
											<path d='M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' />
										</svg>
										<p className={styles.emptyTitle}>
											{search
												? 'Không tìm thấy vai trò nào'
												: 'Chưa có vai trò nào'}
										</p>
										<p className={styles.emptyDesc}>
											{search
												? 'Thử thay đổi từ khoá tìm kiếm'
												: 'Nhấn "Thêm vai trò" để bắt đầu'}
										</p>
									</div>
								</td>
							</tr>
						) : (
							paged.map((role, i) => {
								const rowNum =
									(safePage - 1) * (pageSize || filtered.length) + i + 1;
								const pCount = permCountMap[role.id];
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
												<Ic.Users />
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
													<Ic.Key />
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
													setPermRole(role);
													setModal('permissions');
												}}
											>
												<Ic.Key />
											</button>
											<button
												className={`${styles.actionBtn} ${styles.actionEdit}`}
												title='Chỉnh sửa'
												onClick={() => {
													setEditingRole(role);
													setModal('edit');
												}}
											>
												<Ic.Edit />
											</button>
											<button
												className={`${styles.actionBtn} ${styles.actionDelete}`}
												title='Xoá'
												onClick={() => {
													setDeletingRole(role);
													setModal('delete');
												}}
											>
												<Ic.Trash />
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
			{filtered.length > 0 && totalPages > 1 && (
				<div className={styles.pagination}>
					<span className={styles.paginationInfo}>
						{pageSize === 0
							? `Hiển thị tất cả ${filtered.length} vai trò`
							: `${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, filtered.length)} / ${filtered.length}`}
					</span>
					<div className={styles.paginationControls}>
						<button
							className={styles.pageBtn}
							onClick={() => setPage((p) => Math.max(1, p - 1))}
							disabled={safePage === 1}
						>
							<Ic.ChevronLeft />
						</button>
						{Array.from({ length: totalPages }, (_, idx) => idx + 1)
							.filter(
								(p) =>
									p === 1 || p === totalPages || Math.abs(p - safePage) <= 1,
							)
							.reduce<(number | 'ellipsis')[]>((acc, p, idx, arr) => {
								if (idx > 0 && p - (arr[idx - 1] as number) > 1)
									acc.push('ellipsis');
								acc.push(p);
								return acc;
							}, [])
							.map((p, idx) =>
								p === 'ellipsis' ? (
									<span
										key={`e${idx}`}
										className={styles.pageEllipsis}
									>
										…
									</span>
								) : (
									<button
										key={p}
										className={`${styles.pageBtn} ${p === safePage ? styles.pageBtnActive : ''}`}
										onClick={() => setPage(p as number)}
									>
										{p}
									</button>
								),
							)}
						<button
							className={styles.pageBtn}
							onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
							disabled={safePage === totalPages}
						>
							<Ic.ChevronRight />
						</button>
					</div>
				</div>
			)}

			{/* ── MODALS ── */}
			{modal === 'add' && (
				<RoleFormModal
					mode='add'
					onClose={() => setModal(null)}
					onSave={handleAdd}
					loading={loading}
				/>
			)}
			{modal === 'edit' && editingRole && (
				<RoleFormModal
					mode='edit'
					role={editingRole}
					onClose={() => {
						setModal(null);
						setEditingRole(null);
					}}
					onSave={handleEdit}
					loading={loading}
				/>
			)}
			{modal === 'delete' && deletingRole && (
				<DeleteModal
					role={deletingRole}
					onClose={() => {
						setModal(null);
						setDeletingRole(null);
					}}
					onConfirm={handleDelete}
					loading={loading}
				/>
			)}
			{modal === 'permissions' && permRole && (
				<PermissionModal
					role={permRole}
					onClose={() => {
						setModal(null);
						setPermRole(null);
					}}
					onSaved={handlePermSaved}
				/>
			)}

			{/* ── TOAST ── */}
			{toast && (
				<div
					className={`${styles.toast} ${styles[`toast${toast.type.charAt(0).toUpperCase() + toast.type.slice(1)}` as keyof typeof styles]}`}
				>
					{toast.type === 'success' ? <Ic.Check /> : <Ic.X />}
					{toast.msg}
				</div>
			)}
		</AdminLayout>
	);
}
