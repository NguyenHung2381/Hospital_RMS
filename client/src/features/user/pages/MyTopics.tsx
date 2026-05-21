import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import UserLayout from '../../../layouts/UserLayout';
import { useRealtimeUpdate } from '../../../hooks/useRealtime';
import styles from './MyTopics.module.css';
import { getStoredUser, getToken } from '../../../lib/authStorage';
import { BASE_URL } from '../../../lib/apiClient';
import { getTopics, getTopicFiles } from '../../topics/api/topicApi';
import type { Topic, TopicStatus, TopicFile } from '../../topics/types/topic.type';
import {
	getApprovalTopicDetail,
	getApprovals,
	type Approval as ApprovalHistory,
	type TopicApprovalDetail,
} from '../../approval/api/approval';

// ─── CONFIG ───────────────────────────────
const STATUS_CFG: Record<
	TopicStatus,
	{ label: string; dot: string; bg: string; color: string; badgeCls: string }
> = {
	submitted: {
		label: 'Chờ duyệt',
		dot: '#f59e0b',
		bg: '#fef3c7',
		color: '#92400e',
		badgeCls: 'badgeAmber',
	},
	approved: {
		label: 'Đã duyệt',
		dot: '#22c55e',
		bg: '#dcfce7',
		color: '#166534',
		badgeCls: 'badgeGreen',
	},
	rejected: {
		label: 'Từ chối',
		dot: '#ef4444',
		bg: '#fee2e2',
		color: '#991b1b',
		badgeCls: 'badgeRed',
	},
	supplement: {
		label: 'Cần bổ sung',
		dot: '#8b5cf6',
		bg: '#ede9fe',
		color: '#5b21b6',
		badgeCls: 'badgeBlue',
	},
};

const APV_STATUS_CFG: Record<string, { label: string; badgeCls: string }> = {
	pending: { label: 'Nộp hồ sơ', badgeCls: 'badgeAmber' },
	approved: { label: 'Phê duyệt', badgeCls: 'badgeGreen' },
	rejected: { label: 'Từ chối', badgeCls: 'badgeRed' },
	info_requested: { label: 'Yêu cầu bổ sung', badgeCls: 'badgeBlue' },
};

type FilterTab = TopicStatus;
type CategoryTab = 'department' | 'mine';

const TABS: { key: FilterTab; label: string }[] = [
	{ key: 'submitted', label: 'Chờ duyệt' },
	{ key: 'supplement', label: 'Cần bổ sung' },
	{ key: 'approved', label: 'Đã duyệt' },
	{ key: 'rejected', label: 'Từ chối' },
];

function isDeptAccount(accountType: string) {
	return (
		accountType === 'manager' ||
		accountType === 'admin' ||
		accountType === 'dept'
	);
}

// ─── HELPERS ──────────────────────────────
function formatDate(value?: string | null) {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return new Intl.DateTimeFormat('vi-VN').format(date);
}

function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileViewerUrl(file: TopicFile): string | null {
	const name = file.file_name.toLowerCase();
	const mime = file.mime_type;
	if (mime === 'application/pdf' || name.endsWith('.pdf')) return file.file_url;
	if (
		mime.includes('wordprocessingml') ||
		name.endsWith('.docx') ||
		name.endsWith('.doc')
	)
		return file.file_url;
	return null;
}

function getFileTypeMeta(file: TopicFile): { label: string; cls: string } {
	const name = file.file_name.toLowerCase();
	const mime = file.mime_type;
	if (mime === 'application/pdf' || name.endsWith('.pdf'))
		return { label: 'PDF', cls: 'fileIconPdf' };
	if (
		mime.includes('wordprocessingml') ||
		name.endsWith('.docx') ||
		name.endsWith('.doc')
	)
		return { label: 'DOCX', cls: 'fileIconWord' };
	if (
		mime.includes('spreadsheetml') ||
		name.endsWith('.xlsx') ||
		name.endsWith('.xls')
	)
		return { label: 'XLSX', cls: 'fileIconExcel' };
	if (mime.startsWith('image/')) return { label: 'IMG', cls: 'fileIconImage' };
	return { label: 'FILE', cls: 'fileIconOther' };
}

