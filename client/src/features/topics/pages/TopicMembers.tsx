// =============================================
// TopicMembers.tsx — Quản lý Thành viên Đề tài
// Bệnh viện Hữu Nghị Đa Khoa Nghệ An — RMS
// Bảng: topic_members (join topics, users)
// =============================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRealtimeUpdate } from '../../../hooks/useRealtime';
import CheckSvg from '../../../assets/svg/check.svg?react';
import ChevDSvg from '../../../assets/svg/chev-d.svg?react';
import ChevRSvg from '../../../assets/svg/chev-r.svg?react';
import EditSvg from '../../../assets/svg/edit.svg?react';
import InfoSvg from '../../../assets/svg/info.svg?react';
import KeySvg from '../../../assets/svg/key.svg?react';
import MailSvg from '../../../assets/svg/mail.svg?react';
import PhoneSvg from '../../../assets/svg/phone.svg?react';
import PlusSvg from '../../../assets/svg/plus.svg?react';
import SearchSvg from '../../../assets/svg/search.svg?react';
import ShieldSvg from '../../../assets/svg/shield.svg?react';
import TrashSvg from '../../../assets/svg/trash.svg?react';
import UsersSvg from '../../../assets/svg/users.svg?react';
import XSvg from '../../../assets/svg/x.svg?react';
import AdminLayout from '../../../layouts/AdminLayout';
import {
	addTopicMember,
	deleteTopicMember as deleteTopicMemberApi,
	getTopicMembers,
	getTopics,
	grantTopicMemberAccounts,
	updateTopic,
	updateTopicMember as updateTopicMemberApi,
	type TopicMemberApiRole,
} from '../api/topicApi';
import type {
	MemberFormData,
	MemberRole,
	ModalType,
	Topic,
	TopicMember,
	TopicStatus,
} from '../types/topicmember.type';
import styles from './TopicMembers.module.css';

// ─── MOCK DATA ────────────────────────────
const ROLE_CFG: Record<
	MemberRole,
	{ label: string; short: string; cls: string; avatarCls: string }
> = {
	chu_nhiem: {
		label: 'Chủ nhiệm',
		short: 'CN',
		cls: 'roleGreen',
		avatarCls: 'avatarGreen',
	},
	thu_ky: {
		label: 'Thư ký',
		short: 'TK',
		cls: 'roleBlue',
		avatarCls: 'avatarBlue',
	},
	thanh_vien: {
		label: 'Thành viên',
		short: 'TV',
		cls: 'roleGray',
		avatarCls: 'avatarGray',
	},
	co_van: {
		label: 'Cố vấn',
		short: 'CV',
		cls: 'rolePurple',
		avatarCls: 'avatarPurple',
	},
};

const TOPIC_STATUS_CFG: Record<TopicStatus, { label: string; cls: string }> = {
	draft: { label: 'Bản nháp', cls: 'tsBadgeGray' },
	submitted: { label: 'Chờ duyệt', cls: 'tsBadgeAmber' },
	approved: { label: 'Đã phê duyệt', cls: 'tsBadgeGreen' },
	rejected: { label: 'Từ chối', cls: 'tsBadgeRed' },
	supplement: { label: 'Bổ sung', cls: 'tsBadgeBlue' },
	in_progress: { label: 'Đang thực hiện', cls: 'tsBadgeBlue' },
	completed: { label: 'Hoàn thành', cls: 'tsBadgeTeal' },
};

const EMPTY_FORM: MemberFormData = {
	ho_ten: '',
	email: '',
	so_dien_thoai: '',
	chuc_vu: '',
	staff_number: '',
	role: 'thanh_vien',
};

function formatDate(value?: string | null) {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return new Intl.DateTimeFormat('vi-VN').format(date);
}

function normalizeStatus(status?: string | null): TopicStatus {
	switch (status) {
		case 'draft':
		case 'submitted':
		case 'approved':
		case 'rejected':
		case 'supplement':
		case 'in_progress':
		case 'completed':
			return status;
		default:
			return 'submitted';
	}
}

function mapApiRoleToUi(role?: string | null): MemberRole {
	switch (role) {
		case 'leader':
			return 'chu_nhiem';
		case 'secretary':
			return 'thu_ky';
		case 'member':
			return 'thanh_vien';
		default:
			return 'thanh_vien';
	}
}

function mapUiRoleToApi(role: MemberRole): TopicMemberApiRole {
	switch (role) {
		case 'chu_nhiem':
			return 'leader';
		case 'thu_ky':
			return 'secretary';
		case 'thanh_vien':
		case 'co_van':
		default:
			return 'member';
	}
}

function normalizeTopic(topic: Record<string, unknown>): Topic {
	return {
		id: String(topic.id ?? ''),
		title: String(topic.title ?? ''),
		status: normalizeStatus(topic.status as string | null | undefined),
		department_name: String(
			topic.department_name ?? topic.department_id ?? 'Chua gan khoa/phong',
		),
		round_name: String(topic.round_name ?? topic.round_id ?? 'Chua gan dot'),
		member_count: Number(topic.member_count ?? 0),
	};
}

function normalizeMember(member: Record<string, unknown>): TopicMember {
	return {
		id: String(member.id ?? ''),
		topic_id: String(member.topic_id ?? ''),
		ho_ten: String(member.ho_ten ?? ''),
		email: String(member.email ?? ''),
		so_dien_thoai: (member.so_dien_thoai as string | null | undefined) ?? null,
		chuc_vu: (member.chuc_vu as string | null | undefined) ?? null,
		staff_number:
			member.staff_number != null && member.staff_number !== ''
				? String(member.staff_number)
				: null,
		role: mapApiRoleToUi(member.role as string | null | undefined),
		user_id: (member.user_id as string | null | undefined) ?? null,
		account_granted: Boolean(member.account_granted),
		account_granted_at: formatDate(
			member.account_granted_at as string | null | undefined,
		),
		has_existing_account: Boolean((member as Record<string, unknown>).has_existing_account),
		created_at:
			formatDate(member.created_at as string | null | undefined) ?? '',
		created_by: String(member.created_by ?? ''),
	};
}

