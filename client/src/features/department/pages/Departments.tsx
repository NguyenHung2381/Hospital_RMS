import React, { useCallback, useEffect, useMemo, useState } from 'react';
import BookOpenSvg from '../../../assets/svg/book-open.svg?react';
import CheckSvg from '../../../assets/svg/check.svg?react';
import ChevLSvg from '../../../assets/svg/chev-l.svg?react';
import ChevRSvg from '../../../assets/svg/chev-r.svg?react';
import EditSvg from '../../../assets/svg/edit.svg?react';
import InfoSvg from '../../../assets/svg/info.svg?react';
import PlusSvg from '../../../assets/svg/plus.svg?react';
import SearchSvg from '../../../assets/svg/search.svg?react';
import TrashSvg from '../../../assets/svg/trash.svg?react';
import UsersSvg from '../../../assets/svg/users.svg?react';
import XSvg from '../../../assets/svg/x.svg?react';
import AdminLayout from '../../../layouts/AdminLayout';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import {
	createDepartment,
	deleteDepartment,
	getDepartments,
	updateDepartment,
} from '../api/departmentApi';
import {
	EMPTY_FORM,
	type Department,
	type DeptFormData,
	type ModalType,
} from '../types/department.type';
import styles from './Departments.module.css';

// ─── ICONS ────────────────────────────────
const Ic = {
	Plus: PlusSvg,
	Edit: EditSvg,
	Trash: TrashSvg,
	Search: SearchSvg,
	X: XSvg,
	Check: CheckSvg,
	ChevronLeft: ChevLSvg,
	ChevronRight: ChevRSvg,
	Info: InfoSvg,
	Users: UsersSvg,
	BookOpen: BookOpenSvg,
};

// ─── HELPERS ──────────────────────────────
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

// ─── FORM MODAL ───────────────────────────
function DeptFormModal({
	mode,
	dept,
	onClose,
	onSave,
	loading,
}: {
	mode: 'add' | 'edit';
	dept?: Department;
	onClose: () => void;
	onSave: (d: DeptFormData) => void;
	loading: boolean;
}) {
	const [form, setForm] = useState<DeptFormData>(
		dept
			? {
					name: dept.name,
					code: dept.code,
					viet_tat: dept.viet_tat,
					description: dept.description ?? '',
				}
			: EMPTY_FORM,
	);
	const [errors, setErrors] = useState<Partial<DeptFormData>>({});

	const set =
		(k: keyof DeptFormData) =>
		(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
			setForm((f) => ({ ...f, [k]: e.target.value }));
			setErrors((er) => ({ ...er, [k]: '' }));
		};

	const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const name = e.target.value;
		setForm((f) => ({
			...f,
			name,
			...(mode === 'add'
				? {
						code: name
							.trim()
							.split(/\s+/)
							.filter(Boolean)
							.map((w) => w[0])
							.join('')
							.toUpperCase(),
					}
				: {}),
		}));
		setErrors((er) => ({ ...er, name: '' }));
	};

	const validate = () => {
		const err: Partial<DeptFormData> = {};
		if (!form.name.trim()) err.name = 'Vui lòng nhập tên khoa phòng';
		if (!form.code.trim()) err.code = 'Vui lòng nhập mã';
		if (!form.viet_tat.trim()) err.viet_tat = 'Vui lòng nhập viết tắt';
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
						<Ic.BookOpen />
					</div>
					<div>
						<div className={styles.modalTitle}>
							{mode === 'add' ? 'Thêm khoa phòng' : 'Chỉnh sửa khoa phòng'}
						</div>
						<div className={styles.modalSub}>
							{mode === 'add'
								? 'Thêm đơn vị mới vào hệ thống'
								: `Cập nhật — ${dept?.code}`}
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
					<div className={styles.formGrid2}>
						<div
							className={styles.formGroup}
							style={{ gridColumn: '1 / -1' }}
						>
							<label className={styles.formLabel}>
								Tên khoa phòng <span className={styles.required}>*</span>
							</label>
							<input
								className={`${styles.formInput} ${errors.name ? styles.inputError : ''}`}
								value={form.name}
								onChange={handleNameChange}
								placeholder='VD: Khoa Nội Tim mạch'
							/>
							{errors.name && (
								<div className={styles.fieldError}>{errors.name}</div>
							)}
						</div>

						<div className={styles.formGroup}>
							<label className={styles.formLabel}>
								Mã khoa <span className={styles.required}>*</span>
							</label>
							<input
								className={`${styles.formInput} ${errors.code ? styles.inputError : ''}`}
								value={form.code}
								onChange={set('code')}
								placeholder='VD: NOI-TIM'
							/>
							{errors.code && (
								<div className={styles.fieldError}>{errors.code}</div>
							)}
						</div>

						<div className={styles.formGroup}>
							<label className={styles.formLabel}>
								Viết tắt <span className={styles.required}>*</span>
							</label>
							<input
								className={`${styles.formInput} ${errors.viet_tat ? styles.inputError : ''}`}
								value={form.viet_tat}
								onChange={set('viet_tat')}
								placeholder='VD: Tim mạch'
							/>
							{errors.viet_tat && (
								<div className={styles.fieldError}>{errors.viet_tat}</div>
							)}
						</div>

						<div
							className={styles.formGroup}
							style={{ gridColumn: '1 / -1' }}
						>
							<label className={styles.formLabel}>Mô tả</label>
							<textarea
								className={styles.formTextarea}
								value={form.description}
								onChange={set('description')}
								rows={3}
								placeholder='Mô tả ngắn về chức năng khoa phòng...'
							/>
						</div>
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
						className={styles.btnConfirmApprove}
						onClick={() => validate() && onSave(form)}
						disabled={loading}
					>
						{loading ? <span className={styles.spinner} /> : <Ic.Check />}
						{mode === 'add' ? 'Thêm khoa phòng' : 'Lưu thay đổi'}
					</button>
				</div>
			</div>
		</div>
	);
}

