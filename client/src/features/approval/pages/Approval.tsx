// =============================================
// Approval.tsx — Trang Phê duyệt Đề tài
// Bệnh viện Hữu Nghị Đa Khoa Nghệ An — RMS
// Bảng: approvals (join topics, users)
// =============================================

import React, {
	useState,
	useMemo,
	useEffect,
	useCallback,
	useRef,
} from 'react';
import styles from './Approval.module.css';
import AdminLayout from '../../../layouts/AdminLayout';
import { useRealtimeUpdate } from '../../../hooks/useRealtime';
import {
	approveTopic,
	getApprovals,
	getApprovalTopicDetail,
	getApprovalTopics,
	rejectTopic,
	type Approval as ApprovalHistory,
	type TopicApprovalDetail,
	type TopicApprovalItem,
} from '../api/approval';
import type {
	ApprovalRecord,
	ApvHistoryItem,
	ApvStatus,
	ModalType,
	TabKey,
	TopicLevel,
} from '../types/Approval.type';
import { getTopicFiles } from '../../topics/api/topicApi';
import type { TopicFile } from '../../topics/types/topic.type';
import { getToken } from '../../../lib/authStorage';
import { BASE_URL } from '../../../lib/apiClient';
import CheckSvg from '../../../assets/svg/check.svg?react';
import XSvg from '../../../assets/svg/x.svg?react';
import AlertSvg from '../../../assets/svg/alert.svg?react';
import CheckCircleSvg from '../../../assets/svg/check-circle.svg?react';
import XCircleSvg from '../../../assets/svg/x-circle.svg?react';
import MessageSvg from '../../../assets/svg/message.svg?react';
import ClockSvg from '../../../assets/svg/clock.svg?react';
import SearchSvg from '../../../assets/svg/search.svg?react';
import WarnSvg from '../../../assets/svg/warn.svg?react';
import UsersSvg from '../../../assets/svg/users.svg?react';
import DotSvg from '../../../assets/svg/dot.svg?react';
import HistorySvg from '../../../assets/svg/history.svg?react';
import DownloadSvg from '../../../assets/svg/download.svg?react';
import EyeSvg from '../../../assets/svg/eye.svg?react';
import FileTextSvg from '../../../assets/svg/file-text.svg?react';

// ─── HELPERS ──────────────────────────────
const STATUS_CFG: Record<ApvStatus, { label: string; cls: string }> = {
	pending: { label: 'Chờ phê duyệt', cls: 'badgeAmber' },
	approved: { label: 'Đã phê duyệt', cls: 'badgeGreen' },
	rejected: { label: 'Từ chối', cls: 'badgeRed' },
	info_requested: { label: 'Yêu cầu bổ sung', cls: 'badgeBlue' },
};

const LEVEL_CFG: Record<TopicLevel, { label: string; cls: string }> = {
	'LV-BV': { label: 'Cấp bệnh viện', cls: 'badgeTeal' },
	'LV-BO': { label: 'Cấp bộ', cls: 'badgePurple' },
	'LV-NN': { label: 'Nhà nước', cls: 'badgeAmber' },
	'LV-CS': { label: 'Cơ sở', cls: 'badgeGray' },
};

const APV_HISTORY_CFG: Record<ApvStatus, string> = {
	pending: 'Nộp hồ sơ',
	approved: 'Phê duyệt',
	rejected: 'Từ chối',
	info_requested: 'Yêu cầu bổ sung',
};

// ─── ICONS ────────────────────────────────
const FALLBACK_LEVEL_LABEL: Record<string, string> = {
	'LV-BV': 'Cap benh vien',
	'LV-BO': 'Cap bo',
	'LV-NN': 'Nha nuoc',
	'LV-CS': 'Co so',
};

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

function toApvStatus(status: string): ApvStatus {
	if (status === 'approved' || status === 'rejected') return status;
	return 'pending';
}

function getLevelStyle(level: string) {
	return LEVEL_CFG[level]
		? LEVEL_CFG[level]
		: {
				label: FALLBACK_LEVEL_LABEL[level] ?? level ?? 'Chua phan cap',
				cls: 'badgeGray',
			};
}

function getMemberRoleLabel(role?: string | null) {
	switch (role) {
		case 'leader':
			return 'Chủ nhiệm';
		case 'secretary':
			return 'Thư ký';
		case 'advisor':
			return 'Cố vấn';
		default:
			return 'Thành viên';
	}
}

function isUrgentTopic(createdAt?: string, status?: ApvStatus) {
	if (!createdAt || status !== 'pending') return false;
	const created = new Date(createdAt);
	if (Number.isNaN(created.getTime())) return false;
	return Date.now() - created.getTime() > 3 * 24 * 60 * 60 * 1000;
}

function mapHistoryItem(item: ApprovalHistory): ApvHistoryItem {
	return {
		action: toApvStatus(item.status),
		comment: item.comment,
		actor: item.approver_name || item.created_by,
		at: formatDate(item.created_at) ?? '',
	};
}

function mapTopicToRecord(topic: TopicApprovalItem): ApprovalRecord {
	const status = toApvStatus(topic.status);
	return {
		id: topic.id,
		topic_id: topic.id,
		topic_title: topic.title,
		topic_description: topic.description ?? '',
		topic_level: topic.level_id ?? '',
		topic_category:
			topic.category_name ?? topic.category_id ?? 'Chua phan loai',
		topic_dept:
			topic.department_name ?? topic.department_id ?? 'Chua gan khoa/phong',
		topic_round: topic.round_name ?? topic.round_id ?? 'Chua gan dot',
		topic_member_count: topic.member_count ?? 0,
		status,
		comment: null,
		created_at: formatDate(topic.created_at) ?? '',
		created_by: topic.created_by_name ?? topic.created_by,
		updated_at: formatDate(topic.updated_at),
		updated_by: null,
		is_urgent: isUrgentTopic(topic.created_at, status),
		history: [],
		members: [],
	};
}

