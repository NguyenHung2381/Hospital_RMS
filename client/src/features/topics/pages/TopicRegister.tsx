import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_FILE_SIZE = 150 * 1024 * 1024; // 150 MB
import { useNavigate, useSearchParams } from 'react-router-dom';
import UserLayout from '../../../layouts/UserLayout';
import { getStoredUser } from '../../../lib/authStorage';
import { getRoundByPublicToken } from '../../round/api/roundApi';
import {
	addTopicMember,
	createTopic,
	getCategories,
	getDepts,
	getLevels,
	getRounds,
	getTopics,
	searchUsers,
	type SimpleItem,
	type UserSuggestion,
} from '../api/topicApi';
import type { FormErrors, MemberRole, TopicStatus } from '../types/topic.type';
import type {
	MyTopic,
	PendingMember,
	PendingTopic,
	RegisterForm,
} from '../types/topicregister.type';
import styles from './TopicRegister.module.css';

// ─── HELPERS ──────────────────────────────
const STATUS_CFG: Record<TopicStatus, { label: string; dot: string }> = {
	submitted: { label: 'Chờ duyệt', dot: '#f59e0b' },
	approved: { label: 'Đã duyệt', dot: '#22c55e' },
	rejected: { label: 'Từ chối', dot: '#ef4444' },
	supplement: { label: 'Bổ sung', dot: '#8b5cf6' },
};

const BADGE_CLS: Record<TopicStatus, string> = {
	submitted: styles.badgeAmber,
	approved: styles.badgeGreen,
	rejected: styles.badgeRed,
	supplement: styles.badgeBlue,
};

const ROLE_CFG: Record<MemberRole, { label: string }> = {
	leader: { label: 'Chủ nhiệm' },
	secretary: { label: 'Thư ký' },
	member: { label: 'Thành viên' },
};

function getInitials(name: string | null | undefined) {
	if (!name) return '?';
	return name
		.replace(/^(BS\.|TS\.|PGS\.|GS\.|ĐD\.|DS\.|CN\.|KS\.)\s*/i, '')
		.split(' ')
		.map((w) => w[0])
		.filter(Boolean)
		.slice(-2)
		.join('')
		.toUpperCase();
}

function fmtDate(iso: string) {
	return new Date(iso).toLocaleDateString('vi-VN', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
	});
}

