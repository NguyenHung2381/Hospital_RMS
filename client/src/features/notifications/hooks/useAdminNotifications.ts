import { useEffect, useMemo, useState } from 'react';
import { getDepartments } from '../../department/api/departmentApi';
import type { Department } from '../../department/types/department.type';
import { getUsers } from '../../user/api/userApi';
import type { User } from '../../user/types/user.type';
import {
	adminGetNotifications,
	deleteNotification,
	sendNotification,
	type AdminNotification,
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
	const [deleting, setDeleting] = useState<string | null>(null);
	const [refreshKey, setRefreshKey] = useState(0);

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
		deleting,
		setRefreshKey,
		handleSend,
		handleDelete,
	};
}