// ─── ICONS ────────────────────────────────
const Ic = {
	Plus: () => (
		<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
			<line x1='12' y1='5' x2='12' y2='19' />
			<line x1='5' y1='12' x2='19' y2='12' />
		</svg>
	),
	Search: () => (
		<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
			<circle cx='11' cy='11' r='8' />
			<line x1='21' y1='21' x2='16.65' y2='16.65' />
		</svg>
	),
	Users: () => (
		<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
			<path d='M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' />
			<circle cx='9' cy='7' r='4' />
			<path d='M23 21v-2a4 4 0 0 0-3-3.87' />
			<path d='M16 3.13a4 4 0 0 1 0 7.75' />
		</svg>
	),
	Building: () => (
		<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
			<rect x='2' y='3' width='20' height='14' rx='2' ry='2' />
			<path d='M8 21h8' />
			<path d='M12 17v4' />
		</svg>
	),
	UserCheck: () => (
		<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
			<path d='M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' />
			<circle cx='9' cy='7' r='4' />
			<polyline points='16 11 18 13 22 9' />
		</svg>
	),
	Clock: () => (
		<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
			<circle cx='12' cy='12' r='10' />
			<polyline points='12 6 12 12 16 14' />
		</svg>
	),
	Check: () => (
		<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round'>
			<polyline points='20 6 9 17 4 12' />
		</svg>
	),
	Approve: () => (
		<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
			<path d='M22 11.08V12a10 10 0 1 1-5.93-9.14' />
			<polyline points='22 4 12 14.01 9 11.01' />
		</svg>
	),
	Reject: () => (
		<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
			<circle cx='12' cy='12' r='10' />
			<line x1='4.93' y1='4.93' x2='19.07' y2='19.07' />
		</svg>
	),
	Request: () => (
		<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
			<path d='M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' />
		</svg>
	),
	Download: () => (
		<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
			<path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' />
			<polyline points='7 10 12 15 17 10' />
			<line x1='12' y1='15' x2='12' y2='3' />
		</svg>
	),
	Eye: () => (
		<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
			<path d='M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z' />
			<circle cx='12' cy='12' r='3' />
		</svg>
	),
	File: () => (
		<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
			<path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' />
			<polyline points='14 2 14 8 20 8' />
			<line x1='16' y1='13' x2='8' y2='13' />
			<line x1='16' y1='17' x2='8' y2='17' />
		</svg>
	),
	Empty: () => (
		<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
			<path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' />
			<polyline points='14 2 14 8 20 8' />
		</svg>
	),
};

// ─── BADGE ────────────────────────────────
function Badge({
	cls,
	dot,
	children,
}: {
	cls: string;
	dot?: boolean;
	children: React.ReactNode;
}) {
	return (
		<span className={`${styles.badge} ${styles[cls as keyof typeof styles]}`}>
			{dot && <span className={styles.badgeDot} />}
			{children}
		</span>
	);
}

