import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { getTopicFiles } from '../../topics/api/topicApi';
import type { TopicFile } from '../../topics/types/topic.type';
import {
	approveTopic,
	getApprovals,
	getApprovalTopicDetail,
	getApprovalTopics,
	rejectTopic,
	requestSupplementTopic,
} from '../api/approval';
import type {
	ApprovalRecord,
	ApvStatus,
	ModalType,
	TabKey,
} from '../types/approval.type';
import { mapTopicToRecord, mergeTopicDetail } from '../utils/approvalHelpers';

export interface ApprovalState {
	records: ApprovalRecord[];
	activeTab: TabKey;
	search: string;
	selectedId: string | null;
	selected: ApprovalRecord | null;
	comment: string;
	modal: ModalType;
	loading: boolean;
	listLoading: boolean;
	detailLoading: boolean;
	error: string | null;
	toast: { msg: string; type: 'approve' | 'reject' | 'request' } | null;
	checkedIds: Set<string>;
	bulkModal: 'bulkApprove' | 'bulkReject' | null;
	bulkComment: string;
	filesByTopic: Record<string, TopicFile[]>;
	fileViewer: { url: string; name: string; isWord: boolean } | null;

	// Derived
	stats: {
		pending: number;
		approved: number;
		rejected: number;
		info_requested: number;
	};
	filtered: ApprovalRecord[];
	isSelectableTab: boolean;
	checkedCount: number;
	allChecked: boolean;
	someChecked: boolean;
	TABS: { key: TabKey; label: string; count: number }[];

	// Actions
	setActiveTab: (tab: TabKey) => void;
	setSearch: (s: string) => void;
	setSelectedId: (id: string | null) => void;
	setComment: (v: string) => void;
	setModal: (m: ModalType) => void;
	setCheckedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
	setBulkModal: (m: 'bulkApprove' | 'bulkReject' | null) => void;
	setBulkComment: (v: string) => void;
	setFileViewer: (
		v: { url: string; name: string; isWord: boolean } | null,
	) => void;
	openModal: (type: ModalType) => void;
	toggleAll: () => void;
	handleAction: () => Promise<void>;
	handleBulkAction: () => Promise<void>;
}

// React import needed for Dispatch type
import type React from 'react';

