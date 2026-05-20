import React, { useEffect, useRef, useState } from 'react';
import { BASE_URL } from '../../../lib/apiClient';
import {
	addTopicMember,
	deleteTopicFile,
	deleteTopicMember,
	getTopicFiles,
	getTopicMembers,
	grantTopicMemberAccounts,
	searchUsers,
	uploadTopicFiles,
	type GrantedAccount,
	type SimpleItem,
	type UserSuggestion,
} from '../api/topicApi';
import type {
	DrawerTab,
	MemberRole,
	Topic,
	TopicFile,
	TopicMember,
} from '../types/topic.type';
import styles from '../pages/Topic.module.css';
import {
	MEMBER_ROLE_CFG,
	STATUS_CFG,
	formatFileSize,
	genMemberUsername,
	getFileTypeColor,
	getInitials,
	getMimeExtension,
	lookup,
} from '../utils/topicHelpers';
import { Ic } from '../utils/topicIcons';
import { Badge } from './shared/Badge';
import { ConfirmDeleteFileModal } from './ConfirmDeleteFileModal';
import { ConfirmUploadModal } from './ConfirmUploadModal';
import { GrantedAccountsModal } from './GrantedAccountsModal';

interface DrawerProps {
	topic: Topic;
	categories: SimpleItem[];
	levels: SimpleItem[];
	rounds: SimpleItem[];
	departments: SimpleItem[];
	onClose: () => void;
	onEdit: () => void;
}