const Ic = {
	Users: UsersSvg,
	Plus: PlusSvg,
	Edit: EditSvg,
	Trash: TrashSvg,
	Key: KeySvg,
	Check: CheckSvg,
	X: XSvg,
	Search: SearchSvg,
	ChevronDown: ChevDSvg,
	ChevronRight: ChevRSvg,
	Mail: MailSvg,
	Phone: PhoneSvg,
	Shield: ShieldSvg,
	Info: InfoSvg,
};

// ─── BADGE COMPONENT ──────────────────────
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

// ─── AVATAR ───────────────────────────────
function Avatar({
	name,
	cls,
	size = 'md',
}: {
	name: string;
	cls: string;
	size?: 'sm' | 'md' | 'lg';
}) {
	const initials = name
		.split(' ')
		.filter(Boolean)
		.slice(-2)
		.map((w) => w[0])
		.join('')
		.toUpperCase();
	return (
		<div
			className={`${styles.avatar} ${styles[cls as keyof typeof styles]} ${styles[`avatar${size.charAt(0).toUpperCase() + size.slice(1)}` as keyof typeof styles]}`}
		>
			{initials}
		</div>
	);
}

// ─── MEMBER FORM MODAL ────────────────────
function MemberFormModal({
	mode,
	member,
	onClose,
	onSave,
	loading,
}: {
	mode: 'add' | 'edit';
	member?: TopicMember;
	onClose: () => void;
	onSave: (data: MemberFormData) => void;
	loading: boolean;
}) {
	const [form, setForm] = useState<MemberFormData>(
		member
			? {
					ho_ten: member.ho_ten,
					email: member.email,
					so_dien_thoai: member.so_dien_thoai ?? '',
					chuc_vu: member.chuc_vu ?? '',
					staff_number: member.staff_number ?? '',
					role: member.role,
				}
			: EMPTY_FORM,
	);
	const [errors, setErrors] = useState<Partial<MemberFormData>>({});

	const set = (k: keyof MemberFormData, v: string) => {
		setForm((f) => ({ ...f, [k]: v }));
		setErrors((e) => ({ ...e, [k]: undefined }));
	};

	const validate = () => {
		const e: Partial<MemberFormData> = {};
		if (!form.ho_ten.trim()) e.ho_ten = 'Vui lòng nhập họ tên';
		if (!form.email.trim()) e.email = 'Vui lòng nhập email';
		else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
			e.email = 'Email không hợp lệ';
		setErrors(e);
		return Object.keys(e).length === 0;
	};

	const handleSubmit = () => {
		if (validate()) onSave(form);
	};

	return (
		<div
			className={styles.modalBackdrop}
			onClick={onClose}
		>
			<div
				className={styles.modal}
				onClick={(e) => e.stopPropagation()}
			>
				{/* Header */}
				<div className={styles.modalHeader}>
					<div
						className={styles.modalHeaderIcon}
						style={{
							background:
								mode === 'add' ? 'var(--color-primary-pale)' : '#e6f1fb',
							color: mode === 'add' ? 'var(--color-primary-dark)' : '#0c447c',
						}}
					>
						{mode === 'add' ? <Ic.Plus /> : <Ic.Edit />}
					</div>
					<div>
						<div className={styles.modalTitle}>
							{mode === 'add' ? 'Thêm thành viên mới' : 'Cập nhật thông tin'}
						</div>
						<div className={styles.modalSubtitle}>
							{mode === 'add'
								? 'Điền đầy đủ thông tin thành viên'
								: 'Chỉnh sửa thông tin thành viên'}
						</div>
					</div>
					<button
						className={styles.modalClose}
						onClick={onClose}
					>
						<Ic.X />
					</button>
				</div>

				{/* Body */}
				<div className={styles.modalBody}>
					<div className={styles.formGrid}>
						<div
							className={styles.formGroup}
							style={{ gridColumn: '1 / -1' }}
						>
							<label className={styles.formLabel}>
								Họ và tên <span className={styles.required}>*</span>
							</label>
							<input
								className={`${styles.formInput} ${errors.ho_ten ? styles.inputError : ''}`}
								placeholder='VD: BS. Nguyễn Văn A'
								value={form.ho_ten}
								onChange={(e) => set('ho_ten', e.target.value)}
							/>
							{errors.ho_ten && (
								<span className={styles.fieldError}>{errors.ho_ten}</span>
							)}
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>
								Email <span className={styles.required}>*</span>
							</label>
							<div className={styles.inputWithIcon}>
								<Ic.Mail />
								<input
									className={`${styles.formInput} ${styles.inputHasIcon} ${errors.email ? styles.inputError : ''}`}
									placeholder='example@bvnghe.vn'
									value={form.email}
									onChange={(e) => set('email', e.target.value)}
								/>
							</div>
							{errors.email && (
								<span className={styles.fieldError}>{errors.email}</span>
							)}
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Số điện thoại</label>
							<div className={styles.inputWithIcon}>
								<Ic.Phone />
								<input
									className={`${styles.formInput} ${styles.inputHasIcon}`}
									placeholder='0912 345 678'
									value={form.so_dien_thoai}
									onChange={(e) => set('so_dien_thoai', e.target.value)}
								/>
							</div>
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Chức vụ / Học hàm</label>
							<input
								className={styles.formInput}
								placeholder='VD: Trưởng khoa, ThS., PGS.TS.'
								value={form.chuc_vu}
								onChange={(e) => set('chuc_vu', e.target.value)}
							/>
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Mã nhân viên</label>
							<input
								className={styles.formInput}
								placeholder='VD: 12345'
								value={form.staff_number}
								onChange={(e) => set('staff_number', e.target.value)}
							/>
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>
								Vai trò trong đề tài <span className={styles.required}>*</span>
							</label>
							<div className={styles.selectWrapper}>
								<select
									className={styles.formSelect}
									value={form.role}
									onChange={(e) => set('role', e.target.value as MemberRole)}
								>
									{(
										Object.entries(ROLE_CFG) as [
											MemberRole,
											(typeof ROLE_CFG)[MemberRole],
										][]
									).map(([k, v]) => (
										<option
											key={k}
											value={k}
										>
											{v.label}
										</option>
									))}
								</select>
								<Ic.ChevronDown />
							</div>
						</div>
					</div>
				</div>

				{/* Footer */}
				<div className={styles.modalFooter}>
					<button
						className={styles.btnCancel}
						onClick={onClose}
					>
						Huỷ
					</button>
					<button
						className={
							mode === 'add' ? styles.btnConfirmApprove : styles.btnConfirmBlue
						}
						onClick={handleSubmit}
						disabled={loading}
					>
						{loading ? (
							<>
								<span className={styles.spinner} /> Đang lưu...
							</>
						) : mode === 'add' ? (
							<>
								<Ic.Plus /> Thêm thành viên
							</>
						) : (
							<>
								<Ic.Check /> Lưu thay đổi
							</>
						)}
					</button>
				</div>
			</div>
		</div>
	);
}