function mergeTopicDetail(
	record: ApprovalRecord,
	topic: TopicApprovalDetail,
	approvals: ApprovalHistory[],
): ApprovalRecord {
	const history = approvals.map(mapHistoryItem);
	const latest = approvals[0];
	return {
		...record,
		topic_description: topic.description ?? '',
		topic_level: topic.level_id ?? '',
		topic_category:
			topic.category_name ?? topic.category_id ?? record.topic_category,
		topic_dept:
			topic.department_name ?? topic.department_id ?? record.topic_dept,
		topic_round: topic.round_name ?? topic.round_id ?? record.topic_round,
		topic_member_count: topic.members?.length ?? record.topic_member_count,
		comment: latest?.comment ?? null,
		updated_at: formatDate(latest?.created_at) ?? record.updated_at,
		updated_by:
			latest?.approver_name ?? latest?.created_by ?? record.updated_by,
		history,
		members: (topic.members ?? []).map((member) => ({
			name: member.ho_ten,
			role: getMemberRoleLabel(member.role),
			dept: topic.department_name ?? topic.department_id ?? '',
		})),
	};
}

const Ic = {
	Check: () => <CheckSvg />,
	X: () => <XSvg />,
	Info: () => <AlertSvg />,
	Approve: () => <CheckCircleSvg />,
	Reject: () => <XCircleSvg />,
	Request: () => <MessageSvg />,
	Clock: () => <ClockSvg />,
	Search: () => <SearchSvg />,
	Urgent: () => <WarnSvg />,
	Users: () => <UsersSvg />,
	Dot: () => <DotSvg style={{ width: 8, height: 8 }} />,
	History: () => <HistorySvg />,
	Download: () => <DownloadSvg />,
	Eye: () => <EyeSvg />,
	File: () => <FileTextSvg />,
};

// ─── BADGE COMPONENT ──────────────────────
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

// ─── CONFIRM MODAL ─────────────────────────
interface ConfirmModalProps {
	type: 'approve' | 'reject' | 'request';
	topicTitle: string;
	comment: string;
	onChangeComment: (v: string) => void;
	onConfirm: () => void;
	onClose: () => void;
	loading: boolean;
}

const MODAL_CFG = {
	approve: {
		title: 'Phê duyệt đề tài',
		desc: 'Xác nhận phê duyệt đề tài này. Chủ nhiệm đề tài sẽ nhận thông báo và có thể bắt đầu triển khai.',
		placeholder: 'Nhận xét (không bắt buộc)...',
		iconCls: 'iconApprove',
		btnCls: 'btnConfirmApprove',
		btnLabel: 'Xác nhận phê duyệt',
	},
	reject: {
		title: 'Từ chối đề tài',
		desc: 'Đề tài sẽ bị từ chối. Vui lòng nêu rõ lý do để nhóm nghiên cứu có thể cải thiện.',
		placeholder: 'Nêu rõ lý do từ chối (bắt buộc)...',
		iconCls: 'iconReject',
		btnCls: 'btnConfirmReject',
		btnLabel: 'Xác nhận từ chối',
	},
	request: {
		title: 'Yêu cầu bổ sung hồ sơ',
		desc: 'Gửi yêu cầu bổ sung thông tin đến chủ nhiệm đề tài.',
		placeholder: 'Nêu rõ thông tin cần bổ sung (bắt buộc)...',
		iconCls: 'iconRequest',
		btnCls: 'btnConfirmRequest',
		btnLabel: 'Gửi yêu cầu',
	},
} as const;

function ConfirmModal({
	type,
	topicTitle,
	comment,
	onChangeComment,
	onConfirm,
	onClose,
	loading,
}: ConfirmModalProps) {
	const cfg = MODAL_CFG[type];
	const needComment = type !== 'approve';
	const canSubmit = !needComment || comment.trim().length > 0;

	const IconEl =
		type === 'approve'
			? Ic.Approve
			: type === 'reject'
				? Ic.Reject
				: Ic.Request;

	return (
		<div
			className={styles.modalBackdrop}
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<div
				className={styles.modal}
				role='alertdialog'
				aria-modal='true'
			>
				<div className={styles.modalBody}>
					<div
						className={`${styles.modalIcon} ${styles[cfg.iconCls as keyof typeof styles]}`}
					>
						<IconEl />
					</div>
					<h2 className={styles.modalTitle}>{cfg.title}</h2>
					<p className={styles.modalDesc}>
						Đề tài:{' '}
						<strong>
							"{topicTitle.slice(0, 70)}
							{topicTitle.length > 70 ? '...' : ''}"
						</strong>
						<br />
						{cfg.desc}
					</p>
					<textarea
						className={styles.modalComment}
						placeholder={cfg.placeholder}
						value={comment}
						onChange={(e) => onChangeComment(e.target.value)}
						rows={3}
						maxLength={500}
					/>
				</div>
				<div className={styles.modalFooter}>
					<button
						className={styles.btnCancel}
						onClick={onClose}
					>
						Huỷ
					</button>
					<button
						className={styles[cfg.btnCls as keyof typeof styles] as string}
						onClick={onConfirm}
						disabled={loading || !canSubmit}
					>
						{loading ? (
							<>
								<span
									className={styles.spinner}
									style={
										type !== 'approve' ? { borderTopColor: 'currentColor' } : {}
									}
								/>{' '}
								Đang xử lý...
							</>
						) : (
							cfg.btnLabel
						)}
					</button>
				</div>
			</div>
		</div>
	);
}