// ─── DELETE MODAL ─────────────────────────
function DeleteModal({
	dept,
	onClose,
	onConfirm,
	loading,
}: {
	dept: Department;
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
						<div className={styles.modalTitle}>Xoá khoa phòng</div>
						<div className={styles.modalSub}>{dept.name}</div>
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
						Bạn có chắc muốn xoá <strong>{dept.name}</strong> ({dept.viet_tat})
						khỏi hệ thống?
					</p>
					{(dept.topic_count ?? 0) > 0 && (
						<div className={styles.warnBox}>
							<Ic.Info />
							<span>
								Có <strong>{dept.topic_count} đề tài</strong> đang liên kết với
								khoa phòng này.
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
export default function Departments() {
	const [depts, setDepts] = useState<Department[]>([]);
	const [isLoadingData, setIsLoadingData] = useState(true);
	const [search, setSearch] = useState('');
	const [modal, setModal] = useState<ModalType>(null);
	const [editingDept, setEditingDept] = useState<Department | null>(null);
	const [deletingDept, setDeletingDept] = useState<Department | null>(null);
	const [loading, setLoading] = useState(false);
	const [toast, setToast] = useState<{
		type: 'success' | 'error';
		msg: string;
	} | null>(null);
	const [pageSize, setPageSize] = useState<number>(10);
	const [page, setPage] = useState(1);
	const [refreshKey, setRefreshKey] = useState(0);

	const refreshData = useCallback(() => {
		setRefreshKey((prev) => prev + 1);
	}, []);

	useRealtimeUpdate('department', refreshData);

	const showToast = useCallback((type: 'success' | 'error', msg: string) => {
		setToast({ type, msg });
		setTimeout(() => setToast(null), 3000);
	}, []);

	useEffect(() => {
		getDepartments()
			.then((res) => setDepts(res.data))
			.catch(() => showToast('error', 'Không thể tải danh sách khoa phòng'))
			.finally(() => setIsLoadingData(false));
	}, [showToast, refreshKey]);

	const filtered = useMemo(() => {
		if (!search.trim()) return depts;
		const q = search.toLowerCase();
		return depts.filter(
			(d) =>
				d.name.toLowerCase().includes(q) ||
				(d.code ?? '').toLowerCase().includes(q) ||
				(d.viet_tat ?? '').toLowerCase().includes(q),
		);
	}, [depts, search]);

	const totalPages = pageSize === 0 ? 1 : Math.ceil(filtered.length / pageSize);

	const safePage = Math.min(page, totalPages || 1);

	const paged = useMemo(() => {
		if (pageSize === 0) return filtered;
		const start = (safePage - 1) * pageSize;
		return filtered.slice(start, start + pageSize);
	}, [filtered, safePage, pageSize]);

	const handleSearch = useCallback((v: string) => {
		setSearch(v);
		setPage(1);
	}, []);
	const handlePageSize = useCallback((v: number) => {
		setPageSize(v);
		setPage(1);
	}, []);

	const handleAdd = useCallback(
		async (data: DeptFormData) => {
			setLoading(true);
			try {
				const created = await createDepartment(data);
				setDepts((prev) => [created, ...prev]);
				setModal(null);
				showToast('success', `Đã thêm "${created.name}"`);
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
		async (data: DeptFormData) => {
			if (!editingDept) return;
			setLoading(true);
			try {
				const updated = await updateDepartment(editingDept.id, data);
				setDepts((prev) =>
					prev.map((d) => (d.id === editingDept.id ? updated : d)),
				);
				setModal(null);
				setEditingDept(null);
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
		[editingDept, showToast],
	);

	const handleDelete = useCallback(async () => {
		if (!deletingDept) return;
		setLoading(true);
		try {
			await deleteDepartment(deletingDept.id);
			setDepts((prev) => prev.filter((d) => d.id !== deletingDept.id));
			setModal(null);
			setDeletingDept(null);
			showToast('success', `Đã xoá "${deletingDept.name}"`);
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Xoá thất bại');
		} finally {
			setLoading(false);
		}
	}, [deletingDept, showToast]);

	const headerActions = (
		<button
			className={styles.btnAddHeader}
			onClick={() => setModal('add')}
		>
			<Ic.Plus /> Thêm khoa phòng
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
					<Ic.Search />
					<input
						className={styles.searchInput}
						placeholder='Tìm theo tên, mã, viết tắt...'
						value={search}
						onChange={(e) => handleSearch(e.target.value)}
					/>
					{search && (
						<button
							className={styles.searchClear}
							onClick={() => handleSearch('')}
						>
							<Ic.X />
						</button>
					)}
				</div>
				<span className={styles.resultCount}>{filtered.length} khoa phòng</span>
				<div className={styles.pageSizeWrap}>
					<label className={styles.pageSizeLabel}>Hiển thị</label>
					<select
						className={styles.pageSizeSelect}
						value={pageSize}
						onChange={(e) => handlePageSize(Number(e.target.value))}
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
						{isLoadingData ? (
							<tr>
								<td colSpan={6}>
									<div className={styles.emptyState}>
										<div className={styles.emptyDesc}>Đang tải dữ liệu...</div>
									</div>
								</td>
							</tr>
						) : filtered.length === 0 ? (
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
							paged.map((dept, i) => {
								const c = getDeptColor(dept.id);
								const rowNum =
									(safePage - 1) * (pageSize || filtered.length) + i + 1;
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
													{getInitials(dept.viet_tat || dept.name)}
												</div>
												<span className={styles.deptName}>{dept.name}</span>
											</div>
										</td>
										<td className={styles.td}>
											<span className={styles.codeTag}>{dept.code}</span>
										</td>
										<td className={styles.td}>
											<div className={styles.statCell}>
												<Ic.Users />
												{dept.user_count ?? 0}
											</div>
										</td>
										<td className={styles.td}>
											<div className={styles.statCell}>
												<Ic.BookOpen />
												{dept.topic_count ?? 0}
											</div>
										</td>
										<td className={`${styles.td} ${styles.tdActions}`}>
											<button
												className={`${styles.actionBtn} ${styles.actionEdit}`}
												title='Chỉnh sửa'
												onClick={() => {
													setEditingDept(dept);
													setModal('edit');
												}}
											>
												<Ic.Edit />
											</button>
											<button
												className={`${styles.actionBtn} ${styles.actionDelete}`}
												title='Xoá'
												onClick={() => {
													setDeletingDept(dept);
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
							? `Hiển thị tất cả ${filtered.length} khoa phòng`
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
				<DeptFormModal
					mode='add'
					onClose={() => setModal(null)}
					onSave={handleAdd}
					loading={loading}
				/>
			)}
			{modal === 'edit' && editingDept && (
				<DeptFormModal
					mode='edit'
					dept={editingDept}
					onClose={() => {
						setModal(null);
						setEditingDept(null);
					}}
					onSave={handleEdit}
					loading={loading}
				/>
			)}
			{modal === 'delete' && deletingDept && (
				<DeleteModal
					dept={deletingDept}
					onClose={() => {
						setModal(null);
						setDeletingDept(null);
					}}
					onConfirm={handleDelete}
					loading={loading}
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