// ─── DELETE CONFIRM MODAL ─────────────────
function DeleteModal({
	member,
	onClose,
	onConfirm,
	loading,
}: {
	member: TopicMember;
	onClose: () => void;
	onConfirm: () => void;
	loading: boolean;
}) {
	return (
		<div
			className={styles.modalBackdrop}
			onClick={onClose}
		>
			<div
				className={`${styles.modal} ${styles.modalSm}`}
				onClick={(e) => e.stopPropagation()}
			>
				<div
					className={styles.modalBody}
					style={{ textAlign: 'center', gap: 16 }}
				>
					<div
						className={`${styles.modalHeaderIcon} ${styles.iconDanger}`}
						style={{ margin: '0 auto' }}
					>
						<Ic.Trash />
					</div>
					<div>
						<div className={styles.modalTitle}>Xoá thành viên</div>
						<div
							className={styles.modalSubtitle}
							style={{ marginTop: 6 }}
						>
							Bạn có chắc muốn xoá <strong>{member.ho_ten}</strong> khỏi nhóm
							nghiên cứu? Hành động này không thể hoàn tác.
						</div>
					</div>
					{member.account_granted && (
						<div className={styles.warnBox}>
							<Ic.Info />
							<span>
								Thành viên này đã có tài khoản hệ thống. Tài khoản sẽ bị vô hiệu
								hoá sau khi xoá.
							</span>
						</div>
					)}
				</div>
				<div className={styles.modalFooter}>
					<button
						className={styles.btnCancel}
						onClick={onClose}
					>
						Huỷ
					</button>
					<button
						className={styles.btnDanger}
						onClick={onConfirm}
						disabled={loading}
					>
						{loading ? (
							<>
								<span className={styles.spinner} /> Đang xoá...
							</>
						) : (
							<>
								<Ic.Trash /> Xoá thành viên
							</>
						)}
					</button>
				</div>
			</div>
		</div>
	);
}

// ─── GRANT ACCOUNTS MODAL ─────────────────
function GrantModal({
	topic,
	pendingCount,
	onClose,
	onConfirm,
	loading,
}: {
	topic: Topic;
	pendingCount: number;
	onClose: () => void;
	onConfirm: () => void;
	loading: boolean;
}) {
	return (
		<div
			className={styles.modalBackdrop}
			onClick={onClose}
		>
			<div
				className={`${styles.modal} ${styles.modalSm}`}
				onClick={(e) => e.stopPropagation()}
			>
				<div
					className={styles.modalBody}
					style={{ textAlign: 'center', gap: 16 }}
				>
					<div
						className={`${styles.modalHeaderIcon}`}
						style={{
							margin: '0 auto',
							background: '#faeeda',
							color: '#633806',
						}}
					>
						<Ic.Key />
					</div>
					<div>
						<div className={styles.modalTitle}>Cấp tài khoản hàng loạt</div>
						<div
							className={styles.modalSubtitle}
							style={{ marginTop: 6 }}
						>
							Hệ thống sẽ tự động tạo tài khoản cho{' '}
							<strong>{pendingCount} thành viên</strong> chưa có tài khoản trong
							đề tài <em>{topic.id}</em>.
						</div>
					</div>
					<div className={styles.grantInfoBox}>
						<div className={styles.grantInfoRow}>
							<Ic.Shield />
							<span>Username được tạo từ phần đầu email</span>
						</div>
						<div className={styles.grantInfoRow}>
							<Ic.Key />
							<span>Mật khẩu tạm thời gửi qua email</span>
						</div>
						<div className={styles.grantInfoRow}>
							<Ic.Info />
							<span>Thành viên phải đổi mật khẩu khi đăng nhập lần đầu</span>
						</div>
					</div>
				</div>
				<div className={styles.modalFooter}>
					<button
						className={styles.btnCancel}
						onClick={onClose}
					>
						Huỷ
					</button>
					<button
						className={styles.btnConfirmAmber}
						onClick={onConfirm}
						disabled={loading}
					>
						{loading ? (
							<>
								<span className={`${styles.spinner} ${styles.spinnerDark}`} />{' '}
								Đang cấp...
							</>
						) : (
							<>
								<Ic.Key /> Cấp tài khoản ({pendingCount})
							</>
						)}
					</button>
				</div>
			</div>
		</div>
	);
}