// ─── BULK CONFIRM MODAL ───────────────────
function BulkConfirmModal({
	action,
	count,
	comment,
	onChangeComment,
	onConfirm,
	onClose,
	loading,
}: {
	action: 'approve' | 'reject';
	count: number;
	comment: string;
	onChangeComment: (v: string) => void;
	onConfirm: () => void;
	onClose: () => void;
	loading: boolean;
}) {
	const isApprove = action === 'approve';
	const canSubmit = isApprove || comment.trim().length > 0;
	const IconEl = isApprove ? Ic.Approve : Ic.Reject;

	return (
		<div
			className={styles.modalBackdrop}
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<div
				className={styles.modal}
				role='alertdialog'
				aria-modal='true'
			>
				<div className={styles.modalBody}>
					<div
						className={`${styles.modalIcon} ${styles[isApprove ? 'iconApprove' : 'iconReject']}`}
					>
						<IconEl />
					</div>
					<h2 className={styles.modalTitle}>
						{isApprove ? 'Phê duyệt' : 'Từ chối'} {count} đề tài đã chọn
					</h2>
					<p className={styles.modalDesc}>
						Thao tác này sẽ {isApprove ? 'phê duyệt' : 'từ chối'}{' '}
						<strong>{count} đề tài</strong> cùng lúc.
						{isApprove
							? ' Chủ nhiệm các đề tài sẽ nhận thông báo và có thể bắt đầu triển khai.'
							: ' Vui lòng nêu rõ lý do để các nhóm nghiên cứu có thể cải thiện.'}
					</p>
					<textarea
						className={styles.modalComment}
						placeholder={
							isApprove
								? 'Nhận xét chung (không bắt buộc)...'
								: 'Lý do từ chối áp dụng cho tất cả (bắt buộc)...'
						}
						value={comment}
						onChange={(e) => onChangeComment(e.target.value)}
						rows={3}
						maxLength={500}
					/>
				</div>
				<div className={styles.modalFooter}>
					<button
						className={styles.btnCancel}
						onClick={onClose}
					>
						Huỷ
					</button>
					<button
						className={
							styles[
								isApprove
									? 'btnConfirmApprove'
									: ('btnConfirmReject' as keyof typeof styles)
							] as string
						}
						onClick={onConfirm}
						disabled={loading || !canSubmit}
					>
						{loading ? (
							<>
								<span
									className={styles.spinner}
									style={isApprove ? {} : { borderTopColor: 'currentColor' }}
								/>{' '}
								Đang xử lý...
							</>
						) : isApprove ? (
							`Phê duyệt ${count} đề tài`
						) : (
							`Từ chối ${count} đề tài`
						)}
					</button>
				</div>
			</div>
		</div>
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
	const [renderState, setRenderState] = useState<'loading' | 'done' | 'error'>(
		'loading',
	);
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
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<div className={styles.viewerModal}>
				<div className={styles.viewerHeader}>
					<span className={styles.viewerTitle}>{file.name}</span>
					<button
						className={styles.viewerClose}
						onClick={onClose}
					>
						✕
					</button>
				</div>

				{renderState === 'loading' && (
					<div className={styles.viewerStatus}>
						<span
							className={styles.spinner}
							style={{ borderTopColor: 'var(--color-primary)' }}
						/>
						Đang tải tài liệu...
					</div>
				)}
				{renderState === 'error' && (
					<div
						className={styles.viewerStatus}
						style={{ color: '#b91c1c' }}
					>
						Không thể tải tài liệu. Hãy thử tải về.
					</div>
				)}

				{/* Word: container always mounted so ref is valid when renderAsync runs */}
				{file.isWord && (
					<div
						className={styles.viewerDocxWrap}
						style={{ display: renderState === 'done' ? 'block' : 'none' }}
					>
						<div ref={containerRef} />
					</div>
				)}

				{/* PDF: embed with blob URL — forces browser PDF viewer */}
				{!file.isWord && renderState === 'done' && pdfBlobUrl && (
					<embed
						src={pdfBlobUrl}
						type='application/pdf'
						className={styles.viewerFrame}
					/>
				)}
			</div>
		</div>
	);
}