export function useApproval(): ApprovalState {
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

	// Load all topics
	useEffect(() => {
		let cancelled = false;
		const load = async () => {
			setListLoading(true);
			setError(null);
			try {
				const [submitted, approved, rejected, supplement] = await Promise.all([
					getApprovalTopics({ limit: 0, status: 'submitted' }),
					getApprovalTopics({ limit: 0, status: 'approved' }),
					getApprovalTopics({ limit: 0, status: 'rejected' }),
					getApprovalTopics({ limit: 0, status: 'supplement' }),
				]);
				if (cancelled) return;
				const next = [
					...submitted.data,
					...approved.data,
					...rejected.data,
					...supplement.data,
				].map(mapTopicToRecord);
				setRecords(next);
				setSelectedId((cur) => {
					if (cur && next.some((r) => r.id === cur)) return cur;
					return next[0]?.id ?? null;
				});
			} catch (err) {
				if (!cancelled)
					setError(
						err instanceof Error
							? err.message
							: 'Không thể tải dữ liệu phê duyệt',
					);
			} finally {
				if (!cancelled) setListLoading(false);
			}
		};
		void load();
		return () => {
			cancelled = true;
		};
	}, [refreshKey]);

	// Load topic detail on selection
	useEffect(() => {
		if (!selectedId) return;
		const record = records.find((r) => r.id === selectedId);
		if (!record || record.history.length > 0 || record.members.length > 0)
			return;
		let cancelled = false;
		const load = async () => {
			setDetailLoading(true);
			try {
				const [topic, approvals] = await Promise.all([
					getApprovalTopicDetail(selectedId),
					getApprovals(selectedId),
				]);
				if (cancelled) return;
				setRecords((prev) =>
					prev.map((r) =>
						r.id === selectedId ? mergeTopicDetail(r, topic, approvals) : r,
					),
				);
			} catch (err) {
				if (!cancelled)
					setToast({
						msg: err instanceof Error ? err.message : 'Không thể tải chi tiết đề tài',
						type: 'reject',
					});
			} finally {
				if (!cancelled) setDetailLoading(false);
			}
		};
		void load();
		return () => {
			cancelled = true;
		};
	}, [selectedId, records]);

	// Load files for selected topic
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

	const filtered = useMemo(
		() =>
			records
				.filter((r) => {
					if (r.status !== activeTab) return false;
					if (search) {
						const q = search.toLowerCase();
						return (
							r.topic_title.toLowerCase().includes(q) ||
							r.topic_id.toLowerCase().includes(q) ||
							r.created_by.toLowerCase().includes(q)
						);
					}
					return true;
				})
				.sort((a, b) => {
					if (a.is_urgent && !b.is_urgent) return -1;
					if (!a.is_urgent && b.is_urgent) return 1;
					return 0;
				}),
		[records, activeTab, search],
	);

	const isSelectableTab =
		activeTab === 'pending' || activeTab === 'info_requested';
	const checkedCount = filtered.filter((r) => checkedIds.has(r.id)).length;
	const allChecked = filtered.length > 0 && checkedCount === filtered.length;
	const someChecked = checkedCount > 0 && !allChecked;

	const TABS = [
		{ key: 'pending' as TabKey, label: 'Chờ duyệt', count: stats.pending },
		{
			key: 'info_requested' as TabKey,
			label: 'Cần bổ sung',
			count: stats.info_requested,
		},
		{ key: 'approved' as TabKey, label: 'Đã duyệt', count: stats.approved },
		{ key: 'rejected' as TabKey, label: 'Không phê duyệt', count: stats.rejected },
	];

	const openModal = useCallback((type: ModalType) => {
		setComment('');
		setModal(type);
	}, []);

	const toggleAll = useCallback(() => {
		setCheckedIds((prev) => {
			const next = new Set(prev);
			if (allChecked) filtered.forEach((r) => next.delete(r.id));
			else filtered.forEach((r) => next.add(r.id));
			return next;
		});
	}, [allChecked, filtered]);

	const handleAction = useCallback(async () => {
		if (!selected || !modal) return;
		if ((modal === 'reject' || modal === 'request') && !comment.trim()) return;
		setLoading(true);
		try {
			if (modal === 'approve')
				await approveTopic(selected.id, comment.trim() || undefined);
			else if (modal === 'request')
				await requestSupplementTopic(selected.id, comment.trim());
			else await rejectTopic(selected.id, comment.trim());

			const [topic, approvals] = await Promise.all([
				getApprovalTopicDetail(selected.id),
				getApprovals(selected.id),
			]);
			const newStatus: ApvStatus =
				modal === 'approve'
					? 'approved'
					: modal === 'request'
						? 'info_requested'
						: 'rejected';
			setRecords((prev) =>
				prev.map((r) =>
					r.id === selected.id
						? mergeTopicDetail(
								{ ...r, status: newStatus, is_urgent: false },
								topic,
								approvals,
							)
						: r,
				),
			);
			setToast({
				msg:
					modal === 'approve'
						? 'Đã phê duyệt đề tài thành công'
						: modal === 'request'
							? 'Đã gửi yêu cầu bổ sung tới chủ nhiệm đề tài'
							: 'Đã không phê duyệt đề tài',
				type: modal,
			});
			setModal(null);
			setComment('');
			setActiveTab(newStatus);
		} catch (err) {
			setToast({
				msg: err instanceof Error ? err.message : 'Có lỗi xảy ra, vui lòng thử lại sau.',
				type: modal === 'approve' ? 'approve' : modal === 'request' ? 'request' : 'reject',
			});
		} finally {
			setLoading(false);
		}
	}, [selected, modal, comment]);

	const handleBulkAction = useCallback(async () => {
		if (!bulkModal) return;
		const action = bulkModal === 'bulkApprove' ? 'approve' : 'reject';
		if (action === 'reject' && !bulkComment.trim()) return;
		const targetIds = filtered
			.filter((r) => checkedIds.has(r.id))
			.map((r) => r.id);
		if (!targetIds.length) return;
		setLoading(true);
		const results = await Promise.allSettled(
			targetIds.map((id) =>
				action === 'approve'
					? approveTopic(id, bulkComment.trim() || undefined)
					: rejectTopic(id, bulkComment.trim()),
			),
		);
		const okIds = new Set(
			targetIds.filter((_, i) => results[i].status === 'fulfilled'),
		);
		const failedCount = targetIds.length - okIds.size;
		const newStatus: ApvStatus = action === 'approve' ? 'approved' : 'rejected';
		setRecords((prev) =>
			prev.map((r) =>
				okIds.has(r.id) ? { ...r, status: newStatus, is_urgent: false } : r,
			),
		);
		// Chỉ bỏ tick các đề tài đã xử lý thành công — các đề tài lỗi vẫn được
		// chọn để user thử lại mà không cần tick lại từ đầu.
		setCheckedIds((prev) => {
			const next = new Set(prev);
			okIds.forEach((id) => next.delete(id));
			return next;
		});
		setBulkModal(null);
		setBulkComment('');
		if (okIds.size > 0) setActiveTab(newStatus);
		setToast({
			msg: failedCount
				? `Đã ${action === 'approve' ? 'phê duyệt' : 'từ chối'} ${okIds.size} đề tài, ${failedCount} đề tài lỗi`
				: `Đã ${action === 'approve' ? 'phê duyệt' : 'từ chối'} ${okIds.size} đề tài`,
			type: failedCount ? 'reject' : action === 'approve' ? 'approve' : 'reject',
		});
		setLoading(false);
	}, [bulkModal, bulkComment, filtered, checkedIds]);

	return {
		records,
		activeTab,
		search,
		selectedId,
		selected,
		comment,
		modal,
		loading,
		listLoading,
		detailLoading,
		error,
		toast,
		checkedIds,
		bulkModal,
		bulkComment,
		filesByTopic,
		fileViewer,
		stats,
		filtered,
		isSelectableTab,
		checkedCount,
		allChecked,
		someChecked,
		TABS,
		setActiveTab,
		setSearch,
		setSelectedId,
		setComment,
		setModal,
		setCheckedIds,
		setBulkModal,
		setBulkComment,
		setFileViewer,
		openModal,
		toggleAll,
		handleAction,
		handleBulkAction,
	};
}