// ─── BULK ACTION MODAL ────────────────────
function BulkActionModal({
	action,
	round,
	count,
	onClose,
	onConfirm,
	loading,
}: {
	action: 'approve' | 'reject';
	round: string;
	count: number;
	onClose: () => void;
	onConfirm: () => void;
	loading: boolean;
}) {
	const isApprove = action === 'approve';
	return (
		<div
			className={styles.modalBackdrop}
			onClick={onClose}
		>
			<div
				className={`${styles.modal} ${styles.modalSm}`}
				onClick={(e) => e.stopPropagation()}
			>
				<div
					className={styles.modalBody}
					style={{ textAlign: 'center', gap: 16 }}
				>
					<div
						className={`${styles.modalHeaderIcon} ${isApprove ? '' : styles.iconDanger}`}
						style={{
							margin: '0 auto',
							background: isApprove ? 'var(--color-primary-pale)' : '#fde8e8',
							color: isApprove ? 'var(--color-primary-dark)' : '#b91c1c',
						}}
					>
						{isApprove ? <Ic.Check /> : <Ic.X />}
					</div>
					<div>
						<div className={styles.modalTitle}>
							{isApprove ? 'Phê duyệt tất cả' : 'Từ chối tất cả'}
						</div>
						<div
							className={styles.modalSubtitle}
							style={{ marginTop: 6 }}
						>
							Bạn có chắc muốn {isApprove ? 'phê duyệt' : 'từ chối'}{' '}
							<strong>{count} đề tài đang chờ duyệt</strong> trong đợt{' '}
							<em>{round}</em>? Hành động này không thể hoàn tác.
						</div>
					</div>
				</div>
				<div className={styles.modalFooter}>
					<button
						className={styles.btnCancel}
						onClick={onClose}
					>
						Huỷ
					</button>
					<button
						className={isApprove ? styles.btnConfirmApprove : styles.btnDanger}
						onClick={onConfirm}
						disabled={loading}
					>
						{loading ? (
							<>
								<span className={styles.spinner} /> Đang xử lý...
							</>
						) : isApprove ? (
							<>
								<Ic.Check /> Phê duyệt ({count})
							</>
						) : (
							<>
								<Ic.X /> Từ chối ({count})
							</>
						)}
					</button>
				</div>
			</div>
		</div>
	);
}

