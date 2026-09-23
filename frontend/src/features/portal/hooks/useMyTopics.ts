import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { getStoredUser, type StoredUser } from '../../../shared/utils/storage';
import {
	getApprovalTopicDetail,
	getApprovals,
	type Approval as ApprovalHistory,
	type TopicApprovalDetail,
} from '../../approval/api/approval';
import { getDeadlines } from '../../round/api/roundApi';
import { useRegistrationOpen } from '../../round/hooks/useRegistrationOpen';
import type { RoundDeadline } from '../../round/types/round.type';
import {
	getCategories,
	getDepts,
	getLevels,
	getTopicFiles,
	getTopicMembers,
	getTopics,
	updateTopic,
	uploadTopicFiles,
	type SimpleItem,
} from '../../topics/api/topicApi';
import type {
	MemberRole,
	Topic,
	TopicFile,
} from '../../topics/types/topic.type';
import { formatFileSize } from '../../topics/utils/topicHelpers';
import { getTopicPermissions } from '../services/topicDetailService';
import {
	type CategoryTab,
	type FilterTab,
	canSeeDeptTopics,
} from '../utils/myTopicsHelpers';

export function useMyTopics() {
	const userInfo = getStoredUser<StoredUser>();
	const fullName = userInfo?.full_name ?? userInfo?.username ?? 'Người dùng';
	const userRole = userInfo?.role ?? userInfo?.role_name ?? 'Thành viên';
	const currentUserId = userInfo?.id ?? '';
	const userDeptId = userInfo?.department_id ?? '';
	const permissions = userInfo?.permissions ?? [];
	const isSuperuser = permissions.includes('system:manage');
	const canSeeDept = canSeeDeptTopics(permissions);
	const canCreateTopic =
		isSuperuser ||
		permissions.includes('topics:create') ||
		permissions.includes('topics:manage');
	// Nút "Đăng ký đề tài mới" chỉ hiện khi đang trong thời gian đăng ký của đợt.
	const { open: registrationOpen } = useRegistrationOpen(canCreateTopic);
	const canRegister = canCreateTopic && registrationOpen;

	const initials = fullName
		.split(' ')
		.map((w: string) => w[0])
		.filter(Boolean)
		.slice(-2)
		.join('')
		.toUpperCase();

	const [deptTopics, setDeptTopics] = useState<Topic[]>([]);
	const [myTopics, setMyTopics] = useState<Topic[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [search, setSearch] = useState('');
	const [category, setCategory] = useState<CategoryTab>('department');
	const [_activeTab, setActiveTab] = useState<FilterTab | null>(null);
	const [userSelectedId, setSelectedId] = useState<string | null>(null);
	const [detailLoading, setDetailLoading] = useState(false);
	const [detailTopic, setDetailTopic] = useState<TopicApprovalDetail | null>(
		null,
	);
	const [detailFiles, setDetailFiles] = useState<TopicFile[]>([]);
	const [detailHistory, setDetailHistory] = useState<ApprovalHistory[]>([]);
	const [fileViewer, setFileViewer] = useState<{
		url: string;
		name: string;
		isWord: boolean;
	} | null>(null);
	const [refreshKey, setRefreshKey] = useState(0);
	const [roundDeadlines, setRoundDeadlines] = useState<RoundDeadline[]>([]);
	const [myRole, setMyRole] = useState<MemberRole | null>(null);

	const [editOpen, setEditOpen] = useState(false);
	const [editForm, setEditForm] = useState({
		title: '',
		description: '',
		category_id: '',
		level_id: '',
		department_id: '',
	});
	const [editLoading, setEditLoading] = useState(false);
	const [editError, setEditError] = useState('');
	const [refData, setRefData] = useState<{
		categories: SimpleItem[];
		levels: SimpleItem[];
		depts: SimpleItem[];
	} | null>(null);
	const [refDataLoading, setRefDataLoading] = useState(false);

	const fileInputRef = useRef<HTMLInputElement>(null);
	const [pendingFiles, setPendingFiles] = useState<File[]>([]);
	const [batchNote, setBatchNote] = useState('');
	const [uploadLoading, setUploadLoading] = useState(false);
	const [uploadError, setUploadError] = useState('');

	const prevSelectedIdRef = useRef<string | null | undefined>(undefined);

	const refreshData = useCallback(() => setRefreshKey((k) => k + 1), []);
	useRealtimeUpdate(['topic', 'round'], refreshData);

	useEffect(() => {
		if (!currentUserId) return;
		const deptParams = userDeptId
			? { limit: 0, department_id: userDeptId }
			: { limit: 0 };

		async function fetchTopics() {
			setLoading(true);
			setError('');
			try {
				if (canSeeDept) {
					const [deptRes, myRes] = await Promise.all([
						getTopics(deptParams),
						getTopics({ limit: 0, participant_id: currentUserId }),
					]);
					setDeptTopics(deptRes.data);
					setMyTopics(myRes.data);
				} else {
					const res = await getTopics({
						limit: 0,
						participant_id: currentUserId,
					});
					setMyTopics(res.data);
				}
			} catch {
				setError('Không thể tải danh sách đề tài.');
			} finally {
				setLoading(false);
			}
		}
		void fetchTopics();
	}, [canSeeDept, currentUserId, userDeptId, refreshKey]);

	const activeTopics = canSeeDept
		? category === 'department'
			? deptTopics
			: myTopics
		: myTopics;

	const stats = useMemo(
		() => ({
			submitted: activeTopics.filter((t) => t.status === 'submitted').length,
			approved: activeTopics.filter((t) => t.status === 'approved').length,
			rejected: activeTopics.filter((t) => t.status === 'rejected').length,
			supplement: activeTopics.filter((t) => t.status === 'supplement').length,
			cancelled: activeTopics.filter((t) => t.status === 'cancelled').length,
		}),
		[activeTopics],
	);

	// Derive the active tab: if the user hasn't picked one yet, auto-pick the first
	// non-empty tab in priority order so the list is never blank on first load.
	const activeTab = useMemo<FilterTab>(() => {
		if (_activeTab !== null) return _activeTab;
		if (activeTopics.length === 0) return 'submitted';
		const order: FilterTab[] = [
			'supplement',
			'submitted',
			'approved',
			'rejected',
		];
		return (
			order.find((tab) => activeTopics.some((t) => t.status === tab)) ??
			'submitted'
		);
	}, [_activeTab, activeTopics]);

	const filtered = useMemo(() => {
		let list = activeTopics.filter((t) => t.status === activeTab);
		if (search.trim()) {
			const q = search.toLowerCase();
			list = list.filter(
				(t) =>
					t.title.toLowerCase().includes(q) || t.id.toLowerCase().includes(q),
			);
		}
		return list;
	}, [activeTopics, activeTab, search]);

	const selectedId = useMemo(() => {
		if (userSelectedId && filtered.some((t) => t.id === userSelectedId))
			return userSelectedId;
		return filtered[0]?.id ?? null;
	}, [userSelectedId, filtered]);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			// Only reset form/upload state when the topic actually changes, not on background refreshes
			// (refreshKey increments). This prevents pending file selections from being lost when an
			// unrelated SSE event triggers a reload of the same topic.
			if (selectedId !== prevSelectedIdRef.current) {
				prevSelectedIdRef.current = selectedId;
				setEditOpen(false);
				setPendingFiles([]);
				setBatchNote('');
				setUploadError('');
				setEditError('');
			}
			setRoundDeadlines([]);
			setMyRole(null);
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
				// Fetch topic first to get round_id, then fetch all remaining data in parallel
				const topic = await getApprovalTopicDetail(selectedId);
				if (cancelled) return;

				const [files, history, dl, mem] = await Promise.all([
					getTopicFiles(selectedId),
					getApprovals(selectedId).catch(() => [] as ApprovalHistory[]),
					topic.round_id
						? getDeadlines(topic.round_id)
						: Promise.resolve([] as RoundDeadline[]),
					getTopicMembers(selectedId).catch(() => []),
				]);
				if (cancelled) return;

				// Set all state in one batch so permissions are computed once with complete data
				setDetailTopic(topic);
				setDetailFiles(files.data ?? []);
				setDetailHistory(history);
				setRoundDeadlines(dl);
				setMyRole(
					mem.find((m) => m.user_id === currentUserId)?.role ?? null,
				);
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
		return () => {
			cancelled = true;
		};
	}, [selectedId, refreshKey, currentUserId]);

	useEffect(() => {
		if (!editOpen || refData !== null || refDataLoading) return;
		void (async () => {
			setRefDataLoading(true);
			try {
				const [cats, lvls, dpts] = await Promise.all([
					getCategories(),
					getLevels(),
					getDepts(),
				]);
				setRefData({
					categories: cats.data,
					levels: lvls.data,
					depts: dpts.data,
				});
			} catch {
				// silent
			} finally {
				setRefDataLoading(false);
			}
		})();
	}, [editOpen, refData, refDataLoading]);

	const latestApproval = detailHistory[0] ?? null;

	const perms = useMemo(
		() => getTopicPermissions(myRole, roundDeadlines, isSuperuser),
		[myRole, roundDeadlines, isSuperuser],
	);
	const canUploadFiles = perms.canAddFiles;
	const canEditTitle = perms.canEditTitle;
	const canEditInfo = perms.canEditInfo;

	function openEdit() {
		if (!detailTopic) return;
		setEditForm({
			title: detailTopic.title,
			description: detailTopic.description ?? '',
			category_id: detailTopic.category_id ?? '',
			level_id: detailTopic.level_id ?? '',
			department_id: detailTopic.department_id ?? '',
		});
		setEditError('');
		setEditOpen(true);
	}

	async function handleSaveEdit() {
		if (!detailTopic || !editForm.title.trim()) return;
		// Chỉ gửi những trường mốc thời gian đang cho phép.
		const payload: Parameters<typeof updateTopic>[1] = {};
		if (canEditTitle) payload.title = editForm.title.trim();
		if (canEditInfo) {
			payload.description = editForm.description || undefined;
			payload.category_id = editForm.category_id || undefined;
			payload.level_id = editForm.level_id || undefined;
			payload.department_id = editForm.department_id || undefined;
		}
		if (Object.keys(payload).length === 0) {
			setEditOpen(false);
			return;
		}
		setEditLoading(true);
		setEditError('');
		try {
			await updateTopic(detailTopic.id, payload);
			const [topic, files] = await Promise.all([
				getApprovalTopicDetail(detailTopic.id),
				getTopicFiles(detailTopic.id),
			]);
			setDetailTopic(topic);
			setDetailFiles(files.data ?? []);
			setEditOpen(false);
			refreshData();
		} catch {
			setEditError('Có lỗi xảy ra khi lưu. Vui lòng thử lại.');
		} finally {
			setEditLoading(false);
		}
	}

	async function handleUpload() {
		if (!detailTopic || pendingFiles.length === 0) return;
		setUploadLoading(true);
		setUploadError('');
		try {
			await uploadTopicFiles(
				detailTopic.id,
				pendingFiles,
				batchNote || undefined,
			);
			setPendingFiles([]);
			setBatchNote('');
		} catch (error) {
			console.error('Tải lên file thất bại cho đề tài:', detailTopic.id, error);
			setUploadError('Tải lên thất bại. Vui lòng thử lại.');
			setUploadLoading(false);
			return;
		}
		try {
			const files = await getTopicFiles(detailTopic.id);
			setDetailFiles(files.data ?? []);
		} catch {
			// upload succeeded — silently ignore list refresh failure
		} finally {
			setUploadLoading(false);
		}
	}

	return {
		// user info
		fullName,
		userRole,
		initials,
		canSeeDept,
		canRegister,
		// topics
		deptTopics,
		myTopics,
		loading,
		error,
		// filters
		search,
		setSearch,
		category,
		setCategory,
		activeTab,
		setActiveTab,
		stats,
		filtered,
		selectedId,
		setSelectedId,
		// detail
		detailLoading,
		detailTopic,
		detailFiles,
		detailHistory,
		latestApproval,
		canUploadFiles,
		canEditTitle,
		canEditInfo,
		// file viewer
		fileViewer,
		setFileViewer,
		// edit modal
		editOpen,
		setEditOpen,
		editForm,
		setEditForm,
		editLoading,
		editError,
		refData,
		refDataLoading,
		openEdit,
		handleSaveEdit,
		// file upload
		fileInputRef,
		pendingFiles,
		setPendingFiles,
		batchNote,
		setBatchNote,
		uploadLoading,
		uploadError,
		handleUpload,
		// utils
		formatFileSize,
	};
}
