import { useEffect, useMemo, useState } from 'react';
import { getDepartments } from '../../department/api/departmentApi';
import type { Department } from '../../department/types/department.type';
import { getTopics } from '../../topics/api/topicApi';
import type { Topic } from '../../topics/types/topic.type';
import { getUsers } from '../../user/api/userApi';
import type { User } from '../../user/types/user.type';
import { bulkToast, runBulk } from '../../../shared/utils/runBulk';
import {
	adminGetNotifications,
	deleteNotificationBatch,
	getBatchRecipients,
	sendNotification,
	type AdminNotification,
	type NotificationRecipient,
} from '../api/notificationApi';
import type { TargetType } from '../types/notification.type';

const EMPTY_FORM = {
	type: 'broadcast',
	title: '',
	message: '',
	target_type: 'all' as TargetType,
	target_ids: [] as string[],
	ref_id: '',
	ref_type: '',
};

const LIMIT = 20;

export function useAdminNotifications() {
	// ── Send form state ──────────────────────
	const [form, setForm] = useState(EMPTY_FORM);
	const [depts, setDepts] = useState<Department[]>([]);
	const [deptSearch, setDeptSearch] = useState('');
	const [usersList, setUsersList] = useState<User[]>([]);
	const [userSearch, setUserSearch] = useState('');
	const [loadingUsers, setLoadingUsers] = useState(true);
	const [sending, setSending] = useState(false);
	const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
	const [showSendModal, setShowSendModal] = useState(false);

	// ── Đề tài liên quan (ref_type/ref_id) ────
	const [topicSearch, setTopicSearch] = useState('');
	const [topicResults, setTopicResults] = useState<Topic[]>([]);
	const [fetchedTopicQuery, setFetchedTopicQuery] = useState('');
	const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);

	// Đang tải khi từ khoá hiện tại chưa khớp với từ khoá đã fetch xong (suy ra khi render)
	const loadingTopics =
		topicSearch.trim() !== '' && topicSearch.trim() !== fetchedTopicQuery;

	// ── Tree-select helpers ──────────────────
	const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());

	const usersByDept = useMemo(
		() =>
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

	const toggleUser = (userId: string) => {
		setForm((f) => ({
			...f,
			target_ids: f.target_ids.includes(userId)
				? f.target_ids.filter((x) => x !== userId)
				: [...f.target_ids, userId],
		}));
	};

	const selectAllTargets = () =>
		setForm((f) => ({ ...f, target_ids: usersList.map((u) => u.id) }));

	const clearTargets = () => {
		setForm((f) => ({ ...f, target_ids: [] }));
		setExpandedDepts(new Set());
	};

	const toggleDeptExpanded = (deptId: string) =>
		setExpandedDepts((prev) => {
			const next = new Set(prev);
			if (next.has(deptId)) next.delete(deptId);
			else next.add(deptId);
			return next;
		});

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
	const [pendingDelete, setPendingDelete] = useState<AdminNotification | null>(null);
	const [deletingBatch, setDeletingBatch] = useState(false);
	const [refreshKey, setRefreshKey] = useState(0);

	// ── Recipient drill-down (mở rộng 1 lượt gửi) ────
	const [expandedBatch, setExpandedBatch] = useState<string | null>(null);
	const [recipientsByBatch, setRecipientsByBatch] = useState<
		Record<string, NotificationRecipient[]>
	>({});
	const [loadingRecipients, setLoadingRecipients] = useState<string | null>(null);

	const showToast = (msg: string, ok = true) => {
		setToast({ msg, ok });
		setTimeout(() => setToast(null), 3000);
	};

	useEffect(() => {
		getDepartments()
			.then((res) => setDepts(res.data))
			.catch(() => {});

		getUsers({ limit: 0 })
			.then((res) => setUsersList(res.data))
			.catch(() => {})
			.finally(() => setLoadingUsers(false));
	}, []);

	useEffect(() => {
		const q = topicSearch.trim();
		if (!q) return;
		const timer = setTimeout(() => {
			getTopics({ search: q, limit: 20 })
				.then((res) => setTopicResults(res.data))
				.catch(() => {})
				.finally(() => setFetchedTopicQuery(q));
		}, 300);
		return () => clearTimeout(timer);
	}, [topicSearch]);

	const selectTopic = (topic: Topic) => {
		setForm((f) => ({ ...f, ref_type: 'topic', ref_id: topic.id }));
		setSelectedTopic(topic);
		setTopicSearch('');
		setTopicResults([]);
	};

	const clearTopic = () => {
		setForm((f) => ({ ...f, ref_type: '', ref_id: '' }));
		setSelectedTopic(null);
	};

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
			setSelectedTopic(null);
			setTopicSearch('');
			setShowSendModal(false);
			setRefreshKey((k) => k + 1);
		} catch (err: unknown) {
			showToast(err instanceof Error ? err.message : 'Gửi thất bại', false);
		} finally {
			setSending(false);
		}
	};

	const confirmDelete = async () => {
		if (!pendingDelete) return;
		setDeletingBatch(true);
		try {
			await deleteNotificationBatch(pendingDelete.batch_key);
			showToast('Đã xoá thông báo');
			setPendingDelete(null);
			setRefreshKey((k) => k + 1);
		} catch {
			showToast('Xoá thất bại', false);
		} finally {
			setDeletingBatch(false);
		}
	};

	const handleBulkDelete = async (batchKeys: string[]) => {
		if (!batchKeys.length) return;
		setDeletingBatch(true);
		try {
			const { okIds, failedCount } = await runBulk(
				batchKeys,
				deleteNotificationBatch,
			);
			showToast(
				bulkToast('xoá', okIds.size, failedCount, 'thông báo'),
				!failedCount,
			);
			setRefreshKey((k) => k + 1);
		} finally {
			setDeletingBatch(false);
		}
	};

	const toggleBatchExpand = (batchKey: string) => {
		if (expandedBatch === batchKey) {
			setExpandedBatch(null);
			return;
		}
		setExpandedBatch(batchKey);
		if (!recipientsByBatch[batchKey]) {
			setLoadingRecipients(batchKey);
			getBatchRecipients(batchKey)
				.then((data) => setRecipientsByBatch((prev) => ({ ...prev, [batchKey]: data })))
				.catch(() => {})
				.finally(() => setLoadingRecipients(null));
		}
	};

	const totalPages = Math.ceil(total / LIMIT);

	return {
		form,
		setForm,
		depts,
		deptSearch,
		setDeptSearch,
		usersList,
		userSearch,
		setUserSearch,
		loadingUsers,
		sending,
		toast,
		showSendModal,
		setShowSendModal,
		topicSearch,
		setTopicSearch,
		topicResults,
		loadingTopics,
		selectedTopic,
		selectTopic,
		clearTopic,
		expandedDepts,
		usersByDept,
		getDeptState,
		toggleDeptSelection,
		toggleUserInDept,
		toggleUser,
		selectAllTargets,
		clearTargets,
		toggleDeptExpanded,
		filteredDepts,
		filteredUsers,
		rows,
		page,
		setPage,
		total,
		totalPages,
		search,
		setSearch,
		filterType,
		setFilterType,
		loading,
		pendingDelete,
		setPendingDelete,
		deletingBatch,
		expandedBatch,
		recipientsByBatch,
		loadingRecipients,
		toggleBatchExpand,
		setRefreshKey,
		handleSend,
		confirmDelete,
		handleBulkDelete,
	};
}