// ─── MAIN PAGE ────────────────────────────
export default function Approval() {
	const [records, setRecords] = useState<ApprovalRecord[]>([]);
	const [activeTab, setActiveTab] = useState<TabKey>('pending');
	const [search, setSearch] = useState('');
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [comment, setComment] = useState('');
	const [modal, setModal] = useState<ModalType>(null);
	const [loading, setLoading] = useState(false);
	const [listLoading, setListLoading] = useState(true);
	const [detailLoading, setDetailLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [toast, setToast] = useState<{
		msg: string;
		type: 'approve' | 'reject' | 'request';
	} | null>(null);
	const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
	const [bulkModal, setBulkModal] = useState<
		'bulkApprove' | 'bulkReject' | null
	>(null);
	const [bulkComment, setBulkComment] = useState('');
	const [filesByTopic, setFilesByTopic] = useState<Record<string, TopicFile[]>>(
		{},
	);
	const [fileViewer, setFileViewer] = useState<{
		url: string;
		name: string;
		isWord: boolean;
	} | null>(null);
	const [refreshKey, setRefreshKey] = useState(0);

	const refreshData = useCallback(() => setRefreshKey((k) => k + 1), []);
	useRealtimeUpdate('topic', refreshData);

	// Derive selected from records — always in sync, no effect needed
	const selected = useMemo(
		() =>
			selectedId ? (records.find((r) => r.id === selectedId) ?? null) : null,
		[selectedId, records],
	);

	// Auto-dismiss toast
	useEffect(() => {
		if (!toast) return;
		const t = setTimeout(() => setToast(null), 2800);
		return () => clearTimeout(t);
	}, [toast]);

	useEffect(() => {
		let cancelled = false;

		const loadTopics = async () => {
			setListLoading(true);
			setError(null);

			try {
				const [submitted, approved, rejected] = await Promise.all([
					getApprovalTopics({ limit: 100, status: 'submitted' }),
					getApprovalTopics({ limit: 100, status: 'approved' }),
					getApprovalTopics({ limit: 100, status: 'rejected' }),
				]);

				if (cancelled) return;

				const nextRecords = [
					...submitted.data,
					...approved.data,
					...rejected.data,
				].map(mapTopicToRecord);
				setRecords(nextRecords);
				setSelectedId((current) => {
					if (current && nextRecords.some((item) => item.id === current))
						return current;
					return nextRecords[0]?.id ?? null;
				});
			} catch (err) {
				if (cancelled) return;
				setError(
					err instanceof Error
						? err.message
						: 'Khong tai duoc du lieu phe duyet',
				);
			} finally {
				if (!cancelled) setListLoading(false);
			}
		};

		loadTopics();
		return () => {
			cancelled = true;
		};
	}, [refreshKey]);

	useEffect(() => {
		if (!selectedId) return;
		const record = records.find((item) => item.id === selectedId);
		if (!record) return;
		if (record.history.length > 0 || record.members.length > 0) return;

		let cancelled = false;

		const loadDetail = async () => {
			setDetailLoading(true);
			try {
				const [topic, approvals] = await Promise.all([
					getApprovalTopicDetail(selectedId),
					getApprovals(selectedId),
				]);
				if (cancelled) return;
				setRecords((prev) =>
					prev.map((item) =>
						item.id === selectedId
							? mergeTopicDetail(item, topic, approvals)
							: item,
					),
				);
			} catch (err) {
				if (cancelled) return;
				setToast({
					msg:
						err instanceof Error
							? err.message
							: 'Khong tai duoc chi tiet de tai',
					type: 'reject',
				});
			} finally {
				if (!cancelled) setDetailLoading(false);
			}
		};

		loadDetail();
		return () => {
			cancelled = true;
		};
	}, [selectedId, records]);

	useEffect(() => {
		if (!selectedId) return;
		let cancelled = false;
		const load = async () => {
			try {
				const res = await getTopicFiles(selectedId);
				if (!cancelled)
					setFilesByTopic((prev) => ({
						...prev,
						[selectedId]: res.data ?? [],
					}));
			} catch {
				if (!cancelled)
					setFilesByTopic((prev) => ({ ...prev, [selectedId]: [] }));
			}
		};
		void load();
		return () => {
			cancelled = true;
		};
	}, [selectedId]);

	// ── Stats ──────────────────────────────
	const stats = useMemo(
		() => ({
			pending: records.filter((r) => r.status === 'pending').length,
			approved: records.filter((r) => r.status === 'approved').length,
			rejected: records.filter((r) => r.status === 'rejected').length,
			info_requested: records.filter((r) => r.status === 'info_requested')
				.length,
		}),
		[records],
	);

	// ── Filtered list ──────────────────────
	const filtered = useMemo(() => {
		return records
			.filter((r) => {
				if (r.status !== activeTab) return false;
				if (search) {
					const q = search.toLowerCase();
					if (
						!r.topic_title.toLowerCase().includes(q) &&
						!r.topic_id.toLowerCase().includes(q) &&
						!r.created_by.toLowerCase().includes(q)
					)
						return false;
				}
				return true;
			})
			.sort((a, b) => {
				// urgent first
				if (a.is_urgent && !b.is_urgent) return -1;
				if (!a.is_urgent && b.is_urgent) return 1;
				return 0;
			});
	}, [records, activeTab, search]);

	const handleAction = useCallback(async () => {
		if (!selected || !modal) return;
		if ((modal === 'reject' || modal === 'request') && !comment.trim()) return;

		setLoading(true);

		try {
			if (modal === 'request') {
				throw new Error('Backend chua ho tro thao tac yeu cau bo sung');
			}

			if (modal === 'approve') {
				await approveTopic(selected.id, comment.trim() || undefined);
			} else {
				await rejectTopic(selected.id, comment.trim());
			}

			const [topic, approvals] = await Promise.all([
				getApprovalTopicDetail(selected.id),
				getApprovals(selected.id),
			]);
			const newStatus: ApvStatus =
				modal === 'approve' ? 'approved' : 'rejected';

			setRecords((prev) =>
				prev.map((item) =>
					item.id === selected.id
						? mergeTopicDetail(
								{
									...item,
									status: newStatus,
									is_urgent: false,
								},
								topic,
								approvals,
							)
						: item,
				),
			);

			setToast({
				msg:
					modal === 'approve'
						? 'Da phe duyet de tai thanh cong'
						: 'Da tu choi de tai',
				type: modal,
			});
			setModal(null);
			setComment('');
			setActiveTab(newStatus);
		} catch (err) {
			setToast({
				msg:
					err instanceof Error
						? err.message
						: 'Co loi xay ra, vui long thu lai',
				type: modal === 'approve' ? 'approve' : 'reject',
			});
		} finally {
			setLoading(false);
		}
	}, [selected, modal, comment]);

	const openModal = (type: ModalType) => {
		setComment('');
		setModal(type);
	};

	// ── Bulk select helpers ────────────────
	const isSelectableTab =
		activeTab === 'pending' || activeTab === 'info_requested';
	const checkedCount = filtered.filter((r) => checkedIds.has(r.id)).length;
	const allChecked = filtered.length > 0 && checkedCount === filtered.length;
	const someChecked = checkedCount > 0 && !allChecked;

	const toggleAll = useCallback(() => {
		setCheckedIds((prev) => {
			const next = new Set(prev);
			if (allChecked) {
				filtered.forEach((r) => next.delete(r.id));
			} else {
				filtered.forEach((r) => next.add(r.id));
			}
			return next;
		});
	}, [allChecked, filtered]);

	const handleBulkAction = useCallback(async () => {
		if (!bulkModal) return;
		const action = bulkModal === 'bulkApprove' ? 'approve' : 'reject';
		if (action === 'reject' && !bulkComment.trim()) return;

		const targetIds = filtered
			.filter((r) => checkedIds.has(r.id))
			.map((r) => r.id);
		if (targetIds.length === 0) return;

		setLoading(true);
		try {
			await Promise.all(
				targetIds.map((id) =>
					action === 'approve'
						? approveTopic(id, bulkComment.trim() || undefined)
						: rejectTopic(id, bulkComment.trim()),
				),
			);
			const newStatus: ApvStatus =
				action === 'approve' ? 'approved' : 'rejected';
			setRecords((prev) =>
				prev.map((item) =>
					targetIds.includes(item.id)
						? { ...item, status: newStatus, is_urgent: false }
						: item,
				),
			);
			setCheckedIds(new Set());
			setBulkModal(null);
			setBulkComment('');
			setActiveTab(newStatus);
			setToast({
				msg: `Đã ${action === 'approve' ? 'phê duyệt' : 'từ chối'} ${targetIds.length} đề tài`,
				type: action === 'approve' ? 'approve' : 'reject',
			});
		} catch (err) {
			setToast({
				msg:
					err instanceof Error
						? err.message
						: 'Có lỗi xảy ra khi xử lý hàng loạt',
				type: 'reject',
			});
		} finally {
			setLoading(false);
		}
	}, [bulkModal, bulkComment, filtered, checkedIds]);

	const TABS: { key: TabKey; label: string; count: number }[] = [
		{ key: 'pending', label: 'Chờ duyệt', count: stats.pending },
		{
			key: 'info_requested',
			label: 'Cần bổ sung',
			count: stats.info_requested,
		},
		{ key: 'approved', label: 'Đã duyệt', count: stats.approved },
		{ key: 'rejected', label: 'Từ chối', count: stats.rejected },
	];

	// ── Header actions ─────────────────────
	const headerActions = (
		<div
			style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}
		>
			{stats.pending > 0 && (
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 10,
						padding: '7px 18px',
						background: '#FAEEDA',
						border: '1.5px solid #EF9F27',
						borderRadius: 10,
						boxShadow: '0 1px 4px rgba(239,159,39,0.15)',
					}}
				>
					<Ic.Urgent />
					<div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
						<span
							style={{
								fontSize: 20,
								fontWeight: 800,
								color: '#7C4A00',
								lineHeight: 1,
							}}
						>
							{stats.pending}
						</span>
						<span
							style={{
								fontSize: 12,
								fontWeight: 600,
								color: '#633806',
								whiteSpace: 'nowrap',
							}}
						>
							đề tài chờ phê duyệt
						</span>
					</div>
					<div
						style={{
							width: 1,
							height: 24,
							background: '#EF9F2766',
							margin: '0 4px',
						}}
					/>
					<span
						style={{
							fontSize: 11,
							fontWeight: 500,
							color: '#9A5B00',
							whiteSpace: 'nowrap',
						}}
					>
						Cần xử lý sớm
					</span>
				</div>
			)}
		</div>
	);

	return (
		<AdminLayout
			pageTitle='Phê duyệt Đề tài'
			pageSubtitle='Xem xét và quyết định hồ sơ đề tài NCKH — bảng approvals'
			headerActions={headerActions}
		>
			{/* ── STATS (click to filter) ── */}
			<div className={styles.statsRow}>
				{[
					{
						key: 'pending' as TabKey,
						value: stats.pending,
						label: 'Chờ phê duyệt',
						iconCls: 'iconAmber',
						cardCls: 'amber',
						hintCls: 'hintAmber',
						hint: 'Cần xử lý sớm',
					},
					{
						key: 'approved' as TabKey,
						value: stats.approved,
						label: 'Đã phê duyệt',
						iconCls: 'iconGreen',
						cardCls: 'green',
						hintCls: 'hintGreen',
						hint: 'Hoàn tất',
					},
					{
						key: 'rejected' as TabKey,
						value: stats.rejected,
						label: 'Đã từ chối',
						iconCls: 'iconRed',
						cardCls: 'red',
						hintCls: 'hintRed',
						hint: 'Không đạt yêu cầu',
					},
					{
						key: 'info_requested' as TabKey,
						value: stats.info_requested,
						label: 'Chờ bổ sung',
						iconCls: 'iconBlue',
						cardCls: 'blue',
						hintCls: 'hintBlue',
						hint: 'Đang chờ phản hồi',
					},
				].map((s) => (
					<div
						key={s.key}
						className={`${styles.statCard} ${styles[s.cardCls as keyof typeof styles]} ${activeTab === s.key ? styles.statActive : ''}`}
						onClick={() => setActiveTab(s.key)}
					>
						<div
							className={`${styles.statIcon} ${styles[s.iconCls as keyof typeof styles]}`}
						>
							{s.key === 'pending' && <Ic.Clock />}
							{s.key === 'approved' && <Ic.Approve />}
							{s.key === 'rejected' && <Ic.Reject />}
							{s.key === 'info_requested' && <Ic.Request />}
						</div>
						<div className={styles.statBody}>
							<div className={styles.statValue}>{s.value}</div>
							<div className={styles.statLabel}>{s.label}</div>
							<div
								className={`${styles.statHint} ${styles[s.hintCls as keyof typeof styles]}`}
							>
								{s.hint}
							</div>
						</div>
					</div>
				))}
			</div>

			{/* ── SPLIT LAYOUT ── */}
			<div className={styles.splitLayout}>
				{/* ── LEFT: LIST ── */}
				<div className={styles.listPanel}>
					<div className={styles.listHeader}>
						<div className={styles.listHeaderTop}>
							<div className={styles.listHeaderLeft}>
								{isSelectableTab && filtered.length > 0 && (
									<label
										className={styles.checkAll}
										title={allChecked ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
									>
										<input
											type='checkbox'
											className={styles.checkbox}
											checked={allChecked}
											ref={(el) => {
												if (el) el.indeterminate = someChecked;
											}}
											onChange={toggleAll}
										/>
									</label>
								)}
								<span className={styles.listTitle}>Danh sách phê duyệt</span>
							</div>
							<div className={styles.listHeaderRight}>
								{isSelectableTab && checkedCount > 0 && (
									<span className={styles.selectionBadge}>
										<Ic.Check />
										{checkedCount} đã chọn
									</span>
								)}
								<span className={styles.listCount}>
									{filtered.length} hồ sơ
								</span>
							</div>
						</div>

						{/* Inline bulk action — chỉ hiện khi có items được chọn */}
						{isSelectableTab && checkedCount > 0 && (
							<div className={styles.bulkActions}>
								<button
									className={styles.btnSelApprove}
									onClick={() => {
										setBulkComment('');
										setBulkModal('bulkApprove');
									}}
								>
									<Ic.Approve /> Phê duyệt ({checkedCount})
								</button>
								<button
									className={styles.btnSelReject}
									onClick={() => {
										setBulkComment('');
										setBulkModal('bulkReject');
									}}
								>
									<Ic.Reject /> Từ chối ({checkedCount})
								</button>
								<button
									className={styles.btnSelClear}
									onClick={() => setCheckedIds(new Set())}
								>
									<Ic.X /> Bỏ chọn
								</button>
							</div>
						)}

						<div className={styles.listSearch}>
							<SearchSvg className={styles.listSearchIcon} />
							<input
								className={styles.listSearchInput}
								placeholder='Tìm mã, tên đề tài, người nộp...'
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
								onClick={() => {
									setActiveTab(t.key);
									setSelectedId(null);
									setSearch('');
									setCheckedIds(new Set());
								}}
							>
								{t.label}
								<span className={styles.tabCount}>{t.count}</span>
							</div>
						))}
					</div>

					{/* Items */}
					<div className={styles.listBody}>
						{listLoading ? (
							<div
								style={{
									padding: '48px 24px',
									textAlign: 'center',
									color: 'var(--color-gray-400)',
								}}
							>
								<div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
									Đang tải...
								</div>
							</div>
						) : error ? (
							<div
								style={{
									padding: '48px 24px',
									textAlign: 'center',
									color: '#A32D2D',
								}}
							>
								<div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
									{error}
								</div>
							</div>
						) : filtered.length === 0 ? (
							<div
								style={{
									padding: '48px 24px',
									textAlign: 'center',
									color: 'var(--color-gray-400)',
								}}
							>
								<div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
									Không có hồ sơ nào
								</div>
								<div style={{ fontSize: 12 }}>Thử thay đổi bộ lọc</div>
							</div>
						) : (
							filtered.map((r) => {
								const sc = STATUS_CFG[r.status];
								const isChecked = checkedIds.has(r.id);
								return (
									<div
										key={r.id}
										className={`${styles.listItem} ${selected?.id === r.id ? styles.listItemSelected : ''} ${isChecked ? styles.listItemChecked : ''}`}
										onClick={() => setSelectedId(r.id)}
									>
										{/* Check column: custom checkbox thay urgency dot khi ở tab có thể chọn */}
										{isSelectableTab ? (
											<div
												className={styles.checkCol}
												onClick={(e) => {
													e.stopPropagation();
													setCheckedIds((prev) => {
														const next = new Set(prev);
														if (next.has(r.id)) next.delete(r.id);
														else next.add(r.id);
														return next;
													});
												}}
											>
												<div
													className={`${styles.customCheck} ${isChecked ? styles.customCheckOn : ''}`}
												>
													{isChecked && (
														<svg
															viewBox='0 0 10 8'
															fill='none'
															stroke='currentColor'
															strokeWidth='2.2'
															strokeLinecap='round'
															strokeLinejoin='round'
														>
															<polyline points='1 4 3.5 7 9 1' />
														</svg>
													)}
												</div>
												{r.is_urgent && <span className={styles.urgentPip} />}
											</div>
										) : (
											<div
												className={`${styles.urgencyDot} ${r.is_urgent ? styles.dotUrgent : styles.dotNormal}`}
											/>
										)}

										<div className={styles.listItemContent}>
											<div className={styles.listItemTopicId}>
												{r.topic_id} · {r.id}
											</div>
											<div
												className={styles.listItemTitle}
												title={r.topic_title}
											>
												{r.topic_title}
											</div>
											<div className={styles.listItemMeta}>
												<span>{r.created_by}</span>
												<span>·</span>
												<span>{r.topic_dept}</span>
												<span>·</span>
												<span
													style={{
														display: 'flex',
														alignItems: 'center',
														gap: 3,
													}}
												>
													<Ic.Users />
													{r.topic_member_count}
												</span>
											</div>
										</div>

										<div className={styles.listItemRight}>
											<Badge
												cls={sc.cls}
												dot
											>
												{sc.label}
											</Badge>
											<span className={styles.listItemDate}>
												{r.created_at}
											</span>
											{r.is_urgent && (
												<span
													style={{
														fontSize: 10,
														color: '#E24B4A',
														fontWeight: 700,
													}}
												>
													⚠ Khẩn
												</span>
											)}
										</div>
									</div>
								);
							})
						)}
					</div>
				</div>

				{/* ── RIGHT: DETAIL ── */}
				<div className={styles.detailPanel}>
					{!selected ? (
						<div className={styles.detailEmpty}>
							<CheckCircleSvg className={styles.detailEmptyIcon} />
							<p className={styles.detailEmptyTitle}>
								Chọn một hồ sơ để xem chi tiết
							</p>
							<p className={styles.detailEmptyDesc}>
								Nhấn vào một đề tài ở danh sách bên trái
							</p>
						</div>
					) : (
						<>
							{/* Header */}
							<div className={styles.detailHeader}>
								<div className={styles.detailTopicId}>
									{selected.topic_id} · {selected.id}
								</div>
								<div className={styles.detailTitle}>{selected.topic_title}</div>
								<div className={styles.detailBadges}>
									<Badge
										cls={STATUS_CFG[selected.status].cls}
										dot
									>
										{STATUS_CFG[selected.status].label}
									</Badge>
									<Badge cls={getLevelStyle(selected.topic_level).cls}>
										{getLevelStyle(selected.topic_level).label}
									</Badge>
									<Badge cls='badgeGray'>{selected.topic_category}</Badge>
									{selected.is_urgent && (
										<span className={`${styles.badge} ${styles.badgeRed}`}>
											<WarnSvg
												style={{ width: 11, height: 11, flexShrink: 0 }}
											/>
											Cần xử lý khẩn
										</span>
									)}
								</div>
							</div>

							{/* Body */}
							<div
								className={styles.detailBody}
								style={
									detailLoading
										? { opacity: 0.5, pointerEvents: 'none' }
										: undefined
								}
							>
								{/* Info grid */}
								<div className={styles.infoGrid}>
									<div className={styles.infoItem}>
										<div className={styles.infoLabel}>Người đăng ký</div>
										<div className={styles.infoValue}>
											{selected.created_by}
										</div>
									</div>
									<div className={styles.infoItem}>
										<div className={styles.infoLabel}>Phòng ban / Khoa</div>
										<div className={styles.infoValue}>
											{selected.topic_dept}
										</div>
									</div>
									<div className={styles.infoItem}>
										<div className={styles.infoLabel}>Đợt nghiên cứu</div>
										<div className={styles.infoValue}>
											{selected.topic_round}
										</div>
									</div>
									<div className={styles.infoItem}>
										<div className={styles.infoLabel}>Số thành viên</div>
										<div className={styles.infoValue}>
											{selected.topic_member_count} người
										</div>
									</div>
									<div className={styles.infoItem}>
										<div className={styles.infoLabel}>Ngày nộp hồ sơ</div>
										<div className={styles.infoValue}>
											{selected.created_at}
										</div>
									</div>
									{selected.updated_at && (
										<div className={styles.infoItem}>
											<div className={styles.infoLabel}>Cập nhật lần cuối</div>
											<div className={styles.infoValue}>
												{selected.updated_at} · {selected.updated_by}
											</div>
										</div>
									)}
								</div>

								{/* Members */}
								<div className={styles.descSection}>
									<div className={styles.sectionLabel}>
										Thành viên nhóm nghiên cứu ({selected.members.length} người)
									</div>
									<div className={styles.membersGrid}>
										{selected.members.map((m, i) => (
											<div
												key={i}
												className={styles.memberCard}
											>
												<div
													className={`${styles.memberAvatar} ${styles[`memberRole${m.role === 'Chủ nhiệm' ? 'Lead' : m.role === 'Cố vấn' ? 'Advisor' : 'Member'}` as keyof typeof styles]}`}
												>
													{m.name.split(' ').slice(-1)[0][0]}
												</div>
												<div className={styles.memberInfo}>
													<div className={styles.memberName}>{m.name}</div>
													<div className={styles.memberMeta}>
														<span className={styles.memberRoleBadge}>
															{m.role}
														</span>
														<span className={styles.memberDept}>{m.dept}</span>
													</div>
												</div>
											</div>
										))}
									</div>
								</div>

								{/* Description */}
								<div className={styles.descSection}>
									<div className={styles.sectionLabel}>
										Mô tả / Tóm tắt đề tài
									</div>
									<div className={styles.descBox}>
										{selected.topic_description}
									</div>
								</div>

								{/* Current comment (if any) */}
								{selected.comment && (
									<div>
										<div className={styles.sectionLabel}>
											Nhận xét của hội đồng
										</div>
										<div
											className={`${styles.descBox}`}
											style={{
												fontStyle: 'italic',
												color: 'var(--color-gray-600)',
											}}
										>
											"{selected.comment}"
										</div>
									</div>
								)}

								{/* History */}
								{selected.history.length > 0 && (
									<div>
										<div className={styles.sectionLabel}>
											Lịch sử xử lý ({selected.history.length} lần)
										</div>
										<div className={styles.historyList}>
											{[...selected.history].reverse().map((h, i) => {
												const hcfg = STATUS_CFG[h.action];
												return (
													<div
														key={i}
														className={styles.historyItem}
													>
														<div className={styles.historyTop}>
															<span className={styles.historyReviewer}>
																{h.actor} — {APV_HISTORY_CFG[h.action]}
															</span>
															<div
																style={{
																	display: 'flex',
																	alignItems: 'center',
																	gap: 8,
																}}
															>
																<Badge
																	cls={hcfg.cls}
																	dot
																>
																	{hcfg.label}
																</Badge>
																<span className={styles.historyDate}>
																	{h.at}
																</span>
															</div>
														</div>
														{h.comment && (
															<div className={styles.historyComment}>
																"{h.comment}"
															</div>
														)}
													</div>
												);
											})}
										</div>
									</div>
								)}

								{/* Files */}
								{(() => {
									const files = filesByTopic[selected.id] ?? null;
									if (files === null) return null;
									return (
										<div>
											<div className={styles.sectionLabel}>
												Tài liệu đính kèm ({files.length} tệp)
											</div>
											{files.length === 0 ? (
												<div className={styles.filesEmpty}>
													Chưa có tài liệu nào được đính kèm
												</div>
											) : (
												<div className={styles.filesList}>
													{files.map((f) => {
														const meta = getFileTypeMeta(f);
														const viewerUrl = getFileViewerUrl(f);
														return (
															<div
																key={f.id}
																className={styles.fileItem}
															>
																<div
																	className={`${styles.fileIcon} ${styles[meta.cls as keyof typeof styles]}`}
																>
																	<Ic.File />
																</div>
																<div className={styles.fileInfo}>
																	<div
																		className={styles.fileName}
																		title={f.file_name}
																	>
																		{f.file_name}
																	</div>
																	<div className={styles.fileMeta}>
																		<span
																			className={`${styles.fileTypeBadge} ${styles[meta.cls as keyof typeof styles]}`}
																		>
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
									);
								})()}
							</div>

							{/* Action panel */}
							{/* Action panel */}
							<div className={styles.actionPanel}>
								{selected.status === 'pending' ||
								selected.status === 'info_requested' ? (
									<>
										<div>
											<div className={styles.actionLabel}>
												Quyết định phê duyệt
											</div>
											<div className={styles.actionHint}>
												Sau khi xác nhận, trạng thái đề tài sẽ được cập nhật và
												chủ nhiệm nhận thông báo.
											</div>
										</div>
										<div className={styles.actionBtns}>
											<button
												className={styles.btnApprove}
												onClick={() => openModal('approve')}
											>
												<Ic.Approve />
												Phê duyệt
											</button>
											<button
												className={styles.btnReject}
												onClick={() => openModal('reject')}
											>
												<Ic.Reject />
												Từ chối
											</button>
											<button
												className={styles.btnRequest}
												onClick={() => openModal('request')}
												title='Backend chua ho tro thao tac nay'
											>
												<Ic.Request />
												Yêu cầu bổ sung
											</button>
										</div>
									</>
								) : selected.status === 'approved' ? (
									<div
										className={`${styles.processedNotice} ${styles.processedApproved}`}
									>
										<Ic.Approve />
										<div>
											<div style={{ fontWeight: 700, fontSize: 13 }}>
												Đề tài đã được phê duyệt
											</div>
											<div style={{ fontSize: 12, marginTop: 2 }}>
												Phê duyệt bởi {selected.updated_by} ·{' '}
												{selected.updated_at}
											</div>
										</div>
									</div>
								) : (
									<div
										className={`${styles.processedNotice} ${styles.processedRejected}`}
									>
										<Ic.Reject />
										<div>
											<div style={{ fontWeight: 700, fontSize: 13 }}>
												Đề tài đã bị từ chối
											</div>
											<div style={{ fontSize: 12, marginTop: 2 }}>
												Bởi {selected.updated_by} · {selected.updated_at}
											</div>
										</div>
									</div>
								)}
							</div>
						</>
					)}
				</div>
			</div>

			{/* ── CONFIRM MODAL ── */}
			{modal && selected && (
				<ConfirmModal
					type={modal}
					topicTitle={selected.topic_title}
					comment={comment}
					onChangeComment={setComment}
					onConfirm={handleAction}
					onClose={() => {
						setModal(null);
						setComment('');
					}}
					loading={loading}
				/>
			)}

			{/* ── BULK CONFIRM MODAL ── */}
			{bulkModal && checkedCount > 0 && (
				<BulkConfirmModal
					action={bulkModal === 'bulkApprove' ? 'approve' : 'reject'}
					count={checkedCount}
					comment={bulkComment}
					onChangeComment={setBulkComment}
					onConfirm={() => void handleBulkAction()}
					onClose={() => setBulkModal(null)}
					loading={loading}
				/>
			)}

			{/* ── FILE VIEWER ── */}
			{fileViewer && (
				<FileViewerModal
					file={fileViewer}
					onClose={() => setFileViewer(null)}
				/>
			)}

			{/* ── TOAST ── */}
			{toast && (
				<div
					className={`${styles.toast} ${styles[`toast${toast.type.charAt(0).toUpperCase() + toast.type.slice(1)}` as keyof typeof styles]}`}
				>
					{toast.type === 'approve' && <Ic.Check />}
					{toast.type === 'reject' && <Ic.X />}
					{toast.type === 'request' && <Ic.Info />}
					{toast.msg}
				</div>
			)}
		</AdminLayout>
	);
}