// ─── MAIN PAGE ────────────────────────────
export default function TopicMembers() {
	const [topics, setTopics] = useState<Topic[]>([]);
	const [membersByTopic, setMembersByTopic] = useState<
		Record<string, TopicMember[]>
	>({});
	const [selectedTopicId, setSelectedTopicId] = useState<string>('');
	const [search, setSearch] = useState('');
	const [roleFilter, setRoleFilter] = useState<MemberRole | 'all'>('all');
	const [modal, setModal] = useState<ModalType>(null);
	const [editingMember, setEditingMember] = useState<TopicMember | null>(null);
	const [deletingMember, setDeletingMember] = useState<TopicMember | null>(
		null,
	);
	const [loading, setLoading] = useState(false);
	const [listLoading, setListLoading] = useState(true);
	const [memberLoading, setMemberLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [toast, setToast] = useState<{
		msg: string;
		type: 'success' | 'error' | 'info';
	} | null>(null);

	const [expandedRounds, setExpandedRounds] = useState<Set<string>>(
		() => new Set(),
	);
	const [roundSearch, setRoundSearch] = useState<Record<string, string>>({});
	const [bulkTargetRound, setBulkTargetRound] = useState<string>('');

	const showToast = useCallback(
		(msg: string, type: 'success' | 'error' | 'info' = 'success') => {
			setToast({ msg, type });
		},
		[],
	);

	useEffect(() => {
		if (!toast) return;
		const timeout = setTimeout(() => setToast(null), 3000);
		return () => clearTimeout(timeout);
	}, [toast]);

	const loadTopics = useCallback(async () => {
		setListLoading(true);
		setError(null);
		try {
			const res = await getTopics({ limit: 100 });
			const nextTopics = (res.data ?? []).map((topic) =>
				normalizeTopic(topic as unknown as Record<string, unknown>),
			);
			setTopics(nextTopics);
			setExpandedRounds((prev) => {
				if (prev.size > 0) return prev;
				return nextTopics[0] ? new Set([nextTopics[0].round_name]) : new Set();
			});
			setSelectedTopicId((prev) => {
				if (prev && nextTopics.some((topic) => topic.id === prev)) return prev;
				return nextTopics[0]?.id ?? '';
			});
		} catch (err) {
			setError(
				err instanceof Error ? err.message : 'Khong tai duoc danh sach de tai',
			);
		} finally {
			setListLoading(false);
		}
	}, []);

	const loadMembers = useCallback(
		async (topicId: string, silent = false) => {
			if (!topicId) return;
			if (!silent) setMemberLoading(true);
			try {
				const data = await getTopicMembers(topicId);
				setMembersByTopic((prev) => ({
					...prev,
					[topicId]: (data ?? []).map((member) =>
						normalizeMember(member as unknown as Record<string, unknown>),
					),
				}));
			} catch (err) {
				showToast(
					err instanceof Error
						? err.message
						: 'Khong tai duoc danh sach thanh vien',
					'error',
				);
			} finally {
				if (!silent) setMemberLoading(false);
			}
		},
		[showToast],
	);

	useRealtimeUpdate('topic', loadTopics);

	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect
		void loadTopics();
	}, [loadTopics]);

	useEffect(() => {
		if (!selectedTopicId) return;
		if (membersByTopic[selectedTopicId]) return;
		// eslint-disable-next-line react-hooks/set-state-in-effect
		void loadMembers(selectedTopicId);
	}, [membersByTopic, selectedTopicId, loadMembers]);

	const toggleRound = useCallback((round: string) => {
		setExpandedRounds((prev) => {
			const next = new Set(prev);
			if (next.has(round)) next.delete(round);
			else next.add(round);
			return next;
		});
	}, []);

	const getFilteredTopics = useCallback(
		(topics: Topic[], round: string) => {
			const q = (roundSearch[round] ?? '').toLowerCase().trim();
			if (!q) return topics;
			return topics.filter(
				(t) =>
					t.title.toLowerCase().includes(q) ||
					t.id.toLowerCase().includes(q) ||
					t.department_name.toLowerCase().includes(q),
			);
		},
		[roundSearch],
	);

	const groupedTopics = useMemo(() => {
		const map = new Map<string, Topic[]>();
		topics.forEach((t) => {
			if (!map.has(t.round_name)) map.set(t.round_name, []);
			map.get(t.round_name)!.push(t);
		});
		return Array.from(map.entries()).map(([round, topics]) => ({
			round,
			topics,
		}));
	}, [topics]);

	const selectedTopic = useMemo(
		() => topics.find((t) => t.id === selectedTopicId) ?? null,
		[topics, selectedTopicId],
	);

	const topicMembers = useMemo(
		() => membersByTopic[selectedTopicId] ?? [],
		[membersByTopic, selectedTopicId],
	);

	const filteredMembers = useMemo(() => {
		return topicMembers.filter((m) => {
			if (roleFilter !== 'all' && m.role !== roleFilter) return false;
			if (search) {
				const q = search.toLowerCase();
				return (
					m.ho_ten.toLowerCase().includes(q) ||
					m.email.toLowerCase().includes(q) ||
					(m.chuc_vu ?? '').toLowerCase().includes(q)
				);
			}
			return true;
		});
	}, [topicMembers, search, roleFilter]);

	const stats = useMemo(
		() => ({
			total: topicMembers.length,
			granted: topicMembers.filter((m) => m.account_granted || m.has_existing_account).length,
			pending: topicMembers.filter((m) => !m.account_granted && !m.has_existing_account).length,
			chu_nhiem: topicMembers.filter((m) => m.role === 'chu_nhiem').length,
		}),
		[topicMembers],
	);

	const handleAdd = useCallback(
		async (data: MemberFormData) => {
			if (!selectedTopicId) return;
			setLoading(true);
			try {
				await addTopicMember(selectedTopicId, {
					ho_ten: data.ho_ten.trim(),
					email: data.email.trim(),
					so_dien_thoai: data.so_dien_thoai.trim() || null,
					chuc_vu: data.chuc_vu.trim() || null,
					staff_number: data.staff_number.trim() || null,
					role: mapUiRoleToApi(data.role),
				});
				await Promise.all([loadMembers(selectedTopicId, true), loadTopics()]);
				setModal(null);
				showToast(`Da them ${data.ho_ten} vao nhom nghien cuu`);
			} catch (err) {
				showToast(
					err instanceof Error ? err.message : 'Khong them duoc thanh vien',
					'error',
				);
			} finally {
				setLoading(false);
			}
		},
		[selectedTopicId, loadMembers, loadTopics, showToast],
	);

	const handleEdit = useCallback(
		async (data: MemberFormData) => {
			if (!editingMember) return;
			setLoading(true);
			try {
				await updateTopicMemberApi(editingMember.topic_id, editingMember.id, {
					ho_ten: data.ho_ten.trim(),
					email: data.email.trim(),
					so_dien_thoai: data.so_dien_thoai.trim() || null,
					chuc_vu: data.chuc_vu.trim() || null,
					staff_number: data.staff_number.trim() || null,
					role: mapUiRoleToApi(data.role),
				});
				await Promise.all([
					loadMembers(editingMember.topic_id, true),
					loadTopics(),
				]);
				setModal(null);
				setEditingMember(null);
				showToast('Da cap nhat thong tin thanh vien');
			} catch (err) {
				showToast(
					err instanceof Error ? err.message : 'Khong cap nhat duoc thanh vien',
					'error',
				);
			} finally {
				setLoading(false);
			}
		},
		[editingMember, loadMembers, loadTopics, showToast],
	);

	const handleDelete = useCallback(async () => {
		if (!deletingMember) return;
		setLoading(true);
		try {
			await deleteTopicMemberApi(deletingMember.topic_id, deletingMember.id);
			await Promise.all([
				loadMembers(deletingMember.topic_id, true),
				loadTopics(),
			]);
			setModal(null);
			setDeletingMember(null);
			showToast(`Da xoa ${deletingMember.ho_ten}`, 'info');
		} catch (err) {
			showToast(
				err instanceof Error ? err.message : 'Khong xoa duoc thanh vien',
				'error',
			);
		} finally {
			setLoading(false);
		}
	}, [deletingMember, loadMembers, loadTopics, showToast]);

	const handleGrant = useCallback(async () => {
		if (!selectedTopicId) return;
		const pendingMembers = topicMembers.filter(
			(member) => !member.account_granted && !member.has_existing_account,
		);
		if (pendingMembers.length === 0) return;
		setLoading(true);
		try {
			await grantTopicMemberAccounts(selectedTopicId);
			await loadMembers(selectedTopicId, true);
			setModal(null);
			showToast(`Da cap tai khoan cho ${pendingMembers.length} thanh vien`);
		} catch (err) {
			showToast(
				err instanceof Error ? err.message : 'Khong cap duoc tai khoan',
				'error',
			);
		} finally {
			setLoading(false);
		}
	}, [selectedTopicId, topicMembers, loadMembers, showToast]);

	const handleBulkAction = useCallback(
		async (action: 'approve' | 'reject') => {
			const targetTopics = topics.filter(
				(t) => t.round_name === bulkTargetRound && t.status === 'submitted',
			);
			if (targetTopics.length === 0) return;
			setLoading(true);
			try {
				await Promise.all(
					targetTopics.map((t) =>
						updateTopic(t.id, {
							status: action === 'approve' ? 'approved' : 'rejected',
						}),
					),
				);
				await loadTopics();
				setModal(null);
				showToast(
					`Đã ${action === 'approve' ? 'phê duyệt' : 'từ chối'} ${targetTopics.length} đề tài`,
					action === 'approve' ? 'success' : 'info',
				);
			} catch (err) {
				showToast(
					err instanceof Error ? err.message : 'Có lỗi xảy ra khi xử lý hàng loạt',
					'error',
				);
			} finally {
				setLoading(false);
			}
		},
		[topics, bulkTargetRound, loadTopics, showToast],
	);

	const canGrant =
		selectedTopic?.status === 'approved' ||
		selectedTopic?.status === 'in_progress';

	const headerActions = (
		<div
			style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}
		>
			{canGrant && stats.pending > 0 && (
				<button
					className={styles.btnGrantHeader}
					onClick={() => setModal('grant')}
				>
					<Ic.Key />
					Cấp tài khoản ({stats.pending})
				</button>
			)}
			<button
				className={styles.btnAddHeader}
				onClick={() => {
					setEditingMember(null);
					setModal('add');
				}}
			>
				<Ic.Plus />
				Thêm thành viên
			</button>
		</div>
	);

	if (listLoading) {
		return (
			<AdminLayout
				pageTitle='Quản lý Thành viên'
				pageSubtitle='Quản lý danh sách thành viên theo đề tài NCKH — bảng topic_members'
				headerActions={headerActions}
			>
				<div className={styles.emptyState}>
					<div className={styles.emptyIcon}>
						<Ic.Users />
					</div>
					<div className={styles.emptyTitle}>Đang tải danh sách đề tài...</div>
				</div>
			</AdminLayout>
		);
	}

	if (error) {
		return (
			<AdminLayout
				pageTitle='Quản lý Thành viên'
				pageSubtitle='Quản lý danh sách thành viên theo đề tài NCKH — bảng topic_members'
				headerActions={headerActions}
			>
				<div className={styles.emptyState}>
					<div className={styles.emptyIcon}>
						<Ic.Info />
					</div>
					<div className={styles.emptyTitle}>Không tải được dữ liệu</div>
					<div className={styles.emptyDesc}>{error}</div>
				</div>
			</AdminLayout>
		);
	}

	if (!groupedTopics.length) {
		return (
			<AdminLayout
				pageTitle='Quản lý Thành viên'
				pageSubtitle='Quản lý danh sách thành viên theo đề tài NCKH — bảng topic_members'
				headerActions={headerActions}
			>
				<div className={styles.emptyState}>
					<div className={styles.emptyIcon}>
						<Ic.Users />
					</div>
					<div className={styles.emptyTitle}>Chưa có đề tài</div>
					<div className={styles.emptyDesc}>
						Danh sách đề tài đang trống, nên chưa thể quản lý thành viên.
					</div>
				</div>
			</AdminLayout>
		);
	}

	return (
		<AdminLayout
			pageTitle='Quản lý Thành viên'
			pageSubtitle='Quản lý danh sách thành viên theo đề tài NCKH — bảng topic_members'
			headerActions={headerActions}
		>
			{/* ── TOPIC ACCORDION ── */}
			<div className={styles.topicAccordion}>
				{groupedTopics.map(({ round, topics }) => {
					const isRoundOpen = expandedRounds.has(round);
					const filteredTopics = getFilteredTopics(topics, round);
					const hasSearch = topics.length > 5;
					return (
						<div
							key={round}
							className={styles.roundGroup}
						>
							{/* Round header */}
							{(() => {
								const submittedCount = topics.filter(
									(t) => t.status === 'submitted',
								).length;
								return (
									<div
										className={`${styles.roundHeader} ${isRoundOpen ? styles.roundHeaderOpen : ''}`}
									>
										<div
											className={styles.roundHeaderLeft}
											style={{ flex: 1, cursor: 'pointer' }}
											onClick={() => toggleRound(round)}
											role='button'
											tabIndex={0}
											onKeyDown={(e) =>
												e.key === 'Enter' && toggleRound(round)
											}
										>
											<span
												className={`${styles.roundChevron} ${isRoundOpen ? styles.roundChevronOpen : ''}`}
											>
												<Ic.ChevronDown />
											</span>
											<span className={styles.roundName}>{round}</span>
											<span className={styles.roundTopicCount}>
												{roundSearch[round]
													? `${filteredTopics.length} / ${topics.length} đề tài`
													: `${topics.length} đề tài`}
											</span>
										</div>
										{submittedCount > 0 && (
											<div className={styles.roundHeaderRight}>
												<button
													className={styles.btnBulkApprove}
													onClick={() => {
														setBulkTargetRound(round);
														setModal('bulkApprove');
													}}
												>
													<Ic.Check /> Duyệt tất cả ({submittedCount})
												</button>
												<button
													className={styles.btnBulkReject}
													onClick={() => {
														setBulkTargetRound(round);
														setModal('bulkReject');
													}}
												>
													<Ic.X /> Từ chối tất cả ({submittedCount})
												</button>
											</div>
										)}
									</div>
								);
							})()}

							{/* Topics list (collapsible) */}
							{isRoundOpen && (
								<div className={styles.roundTopics}>
									{/* Search bar — chỉ hiện khi đợt có > 5 đề tài */}
									{hasSearch && (
										<div className={styles.roundSearchBar}>
											<div className={styles.roundSearchWrap}>
												<Ic.Search />
												<input
													className={styles.roundSearchInput}
													placeholder='Tìm đề tài, mã, khoa...'
													value={roundSearch[round] ?? ''}
													onChange={(e) =>
														setRoundSearch((prev) => ({
															...prev,
															[round]: e.target.value,
														}))
													}
												/>
												{roundSearch[round] && (
													<button
														className={styles.roundSearchClear}
														onClick={() =>
															setRoundSearch((prev) => ({
																...prev,
																[round]: '',
															}))
														}
													>
														<Ic.X />
													</button>
												)}
											</div>
										</div>
									)}

									{/* Scrollable topic list */}
									<div
										className={`${styles.roundTopicsList} ${topics.length > 5 ? styles.roundTopicsScrollable : ''}`}
									>
										{filteredTopics.length === 0 ? (
											<div className={styles.roundSearchEmpty}>
												Không tìm thấy đề tài phù hợp
											</div>
										) : (
											filteredTopics.map((t) => {
												const sc = TOPIC_STATUS_CFG[t.status];
												const isActive = t.id === selectedTopicId;
												return (
													<div key={t.id}>
														<button
															className={`${styles.topicRow} ${isActive ? styles.topicRowActive : ''}`}
															onClick={() => {
																setSelectedTopicId(t.id);
																setSearch('');
																setRoleFilter('all');
															}}
														>
															<div className={styles.topicRowLeft}>
																<span className={styles.topicRowIndicator} />
																<div className={styles.topicRowInfo}>
																	<div className={styles.topicRowTop}>
																		<span className={styles.topicRowId}>
																			{t.id}
																		</span>
																		<Badge cls={sc.cls}>{sc.label}</Badge>
																		<span className={styles.topicRowDept}>
																			{t.department_name}
																		</span>
																	</div>
																	<div className={styles.topicRowTitle}>
																		{t.title}
																	</div>
																</div>
															</div>
															<div className={styles.topicRowRight}>
																<span className={styles.topicMemberCount}>
																	<Ic.Users />
																	{t.member_count} TV
																</span>
																<span
																	className={`${styles.topicArrow} ${isActive ? styles.topicArrowActive : ''}`}
																>
																	<Ic.ChevronRight />
																</span>
															</div>
														</button>

														{/* Inline member panel */}
														{isActive && selectedTopic && (
															<div className={styles.memberPanel}>
																{/* TOPIC INFO BANNER */}
																<div className={styles.topicBanner}>
																	<div className={styles.topicBannerMain}>
																		<div className={styles.topicBannerTitle}>
																			{selectedTopic?.title}
																		</div>
																		<div className={styles.topicBannerMeta}>
																			<Badge
																				cls={
																					TOPIC_STATUS_CFG[
																						selectedTopic?.status ?? 'submitted'
																					].cls
																				}
																			>
																				{
																					TOPIC_STATUS_CFG[
																						selectedTopic?.status ?? 'submitted'
																					].label
																				}
																			</Badge>
																			<span className={styles.metaDot} />
																			<span>
																				{selectedTopic?.department_name}
																			</span>
																			<span className={styles.metaDot} />
																			<span>{selectedTopic?.round_name}</span>
																		</div>
																	</div>
																	<div className={styles.topicBannerStats}>
																		<div className={styles.bannerStat}>
																			<span className={styles.bannerStatValue}>
																				{stats.total}
																			</span>
																			<span className={styles.bannerStatLabel}>
																				Thành viên
																			</span>
																		</div>
																		<div className={styles.bannerStatDivider} />
																		<div className={styles.bannerStat}>
																			<span
																				className={`${styles.bannerStatValue} ${styles.valueGreen}`}
																			>
																				{stats.granted}
																			</span>
																			<span className={styles.bannerStatLabel}>
																				Có tài khoản
																			</span>
																		</div>
																		<div className={styles.bannerStatDivider} />
																		<div className={styles.bannerStat}>
																			<span
																				className={`${styles.bannerStatValue} ${styles.valueAmber}`}
																			>
																				{stats.pending}
																			</span>
																			<span className={styles.bannerStatLabel}>
																				Chưa cấp
																			</span>
																		</div>
																	</div>
																</div>

																{/* TOOLBAR */}
																<div className={styles.toolbar}>
																	<div className={styles.toolbarLeft}>
																		<div className={styles.searchBox}>
																			<Ic.Search />
																			<input
																				className={styles.searchInput}
																				placeholder='Tìm theo tên, email, chức vụ...'
																				value={search}
																				onChange={(e) =>
																					setSearch(e.target.value)
																				}
																			/>
																			{search && (
																				<button
																					className={styles.searchClear}
																					onClick={() => setSearch('')}
																				>
																					<Ic.X />
																				</button>
																			)}
																		</div>
																		<div className={styles.roleFilters}>
																			{(
																				[
																					'all',
																					'chu_nhiem',
																					'thu_ky',
																					'thanh_vien',
																					'co_van',
																				] as const
																			).map((r) => (
																				<button
																					key={r}
																					className={`${styles.roleFilterBtn} ${roleFilter === r ? styles.roleFilterActive : ''}`}
																					onClick={() => setRoleFilter(r)}
																				>
																					{r === 'all'
																						? 'Tất cả'
																						: ROLE_CFG[r].label}
																					<span
																						className={styles.roleFilterCount}
																					>
																						{r === 'all'
																							? topicMembers.length
																							: topicMembers.filter(
																									(m) => m.role === r,
																								).length}
																					</span>
																				</button>
																			))}
																		</div>
																	</div>
																	<div className={styles.toolbarRight}>
																		<span className={styles.resultCount}>
																			{filteredMembers.length} thành viên
																		</span>
																	</div>
																</div>

																{/* MEMBERS TABLE */}
																<div className={styles.tableWrap}>
																	{memberLoading ? (
																		<div className={styles.emptyState}>
																			<div className={styles.emptyIcon}>
																				<Ic.Users />
																			</div>
																			<div className={styles.emptyTitle}>
																				Dang tai thanh vien...
																			</div>
																		</div>
																	) : filteredMembers.length === 0 ? (
																		<div className={styles.emptyState}>
																			<div className={styles.emptyIcon}>
																				<Ic.Users />
																			</div>
																			<div className={styles.emptyTitle}>
																				{search || roleFilter !== 'all'
																					? 'Không tìm thấy kết quả'
																					: 'Chưa có thành viên'}
																			</div>
																			<div className={styles.emptyDesc}>
																				{search || roleFilter !== 'all'
																					? 'Thử thay đổi bộ lọc hoặc từ khoá tìm kiếm'
																					: 'Thêm thành viên đầu tiên vào nhóm nghiên cứu'}
																			</div>
																			{!search && roleFilter === 'all' && (
																				<button
																					className={styles.btnAddHeader}
																					onClick={() => setModal('add')}
																					style={{ marginTop: 16 }}
																				>
																					<Ic.Plus /> Thêm thành viên
																				</button>
																			)}
																		</div>
																	) : (
																		<table className={styles.table}>
																			<thead>
																				<tr>
																					<th className={styles.th}>#</th>
																					<th className={styles.th}>
																						Thành viên
																					</th>
																					<th className={styles.th}>Chức vụ</th>
																					<th className={styles.th}>Vai trò</th>
																					<th className={styles.th}>Liên hệ</th>
																					<th className={styles.th}>
																						Tài khoản
																					</th>
																					<th
																						className={`${styles.th} ${styles.thRight}`}
																					>
																						Thao tác
																					</th>
																				</tr>
																			</thead>
																			<tbody>
																				{filteredMembers.map((m, i) => {
																					const rc = ROLE_CFG[m.role];
																					return (
																						<tr
																							key={m.id}
																							className={styles.tr}
																						>
																							<td
																								className={`${styles.td} ${styles.tdIdx}`}
																							>
																								{i + 1}
																							</td>
																							<td className={styles.td}>
																								<div
																									className={styles.memberCell}
																								>
																									<Avatar
																										name={m.ho_ten}
																										cls={rc.avatarCls}
																										size='md'
																									/>
																									<div>
																										<div
																											className={
																												styles.memberName
																											}
																										>
																											{m.ho_ten}
																										</div>
																										<div
																											className={
																												styles.memberId
																											}
																										>
																											{m.id}
																											{m.staff_number && (
																												<span
																													style={{
																														marginLeft: 6,
																														color: 'var(--color-gray-400)',
																													}}
																												>
																													· MNV: {m.staff_number}
																												</span>
																											)}
																										</div>
																									</div>
																								</div>
																							</td>
																							<td className={styles.td}>
																								<span className={styles.chucVu}>
																									{m.chuc_vu ?? (
																										<span
																											className={styles.naText}
																										>
																											—
																										</span>
																									)}
																								</span>
																							</td>
																							<td className={styles.td}>
																								<Badge cls={rc.cls}>
																									{rc.label}
																								</Badge>
																							</td>
																							<td className={styles.td}>
																								<div
																									className={styles.contactCell}
																								>
																									<div
																										className={
																											styles.contactEmail
																										}
																									>
																										<Ic.Mail />
																										{m.email}
																									</div>
																									{m.so_dien_thoai && (
																										<div
																											className={
																												styles.contactPhone
																											}
																										>
																											<Ic.Phone />
																											{m.so_dien_thoai}
																										</div>
																									)}
																								</div>
																							</td>
																							<td className={styles.td}>
																								{m.account_granted ? (
																									<div
																										className={
																											styles.accountGranted
																										}
																									>
																										<Ic.Check />
																										<div>
																											<div
																												className={
																													styles.accountUser
																												}
																											>
																												{m.user_id}
																											</div>
																											<div
																												className={
																													styles.accountDate
																												}
																											>
																												{m.account_granted_at}
																											</div>
																										</div>
																									</div>
																								) : m.has_existing_account ? (
																									<span
																										style={{
																											fontSize: 11,
																											color: '#d97706',
																											fontWeight: 600,
																										}}
																									>
																										Đã có TK
																									</span>
																								) : (
																									<span
																										className={
																											styles.accountPending
																										}
																									>
																										Chưa cấp
																									</span>
																								)}
																							</td>
																							<td
																								className={`${styles.td} ${styles.tdActions}`}
																							>
																								<button
																									className={`${styles.actionBtn} ${styles.actionEdit}`}
																									title='Chỉnh sửa'
																									onClick={() => {
																										setEditingMember(m);
																										setModal('edit');
																									}}
																								>
																									<Ic.Edit />
																								</button>
																								<button
																									className={`${styles.actionBtn} ${styles.actionDelete}`}
																									title='Xoá'
																									onClick={() => {
																										setDeletingMember(m);
																										setModal('delete');
																									}}
																								>
																									<Ic.Trash />
																								</button>
																							</td>
																						</tr>
																					);
																				})}
																			</tbody>
																		</table>
																	)}
																</div>

																{/* GRANT WARNING */}
																{!canGrant && stats.pending > 0 && (
																	<div className={styles.grantWarning}>
																		<Ic.Info />
																		<span>
																			Đề tài chưa được phê duyệt. Có thể cấp tài
																			khoản sau khi đề tài đạt trạng thái{' '}
																			<strong>Đã phê duyệt</strong> hoặc{' '}
																			<strong>Đang thực hiện</strong>.
																		</span>
																	</div>
																)}
															</div>
														)}
													</div>
												);
											})
										)}
									</div>

									{/* Scroll hint — chỉ hiện khi có > 5 đề tài và không đang search */}
									{topics.length > 5 && !roundSearch[round] && (
										<div className={styles.roundScrollHint}>
											<Ic.ChevronDown />
											Cuộn để xem thêm
										</div>
									)}
								</div>
							)}
						</div>
					);
				})}
			</div>

			{/* ── MODALS ── */}
			{modal === 'add' && (
				<MemberFormModal
					mode='add'
					onClose={() => setModal(null)}
					onSave={handleAdd}
					loading={loading}
				/>
			)}
			{modal === 'edit' && editingMember && (
				<MemberFormModal
					mode='edit'
					member={editingMember}
					onClose={() => {
						setModal(null);
						setEditingMember(null);
					}}
					onSave={handleEdit}
					loading={loading}
				/>
			)}
			{modal === 'delete' && deletingMember && (
				<DeleteModal
					member={deletingMember}
					onClose={() => {
						setModal(null);
						setDeletingMember(null);
					}}
					onConfirm={handleDelete}
					loading={loading}
				/>
			)}
			{modal === 'grant' && selectedTopic && (
				<GrantModal
					topic={selectedTopic}
					pendingCount={stats.pending}
					onClose={() => setModal(null)}
					onConfirm={handleGrant}
					loading={loading}
				/>
			)}
			{(modal === 'bulkApprove' || modal === 'bulkReject') && (
				<BulkActionModal
					action={modal === 'bulkApprove' ? 'approve' : 'reject'}
					round={bulkTargetRound}
					count={topics.filter(
						(t) =>
							t.round_name === bulkTargetRound && t.status === 'submitted',
					).length}
					onClose={() => setModal(null)}
					onConfirm={() =>
						void handleBulkAction(
							modal === 'bulkApprove' ? 'approve' : 'reject',
						)
					}
					loading={loading}
				/>
			)}

			{/* ── TOAST ── */}
			{toast && (
				<div
					className={`${styles.toast} ${styles[`toast${toast.type.charAt(0).toUpperCase() + toast.type.slice(1)}` as keyof typeof styles]}`}
				>
					{toast.type === 'success' && <Ic.Check />}
					{toast.type === 'error' && <Ic.X />}
					{toast.type === 'info' && <Ic.Info />}
					{toast.msg}
				</div>
			)}
		</AdminLayout>
	);
}