// ─── ICONS ────────────────────────────────
const Icon = {
	FileText: () => (
		<svg
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='2'
			strokeLinecap='round'
			strokeLinejoin='round'
		>
			<path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' />
			<polyline points='14 2 14 8 20 8' />
			<line
				x1='16'
				y1='13'
				x2='8'
				y2='13'
			/>
			<line
				x1='16'
				y1='17'
				x2='8'
				y2='17'
			/>
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
			strokeLinejoin='round'
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
	AlertCircle: () => (
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
				y1='8'
				x2='12'
				y2='12'
			/>
			<line
				x1='12'
				y1='16'
				x2='12.01'
				y2='16'
			/>
		</svg>
	),
	Send: () => (
		<svg
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='2'
			strokeLinecap='round'
			strokeLinejoin='round'
		>
			<line
				x1='22'
				y1='2'
				x2='11'
				y2='13'
			/>
			<polygon points='22 2 15 22 11 13 2 9 22 2' />
		</svg>
	),
	List: () => (
		<svg
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='2'
			strokeLinecap='round'
			strokeLinejoin='round'
		>
			<line
				x1='8'
				y1='6'
				x2='21'
				y2='6'
			/>
			<line
				x1='8'
				y1='12'
				x2='21'
				y2='12'
			/>
			<line
				x1='8'
				y1='18'
				x2='21'
				y2='18'
			/>
			<line
				x1='3'
				y1='6'
				x2='3.01'
				y2='6'
			/>
			<line
				x1='3'
				y1='12'
				x2='3.01'
				y2='12'
			/>
			<line
				x1='3'
				y1='18'
				x2='3.01'
				y2='18'
			/>
		</svg>
	),
	HelpCircle: () => (
		<svg
			width='15'
			height='15'
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
			<path d='M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3' />
			<line
				x1='12'
				y1='17'
				x2='12.01'
				y2='17'
			/>
		</svg>
	),
	ChevronRight: () => (
		<svg
			width='12'
			height='12'
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
	UserPlus: () => (
		<svg
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='2'
			strokeLinecap='round'
			strokeLinejoin='round'
		>
			<path d='M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' />
			<circle
				cx='8.5'
				cy='7'
				r='4'
			/>
			<line
				x1='20'
				y1='8'
				x2='20'
				y2='14'
			/>
			<line
				x1='23'
				y1='11'
				x2='17'
				y2='11'
			/>
		</svg>
	),
	Upload: () => (
		<svg
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='2'
			strokeLinecap='round'
			strokeLinejoin='round'
		>
			<polyline points='16 16 12 12 8 16' />
			<line
				x1='12'
				y1='12'
				x2='12'
				y2='21'
			/>
			<path d='M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3' />
		</svg>
	),
	Paperclip: () => (
		<svg
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='2'
			strokeLinecap='round'
			strokeLinejoin='round'
		>
			<path d='M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48' />
		</svg>
	),
};

// ─── GUIDE STEPS ──────────────────────────
const GUIDE_STEPS = [
	{
		title: 'Điền thông tin đề tài',
		desc: 'Nhập tiêu đề, mô tả và chọn vòng nghiên cứu phù hợp.',
	},
	{
		title: 'Thêm thành viên',
		desc: 'Tìm kiếm hoặc thêm thủ công với đầy đủ thông tin bắt buộc.',
	},
	{
		title: 'Thêm vào danh sách',
		desc: 'Nhấn "Thêm vào danh sách" rồi tiếp tục điền đề tài kế tiếp.',
	},
	{
		title: 'Gửi tất cả',
		desc: 'Khi hoàn tất, nhấn "Gửi tất cả" để nộp lên hội đồng phê duyệt.',
	},
];

// ─── COMPONENT ────────────────────────────
export default function TopicRegister() {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const publicToken = searchParams.get('token');

	// ── User info ──
	const userInfo = getStoredUser<Record<string, string>>();
	const currentUserId: string = userInfo?.id ?? '';
	const currentDeptId: string = userInfo?.department_id ?? '';
	const userName: string =
		userInfo?.full_name ?? userInfo?.username ?? 'Người dùng';
	const userRole: string = userInfo?.role_name ?? '';
	const userInitials: string = getInitials(userName || 'U');
	const canRegister = !!currentDeptId;

	// ── Reference data ──
	const [rounds, setRounds] = useState<SimpleItem[]>([]);
	const [categories, setCategories] = useState<SimpleItem[]>([]);
	const [levels, setLevels] = useState<SimpleItem[]>([]);
	const [depts, setDepts] = useState<SimpleItem[]>([]);
	const [myTopics, setMyTopics] = useState<MyTopic[]>([]);
	const [loadingRef, setLoadingRef] = useState(true);
	const [lockedRound, setLockedRound] = useState<{
		id: string;
		name: string;
		registration_start_date?: string | null;
		registration_end_date?: string | null;
	} | null>(null);

	// ── Form state ──
	const [form, setForm] = useState<RegisterForm>({
		title: '',
		description: '',
		staff_number: '',
		round_id: '',
		category_id: '',
		level_id: '',
		department_id: currentDeptId,
	});
	const [errors, setErrors] = useState<FormErrors>({});

	// ── Pending topics (batch) ──
	const [pendingTopics, setPendingTopics] = useState<PendingTopic[]>([]);
	const [submittingAll, setSubmittingAll] = useState(false);
	const [submitError, setSubmitError] = useState('');

	// ── Member state ──
	const [pendingMembers, setPendingMembers] = useState<PendingMember[]>([]);
	const [memberQuery, setMemberQuery] = useState('');
	const [suggestions, setSuggestions] = useState<UserSuggestion[]>([]);
	const [showSuggestions, setShowSuggestions] = useState(false);
	const [isSearching, setIsSearching] = useState(false);
	const [addRole, setAddRole] = useState<MemberRole>('member');
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// ── Manual add form ──
	const [showManualForm, setShowManualForm] = useState(false);
	const [manualForm, setManualForm] = useState({
		ho_ten: '',
		staff_number: '',
		email: '',
		chuc_vu: '',
		role: 'member' as MemberRole,
	});
	const [manualErrors, setManualErrors] = useState<Record<string, string>>({});

	// ── File attachments ──
	const [attachments, setAttachments] = useState<File[]>([]);
	const [fileError, setFileError] = useState('');
	const [isDragging, setIsDragging] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	// ── Toast ──
	const [toast, setToast] = useState<{
		msg: string;
		type: 'success' | 'error';
	} | null>(null);

	// ── Load reference data ──
	useEffect(() => {
		const base = Promise.all([
			getRounds(),
			getCategories(),
			getLevels(),
			getDepts(),
		]).then(([r, c, l, d]) => {
			setRounds(r.data);
			setCategories(c.data);
			setLevels(l.data);
			setDepts(d.data);
		});

		const tokenLoad = publicToken
			? getRoundByPublicToken(publicToken).then((round) => {
					if (round) {
						setLockedRound({
							id: round.id,
							name: round.name,
							registration_start_date: round.registration_start_date,
							registration_end_date: round.registration_end_date,
						});
						setForm((prev) => ({ ...prev, round_id: round.id }));
					}
				})
			: Promise.resolve();

		Promise.all([base, tokenLoad]).finally(() => setLoadingRef(false));
	}, [publicToken]);

	// ── Load my topics ──
	useEffect(() => {
		if (!currentUserId) return;
		getTopics({ limit: 20 })
			.then((res) => {
				setMyTopics(
					res.data
						.filter((t) => t.created_by === currentUserId)
						.map((t) => ({
							id: t.id,
							title: t.title,
							status: t.status,
							created_at: t.created_at,
						})),
				);
			})
			.catch(() => {
				/* ignore */
			});
	}, [currentUserId]);

	// ── Member search debounce ──
	useEffect(() => {
		if (memberQuery.trim().length < 2) return;
		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => {
			setIsSearching(true);
			searchUsers(memberQuery)
				.then((res) => {
					setSuggestions(res.data);
					setShowSuggestions(true);
				})
				.catch(() => setSuggestions([]))
				.finally(() => setIsSearching(false));
		}, 300);
		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, [memberQuery]);

	// ── Auto-hide toast ──
	useEffect(() => {
		if (!toast) return;
		const t = setTimeout(() => setToast(null), 3500);
		return () => clearTimeout(t);
	}, [toast]);

	// ── Form field helper ──
	const setField = useCallback(
		<K extends keyof RegisterForm>(key: K, val: RegisterForm[K]) => {
			setForm((f) => ({ ...f, [key]: val }));
			setErrors((e) => {
				const n = { ...e };
				delete n[key];
				return n;
			});
		},
		[],
	);

	const handleDeptChange = useCallback(
		(deptId: string) => {
			setField('department_id', deptId);
		},
		[setField],
	);

	// ── Member helpers ──
	const addMember = useCallback(
		(u: UserSuggestion) => {
			if (pendingMembers.some((m) => m.id === u.id)) return;
			setPendingMembers((prev) => [
				...prev,
				{
					id: u.id,
					ho_ten: u.full_name,
					staff_number: u.staff_number != null ? String(u.staff_number) : '',
					email: u.email,
					chuc_vu: '',
					role: addRole,
				},
			]);
			setMemberQuery('');
			setSuggestions([]);
			setShowSuggestions(false);
		},
		[pendingMembers, addRole],
	);

	const removeMember = useCallback((id: string) => {
		setPendingMembers((prev) => prev.filter((m) => m.id !== id));
	}, []);

	const changeRole = useCallback((id: string, role: MemberRole) => {
		setPendingMembers((prev) =>
			prev.map((m) => (m.id === id ? { ...m, role } : m)),
		);
	}, []);

	const addMemberManual = useCallback(() => {
		const errs: Record<string, string> = {};
		if (!manualForm.ho_ten.trim()) errs.ho_ten = 'Nhập họ tên';
		if (!manualForm.staff_number.trim())
			errs.staff_number = 'Nhập mã nhân viên';
		if (!manualForm.email.trim()) errs.email = 'Nhập email';
		else if (!/\S+@\S+\.\S+/.test(manualForm.email))
			errs.email = 'Email không hợp lệ';
		if (!manualForm.chuc_vu.trim()) errs.chuc_vu = 'Nhập chức danh';
		if (Object.keys(errs).length) {
			setManualErrors(errs);
			return;
		}
		if (pendingMembers.some((m) => m.email === manualForm.email.trim())) {
			setToast({ msg: 'Thành viên này đã được thêm.', type: 'error' });
			return;
		}
		setPendingMembers((prev) => [
			...prev,
			{
				id: `manual_${Date.now()}`,
				ho_ten: manualForm.ho_ten.trim(),
				staff_number: manualForm.staff_number.trim(),
				email: manualForm.email.trim(),
				chuc_vu: manualForm.chuc_vu.trim(),
				role: manualForm.role,
			},
		]);
		setManualForm({
			ho_ten: '',
			staff_number: '',
			email: '',
			chuc_vu: '',
			role: 'member',
		});
		setManualErrors({});
		setShowManualForm(false);
		setMemberQuery('');
	}, [pendingMembers, manualForm]);

	// ── File helpers ──
	const handleFiles = useCallback((files: FileList | null) => {
		if (!files) return;
		const toAdd: File[] = [];
		const oversized: string[] = [];
		Array.from(files).forEach((f) => {
			if (f.size > MAX_FILE_SIZE) {
				oversized.push(f.name);
			} else {
				toAdd.push(f);
			}
		});
		if (oversized.length) {
			setFileError(
				`File vượt quá 150MB: ${oversized.join(', ')}`,
			);
		} else {
			setFileError('');
		}
		if (toAdd.length) {
			setAttachments((prev) => {
				const existingNames = new Set(prev.map((f) => f.name));
				return [...prev, ...toAdd.filter((f) => !existingNames.has(f.name))];
			});
		}
	}, []);

	const removeAttachment = useCallback((name: string) => {
		setAttachments((prev) => prev.filter((f) => f.name !== name));
		setFileError('');
	}, []);

	// ── Topic batch helpers ──
	const addTopicToList = useCallback(() => {
		const e: FormErrors = {};
		if (!form.title.trim()) e.title = 'Tiêu đề đề tài là bắt buộc';
		if (!form.round_id) e.round_id = 'Vui lòng chọn vòng nghiên cứu';
		if (!form.department_id) e.department_id = 'Vui lòng chọn khoa phòng';
		if (Object.keys(e).length) {
			setErrors(e);
			return;
		}

		setPendingTopics((prev) => [
			...prev,
			{
				localId: `t_${Date.now()}`,
				title: form.title.trim(),
				description: form.description.trim(),
				staff_number: form.staff_number.trim(),
				round_id: form.round_id,
				category_id: form.category_id,
				level_id: form.level_id,
				department_id: form.department_id,
				members: pendingMembers,
				attachments,
			},
		]);
		setToast({ msg: 'Đã thêm đề tài vào danh sách.', type: 'success' });

		// Reset form — keep round & department for next topic
		setForm({
			title: '',
			description: '',
			staff_number: '',
			round_id: form.round_id,
			category_id: '',
			level_id: '',
			department_id: form.department_id,
		});
		setErrors({});
		setPendingMembers([]);
		setMemberQuery('');
		setSuggestions([]);
		setShowSuggestions(false);
		setShowManualForm(false);
		setManualForm({
			ho_ten: '',
			staff_number: '',
			email: '',
			chuc_vu: '',
			role: 'member',
		});
		setManualErrors({});
		setAttachments([]);
		setFileError('');
	}, [form, pendingMembers, attachments]);

	const removeTopicFromList = useCallback((localId: string) => {
		setPendingTopics((prev) => prev.filter((t) => t.localId !== localId));
	}, []);

	const submitAll = useCallback(
		async (status: TopicStatus) => {
			if (pendingTopics.length === 0) {
				setToast({ msg: 'Chưa có đề tài nào trong danh sách.', type: 'error' });
				return;
			}
			setSubmittingAll(true);
			setSubmitError('');
			try {
				await Promise.all(
					pendingTopics.map(async (t) => {
						const created = await createTopic({
							title: t.title,
							description: t.description || undefined,
							round_id: t.round_id,
							category_id: t.category_id || undefined,
							level_id: t.level_id || undefined,
							department_id: t.department_id,
							status,
						});
						if (t.members.length > 0) {
							await Promise.allSettled(
								t.members.map((m) =>
									addTopicMember(created.id, {
										ho_ten: m.ho_ten,
										email: m.email,
										chuc_vu: m.chuc_vu || null,
										staff_number: m.staff_number || null,
										department_id: t.department_id || null,
										role: m.role,
									}),
								),
							);
						}
					}),
				);
				setToast({
					msg: `Đã gửi ${pendingTopics.length} đề tài để phê duyệt!`,
					type: 'success',
				});
				setTimeout(() => navigate('/user/my-topics'), 1800);
			} catch {
				setSubmitError('Có lỗi xảy ra, vui lòng thử lại.');
				setSubmittingAll(false);
			}
		},
		[pendingTopics, navigate],
	);

	// ─── RENDER ───────────────────────────────
	const breadcrumbs = [
		{ label: 'Đề tài', path: '/user/my-topics' },
		{ label: 'Đăng ký mới' },
	];

	if (loadingRef) {
		return (
			<UserLayout
				userName={userName}
				userRole={userRole}
				userInitials={userInitials}
				pageTitle='Đăng ký đề tài'
				breadcrumbs={breadcrumbs}
			>
				<div
					style={{
						textAlign: 'center',
						padding: 60,
						color: 'var(--color-gray-400)',
						fontSize: 14,
					}}
				>
					Đang tải dữ liệu...
				</div>
			</UserLayout>
		);
	}

	const activeRounds = rounds.filter((r) => !r.status || r.status === 'active');

	// No active rounds
	if (activeRounds.length === 0) {
		return (
			<UserLayout
				userName={userName}
				userRole={userRole}
				userInitials={userInitials}
				pageTitle='Đăng ký đề tài'
				breadcrumbs={breadcrumbs}
			>
				<div className={styles.emptyCard}>
					<div className={styles.emptyCardIcon}>
						<Icon.List />
					</div>
					<div className={styles.emptyTitle}>
						Chưa có vòng nghiên cứu nào đang mở
					</div>
					<div className={styles.emptyDesc}>
						Vui lòng liên hệ quản trị viên để biết thêm thông tin.
					</div>
				</div>
			</UserLayout>
		);
	}

	// Account restriction
	if (!canRegister) {
		return (
			<UserLayout
				userName={userName}
				userRole={userRole}
				userInitials={userInitials}
				pageTitle='Đăng ký đề tài'
				breadcrumbs={breadcrumbs}
			>
				<div className={styles.emptyCard}>
					<div
						className={styles.emptyCardIcon}
						style={{ background: '#fee2e2', color: '#ef4444' }}
					>
						<Icon.AlertCircle />
					</div>
					<div className={styles.emptyTitle}>
						Chức năng này chỉ dành cho tài khoản khoa phòng
					</div>
					<div className={styles.emptyDesc}>
						Tài khoản của bạn chưa được gán vào khoa phòng. Vui lòng liên hệ
						quản trị viên.
					</div>
				</div>
			</UserLayout>
		);
	}

	// Registration window check (only when accessed via public token with dates)
	if (lockedRound) {
		const parseReg = (s: string) => {
			const [d, m, y] = s.split('/').map(Number);
			const dt = new Date(y, m - 1, d);
			dt.setHours(0, 0, 0, 0);
			return dt;
		};
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		if (lockedRound.registration_start_date) {
			const regStart = parseReg(lockedRound.registration_start_date);
			if (today < regStart) {
				return (
					<UserLayout
						userName={userName}
						userRole={userRole}
						userInitials={userInitials}
						pageTitle='Đăng ký đề tài'
						breadcrumbs={breadcrumbs}
					>
						<div className={styles.emptyCard}>
							<div
								className={styles.emptyCardIcon}
								style={{ background: '#fef3c7', color: '#d97706' }}
							>
								<Icon.AlertCircle />
							</div>
							<div className={styles.emptyTitle}>
								Chưa đến thời gian đăng ký
							</div>
							<div className={styles.emptyDesc}>
								Đợt <strong>{lockedRound.name}</strong> sẽ bắt đầu nhận đăng ký
								từ ngày <strong>{lockedRound.registration_start_date}</strong>.
								{lockedRound.registration_end_date &&
									` Hạn đăng ký đến ngày ${lockedRound.registration_end_date}.`}
							</div>
						</div>
					</UserLayout>
				);
			}
		}

		if (lockedRound.registration_end_date) {
			const regEnd = parseReg(lockedRound.registration_end_date);
			if (today > regEnd) {
				return (
					<UserLayout
						userName={userName}
						userRole={userRole}
						userInitials={userInitials}
						pageTitle='Đăng ký đề tài'
						breadcrumbs={breadcrumbs}
					>
						<div className={styles.emptyCard}>
							<div
								className={styles.emptyCardIcon}
								style={{ background: '#fee2e2', color: '#ef4444' }}
							>
								<Icon.AlertCircle />
							</div>
							<div className={styles.emptyTitle}>Đã hết thời gian đăng ký</div>
							<div className={styles.emptyDesc}>
								Thời gian đăng ký đề tài cho đợt{' '}
								<strong>{lockedRound.name}</strong> đã kết thúc vào ngày{' '}
								<strong>{lockedRound.registration_end_date}</strong>.
							</div>
						</div>
					</UserLayout>
				);
			}
		}
	}

	const addedIds = new Set(pendingMembers.map((m) => m.id));
	const currentDeptName =
		depts.find((d) => d.id === currentDeptId)?.name ?? currentDeptId;

	return (
		<UserLayout
			userName={userName}
			userRole={userRole}
			userInitials={userInitials}
			pageTitle='Đăng ký đề tài mới'
			breadcrumbs={breadcrumbs}
		>
			<div className={styles.pageGrid}>
				{/* ── LEFT COLUMN ── */}
				<div className={styles.leftCol}>
					{/* ── FORM CARD ── */}
					<div className={styles.formCard}>
						<div className={styles.formCardHeader}>
							<div className={styles.formCardIcon}>
								<Icon.FileText />
							</div>
							<div>
								<div className={styles.formCardTitle}>
									Đăng ký đề tài nghiên cứu
								</div>
								<div className={styles.formCardSub}>
									Điền thông tin rồi nhấn "Thêm vào danh sách"
								</div>
							</div>
						</div>

						<div className={styles.formCardBody}>
							{/* ── Thông tin cơ bản ── */}
							<div className={styles.formSection}>Thông tin cơ bản</div>

							<div className={styles.formGroup}>
								<label
									className={styles.formLabel}
									htmlFor='reg-title'
								>
									Tiêu đề đề tài <span className={styles.formRequired}>*</span>
								</label>
								<input
									id='reg-title'
									className={`${styles.formInput} ${errors.title ? styles.hasError : ''}`}
									placeholder='Nhập tiêu đề đề tài nghiên cứu...'
									value={form.title}
									onChange={(e) => setField('title', e.target.value)}
								/>
								{errors.title && (
									<div className={styles.formError}>
										<Icon.AlertCircle /> {errors.title}
									</div>
								)}
							</div>

							<div className={styles.formGroup}>
								<label
									className={styles.formLabel}
									htmlFor='reg-desc'
								>
									Mô tả / Tóm tắt
								</label>
								<textarea
									id='reg-desc'
									className={styles.formInput}
									rows={3}
									placeholder='Mô tả ngắn về mục tiêu, phương pháp nghiên cứu...'
									value={form.description}
									onChange={(e) => setField('description', e.target.value)}
								/>
							</div>

							{/* ── Phân loại ── */}
							<div className={styles.formSection}>
								Phân loại & Vòng nghiên cứu
							</div>

							<div className={styles.formRow}>
								<div className={styles.formGroup}>
									<label
										className={styles.formLabel}
										htmlFor='reg-round'
									>
										Vòng nghiên cứu{' '}
										<span className={styles.formRequired}>*</span>
									</label>
									{lockedRound ? (
										<div className={styles.deptLocked}>{lockedRound.name}</div>
									) : (
										<>
											<select
												id='reg-round'
												className={`${styles.formSelect} ${errors.round_id ? styles.hasError : ''}`}
												value={form.round_id}
												onChange={(e) => setField('round_id', e.target.value)}
											>
												<option value=''>-- Chọn vòng --</option>
												{activeRounds.map((r) => (
													<option
														key={r.id}
														value={r.id}
													>
														{r.name}
													</option>
												))}
											</select>
											{errors.round_id && (
												<div className={styles.formError}>
													<Icon.AlertCircle /> {errors.round_id}
												</div>
											)}
										</>
									)}
								</div>

								<div className={styles.formGroup}>
									<label
										className={styles.formLabel}
										htmlFor='reg-cat'
									>
										Danh mục
									</label>
									<select
										id='reg-cat'
										className={styles.formSelect}
										value={form.category_id}
										onChange={(e) => setField('category_id', e.target.value)}
									>
										<option value=''>-- Chọn danh mục --</option>
										{categories.map((c) => (
											<option
												key={c.id}
												value={c.id}
											>
												{c.name}
											</option>
										))}
									</select>
								</div>
							</div>

							<div className={styles.formRow}>
								<div className={styles.formGroup}>
									<label
										className={styles.formLabel}
										htmlFor='reg-level'
									>
										Cấp độ
									</label>
									<select
										id='reg-level'
										className={styles.formSelect}
										value={form.level_id}
										onChange={(e) => setField('level_id', e.target.value)}
									>
										<option value=''>-- Chọn cấp độ --</option>
										{levels.map((l) => (
											<option
												key={l.id}
												value={l.id}
											>
												{l.name}
											</option>
										))}
									</select>
								</div>

								<div className={styles.formGroup}>
									<label
										className={styles.formLabel}
										htmlFor='reg-dept'
									>
										Khoa phòng <span className={styles.formRequired}>*</span>
									</label>
									{currentDeptId ? (
										<div className={styles.deptLocked}>{currentDeptName}</div>
									) : (
										<select
											id='reg-dept'
											className={`${styles.formSelect} ${errors.department_id ? styles.hasError : ''}`}
											value={form.department_id}
											onChange={(e) => handleDeptChange(e.target.value)}
										>
											<option value=''>-- Chọn khoa --</option>
											{depts.map((d) => (
												<option
													key={d.id}
													value={d.id}
												>
													{d.name}
												</option>
											))}
										</select>
									)}
									{errors.department_id && (
										<div className={styles.formError}>
											<Icon.AlertCircle /> {errors.department_id}
										</div>
									)}
								</div>
							</div>

							{/* ── Thành viên ── */}
							<div className={styles.formSection}>Thành viên tham gia</div>

							<div className={styles.formGroup}>
								<label className={styles.formLabel}>Tìm kiếm thành viên</label>
								<div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
									<div className={styles.memberSearch} style={{ flex: 1, marginBottom: 0 }}>
										<span className={styles.memberSearchIcon}>
											{isSearching ? (
												<span
													style={{
														width: 15,
														height: 15,
														border: '2px solid #cbd5e1',
														borderTopColor: '#1a6abd',
														borderRadius: '50%',
														display: 'inline-block',
														animation: 'spin 0.6s linear infinite',
													}}
												/>
											) : (
												<Icon.Search />
											)}
										</span>
										<input
											className={styles.memberSearchInput}
											placeholder='Tìm theo tên hoặc mã nhân viên...'
											value={memberQuery}
											onChange={(e) => {
												const val = e.target.value;
												setMemberQuery(val);
												if (val.trim().length < 2) {
													setSuggestions([]);
													setShowSuggestions(false);
												}
											}}
											onBlur={() =>
												setTimeout(() => setShowSuggestions(false), 180)
											}
											onFocus={() =>
												suggestions.length > 0 && setShowSuggestions(true)
											}
										/>
										{showSuggestions && (
											<div className={styles.suggestionsBox}>
												{suggestions.length > 0 ? (
													suggestions.map((u) => {
														const already = addedIds.has(u.id);
														return (
															<div
																key={u.id}
																className={`${styles.suggestionItem} ${already ? styles.suggestionDisabled : ''}`}
																onMouseDown={() => !already && addMember(u)}
															>
																<div className={styles.suggAvatar}>
																	{getInitials(u.full_name)}
																</div>
																<div style={{ flex: 1, minWidth: 0 }}>
																	<div className={styles.suggName}>
																		{u.full_name}
																	</div>
																	<div className={styles.suggMeta}>
																		{u.username} · MNV: {u.staff_number ?? '—'}
																	</div>
																</div>
																{already ? (
																	<span className={styles.suggAdded}>
																		Đã thêm
																	</span>
																) : (
																	<span className={styles.suggAdd}>+ Thêm</span>
																)}
															</div>
														);
													})
												) : (
													<div className={styles.noResults}>
														<span>Không tìm thấy kết quả</span>
														<button
															type='button'
															className={styles.suggAdd}
															onMouseDown={(e) => {
																e.preventDefault();
																setShowSuggestions(false);
																setManualForm({
																	ho_ten: memberQuery,
																	staff_number: '',
																	email: '',
																	chuc_vu: '',
																	role: addRole,
																});
																setShowManualForm(true);
															}}
														>
															+ Thêm thủ công
														</button>
													</div>
												)}
											</div>
										)}
									</div>
									<select
										className={styles.formSelect}
										style={{ width: 130, flexShrink: 0 }}
										value={addRole}
										onChange={(e) => setAddRole(e.target.value as MemberRole)}
									>
										{(Object.keys(ROLE_CFG) as MemberRole[]).map((r) => (
											<option key={r} value={r}>
												{ROLE_CFG[r].label}
											</option>
										))}
									</select>
								</div>
								<div className={styles.formHint}>
									Tìm tối thiểu 2 ký tự · Chỉ thành viên cùng khoa phòng
								</div>
							</div>

							{/* Nút mở form thêm thủ công */}
							{!showManualForm && (
								<button
									type='button'
									className={styles.manualAddTrigger}
									onClick={() => {
										setManualForm({
											ho_ten: '',
											staff_number: '',
											email: '',
											chuc_vu: '',
											role: pendingMembers.length === 0 ? 'leader' : 'member',
										});
										setShowManualForm(true);
									}}
								>
									<Icon.UserPlus /> Thêm thành viên thủ công
								</button>
							)}

							{/* Manual add form */}
							{showManualForm && (
								<div className={styles.manualAddForm}>
									<div className={styles.manualAddTitle}>
										Thêm thành viên thủ công
									</div>

									<div className={styles.formRow}>
										<div className={styles.formGroup}>
											<label className={styles.formLabel}>
												Họ tên <span className={styles.formRequired}>*</span>
											</label>
											<input
												className={`${styles.formInput} ${manualErrors.ho_ten ? styles.hasError : ''}`}
												placeholder='Nguyễn Văn A'
												value={manualForm.ho_ten}
												onChange={(e) => {
													setManualForm((p) => ({
														...p,
														ho_ten: e.target.value,
													}));
													setManualErrors((p) => ({ ...p, ho_ten: '' }));
												}}
											/>
											{manualErrors.ho_ten && (
												<div className={styles.formError}>
													<Icon.AlertCircle /> {manualErrors.ho_ten}
												</div>
											)}
										</div>
										<div className={styles.formGroup}>
											<label className={styles.formLabel}>
												Mã nhân viên{' '}
												<span className={styles.formRequired}>*</span>
											</label>
											<input
												className={`${styles.formInput} ${manualErrors.staff_number ? styles.hasError : ''}`}
												placeholder='NV001'
												value={manualForm.staff_number}
												onChange={(e) => {
													setManualForm((p) => ({
														...p,
														staff_number: e.target.value,
													}));
													setManualErrors((p) => ({ ...p, staff_number: '' }));
												}}
											/>
											{manualErrors.staff_number && (
												<div className={styles.formError}>
													<Icon.AlertCircle /> {manualErrors.staff_number}
												</div>
											)}
										</div>
									</div>

									<div className={styles.formRow}>
										<div className={styles.formGroup}>
											<label className={styles.formLabel}>
												Email <span className={styles.formRequired}>*</span>
											</label>
											<input
												className={`${styles.formInput} ${manualErrors.email ? styles.hasError : ''}`}
												placeholder='example@hospital.vn'
												type='email'
												value={manualForm.email}
												onChange={(e) => {
													setManualForm((p) => ({
														...p,
														email: e.target.value,
													}));
													setManualErrors((p) => ({ ...p, email: '' }));
												}}
											/>
											{manualErrors.email && (
												<div className={styles.formError}>
													<Icon.AlertCircle /> {manualErrors.email}
												</div>
											)}
										</div>
										<div className={styles.formGroup}>
											<label className={styles.formLabel}>
												Chức danh <span className={styles.formRequired}>*</span>
											</label>
											<input
												className={`${styles.formInput} ${manualErrors.chuc_vu ? styles.hasError : ''}`}
												placeholder='Bác sĩ, Điều dưỡng...'
												value={manualForm.chuc_vu}
												onChange={(e) => {
													setManualForm((p) => ({
														...p,
														chuc_vu: e.target.value,
													}));
													setManualErrors((p) => ({ ...p, chuc_vu: '' }));
												}}
											/>
											{manualErrors.chuc_vu && (
												<div className={styles.formError}>
													<Icon.AlertCircle /> {manualErrors.chuc_vu}
												</div>
											)}
										</div>
									</div>

									<div className={styles.formGroup}>
										<label className={styles.formLabel}>
											Vai trò trong đề tài
										</label>
										<select
											className={styles.formSelect}
											value={manualForm.role}
											onChange={(e) =>
												setManualForm((p) => ({
													...p,
													role: e.target.value as MemberRole,
												}))
											}
										>
											{(Object.keys(ROLE_CFG) as MemberRole[]).map((r) => (
												<option
													key={r}
													value={r}
												>
													{ROLE_CFG[r].label}
												</option>
											))}
										</select>
									</div>

									<div
										style={{
											display: 'flex',
											gap: 8,
											justifyContent: 'flex-end',
										}}
									>
										<button
											type='button'
											className={styles.btnSecondary}
											style={{ padding: '7px 14px', fontSize: 12.5 }}
											onClick={() => {
												setShowManualForm(false);
												setManualErrors({});
											}}
										>
											Huỷ
										</button>
										<button
											type='button'
											className={styles.btnPrimary}
											style={{ padding: '7px 14px', fontSize: 12.5 }}
											onClick={addMemberManual}
										>
											Thêm thành viên
										</button>
									</div>
								</div>
							)}

							{/* Member list */}
							{pendingMembers.length > 0 && (
								<div className={styles.manualBox}>
									<div className={styles.memberList}>
										{pendingMembers.map((m) => (
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
														{m.chuc_vu && <span>{m.chuc_vu} · </span>}
														<span>{m.email}</span>
													</div>
												</div>
												<select
													style={{
														fontSize: 12,
														padding: '3px 8px',
														border: '1px solid var(--color-gray-200)',
														borderRadius: 6,
														background: 'var(--color-white)',
														color: 'var(--color-gray-700)',
														cursor: 'pointer',
														outline: 'none',
													}}
													value={m.role}
													onChange={(e) =>
														changeRole(m.id, e.target.value as MemberRole)
													}
												>
													{(Object.keys(ROLE_CFG) as MemberRole[]).map((r) => (
														<option
															key={r}
															value={r}
														>
															{ROLE_CFG[r].label}
														</option>
													))}
												</select>
												<button
													type='button'
													className={styles.removeBtn}
													onClick={() => removeMember(m.id)}
													title='Xoá'
												>
													<Icon.X />
												</button>
											</div>
										))}
									</div>
								</div>
							)}
						{/* ── File upload ── */}
						<div className={styles.formSection} style={{ marginTop: 4 }}>
							Tài liệu đính kèm
						</div>

						<div className={styles.formGroup}>
							<div
								className={`${styles.dropZone} ${isDragging ? styles.dropZoneActive : ''}`}
								onClick={() => fileInputRef.current?.click()}
								onDragOver={(e) => {
									e.preventDefault();
									setIsDragging(true);
								}}
								onDragLeave={() => setIsDragging(false)}
								onDrop={(e) => {
									e.preventDefault();
									setIsDragging(false);
									handleFiles(e.dataTransfer.files);
								}}
							>
								<span className={styles.dropZoneIcon}>
									<Icon.Upload />
								</span>
								<span className={styles.dropZoneText}>
									Kéo thả file vào đây hoặc{' '}
									<span className={styles.dropZoneLink}>chọn file</span>
								</span>
								<span className={styles.dropZoneHint}>
									Dung lượng tối đa: 150MB mỗi file
								</span>
								<input
									ref={fileInputRef}
									type='file'
									multiple
									style={{ display: 'none' }}
									onChange={(e) => handleFiles(e.target.files)}
								/>
							</div>
							{fileError && (
								<div className={styles.formError}>
									<Icon.AlertCircle /> {fileError}
								</div>
							)}

							{attachments.length > 0 && (
								<div className={styles.fileList}>
									{attachments.map((f) => (
										<div
											key={f.name}
											className={styles.fileItem}
										>
											<span className={styles.fileItemIcon}>
												<Icon.Paperclip />
											</span>
											<span className={styles.fileItemName}>{f.name}</span>
											<span className={styles.fileItemSize}>
												{(f.size / (1024 * 1024)).toFixed(1)} MB
											</span>
											<button
												type='button'
												className={styles.removeBtn}
												onClick={() => removeAttachment(f.name)}
												title='Xoá file'
											>
												<Icon.X />
											</button>
										</div>
									))}
								</div>
							)}
						</div>
						</div>

						{/* Form footer */}
						<div className={styles.formFooter}>
							<span
								style={{
									flex: 1,
									fontSize: 12,
									color: 'var(--color-gray-400)',
								}}
							>
								{pendingTopics.length > 0
									? `${pendingTopics.length} đề tài đang chờ gửi`
									: 'Chưa có đề tài nào trong danh sách'}
							</span>
							<button
								type='button'
								className={styles.btnSecondary}
								onClick={() => {
									setForm({
										title: '',
										description: '',
										staff_number: '',
										round_id: lockedRound ? lockedRound.id : '',
										category_id: '',
										level_id: '',
										department_id: currentDeptId,
									});
									setErrors({});
									setPendingMembers([]);
									setMemberQuery('');
									setSuggestions([]);
									setShowManualForm(false);
									setManualErrors({});
									setAttachments([]);
									setFileError('');
								}}
							>
								Xoá form
							</button>
							<button
								type='button'
								className={styles.btnPrimary}
								onClick={addTopicToList}
							>
								+ Thêm vào danh sách
							</button>
						</div>
					</div>

					{/* ── PENDING TOPICS CARD ── */}
					{pendingTopics.length > 0 && (
						<div className={styles.pendingCard}>
							<div className={styles.pendingHeader}>
								<span>Danh sách đề tài chờ gửi</span>
								<span className={styles.pendingBadge}>
									{pendingTopics.length}
								</span>
							</div>

							<div className={styles.pendingList}>
								{pendingTopics.map((t, i) => {
									const roundName =
										rounds.find((r) => r.id === t.round_id)?.name ?? '—';
									return (
										<div
											key={t.localId}
											className={styles.pendingItem}
										>
											<div className={styles.pendingNum}>{i + 1}</div>
											<div className={styles.pendingInfo}>
												<div className={styles.pendingTitle}>{t.title}</div>
												<div className={styles.pendingMeta}>
													{roundName} · {t.members.length} thành viên
												</div>
											</div>
											<button
												type='button'
												className={styles.removeBtn}
												onClick={() => removeTopicFromList(t.localId)}
												title='Xoá'
											>
												<Icon.X />
											</button>
										</div>
									);
								})}
							</div>

							<div className={styles.pendingFooter}>
								{submitError && (
									<div className={styles.saveError}>
										<Icon.AlertCircle /> {submitError}
									</div>
								)}
								<button
									type='button'
									className={styles.btnPrimary}
									onClick={() => submitAll('submitted')}
									disabled={submittingAll}
								>
									{submittingAll ? <span className={styles.spinner} /> : null}
									<Icon.Send />
									Gửi tất cả ({pendingTopics.length})
								</button>
							</div>
						</div>
					)}
				</div>

				{/* ── RIGHT: SIDE PANEL ── */}
				<div className={styles.sidePanel}>
					{/* Guide card */}
					<div className={styles.sideCard}>
						<div className={styles.sideCardHeader}>
							<span>Hướng dẫn đăng ký</span>
							<Icon.HelpCircle />
						</div>
						<div className={styles.sideCardBody}>
							{GUIDE_STEPS.map((s, i) => (
								<div
									key={i}
									className={styles.guideStep}
								>
									<div className={styles.guideNum}>{i + 1}</div>
									<div className={styles.guideText}>
										<span className={styles.guideTextBold}>{s.title}.</span>{' '}
										{s.desc}
									</div>
								</div>
							))}
						</div>
					</div>

					{/* My topics card */}
					<div className={styles.sideCard}>
						<div className={styles.sideCardHeader}>
							<span>Đề tài của tôi</span>
							<button
								type='button'
								style={{
									background: 'none',
									border: 'none',
									cursor: 'pointer',
									color: '#1a6abd',
									fontSize: 12,
									fontWeight: 600,
									display: 'inline-flex',
									alignItems: 'center',
									gap: 3,
								}}
								onClick={() => navigate('/user/my-topics')}
							>
								Xem tất cả <Icon.ChevronRight />
							</button>
						</div>
						<div className={styles.sideCardBody}>
							{myTopics.length === 0 ? (
								<div
									style={{
										textAlign: 'center',
										padding: '24px 0',
										color: 'var(--color-gray-400)',
										fontSize: 13,
									}}
								>
									Bạn chưa có đề tài nào
								</div>
							) : (
								myTopics.slice(0, 5).map((t) => (
									<div
										key={t.id}
										className={styles.myTopicItem}
										onClick={() => navigate('/user/my-topics')}
									>
										<div className={styles.myTopicTitle}>{t.title}</div>
										<div className={styles.myTopicMeta}>
											<span>{fmtDate(t.created_at)}</span>
											<span
												className={`${styles.badge} ${BADGE_CLS[t.status]}`}
											>
												<span className={styles.badgeDot} />
												{STATUS_CFG[t.status].label}
											</span>
										</div>
									</div>
								))
							)}
						</div>
					</div>
				</div>
			</div>

			{/* Toast */}
			{toast && (
				<div
					className={`${styles.toast} ${toast.type === 'success' ? styles.toastSuccess : styles.toastError}`}
				>
					{toast.type === 'success' ? <Icon.Check /> : <Icon.AlertCircle />}
					{toast.msg}
				</div>
			)}
		</UserLayout>
	);
}