export function TopicDrawer({
	topic,
	categories,
	levels,
	rounds,
	departments,
	onClose,
	onEdit,
}: DrawerProps) {
	const [tab, setTab] = useState<DrawerTab>('info');
	const [members, setMembers] = useState<TopicMember[]>([]);
	const [files, setFiles] = useState<TopicFile[]>([]);

	const [showAddMember, setShowAddMember] = useState(false);
	const [newMember, setNewMember] = useState({
		ho_ten: '',
		email: '',
		so_dien_thoai: '',
		chuc_vu: '',
		staff_number: '',
		department_id: '',
		role: 'member' as MemberRole,
	});
	const [savingMember, setSavingMember] = useState(false);
	const [memberError, setMemberError] = useState('');
	const [nameSuggestions, setNameSuggestions] = useState<UserSuggestion[]>([]);
	const [showNameSuggestions, setShowNameSuggestions] = useState(false);
	const [isSearchingName, setIsSearchingName] = useState(false);
	const nameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const fileInputRef = useRef<HTMLInputElement>(null);
	const [pendingFiles, setPendingFiles] = useState<File[]>([]);
	const [batchNote, setBatchNote] = useState('');
	const [uploading, setUploading] = useState(false);
	const [uploadError, setUploadError] = useState('');
	const [dragging, setDragging] = useState(false);

	const [filesToDelete, setFilesToDelete] = useState<TopicFile[]>([]);
	const [showUploadConfirm, setShowUploadConfirm] = useState(false);
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

	const [grantingIds, setGrantingIds] = useState<Set<string>>(new Set());
	const [grantedAccounts, setGrantedAccounts] = useState<GrantedAccount[]>([]);
	const [grantError, setGrantError] = useState('');
	const pendingMembers = members.filter((m) => !m.account_granted && !m.has_existing_account);
	const membersMissingEmail = pendingMembers.filter(
		(m) => !m.email || !m.email.trim(),
	);

	const canGrantAccountsNoEmail = topic.status === 'approved';

	const handleGrantAccountsNoEmail = async () => {
		if (topic.status !== 'approved') {
			setGrantError(
				'Đề tài chưa được duyệt nên chưa thể cấp tài khoản thành viên.',
			);
			return;
		}
		setGrantingIds(new Set(['all']));
		setGrantError('');
		try {
			const result = await grantTopicMemberAccounts(topic.id);
			const refreshed = await getTopicMembers(topic.id);
			setMembers(refreshed);
			if (result.length > 0) setGrantedAccounts(result);
		} catch (err) {
			setGrantError(err instanceof Error ? err.message : 'Lỗi cấp tài khoản');
		} finally {
			setGrantingIds(new Set());
		}
	};

	const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
		const selected = Array.from(e.target.files ?? []);
		setPendingFiles((prev) => [...prev, ...selected]);
		e.target.value = '';
	};

	const removePending = (idx: number) =>
		setPendingFiles((prev) => prev.filter((_, i) => i !== idx));

	const handleUpload = async () => {
		if (pendingFiles.length === 0) return;
		setUploading(true);
		setUploadError('');
		try {
			await uploadTopicFiles(
				topic.id,
				pendingFiles,
				batchNote.trim() || undefined,
			);
			const res = await getTopicFiles(topic.id);
			setFiles(res.data);
			setPendingFiles([]);
			setBatchNote('');
		} catch (err) {
			setUploadError(err instanceof Error ? err.message : 'Lỗi upload file');
		} finally {
			setUploading(false);
		}
	};

	const toggleSelect = (id: string) =>
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});

	const toggleSelectAll = () =>
		setSelectedIds(
			selectedIds.size === files.length
				? new Set()
				: new Set(files.map((f) => f.id)),
		);

	const handleDeleteFile = (file: TopicFile) => setFilesToDelete([file]);

	const handleBulkDelete = () =>
		setFilesToDelete(files.filter((f) => selectedIds.has(f.id)));

	const handleBulkDownload = () => {
		files
			.filter((f) => selectedIds.has(f.id))
			.forEach((f, i) => {
				setTimeout(() => {
					const a = document.createElement('a');
					a.href = `${BASE_URL}${f.file_url}`;
					a.download = f.file_name;
					document.body.appendChild(a);
					a.click();
					document.body.removeChild(a);
				}, i * 250);
			});
	};

	const doDeleteFiles = async () => {
		const ids = filesToDelete.map((f) => f.id);
		for (const id of ids) await deleteTopicFile(id);
		setFiles((prev) => prev.filter((f) => !ids.includes(f.id)));
		setSelectedIds((prev) => {
			const next = new Set(prev);
			ids.forEach((id) => next.delete(id));
			return next;
		});
		setFilesToDelete([]);
	};

	useEffect(() => {
		const q = newMember.ho_ten.trim();
		if (q.length < 2) {
			setNameSuggestions([]);
			setShowNameSuggestions(false);
			return;
		}
		if (nameDebounceRef.current) clearTimeout(nameDebounceRef.current);
		nameDebounceRef.current = setTimeout(() => {
			setIsSearchingName(true);
			searchUsers(q)
				.then((res) => {
					setNameSuggestions(res.data);
					setShowNameSuggestions(true);
				})
				.catch(() => setNameSuggestions([]))
				.finally(() => setIsSearchingName(false));
		}, 300);
		return () => {
			if (nameDebounceRef.current) clearTimeout(nameDebounceRef.current);
		};
	}, [newMember.ho_ten]);

	useEffect(() => {
		getTopicMembers(topic.id)
			.then(setMembers)
			.catch((err) => {
				console.error('getTopicMembers failed:', err);
				setMembers([]);
			});
		getTopicFiles(topic.id)
			.then((res) => setFiles(res.data))
			.catch((err) => {
				console.error('getTopicFiles failed:', err);
				setFiles([]);
			});
	}, [topic.id]);

	const handleAddMember = async () => {
		if (!newMember.ho_ten.trim()) {
			setMemberError('Vui lòng nhập họ tên');
			return;
		}
		if (!String(newMember.staff_number ?? '').trim()) {
			setMemberError('Vui lòng nhập mã nhân viên');
			return;
		}
		setSavingMember(true);
		setMemberError('');
		try {
			await addTopicMember(topic.id, {
				ho_ten: newMember.ho_ten.trim(),
				email: newMember.email.trim(),
				so_dien_thoai: newMember.so_dien_thoai.trim() || null,
				chuc_vu: newMember.chuc_vu.trim() || null,
				staff_number: String(newMember.staff_number ?? '').trim() || null,
				department_id: newMember.department_id || null,
				role: newMember.role,
			});
			const updated = await getTopicMembers(topic.id);
			setMembers(updated);
			setNewMember({
				ho_ten: '',
				email: '',
				so_dien_thoai: '',
				chuc_vu: '',
				staff_number: '',
				department_id: '',
				role: 'member',
			});
			setShowAddMember(false);
		} catch (err) {
			setMemberError(
				err instanceof Error ? err.message : 'Lỗi thêm thành viên',
			);
		} finally {
			setSavingMember(false);
		}
	};

	const handleDeleteMember = async (memberId: string) => {
		try {
			await deleteTopicMember(topic.id, memberId);
			setMembers((prev) => prev.filter((m) => m.id !== memberId));
		} catch {
			// ignore
		}
	};

	const statusCfg = STATUS_CFG[topic.status];

	const TABS: {
		key: DrawerTab;
		label: string;
		icon: React.ReactNode;
		count?: number;
	}[] = [
		{ key: 'info', label: 'Thông tin', icon: <Ic.Info /> },
		{
			key: 'members',
			label: 'Thành viên',
			icon: <Ic.Users />,
			count: members.length,
		},
		{
			key: 'files',
			label: 'Tài liệu',
			icon: <Ic.Doc />,
			count: files.length,
		},
	];

	return (
		<>
			<div
				className={styles.drawerBackdrop}
				onClick={onClose}
			/>
			<div
				className={styles.drawer}
				role='dialog'
				aria-label='Chi tiết đề tài'
			>
				{/* Header */}
				<div className={styles.drawerHeader}>
					<div className={styles.drawerTitleWrap}>
						<div className={styles.drawerTopicId}>{topic.id}</div>
						<div className={styles.drawerTitle}>{topic.title}</div>
						<div className={styles.drawerBadges}>
							<Badge
								cls={statusCfg.cls}
								dot
							>
								{statusCfg.label}
							</Badge>
							<Badge cls='badgePurple'>{lookup(levels, topic.level_id)}</Badge>
							<Badge cls='badgeTeal'>
								{lookup(categories, topic.category_id)}
							</Badge>
						</div>
					</div>
					<button
						className={styles.drawerCloseBtn}
						onClick={onClose}
						aria-label='Đóng'
					>
						<Ic.X />
					</button>
				</div>

				{/* Tabs */}
				<div className={styles.drawerTabs}>
					{TABS.map((t) => (
						<div
							key={t.key}
							className={`${styles.tab} ${tab === t.key ? styles.tabActive : ''}`}
							onClick={() => setTab(t.key)}
						>
							{t.label}
							{t.count !== undefined && (
								<span className={styles.tabBadge}>{t.count}</span>
							)}
						</div>
					))}
				</div>

				{/* Body */}
				<div className={styles.drawerBody}>
					{/* ── INFO ── */}
					{tab === 'info' && (
						<>
							<div className={styles.infoGrid}>
								<div className={styles.infoItem}>
									<div className={styles.infoLabel}>Đợt nghiên cứu</div>
									<div className={styles.infoValue}>
										{lookup(rounds, topic.round_id)}
									</div>
								</div>
								<div className={styles.infoItem}>
									<div className={styles.infoLabel}>Phòng ban / Khoa</div>
									<div className={styles.infoValue}>
										{lookup(departments, topic.department_id)}
									</div>
								</div>
								<div className={styles.infoItem}>
									<div className={styles.infoLabel}>Cấp độ</div>
									<div className={styles.infoValue}>
										{lookup(levels, topic.level_id)}
									</div>
								</div>
								<div className={styles.infoItem}>
									<div className={styles.infoLabel}>Phân loại</div>
									<div className={styles.infoValue}>
										{lookup(categories, topic.category_id)}
									</div>
								</div>
								<div className={styles.infoItem}>
									<div className={styles.infoLabel}>Ngày đăng ký</div>
									<div className={styles.infoValue}>
										{new Date(topic.created_at).toLocaleString('vi-VN', {
											day: '2-digit',
											month: '2-digit',
											year: 'numeric',
											hour: '2-digit',
											minute: '2-digit',
										})}
									</div>
								</div>
								<div className={styles.infoItem}>
									<div className={styles.infoLabel}>Số thành viên</div>
									<div className={styles.infoValue}>
										{topic.member_count} người
									</div>
								</div>
							</div>

							{topic.description && (
								<div>
									<div
										className={styles.infoLabel}
										style={{ marginBottom: 8 }}
									>
										Mô tả / Tóm tắt
									</div>
									<div className={styles.descBox}>{topic.description}</div>
								</div>
							)}
						</>
					)}

					{/* ── MEMBERS ── */}
					{tab === 'members' && (
						<>
							<div
								className={styles.drawerSection}
								style={{
									display: 'flex',
									justifyContent: 'space-between',
									alignItems: 'center',
								}}
							>
								<span>Danh sách thành viên — {members.length} người</span>
								<button
									className={styles.btnPrimary}
									style={{ padding: '4px 10px', fontSize: 12 }}
									onClick={() => {
										setShowAddMember((v) => !v);
										setMemberError('');
									}}
								>
									<Ic.Plus />
									Thêm
								</button>
							</div>

							{showAddMember && (
								<div
									style={{
										background: 'var(--color-gray-50)',
										border: '1px solid var(--color-gray-200)',
										borderRadius: 8,
										padding: 12,
										marginBottom: 8,
									}}
								>
									<div
										style={{
											display: 'grid',
											gridTemplateColumns: '1fr 1fr',
											gap: 8,
											marginBottom: 8,
										}}
									>
										<div style={{ gridColumn: '1 / -1' }}>
											<label
												style={{
													fontSize: 12,
													fontWeight: 600,
													color: 'var(--color-gray-600)',
													display: 'block',
													marginBottom: 4,
												}}
											>
												Họ tên{' '}
												<span style={{ color: 'var(--color-red-500)' }}>*</span>
											</label>
											<div style={{ position: 'relative' }}>
											<input
												className={styles.formInput}
												placeholder='Nhập họ tên...'
												value={newMember.ho_ten}
												onChange={(e) => {
													setNewMember((p) => ({ ...p, ho_ten: e.target.value }));
													if (e.target.value.trim().length < 2) setShowNameSuggestions(false);
												}}
												onBlur={() => setTimeout(() => setShowNameSuggestions(false), 150)}
											/>
											{showNameSuggestions && (
												<div style={{
													position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
													background: 'var(--color-white)', border: '1px solid var(--color-gray-200)',
													borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
													overflow: 'hidden', marginTop: 2,
												}}>
													{isSearchingName ? (
														<div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--color-gray-400)' }}>Đang tìm...</div>
													) : nameSuggestions.length === 0 ? (
														<div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--color-gray-400)' }}>Không tìm thấy</div>
													) : (
														nameSuggestions.map((u) => (
															<div
																key={u.id}
																onMouseDown={() => {
																	setNewMember((p) => ({
																		...p,
																		ho_ten: u.full_name,
																		staff_number: u.staff_number != null ? String(u.staff_number) : '',
																		email: u.email,
																		department_id: u.department_id,
																	}));
																	setShowNameSuggestions(false);
																}}
																style={{ padding: '7px 12px', cursor: 'pointer', borderBottom: '1px solid var(--color-gray-100)' }}
																onMouseEnter={(e) => (e.currentTarget.style.background = '#f0fbf6')}
																onMouseLeave={(e) => (e.currentTarget.style.background = '')}
															>
																<div style={{ fontWeight: 600, fontSize: 12, color: 'var(--color-gray-800)' }}>{u.full_name}</div>
																<div style={{ fontSize: 11, color: 'var(--color-gray-400)' }}>
																	MNV: {u.staff_number ?? '—'} · {u.username}
																</div>
															</div>
														))
													)}
												</div>
											)}
										</div>
										</div>
										<div>
											<label
												style={{
													fontSize: 12,
													fontWeight: 600,
													color: 'var(--color-gray-600)',
													display: 'block',
													marginBottom: 4,
												}}
											>
												Mã nhân viên{' '}
												<span style={{ color: 'var(--color-red-500)' }}>*</span>
											</label>
											<input
												className={styles.formInput}
												placeholder='VD: 0123'
												value={newMember.staff_number}
												onChange={(e) =>
													setNewMember((p) => ({
														...p,
														staff_number: e.target.value,
													}))
												}
											/>
										</div>
										<div>
											<label
												style={{
													fontSize: 12,
													fontWeight: 600,
													color: 'var(--color-gray-600)',
													display: 'block',
													marginBottom: 4,
												}}
											>
												Chức vụ
											</label>
											<input
												className={styles.formInput}
												placeholder='Bác sĩ, Điều dưỡng...'
												value={newMember.chuc_vu}
												onChange={(e) =>
													setNewMember((p) => ({
														...p,
														chuc_vu: e.target.value,
													}))
												}
											/>
										</div>
										<div>
											<label
												style={{
													fontSize: 12,
													fontWeight: 600,
													color: 'var(--color-gray-600)',
													display: 'block',
													marginBottom: 4,
												}}
											>
												Khoa / Phòng ban
											</label>
											<select
												className={styles.formSelect}
												value={newMember.department_id}
												onChange={(e) =>
													setNewMember((p) => ({
														...p,
														department_id: e.target.value,
													}))
												}
											>
												<option value=''>— Chọn khoa —</option>
												{departments.map((d) => (
													<option
														key={d.id}
														value={d.id}
													>
														{d.name}
													</option>
												))}
											</select>
										</div>
										<div>
											<label
												style={{
													fontSize: 12,
													fontWeight: 600,
													color: 'var(--color-gray-600)',
													display: 'block',
													marginBottom: 4,
												}}
											>
												Vai trò
											</label>
											<select
												className={styles.formSelect}
												value={newMember.role}
												onChange={(e) =>
													setNewMember((p) => ({
														...p,
														role: e.target.value as MemberRole,
													}))
												}
											>
												{(Object.keys(MEMBER_ROLE_CFG) as MemberRole[]).map(
													(r) => (
														<option
															key={r}
															value={r}
														>
															{MEMBER_ROLE_CFG[r].label}
														</option>
													),
												)}
											</select>
										</div>
									</div>
									<div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, marginBottom: 8 }}>
										<div>
											<label
												style={{
													fontSize: 12,
													fontWeight: 600,
													color: 'var(--color-gray-600)',
													display: 'block',
													marginBottom: 4,
												}}
											>
												Email
											</label>
											<input
												className={styles.formInput}
												placeholder='email@hospital.vn (tuỳ chọn)'
												type='email'
												value={newMember.email}
												onChange={(e) =>
													setNewMember((p) => ({ ...p, email: e.target.value }))
												}
											/>
										</div>
										<div>
											<label
												style={{
													fontSize: 12,
													fontWeight: 600,
													color: 'var(--color-gray-600)',
													display: 'block',
													marginBottom: 4,
												}}
											>
												Số điện thoại
											</label>
											<input
												className={styles.formInput}
												placeholder='0901234567 (tuỳ chọn)'
												type='tel'
												value={newMember.so_dien_thoai}
												onChange={(e) =>
													setNewMember((p) => ({ ...p, so_dien_thoai: e.target.value }))
												}
											/>
										</div>
									</div>
									{memberError && (
										<div
											style={{
												fontSize: 12,
												color: 'var(--color-red-600)',
												marginBottom: 8,
												display: 'flex',
												alignItems: 'center',
												gap: 4,
											}}
										>
											<Ic.Alert /> {memberError}
										</div>
									)}
									<div
										style={{
											display: 'flex',
											gap: 8,
											justifyContent: 'flex-end',
										}}
									>
										<button
											className={styles.btnSecondary}
											style={{ padding: '4px 12px', fontSize: 12 }}
											onClick={() => {
												setShowAddMember(false);
												setMemberError('');
											}}
										>
											Huỷ
										</button>
										<button
											className={styles.btnPrimary}
											style={{ padding: '4px 12px', fontSize: 12 }}
											onClick={handleAddMember}
											disabled={savingMember}
										>
											{savingMember ? 'Đang lưu...' : 'Thêm thành viên'}
										</button>
									</div>
								</div>
							)}

							{/* Bulk grant bar */}
							{pendingMembers.length > 0 && (
								<div className={styles.grantBar}>
									<div className={styles.grantBarText}>
										<Ic.Info />
										{pendingMembers.length} thành viên chưa có tài khoản
									</div>
									<button
										className={styles.grantBarBtn}
										onClick={() => handleGrantAccountsNoEmail()}
										disabled={grantingIds.size > 0 || !canGrantAccountsNoEmail}
									>
										{grantingIds.size > 0
											? 'Đang cấp...'
											: 'Cấp tài khoản cho tất cả'}
									</button>
								</div>
							)}

							{grantError && (
								<div
									style={{
										fontSize: 12,
										color: 'var(--color-red-600)',
										display: 'flex',
										gap: 4,
										alignItems: 'center',
									}}
								>
									<Ic.Alert /> {grantError}
								</div>
							)}

							{pendingMembers.length > 0 && topic.status !== 'approved' && (
								<div
									style={{
										fontSize: 12,
										color: 'var(--color-amber-700)',
										display: 'flex',
										gap: 4,
										alignItems: 'center',
									}}
								>
									<Ic.Info /> Cần duyệt đề tài trước khi cấp tài khoản thành
									viên.
								</div>
							)}

							{false && membersMissingEmail.length > 0 && (
								<div
									style={{
										fontSize: 12,
										color: 'var(--color-amber-700)',
										display: 'flex',
										gap: 4,
										alignItems: 'center',
									}}
								>
									<Ic.Info /> {membersMissingEmail.length} thành viên chưa có
									email nên chưa thể tạo tài khoản.
								</div>
							)}

							{members.length === 0 ? (
								<p
									style={{
										fontSize: 13,
										color: 'var(--color-gray-400)',
										textAlign: 'center',
										padding: '32px 0',
									}}
								>
									Chưa có thành viên nào
								</p>
							) : (
								<div className={styles.memberList}>
									{members.map((m) => {
										const rc = MEMBER_ROLE_CFG[m.role];
										const isGranting = grantingIds.has(m.id);
										const expiryDate = m.account_expires_at
											? new Date(m.account_expires_at).toLocaleDateString(
													'vi-VN',
													{ day: '2-digit', month: '2-digit', year: 'numeric' },
												)
											: null;
										return (
											<div
												key={m.id}
												className={styles.memberItem}
											>
												<div className={styles.memberAvatar}>
													{getInitials(m.ho_ten)}
												</div>
												<div className={styles.memberInfo}>
													<div className={styles.memberName}>{m.ho_ten}</div>
													<div className={styles.memberMeta}>
														{m.staff_number && (
															<span>MNV: {m.staff_number} · </span>
														)}
														{m.email} · {m.chuc_vu ?? 'N/A'}
													</div>
												</div>
												<div className={styles.memberRight}>
													<Badge cls={rc.cls}>{rc.label}</Badge>
													{m.account_granted ? (
														<div className={styles.memberAccountInfo}>
															<span className={styles.memberAccountGranted}>
																✓ {m.username}
															</span>
															{expiryDate && (
																<span className={styles.memberAccountExpiry}>
																	HH đến {expiryDate}
																</span>
															)}
														</div>
													) : m.has_existing_account ? (
														<div className={styles.memberAccountInfo}>
															<span
																style={{
																	fontSize: 11,
																	color: 'var(--color-amber-600, #d97706)',
																	fontWeight: 600,
																}}
															>
																Đã có TK
															</span>
															{m.staff_number && (
																<span
																	style={{
																		fontSize: 11,
																		color: 'var(--color-gray-400)',
																	}}
																>
																	TK: {genMemberUsername(m.ho_ten, m.staff_number)}
																</span>
															)}
														</div>
													) : (
														<div
															style={{
																display: 'flex',
																flexDirection: 'column',
																alignItems: 'flex-end',
																gap: 2,
															}}
														>
															{m.staff_number && (
																<span
																	style={{
																		fontSize: 11,
																		color: 'var(--color-gray-400)',
																	}}
																>
																	TK:{' '}
																	{genMemberUsername(m.ho_ten, m.staff_number)}
																</span>
															)}
															<button
																className={styles.grantBtn}
																onClick={() => handleGrantAccountsNoEmail()}
																disabled={
																	isGranting ||
																	grantingIds.size > 0 ||
																	!canGrantAccountsNoEmail
																}
															>
																{isGranting ? '...' : 'Cấp TK'}
															</button>
														</div>
													)}
												</div>
												<div
													className={`${styles.actionBtn} ${styles.danger}`}
													title='Xoá thành viên'
													onClick={() => handleDeleteMember(m.id)}
													style={{ marginLeft: 4, flexShrink: 0 }}
												>
													<Ic.Trash />
												</div>
											</div>
										);
									})}
								</div>
							)}
						</>
					)}

					{/* ── FILES ── */}
					{tab === 'files' && (
						<>
							{/* Upload zone */}
							<input
								ref={fileInputRef}
								type='file'
								multiple
								style={{ display: 'none' }}
								onChange={handleFileSelect}
							/>
							<div
								className={`${styles.uploadZone} ${dragging ? styles.uploadZoneActive : ''}`}
								onClick={() => fileInputRef.current?.click()}
								onDragOver={(e) => {
									e.preventDefault();
									setDragging(true);
								}}
								onDragLeave={() => setDragging(false)}
								onDrop={(e) => {
									e.preventDefault();
									setDragging(false);
									const dropped = Array.from(e.dataTransfer.files);
									if (dropped.length)
										setPendingFiles((prev) => [...prev, ...dropped]);
								}}
							>
								<div className={styles.uploadZoneIcon}>
									<Ic.Plus />
								</div>
								<div className={styles.uploadZoneText}>
									Kéo thả file vào đây hoặc <span>chọn từ máy tính</span>
								</div>
								<div className={styles.uploadZoneHint}>
									PDF, Word, Excel, ZIP, hình ảnh — tối đa 50 MB/file
								</div>
							</div>

							{/* Pending list */}
							{pendingFiles.length > 0 && (
								<div className={styles.uploadPendingWrap}>
									<div className={styles.uploadPendingHeader}>
										<span className={styles.uploadPendingCount}>
											{pendingFiles.length} file đã chọn
											<span className={styles.uploadPendingDot} />
											{formatFileSize(
												pendingFiles.reduce((s, f) => s + f.size, 0),
											)}{' '}
											tổng
										</span>
										<button
											className={styles.uploadClearAll}
											onClick={() => setPendingFiles([])}
										>
											Xoá tất cả
										</button>
									</div>

									<div className={styles.uploadPendingList}>
										{pendingFiles.map((f, i) => {
											const ext =
												f.name.split('.').pop()?.toLowerCase() ?? 'file';
											const color = getFileTypeColor(ext);
											return (
												<div
													key={i}
													className={styles.uploadPendingRow}
												>
													<div
														className={styles.uploadPendingBadge}
														style={{ background: color + '1a', color }}
													>
														{ext.toUpperCase()}
													</div>
													<span className={styles.uploadPendingName}>
														{f.name}
													</span>
													<span className={styles.uploadPendingSize}>
														{formatFileSize(f.size)}
													</span>
													<button
														className={styles.uploadPendingRemove}
														onClick={() => removePending(i)}
														title='Bỏ file này'
													>
														<Ic.X />
													</button>
												</div>
											);
										})}
									</div>

									<input
										className={styles.formInput}
										placeholder='Ghi chú đợt upload (tùy chọn)'
										value={batchNote}
										onChange={(e) => setBatchNote(e.target.value)}
										disabled={uploading}
									/>

									{uploadError && (
										<p className={styles.uploadError}>{uploadError}</p>
									)}

									<button
										className={styles.btnPrimary}
										style={{ width: '100%', justifyContent: 'center' }}
										onClick={() => setShowUploadConfirm(true)}
										disabled={uploading}
									>
										<Ic.Plus />
										{uploading
											? 'Đang tải lên...'
											: `Tải lên ${pendingFiles.length} file`}
									</button>
								</div>
							)}

							{/* Uploaded file list header */}
							<div
								className={styles.fileListHeader}
								style={{ marginTop: 'var(--space-2)' }}
							>
								<label
									className={styles.fileSelectAllWrap}
									title='Chọn tất cả'
								>
									<input
										type='checkbox'
										className={styles.fileCheckbox}
										checked={
											files.length > 0 && selectedIds.size === files.length
										}
										ref={(el) => {
											if (el)
												el.indeterminate =
													selectedIds.size > 0 &&
													selectedIds.size < files.length;
										}}
										onChange={toggleSelectAll}
									/>
								</label>
								<span
									className={styles.drawerSection}
									style={{ margin: 0, flex: 1 }}
								>
									Tài liệu đã tải lên — {files.length} file
								</span>
							</div>

							{/* Bulk action bar */}
							{selectedIds.size > 0 && (
								<div className={styles.fileBulkBar}>
									<span className={styles.fileBulkCount}>
										{selectedIds.size} file đã chọn
									</span>
									<button
										className={styles.fileBulkBtn}
										onClick={handleBulkDownload}
									>
										<Ic.Download /> Tải về
									</button>
									<button
										className={`${styles.fileBulkBtn} ${styles.fileBulkBtnDanger}`}
										onClick={handleBulkDelete}
									>
										<Ic.Trash /> Xoá
									</button>
									<button
										className={styles.fileBulkClear}
										onClick={() => setSelectedIds(new Set())}
										title='Bỏ chọn'
									>
										<Ic.X />
									</button>
								</div>
							)}

							{files.length === 0 ? (
								<div className={styles.emptyState}>
									<div className={styles.emptyIcon}>
										<Ic.Doc />
									</div>
									<div className={styles.emptyTitle}>Chưa có tài liệu</div>
									<div className={styles.emptyDesc}>
										Tải lên file đầu tiên bằng khu vực phía trên
									</div>
								</div>
							) : (
								<div className={styles.fileList}>
									{files.map((f) => {
										const ext = getMimeExtension(f.mime_type);
										const color = getFileTypeColor(ext);
										const uploadedDate = new Date(
											f.created_at,
										).toLocaleDateString('vi-VN', {
											day: '2-digit',
											month: '2-digit',
											year: 'numeric',
										});
										const isSelected = selectedIds.has(f.id);
										return (
											<div
												key={f.id}
												className={`${styles.fileRow} ${isSelected ? styles.fileRowSelected : ''}`}
												onClick={() => toggleSelect(f.id)}
											>
												<input
													type='checkbox'
													className={styles.fileCheckbox}
													checked={isSelected}
													onChange={() => toggleSelect(f.id)}
													onClick={(e) => e.stopPropagation()}
												/>
												<div
													className={styles.fileRowBadge}
													style={{ background: color + '1a', color }}
												>
													{ext.toUpperCase()}
												</div>
												<div className={styles.fileRowInfo}>
													<div className={styles.fileRowName}>
														{f.file_name}
													</div>
													<div className={styles.fileRowMeta}>
														<span>{formatFileSize(f.file_size)}</span>
														<span className={styles.cfmMetaDot} />
														<span>{f.uploaded_by_name}</span>
														<span className={styles.cfmMetaDot} />
														<span>{uploadedDate}</span>
														{f.batch_note && (
															<>
																<span className={styles.cfmMetaDot} />
																<span style={{ fontStyle: 'italic' }}>
																	{f.batch_note}
																</span>
															</>
														)}
													</div>
												</div>
												<div
													className={styles.fileRowActions}
													onClick={(e) => e.stopPropagation()}
												>
													<a
														href={`${BASE_URL}${f.file_url}`}
														download={f.file_name}
														target='_blank'
														rel='noreferrer'
														className={styles.fileActionBtn}
														title='Tải về'
													>
														<Ic.Download />
													</a>
													<button
														className={`${styles.fileActionBtn} ${styles.fileActionDanger}`}
														title='Xoá file'
														onClick={() => handleDeleteFile(f)}
													>
														<Ic.Trash />
													</button>
												</div>
											</div>
										);
									})}
								</div>
							)}
						</>
					)}
				</div>

				{/* Footer */}
				<div className={styles.drawerFooter}>
					<button
						className={styles.btnSecondary}
						onClick={onClose}
					>
						Đóng
					</button>
					<button
						className={styles.btnPrimary}
						onClick={onEdit}
					>
						<Ic.Edit />
						Chỉnh sửa đề tài
					</button>
				</div>
			</div>

			{filesToDelete.length > 0 && (
				<ConfirmDeleteFileModal
					files={filesToDelete}
					onClose={() => setFilesToDelete([])}
					onConfirm={doDeleteFiles}
				/>
			)}

			{showUploadConfirm && (
				<ConfirmUploadModal
					files={pendingFiles}
					batchNote={batchNote}
					onClose={() => setShowUploadConfirm(false)}
					onConfirm={async () => {
						await handleUpload();
						setShowUploadConfirm(false);
					}}
				/>
			)}

			{grantedAccounts.length > 0 && (
				<GrantedAccountsModal
					accounts={grantedAccounts}
					members={members}
					onClose={() => setGrantedAccounts([])}
				/>
			)}
		</>
	);
}