// ─── FILE VIEWER MODAL ────────────────────
function FileViewerModal({
	file,
	onClose,
}: {
	file: { url: string; name: string; isWord: boolean };
	onClose: () => void;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const blobUrlRef = useRef<string | null>(null);
	const [renderState, setRenderState] = useState<'loading' | 'done' | 'error'>('loading');
	const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		const render = async () => {
			try {
				const token = getToken();
				const fetchUrl = file.url.startsWith('http')
					? file.url
					: `${BASE_URL}${file.url}`;
				const response = await fetch(fetchUrl, {
					headers: token ? { Authorization: `Bearer ${token}` } : {},
				});
				if (!response.ok) throw new Error(`${response.status}`);
				const buffer = await response.arrayBuffer();
				if (cancelled) return;

				if (file.isWord) {
					const { renderAsync } = await import('docx-preview');
					if (containerRef.current) {
						containerRef.current.innerHTML = '';
						await renderAsync(buffer, containerRef.current, undefined, {
							className: 'docxViewer',
							inWrapper: true,
							breakPages: true,
							useBase64URL: true,
						});
					}
				} else {
					const blob = new Blob([buffer], { type: 'application/pdf' });
					const url = URL.createObjectURL(blob);
					blobUrlRef.current = url;
					if (!cancelled) setPdfBlobUrl(url);
				}
				if (!cancelled) setRenderState('done');
			} catch {
				if (!cancelled) setRenderState('error');
			}
		};
		void render();
		return () => {
			cancelled = true;
			if (blobUrlRef.current) {
				URL.revokeObjectURL(blobUrlRef.current);
				blobUrlRef.current = null;
			}
		};
	}, [file.url, file.isWord]);

	return (
		<div
			className={styles.viewerBackdrop}
			onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
		>
			<div className={styles.viewerModal}>
				<div className={styles.viewerHeader}>
					<span className={styles.viewerTitle}>{file.name}</span>
					<button className={styles.viewerClose} onClick={onClose}>✕</button>
				</div>
				{renderState === 'loading' && (
					<div className={styles.viewerStatus}>
						<span className={styles.spinner} style={{ borderTopColor: 'var(--color-primary)' }} />
						Đang tải tài liệu...
					</div>
				)}
				{renderState === 'error' && (
					<div className={styles.viewerStatus} style={{ color: '#b91c1c' }}>
						Không thể tải tài liệu. Hãy thử tải về.
					</div>
				)}
				{file.isWord && (
					<div
						className={styles.viewerDocxWrap}
						style={{ display: renderState === 'done' ? 'block' : 'none' }}
					>
						<div ref={containerRef} />
					</div>
				)}
				{!file.isWord && renderState === 'done' && pdfBlobUrl && (
					<embed src={pdfBlobUrl} type='application/pdf' className={styles.viewerFrame} />
				)}
			</div>
		</div>
	);
}

