import { useEffect, useMemo, useState } from 'react';
import {
	BellSvg,
	CheckCircleSvg,
	CheckSmSvg,
	ChevDSvg,
	RefreshSvg,
	SearchSvg,
	SendSvg,
	TrashSvg,
	WarnSvg,
} from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { getDepartments } from '../../department/api/departmentApi';
import type { Department } from '../../department/types/department.type';
import { getUsers } from '../../user/api/userApi';
import type { User } from '../../user/types/user.type';
import {
	adminGetNotifications,
	deleteNotification,
	sendNotification,
} from '../api/notificationApi';
import type { AdminNotification } from '../api/notificationApi';
import { NOTIF_TYPES, TARGET_LABELS } from '../types/notification.type';
import type { TargetType } from '../types/notification.type';
import { toNotif } from '../utils/notifUtils';
import styles from './AdminNotifications.module.css';

const EMPTY_FORM = {
	type: 'broadcast',
	title: '',
	message: '',
	target_type: 'all' as TargetType,
	target_ids: [] as string[],
	ref_id: '',
	ref_type: '',
};

export default function AdminNotifications() {
	// ── Send form state ──────────────────────
	const [form, setForm] = useState(EMPTY_FORM);
	const [depts, setDepts] = useState<Department[]>([]);
	const [deptSearch, setDeptSearch] = useState('');
	const [usersList, setUsersList] = useState<User[]>([]);
	const [userSearch, setUserSearch] = useState('');
	const [loadingUsers, setLoadingUsers] = useState(true);
	const [sending, setSending] = useState(false);
	const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

	// ── Tree-select helpers ──────────────────
	const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());

	const usersByDept = useMemo(() =>
		usersList.reduce<Record<string, typeof usersList>>((acc, u) => {
			(acc[u.department_id] ??= []).push(u);
			return acc;
		}, {}),
		[usersList],
	);

	const getDeptState = (deptId: string): 'all' | 'some' | 'none' => {
		const ids = (usersByDept[deptId] ?? []).map((u) => u.id);
		if (!ids.length) return 'none';
		const sel = ids.filter((id) => form.target_ids.includes(id)).length;
		if (sel === ids.length) return 'all';
		return sel > 0 ? 'some' : 'none';
	};

	const toggleDeptSelection = (deptId: string) => {
		const ids = (usersByDept[deptId] ?? []).map((u) => u.id);
		const allSel = getDeptState(deptId) === 'all';
		setForm((f) => ({
			...f,
			target_ids: allSel
				? f.target_ids.filter((id) => !ids.includes(id))
				: [...new Set([...f.target_ids, ...ids])],
		}));
	};

	const toggleUserInDept = (userId: string) => {
		setForm((f) => ({
			...f,
			target_ids: f.target_ids.includes(userId)
				? f.target_ids.filter((id) => id !== userId)
				: [...f.target_ids, userId],
		}));
	};

	const filteredDepts = depts.filter((d) => {
		const q = deptSearch.trim().toLowerCase();
		if (!q) return true;
		if (d.name.toLowerCase().includes(q)) return true;
		// show dept if any user matches search (tree mode)
		if (form.target_type === 'department')
			return (usersByDept[d.id] ?? []).some(
				(u) => u.full_name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q),
			);
		return false;
	});

	const filteredUsers = usersList.filter((u) => {
		const q = userSearch.trim().toLowerCase();
		if (!q) return true;
		return (
			u.full_name.toLowerCase().includes(q) ||
			u.username.toLowerCase().includes(q) ||
			(u.staff_number && u.staff_number.toLowerCase().includes(q)) ||
			u.id.toLowerCase().includes(q)
		);
	});

	// ── History state ────────────────────────
	const [rows, setRows] = useState<AdminNotification[]>([]);
	const [page, setPage] = useState(1);
	const [total, setTotal] = useState(0);
	const [search, setSearch] = useState('');
	const [filterType, setFilterType] = useState('');
	const [loading, setLoading] = useState(false);
	const [deleting, setDeleting] = useState<string | null>(null);
	const [refreshKey, setRefreshKey] = useState(0);

	const LIMIT = 20;

	const showToast = (msg: string, ok = true) => {
		setToast({ msg, ok });
		setTimeout(() => setToast(null), 3000);
	};

	useEffect(() => {
		getDepartments()
			.then((res) => setDepts(res.data))
			.catch(() => {});

		getUsers({ limit: 200 })
			.then((res) => setUsersList(res.data))
			.catch(() => {})
			.finally(() => setLoadingUsers(false));
	}, []);

	useEffect(() => {
		let cancelled = false;
		queueMicrotask(async () => {
			if (cancelled) return;
			setLoading(true);
			try {
				const res = await adminGetNotifications({
					page,
					limit: LIMIT,
					type: filterType || undefined,
					search: search || undefined,
				});
				if (!cancelled) {
					setRows(res.data);
					setTotal(res.pagination.total);
				}
			} catch {
				// ignore
			} finally {
				if (!cancelled) setLoading(false);
			}
		});
		return () => {
			cancelled = true;
		};
	}, [page, filterType, search, refreshKey]);

	const handleSend = async () => {
		if (!form.title.trim()) {
			showToast('Vui lòng nhập tiêu đề', false);
			return;
		}
		const target_ids = form.target_ids;
		if (
			(form.target_type === 'users' || form.target_type === 'department') &&
			!target_ids.length
		) {
			showToast('Vui lòng chọn ít nhất một người nhận', false);
			return;
		}
		setSending(true);
		try {
			// dept mode always resolves to user IDs → send as 'users'
			const effectiveTargetType =
				form.target_type === 'department' ? 'users' : form.target_type;
			const res = await sendNotification({
				type: form.type,
				title: form.title.trim(),
				message: form.message.trim() || undefined,
				ref_id: form.ref_id.trim() || undefined,
				ref_type: form.ref_type.trim() || undefined,
				target_type: effectiveTargetType,
				target_ids,
			});
			showToast(`Đã gửi thành công tới ${res.sent} người dùng`);
			setForm(EMPTY_FORM);
			setDeptSearch('');
			setUserSearch('');
			setExpandedDepts(new Set());
			setRefreshKey((k) => k + 1);
		} catch (err: unknown) {
			showToast(err instanceof Error ? err.message : 'Gửi thất bại', false);
		} finally {
			setSending(false);
		}
	};

	const handleDelete = async (id: string) => {
		setDeleting(id);
		try {
			await deleteNotification(id);
			showToast('Đã xoá thông báo');
			setRefreshKey((k) => k + 1);
		} catch {
			showToast('Xoá thất bại', false);
		} finally {
			setDeleting(null);
		}
	};

	const totalPages = Math.ceil(total / LIMIT);

	const typeLabel = (t: string) =>
		NOTIF_TYPES.find((x) => x.value === t)?.label ?? t;

	return (
		<AdminLayout
			pageTitle='Quản lý thông báo'
			pageSubtitle='Gửi thông báo và xem lịch sử thông báo hệ thống'
		>
			<div className={styles.layout}>
				{/* ── SEND FORM ───────────────────────── */}
				<section className={styles.card}>
					<div className={styles.cardHeader}>
						<div className={styles.cardHeaderIcon}>
							<SendSvg />
						</div>
						<div>
							<div className={styles.cardTitle}>Gửi thông báo</div>
							<div className={styles.cardSub}>
								Tạo và gửi thông báo đến người dùng
							</div>
						</div>
					</div>

					<div className={styles.formBody}>
						<div className={styles.formRow2}>
							<div className={styles.formGroup}>
								<label className={styles.formLabel}>
									Loại thông báo <span className={styles.req}>*</span>
								</label>
								<select
									className={styles.formSelect}
									value={form.type}
									onChange={(e) =>
										setForm((f) => ({ ...f, type: e.target.value }))
									}
								>
									{NOTIF_TYPES.map((t) => (
										<option
											key={t.value}
											value={t.value}
										>
											{t.label}
										</option>
									))}
								</select>
							</div>

							<div className={styles.formGroup}>
								<label className={styles.formLabel}>
									Đối tượng nhận <span className={styles.req}>*</span>
								</label>
								<select
									className={styles.formSelect}
									value={form.target_type}
									onChange={(e) =>
										setForm((f) => ({
											...f,
											target_type: e.target.value as TargetType,
											target_ids: [],
										}))
									}
								>
									{(Object.keys(TARGET_LABELS) as TargetType[]).map((k) => (
										<option
											key={k}
											value={k}
										>
											{TARGET_LABELS[k]}
										</option>
									))}
								</select>
							</div>
						</div>

						{form.target_type === 'department' && (
							<div className={styles.formGroup}>
								<div className={styles.deptHeader}>
									<label className={styles.formLabel}>
										Phòng ban & Thành viên
										{form.target_ids.length > 0 && (
											<span className={styles.selCount}>
												{' '}— {form.target_ids.length} người
											</span>
										)}
									</label>
									<div className={styles.deptActions}>
										<button
											type='button'
											className={styles.btnLink}
											onClick={() =>
												setForm((f) => ({
													...f,
													target_ids: usersList.map((u) => u.id),
												}))
											}
										>
											Chọn tất cả
										</button>
										<button
											type='button'
											className={styles.btnLink}
											onClick={() => {
												setForm((f) => ({ ...f, target_ids: [] }));
												setExpandedDepts(new Set());
											}}
										>
											Bỏ chọn
										</button>
									</div>
								</div>
								<div className={styles.deptSearchWrap}>
									<input
										type='text'
										className={styles.deptSearchInput}
										placeholder='Tìm phòng ban hoặc người dùng...'
										value={deptSearch}
										onChange={(e) => setDeptSearch(e.target.value)}
									/>
								</div>

								{loadingUsers ? (
									<div className={styles.deptTreeList}>
										<div className={styles.emptyDeptText}>Đang tải...</div>
									</div>
								) : (
									<div className={styles.deptTreeList}>
										{filteredDepts.length === 0 ? (
											<div className={styles.emptyDeptText}>
												Không tìm thấy kết quả
											</div>
										) : (
											filteredDepts.map((dept) => {
												const deptUsers = usersByDept[dept.id] ?? [];
												const q = deptSearch.trim().toLowerCase();
												const deptNameMatches =
													!q || dept.name.toLowerCase().includes(q);
												const visibleUsers = deptNameMatches
													? deptUsers
													: deptUsers.filter(
															(u) =>
																u.full_name.toLowerCase().includes(q) ||
																u.username.toLowerCase().includes(q),
														);
												const autoExpand =
													q.length > 0 &&
													!deptNameMatches &&
													visibleUsers.length > 0;
												const isExpanded =
													expandedDepts.has(dept.id) || autoExpand;
												const state = getDeptState(dept.id);
												const selCount = deptUsers.filter((u) =>
													form.target_ids.includes(u.id),
												).length;

												return (
													<div
														key={dept.id}
														className={styles.deptNode}
													>
														<div className={styles.deptNodeHead}>
															{/* Expand toggle */}
															<button
																type='button'
																className={styles.expandBtn}
																onClick={() =>
																	setExpandedDepts((prev) => {
																		const next = new Set(prev);
																		if (next.has(dept.id)) next.delete(dept.id);
																		else next.add(dept.id);
																		return next;
																	})
																}
															>
																<ChevDSvg
																	style={{
																		width: 12,
																		height: 12,
																		transition: 'transform 180ms',
																		transform: isExpanded
																			? 'none'
																			: 'rotate(-90deg)',
																	}}
																/>
															</button>

															{/* Dept checkbox */}
															<span
																className={`${styles.treeCheckBox} ${state === 'all' ? styles.treeCheckOn : state === 'some' ? styles.treeCheckPartial : ''}`}
																onClick={() => toggleDeptSelection(dept.id)}
																role='checkbox'
																aria-checked={
																	state === 'all'
																		? true
																		: state === 'some'
																			? 'mixed'
																			: false
																}
															>
																{state === 'all' && (
																	<CheckSmSvg
																		style={{
																			width: 9,
																			height: 7,
																			color: '#fff',
																		}}
																	/>
																)}
																{state === 'some' && (
																	<span className={styles.partialDash} />
																)}
															</span>

															{/* Name + count */}
															<span
																className={styles.deptNodeName}
																onClick={() => toggleDeptSelection(dept.id)}
															>
																{dept.name}
															</span>
															<span className={styles.deptNodeCount}>
																{selCount}/{deptUsers.length}
															</span>
														</div>

														{/* Users */}
														{isExpanded && (
															<div className={styles.deptNodeUsers}>
																{visibleUsers.length === 0 ? (
																	<div className={styles.deptNodeEmpty}>
																		{deptUsers.length === 0
																			? 'Chưa có người dùng'
																			: 'Không tìm thấy'}
																	</div>
																) : (
																	visibleUsers.map((u) => {
																		const isSel =
																			form.target_ids.includes(u.id);
																		return (
																			<label
																				key={u.id}
																				className={`${styles.userNode} ${isSel ? styles.userNodeOn : ''}`}
																			>
																				<input
																					type='checkbox'
																					hidden
																					checked={isSel}
																					onChange={() =>
																						toggleUserInDept(u.id)
																					}
																				/>
																				<span
																					className={`${styles.treeCheckBox} ${isSel ? styles.treeCheckOn : ''}`}
																				>
																					{isSel && (
																						<CheckSmSvg
																							style={{
																								width: 9,
																								height: 7,
																								color: '#fff',
																							}}
																						/>
																					)}
																				</span>
																				<span className={styles.userNodeName}>
																					{u.full_name}
																				</span>
																				<span className={styles.userNodeSub}>
																					{u.username}
																				</span>
																			</label>
																		);
																	})
																)}
															</div>
														)}
													</div>
												);
											})
										)}
									</div>
								)}
							</div>
						)}

						{form.target_type === 'users' && (
							<div className={styles.formGroup}>
								<div className={styles.deptHeader}>
									<label className={styles.formLabel}>
										Chọn người nhận cụ thể ({form.target_ids.length}/
										{usersList.length})
									</label>
									<div className={styles.deptActions}>
										<button
											type='button'
											className={styles.btnLink}
											onClick={() =>
												setForm((f) => ({
													...f,
													target_ids: usersList.map((u) => u.id),
												}))
											}
										>
											Chọn tất cả
										</button>
										<button
											type='button'
											className={styles.btnLink}
											onClick={() => setForm((f) => ({ ...f, target_ids: [] }))}
										>
											Bỏ chọn
										</button>
									</div>
								</div>
								<div className={styles.deptSearchWrap}>
									<input
										type='text'
										className={styles.deptSearchInput}
										placeholder='Tìm kiếm người dùng (họ tên, tài khoản, mã NV)...'
										value={userSearch}
										onChange={(e) => setUserSearch(e.target.value)}
									/>
								</div>
								<div className={styles.deptGrid}>
									{loadingUsers ? (
										<div className={styles.emptyDeptText}>
											Đang tải danh sách người dùng...
										</div>
									) : filteredUsers.length === 0 ? (
										<div className={styles.emptyDeptText}>
											Không tìm thấy người dùng nào
										</div>
									) : (
										filteredUsers.map((u) => {
											const isSel = form.target_ids.includes(u.id);
											return (
												<label
													key={u.id}
													className={`${styles.deptCheck} ${isSel ? styles.deptCheckActive : ''}`}
												>
													<input
														type='checkbox'
														checked={isSel}
														onChange={() =>
															setForm((f) => ({
																...f,
																target_ids: isSel
																	? f.target_ids.filter((x) => x !== u.id)
																	: [...f.target_ids, u.id],
															}))
														}
													/>
													<span
														className={`${styles.customBox} ${isSel ? styles.customBoxActive : ''}`}
													>
														{isSel && (
															<CheckSmSvg
																style={{ width: 10, height: 8, color: '#fff' }}
															/>
														)}
													</span>
													<span className={styles.itemLabel}>
														{u.full_name}{' '}
														<small style={{ opacity: 0.65 }}>
															({u.username})
														</small>
													</span>
												</label>
											);
										})
									)}
								</div>
							</div>
						)}

						<div className={styles.formGroup}>
							<label className={styles.formLabel}>
								Tiêu đề <span className={styles.req}>*</span>
							</label>
							<input
								className={styles.formInput}
								type='text'
								placeholder='Nhập tiêu đề thông báo...'
								value={form.title}
								onChange={(e) =>
									setForm((f) => ({ ...f, title: e.target.value }))
								}
							/>
						</div>

						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Nội dung</label>
							<textarea
								className={styles.formInput}
								rows={4}
								placeholder='Nhập nội dung chi tiết...'
								value={form.message}
								onChange={(e) =>
									setForm((f) => ({ ...f, message: e.target.value }))
								}
							/>
						</div>

						<div className={styles.formRow2}>
							<div className={styles.formGroup}>
								<label className={styles.formLabel}>Ref Type (tuỳ chọn)</label>
								<input
									className={styles.formInput}
									type='text'
									placeholder='VD: topic, round'
									value={form.ref_type}
									onChange={(e) =>
										setForm((f) => ({ ...f, ref_type: e.target.value }))
									}
								/>
							</div>
							<div className={styles.formGroup}>
								<label className={styles.formLabel}>Ref ID (tuỳ chọn)</label>
								<input
									className={styles.formInput}
									type='text'
									placeholder='ID đối tượng liên quan'
									value={form.ref_id}
									onChange={(e) =>
										setForm((f) => ({ ...f, ref_id: e.target.value }))
									}
								/>
							</div>
						</div>

						<div className={styles.formActions}>
							<button
								className={styles.btnSend}
								onClick={handleSend}
								disabled={sending}
							>
								{sending ? (
									<span className={styles.spinner} />
								) : (
									<SendSvg style={{ width: 15, height: 15 }} />
								)}
								{sending ? 'Đang gửi...' : 'Gửi thông báo'}
							</button>
						</div>
					</div>
				</section>

				{/* ── HISTORY ─────────────────────────── */}
				<section className={styles.card}>
					<div className={styles.cardHeader}>
						<div className={styles.cardHeaderIcon}>
							<BellSvg />
						</div>
						<div>
							<div className={styles.cardTitle}>Lịch sử thông báo</div>
							<div className={styles.cardSub}>
								Tổng cộng {total} thông báo trong hệ thống
							</div>
						</div>
						<button
							className={styles.btnRefresh}
							onClick={() => setRefreshKey((k) => k + 1)}
							title='Làm mới'
						>
							<RefreshSvg style={{ width: 14, height: 14 }} />
						</button>
					</div>

					<div className={styles.historyToolbar}>
						<div className={styles.searchBox}>
							<SearchSvg />
							<input
								className={styles.searchInput}
								placeholder='Tìm tiêu đề...'
								value={search}
								onChange={(e) => {
									setSearch(e.target.value);
									setPage(1);
								}}
							/>
						</div>
						<select
							className={styles.filterSelect}
							value={filterType}
							onChange={(e) => {
								setFilterType(e.target.value);
								setPage(1);
							}}
						>
							<option value=''>Tất cả loại</option>
							{NOTIF_TYPES.map((t) => (
								<option
									key={t.value}
									value={t.value}
								>
									{t.label}
								</option>
							))}
						</select>
					</div>

					{loading ? (
						<div className={styles.loadingWrap}>
							<span className={styles.spinnerDark} />
						</div>
					) : rows.length === 0 ? (
						<div className={styles.emptyState}>
							<BellSvg
								style={{
									width: 36,
									height: 36,
									color: 'var(--color-gray-300)',
								}}
							/>
							<div className={styles.emptyTitle}>Chưa có thông báo nào</div>
						</div>
					) : (
						<div className={styles.tableWrap}>
							<table className={styles.table}>
								<thead>
									<tr>
										<th className={styles.th}>Loại</th>
										<th className={styles.th}>Tiêu đề / Nội dung</th>
										<th className={styles.th}>Người nhận</th>
										<th className={styles.th}>Trạng thái</th>
										<th className={styles.th}>Thời gian</th>
										<th className={styles.th} />
									</tr>
								</thead>
								<tbody>
									{rows.map((row) => {
										const notif = toNotif(row);
										return (
											<tr
												key={row.id}
												className={styles.tr}
											>
												<td className={styles.td}>
													<span
														className={`${styles.typeBadge} ${styles[`type_${notif.type}`]}`}
													>
														{typeLabel(row.type)}
													</span>
												</td>
												<td className={styles.td}>
													<div className={styles.rowTitle}>{row.title}</div>
													{row.message && (
														<div className={styles.rowMsg}>{row.message}</div>
													)}
												</td>
												<td className={styles.td}>
													<div className={styles.recipientName}>
														{row.full_name}
													</div>
													<div className={styles.recipientId}>
														{row.user_id}
													</div>
												</td>
												<td className={styles.td}>
													{row.is_read ? (
														<span className={styles.readBadge}>
															<CheckCircleSvg
																style={{ width: 12, height: 12 }}
															/>
															Đã đọc
														</span>
													) : (
														<span className={styles.unreadBadge}>
															<WarnSvg style={{ width: 12, height: 12 }} />
															Chưa đọc
														</span>
													)}
												</td>
												<td className={styles.td}>
													<div className={styles.timeText}>{notif.time}</div>
												</td>
												<td className={styles.td}>
													<button
														className={styles.btnDelete}
														onClick={() => handleDelete(row.id)}
														disabled={deleting === row.id}
														title='Xoá'
													>
														{deleting === row.id ? (
															<span className={styles.spinnerSm} />
														) : (
															<TrashSvg style={{ width: 14, height: 14 }} />
														)}
													</button>
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					)}

					{totalPages > 1 && (
						<div className={styles.pagination}>
							<span className={styles.paginInfo}>
								Trang {page}/{totalPages} — {total} mục
							</span>
							<div className={styles.paginBtns}>
								<button
									className={styles.paginBtn}
									disabled={page === 1}
									onClick={() => setPage((p) => p - 1)}
								>
									‹
								</button>
								{Array.from(
									{ length: Math.min(totalPages, 7) },
									(_, i) => i + 1,
								).map((p) => (
									<button
										key={p}
										className={`${styles.paginBtn} ${page === p ? styles.paginBtnActive : ''}`}
										onClick={() => setPage(p)}
									>
										{p}
									</button>
								))}
								<button
									className={styles.paginBtn}
									disabled={page === totalPages}
									onClick={() => setPage((p) => p + 1)}
								>
									›
								</button>
							</div>
						</div>
					)}
				</section>
			</div>

			{toast && (
				<div
					className={`${styles.toast} ${toast.ok ? styles.toastOk : styles.toastErr}`}
				>
					{toast.ok ? (
						<CheckCircleSvg style={{ width: 15, height: 15 }} />
					) : (
						<WarnSvg style={{ width: 15, height: 15 }} />
					)}
					{toast.msg}
				</div>
			)}
		</AdminLayout>
	);
}