// ─── MAIN COMPONENT ───────────────────────
export default function MyTopics() {
	const navigate = useNavigate();
	const userInfo = getStoredUser<Record<string, string>>();

	const fullName = userInfo?.full_name ?? userInfo?.username ?? 'Người dùng';
	const userRole = userInfo?.role ?? userInfo?.role_name ?? 'Thành viên';
	const currentUserId = userInfo?.id ?? '';
	const userDeptId = userInfo?.department_id ?? '';
	const accountType = userInfo?.account_type ?? 'member';
	const canSeeDept = isDeptAccount(accountType);
	const canRegister = accountType !== 'member';

	const initials = fullName
		.split(' ')
		.map((w: string) => w[0])
		.filter(Boolean)
		.slice(-2)
		.join('')
		.toUpperCase();

	// ── State ──
	const [deptTopics, setDeptTopics] = useState<Topic[]>([]);
	const [myTopics, setMyTopics] = useState<Topic[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [search, setSearch] = useState('');
	const [category, setCategory] = useState<CategoryTab>('department');
	const [activeTab, setActiveTab] = useState<FilterTab>('submitted');
	const [userSelectedId, setSelectedId] = useState<string | null>(null);
	const [detailLoading, setDetailLoading] = useState(false);
	const [detailTopic, setDetailTopic] = useState<TopicApprovalDetail | null>(null);
	const [detailFiles, setDetailFiles] = useState<TopicFile[]>([]);
	const [detailHistory, setDetailHistory] = useState<ApprovalHistory[]>([]);
	const [fileViewer, setFileViewer] = useState<{ url: string; name: string; isWord: boolean } | null>(null);
	const [refreshKey, setRefreshKey] = useState(0);

	const refreshData = useCallback(() => setRefreshKey((k) => k + 1), []);
	useRealtimeUpdate('topic', refreshData);

	// ── Fetch list ──
	useEffect(() => {
		if (!currentUserId) return;
		const deptParams = userDeptId
			? { limit: 200, department_id: userDeptId }
			: { limit: 200 };

		async function fetchTopics() {
			setLoading(true);
			setError('');
			try {
				if (canSeeDept) {
					const [deptRes, myRes] = await Promise.all([
						getTopics(deptParams),
						getTopics({ limit: 200, participant_id: currentUserId }),
					]);
					setDeptTopics(deptRes.data);
					setMyTopics(myRes.data);
				} else {
					const res = await getTopics({ limit: 200, participant_id: currentUserId });
					setMyTopics(res.data);
				}
			} catch {
				setError('Không thể tải danh sách đề tài.');
			} finally {
				setLoading(false);
			}
		}
		fetchTopics();
	}, [canSeeDept, currentUserId, userDeptId, refreshKey]);

	// ── Active topics based on category ──
	const activeTopics = canSeeDept
		? category === 'department'
			? deptTopics
			: myTopics
		: myTopics;

	// ── Stats ──
	const stats = useMemo(
		() => ({
			submitted: activeTopics.filter((t) => t.status === 'submitted').length,
			approved: activeTopics.filter((t) => t.status === 'approved').length,
			rejected: activeTopics.filter((t) => t.status === 'rejected').length,
			supplement: activeTopics.filter((t) => t.status === 'supplement').length,
		}),
		[activeTopics],
	);

	// ── Filtered list ──
	const filtered = useMemo(() => {
		let list = activeTopics.filter((t) => t.status === activeTab);
		if (search.trim()) {
			const q = search.toLowerCase();
			list = list.filter(
				(t) =>
					t.title.toLowerCase().includes(q) ||
					t.id.toLowerCase().includes(q),
			);
		}
		return list;
	}, [activeTopics, activeTab, search]);

	// ── Derive selectedId: keep user's choice if still in filtered, else first item ──
	const selectedId = useMemo(() => {
		if (userSelectedId && filtered.some((t) => t.id === userSelectedId))
			return userSelectedId;
		return filtered[0]?.id ?? null;
	}, [userSelectedId, filtered]);

	// ── Load detail when selectedId changes ──
	useEffect(() => {
		let cancelled = false;
		void (async () => {
			if (!selectedId) {
				setDetailTopic(null);
				setDetailFiles([]);
				setDetailHistory([]);
				return;
			}
			setDetailTopic(null);
			setDetailFiles([]);
			setDetailHistory([]);
			setDetailLoading(true);
			try {
				const [topic, files, history] = await Promise.all([
					getApprovalTopicDetail(selectedId),
					getTopicFiles(selectedId),
					getApprovals(selectedId).catch(() => [] as ApprovalHistory[]),
				]);
				if (cancelled) return;
				setDetailTopic(topic);
				setDetailFiles(files.data ?? []);
				setDetailHistory(history);
			} catch {
				if (!cancelled) {
					setDetailTopic(null);
					setDetailFiles([]);
					setDetailHistory([]);
				}
			} finally {
				if (!cancelled) setDetailLoading(false);
			}
		})();
		return () => { cancelled = true; };
	}, [selectedId]);

	// ── Latest approval info for "updated by" ──
	const latestApproval = detailHistory[0] ?? null;

	// ── Header actions ──
	const headerActions = canRegister ? (
		<button
			className={styles.btnPrimary}
			onClick={() => navigate('/user/register-topic')}
		>
			<Ic.Plus />
			Đăng ký đề tài mới
		</button>
	) : null;

	return (
		<UserLayout
			pageTitle='Đề tài nghiên cứu'
			pageSubtitle={
				canSeeDept
					? 'Quản lý đề tài theo khoa và cá nhân'
					: 'Đề tài bạn tham gia hoặc đăng ký'
			}
			breadcrumbs={[{ label: 'Đề tài nghiên cứu' }]}
			headerActions={headerActions}
			userName={fullName}
			userRole={userRole}
			userInitials={initials}
		>
			{loading ? (
				<div className={styles.stateBox}>
					<div className={styles.spinner} />
					<span>Đang tải...</span>
				</div>
			) : error ? (
				<div className={styles.stateBox} style={{ color: '#ef4444' }}>
					{error}
				</div>
			) : (
				<>
					{/* ── Category toggle (dept accounts only) ── */}
					{canSeeDept && (
						<div className={styles.categoryRow}>
							<button
								className={`${styles.categoryCard} ${category === 'department' ? styles.categoryCardActive : ''}`}
								onClick={() => { setCategory('department'); setSearch(''); }}
							>
								<div className={`${styles.categoryIcon} ${category === 'department' ? styles.categoryIconActive : ''}`}>
									<Ic.Building />
								</div>
								<div className={styles.categoryText}>
									<div className={styles.categoryLabel}>Đề tài của khoa</div>
									<div className={styles.categoryDesc}>Toàn bộ đề tài thuộc khoa/phòng</div>
								</div>
								<div className={`${styles.categoryCount} ${category === 'department' ? styles.categoryCountActive : ''}`}>
									{deptTopics.length}
								</div>
							</button>
							<button
								className={`${styles.categoryCard} ${category === 'mine' ? styles.categoryCardActive : ''}`}
								onClick={() => { setCategory('mine'); setSearch(''); }}
							>
								<div className={`${styles.categoryIcon} ${category === 'mine' ? styles.categoryIconActive : ''}`}>
									<Ic.UserCheck />
								</div>
								<div className={styles.categoryText}>
									<div className={styles.categoryLabel}>Đề tài tôi tham gia</div>
									<div className={styles.categoryDesc}>Đề tài tôi đăng ký hoặc là thành viên</div>
								</div>
								<div className={`${styles.categoryCount} ${category === 'mine' ? styles.categoryCountActive : ''}`}>
									{myTopics.length}
								</div>
							</button>
						</div>
					)}

					{/* ── Stats row ── */}
					<div className={styles.statsRow}>
						{(
							[
								{ key: 'submitted' as FilterTab, iconCls: 'iconAmber', cardCls: 'amber', hintCls: 'hintAmber', hint: 'Cần xử lý sớm', Icon: Ic.Clock },
								{ key: 'approved' as FilterTab, iconCls: 'iconGreen', cardCls: 'green', hintCls: 'hintGreen', hint: 'Hoàn tất', Icon: Ic.Approve },
								{ key: 'rejected' as FilterTab, iconCls: 'iconRed', cardCls: 'red', hintCls: 'hintRed', hint: 'Không đạt yêu cầu', Icon: Ic.Reject },
								{ key: 'supplement' as FilterTab, iconCls: 'iconBlue', cardCls: 'blue', hintCls: 'hintBlue', hint: 'Cần bổ sung hồ sơ', Icon: Ic.Request },
							] as const
						).map((s) => {
							const cfg = STATUS_CFG[s.key];
							return (
								<div
									key={s.key}
									className={`${styles.statCard} ${styles[s.cardCls as keyof typeof styles]} ${activeTab === s.key ? styles.statActive : ''}`}
									onClick={() => setActiveTab(s.key)}
								>
									<div className={`${styles.statIcon} ${styles[s.iconCls as keyof typeof styles]}`}>
										<s.Icon />
									</div>
									<div className={styles.statBody}>
										<div className={styles.statValue}>{stats[s.key]}</div>
										<div className={styles.statLabel}>{cfg.label}</div>
										<div className={`${styles.statHint} ${styles[s.hintCls as keyof typeof styles]}`}>
											{s.hint}
										</div>
									</div>
								</div>
							);
						})}
					</div>

					{/* ── Split layout ── */}
					<div className={styles.splitLayout}>
						{/* ── LEFT: LIST ── */}
						<div className={styles.listPanel}>
							<div className={styles.listHeader}>
								<div className={styles.listHeaderTop}>
									<span className={styles.listTitle}>Danh sách đề tài</span>
									<span className={styles.listCount}>{filtered.length} đề tài</span>
								</div>
								<div className={styles.listSearch}>
									<svg className={styles.listSearchIcon} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
										<circle cx='11' cy='11' r='8' />
										<line x1='21' y1='21' x2='16.65' y2='16.65' />
									</svg>
									<input
										className={styles.listSearchInput}
										placeholder='Tìm mã, tên đề tài...'
										value={search}
										onChange={(e) => setSearch(e.target.value)}
									/>
								</div>
							</div>

							{/* Tabs */}
							<div className={styles.listTabs}>
								{TABS.map((t) => (
									<div
										key={t.key}
										className={`${styles.listTab} ${activeTab === t.key ? styles.listTabActive : ''}`}
										onClick={() => { setActiveTab(t.key); setSearch(''); }}
									>
										{t.label}
										<span className={styles.tabCount}>{stats[t.key]}</span>
									</div>
								))}
							</div>

							{/* Items */}
							<div className={styles.listBody}>
								{filtered.length === 0 ? (
									<div className={styles.listEmpty}>
										<div className={styles.listEmptyIcon}><Ic.Empty /></div>
										<div className={styles.listEmptyTitle}>
											{search ? 'Không tìm thấy đề tài phù hợp' : 'Chưa có đề tài nào'}
										</div>
										<div className={styles.listEmptyDesc}>
											{search ? 'Thử từ khoá khác hoặc đổi bộ lọc.' : 'Không có đề tài ở trạng thái này.'}
										</div>
									</div>
								) : (
									filtered.map((t) => {
										const cfg = STATUS_CFG[t.status];
										return (
											<div
												key={t.id}
												className={`${styles.listItem} ${selectedId === t.id ? styles.listItemSelected : ''}`}
												onClick={() => setSelectedId(t.id)}
											>
												<div className={styles.urgencyDot} style={{ background: cfg.dot }} />
												<div className={styles.listItemContent}>
													<div className={styles.listItemTopicId}>{t.id}</div>
													<div className={styles.listItemTitle} title={t.title}>{t.title}</div>
													<div className={styles.listItemMeta}>
														<span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
															<Ic.Users />
															{t.member_count ?? 0} thành viên
														</span>
														<span>·</span>
														<span>{formatDate(t.created_at)}</span>
													</div>
												</div>
												<div className={styles.listItemRight}>
													<Badge cls={cfg.badgeCls} dot>{cfg.label}</Badge>
												</div>
											</div>
										);
									})
								)}
							</div>
						</div>

						{/* ── RIGHT: DETAIL ── */}
						<div className={styles.detailPanel}>
							{!selectedId ? (
								<div className={styles.detailEmpty}>
									<svg className={styles.detailEmptyIcon} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
										<path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' />
										<polyline points='14 2 14 8 20 8' />
									</svg>
									<p className={styles.detailEmptyTitle}>Chọn một đề tài để xem chi tiết</p>
									<p className={styles.detailEmptyDesc}>Nhấn vào một đề tài ở danh sách bên trái</p>
								</div>
							) : (
								<>
									{/* Detail header skeleton while loading */}
									{detailLoading && !detailTopic ? (
										<div className={styles.detailEmpty}>
											<div className={styles.detailSpinner} />
											<p className={styles.detailEmptyDesc}>Đang tải chi tiết...</p>
										</div>
									) : detailTopic ? (
										<>
											{/* Header */}
											<div className={styles.detailHeader}>
												<div className={styles.detailTopicId}>{detailTopic.id}</div>
												<div className={styles.detailTitle}>{detailTopic.title}</div>
												<div className={styles.detailBadges}>
													<Badge cls={STATUS_CFG[detailTopic.status as TopicStatus]?.badgeCls ?? 'badgeGray'} dot>
														{STATUS_CFG[detailTopic.status as TopicStatus]?.label ?? detailTopic.status}
													</Badge>
													{detailTopic.category_id && (
														<Badge cls='badgeGray'>
															{detailTopic.category_name ?? detailTopic.category_id}
														</Badge>
													)}
													{detailTopic.level_id && (
														<Badge cls='badgeGray'>
															{detailTopic.level_name ?? detailTopic.level_id}
														</Badge>
													)}
												</div>
											</div>

											{/* Body */}
											<div
												className={styles.detailBody}
												style={detailLoading ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
											>
												{/* Info grid */}
												<div className={styles.infoGrid}>
													<div className={styles.infoItem}>
														<div className={styles.infoLabel}>Người đăng ký</div>
														<div className={styles.infoValue}>
															{detailTopic.created_by_name ?? detailTopic.created_by}
														</div>
													</div>
													<div className={styles.infoItem}>
														<div className={styles.infoLabel}>Phòng ban / Khoa</div>
														<div className={styles.infoValue}>
															{detailTopic.department_name ?? detailTopic.department_id ?? '—'}
														</div>
													</div>
													<div className={styles.infoItem}>
														<div className={styles.infoLabel}>Đợt nghiên cứu</div>
														<div className={styles.infoValue}>
															{detailTopic.round_name ?? detailTopic.round_id ?? '—'}
														</div>
													</div>
													<div className={styles.infoItem}>
														<div className={styles.infoLabel}>Số thành viên</div>
														<div className={styles.infoValue}>
															{detailTopic.members?.length ?? detailTopic.member_count ?? 0} người
														</div>
													</div>
													<div className={styles.infoItem}>
														<div className={styles.infoLabel}>Ngày nộp hồ sơ</div>
														<div className={styles.infoValue}>{formatDate(detailTopic.created_at)}</div>
													</div>
													{(latestApproval ?? detailTopic.updated_at) && (
														<div className={styles.infoItem}>
															<div className={styles.infoLabel}>Cập nhật lần cuối</div>
															<div className={styles.infoValue}>
																{formatDate(latestApproval?.created_at ?? detailTopic.updated_at)}
																{latestApproval &&
																	` · ${latestApproval.approver_name ?? latestApproval.created_by}`}
															</div>
														</div>
													)}
												</div>

												{/* Members */}
												{(detailTopic.members?.length ?? 0) > 0 && (
													<div className={styles.descSection}>
														<div className={styles.sectionLabel}>
															Thành viên nhóm nghiên cứu ({detailTopic.members.length} người)
														</div>
														<div className={styles.membersGrid}>
															{detailTopic.members.map((m, i) => {
																const avatarCls =
																	m.role === 'leader'
																		? styles.memberRoleLead
																		: m.role === 'secretary'
																			? styles.memberRoleMember
																			: styles.memberRoleMember;
																const roleLabel =
																	m.role === 'leader'
																		? 'Chủ nhiệm'
																		: m.role === 'secretary'
																			? 'Thư ký'
																			: 'Thành viên';
																const initial = m.ho_ten.split(' ').slice(-1)[0]?.[0] ?? '?';
																return (
																	<div key={i} className={styles.memberCard}>
																		<div className={`${styles.memberAvatar} ${avatarCls}`}>
																			{initial}
																		</div>
																		<div className={styles.memberInfo}>
																			<div className={styles.memberName}>{m.ho_ten}</div>
																			<div className={styles.memberMeta}>
																				<span className={styles.memberRoleBadge}>{roleLabel}</span>
																				{detailTopic.department_name && (
																					<span className={styles.memberDept}>{detailTopic.department_name}</span>
																				)}
																			</div>
																		</div>
																	</div>
																);
															})}
														</div>
													</div>
												)}

												{/* Description */}
												<div className={styles.descSection}>
													<div className={styles.sectionLabel}>Mô tả / Tóm tắt đề tài</div>
													<div className={styles.descBox}>
														{detailTopic.description || 'Chưa có mô tả.'}
													</div>
												</div>

												{/* History */}
												{detailHistory.length > 0 && (
													<div>
														<div className={styles.sectionLabel}>
															Lịch sử xử lý ({detailHistory.length} lần)
														</div>
														<div className={styles.historyList}>
															{[...detailHistory].reverse().map((h, i) => {
																const hcfg = APV_STATUS_CFG[h.status] ?? {
																	label: h.status,
																	badgeCls: 'badgeGray',
																};
																return (
																	<div key={i} className={styles.historyItem}>
																		<div className={styles.historyTop}>
																			<span className={styles.historyReviewer}>
																				{h.approver_name ?? h.created_by} — {hcfg.label}
																			</span>
																			<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
																				<Badge cls={hcfg.badgeCls} dot>{hcfg.label}</Badge>
																				<span className={styles.historyDate}>{formatDate(h.created_at)}</span>
																			</div>
																		</div>
																		{h.comment && (
																			<div className={styles.historyComment}>"{h.comment}"</div>
																		)}
																	</div>
																);
															})}
														</div>
													</div>
												)}

												{/* Files */}
												<div>
													<div className={styles.sectionLabel}>
														Tài liệu đính kèm ({detailFiles.length} tệp)
													</div>
													{detailFiles.length === 0 ? (
														<div className={styles.filesEmpty}>
															Chưa có tài liệu nào được đính kèm
														</div>
													) : (
														<div className={styles.filesList}>
															{detailFiles.map((f) => {
																const meta = getFileTypeMeta(f);
																const viewerUrl = getFileViewerUrl(f);
																return (
																	<div key={f.id} className={styles.fileItem}>
																		<div className={`${styles.fileIcon} ${styles[meta.cls as keyof typeof styles]}`}>
																			<Ic.File />
																		</div>
																		<div className={styles.fileInfo}>
																			<div className={styles.fileName} title={f.file_name}>
																				{f.file_name}
																			</div>
																			<div className={styles.fileMeta}>
																				<span className={`${styles.fileTypeBadge} ${styles[meta.cls as keyof typeof styles]}`}>
																					{meta.label}
																				</span>
																				· {formatFileSize(f.file_size)} ·{' '}
																				{f.uploaded_by_name} ·{' '}
																				{formatDate(f.created_at)}
																			</div>
																		</div>
																		<div className={styles.fileActions}>
																			{viewerUrl && (
																				<button
																					className={styles.btnFileView}
																					onClick={() =>
																						setFileViewer({
																							url: viewerUrl,
																							name: f.file_name,
																							isWord: meta.label !== 'PDF',
																						})
																					}
																				>
																					<Ic.Eye /> Xem
																				</button>
																			)}
																			<a
																				className={styles.btnFileDownload}
																				href={f.file_url}
																				download={f.file_name}
																				target='_blank'
																				rel='noreferrer'
																			>
																				<Ic.Download />
																			</a>
																		</div>
																	</div>
																);
															})}
														</div>
													)}
												</div>
											</div>

											{/* Status notice at bottom */}
											<div className={styles.actionPanel}>
												{detailTopic.status === 'submitted' && (
													<div className={`${styles.processedNotice} ${styles.processedAmber}`}>
														<Ic.Clock />
														<div>
															<div style={{ fontWeight: 700, fontSize: 13 }}>
																Đề tài đang chờ phê duyệt
															</div>
															<div style={{ fontSize: 12, marginTop: 2 }}>
																Hồ sơ đã được nộp và đang chờ hội đồng xem xét.
															</div>
														</div>
													</div>
												)}
												{detailTopic.status === 'approved' && (
													<div className={`${styles.processedNotice} ${styles.processedApproved}`}>
														<Ic.Approve />
														<div>
															<div style={{ fontWeight: 700, fontSize: 13 }}>
																Đề tài đã được phê duyệt
															</div>
															<div style={{ fontSize: 12, marginTop: 2 }}>
																Phê duyệt bởi{' '}
																{latestApproval?.approver_name ?? latestApproval?.created_by ?? '—'}{' '}
																· {formatDate(latestApproval?.created_at ?? detailTopic.updated_at)}
															</div>
														</div>
													</div>
												)}
												{detailTopic.status === 'rejected' && (
													<div className={`${styles.processedNotice} ${styles.processedRejected}`}>
														<Ic.Reject />
														<div>
															<div style={{ fontWeight: 700, fontSize: 13 }}>
																Đề tài đã bị từ chối
															</div>
															<div style={{ fontSize: 12, marginTop: 2 }}>
																Bởi{' '}
																{latestApproval?.approver_name ?? latestApproval?.created_by ?? '—'}{' '}
																· {formatDate(latestApproval?.created_at ?? detailTopic.updated_at)}
															</div>
														</div>
													</div>
												)}
												{detailTopic.status === 'supplement' && (
													<div className={`${styles.processedNotice} ${styles.processedBlue}`}>
														<Ic.Request />
														<div>
															<div style={{ fontWeight: 700, fontSize: 13 }}>
																Cần bổ sung hồ sơ
															</div>
															<div style={{ fontSize: 12, marginTop: 2 }}>
																Hội đồng yêu cầu bổ sung thêm thông tin. Vui lòng kiểm tra nhận xét.
															</div>
														</div>
													</div>
												)}
											</div>
										</>
									) : null}
								</>
							)}
						</div>
					</div>
				</>
			)}

			{/* ── FILE VIEWER ── */}
			{fileViewer && (
				<FileViewerModal file={fileViewer} onClose={() => setFileViewer(null)} />
			)}
		</UserLayout>
	);
}
