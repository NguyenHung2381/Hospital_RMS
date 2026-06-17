import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import {
	addTopicMember,
	deleteTopicMember as deleteTopicMemberApi,
	getTopicMembers,
	getTopics,
	grantTopicMemberAccounts,
	updateTopic,
	updateTopicMember as updateTopicMemberApi,
} from '../api/topicApi';
import type {
	MemberFormData,
	MemberRole,
	ModalType,
	Topic,
	TopicMember,
} from '../types/topicmember.type';
import {
	mapUiRoleToApi,
	normalizeMember,
	normalizeTopic,
} from '../utils/memberHelpers';

export interface TopicMembersState {
	topics: Topic[];
	membersByTopic: Record<string, TopicMember[]>;
	selectedTopicId: string;
	selectedTopic: Topic | null;
	topicMembers: TopicMember[];
	filteredMembers: TopicMember[];
	groupedTopics: { round: string; topics: Topic[] }[];
	search: string;
	roleFilter: MemberRole | 'all';
	modal: ModalType;
	editingMember: TopicMember | null;
	deletingMember: TopicMember | null;
	loading: boolean;
	listLoading: boolean;
	memberLoading: boolean;
	error: string | null;
	toast: { msg: string; type: 'success' | 'error' | 'info' } | null;
	expandedRounds: Set<string>;
	roundSearch: Record<string, string>;
	bulkTargetRound: string;
	stats: { total: number; granted: number; pending: number; chu_nhiem: number };
	canGrant: boolean;

	setSearch: (v: string) => void;
	setRoleFilter: (r: MemberRole | 'all') => void;
	setModal: (m: ModalType) => void;
	setEditingMember: (m: TopicMember | null) => void;
	setDeletingMember: (m: TopicMember | null) => void;
	setSelectedTopicId: (id: string) => void;
	setBulkTargetRound: (r: string) => void;
	setRoundSearch: React.Dispatch<React.SetStateAction<Record<string, string>>>;
	toggleRound: (round: string) => void;
	getFilteredTopics: (topics: Topic[], round: string) => Topic[];
	handleAdd: (data: MemberFormData) => Promise<void>;
	handleEdit: (data: MemberFormData) => Promise<void>;
	handleDelete: () => Promise<void>;
	handleGrant: () => Promise<void>;
	handleBulkAction: (action: 'approve' | 'reject') => Promise<void>;
}

import type React from 'react';

export function useTopicMembers(): TopicMembersState {
	const [topics, setTopics] = useState<Topic[]>([]);
	const [membersByTopic, setMembersByTopic] = useState<
		Record<string, TopicMember[]>
	>({});
	const [selectedTopicId, setSelectedTopicId] = useState('');
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
	const [bulkTargetRound, setBulkTargetRound] = useState('');

	const showToast = useCallback(
		(msg: string, type: 'success' | 'error' | 'info' = 'success') => {
			setToast({ msg, type });
		},
		[],
	);

	useEffect(() => {
		if (!toast) return;
		const t = setTimeout(() => setToast(null), 3000);
		return () => clearTimeout(t);
	}, [toast]);

	const loadTopics = useCallback(async () => {
		setListLoading(true);
		setError(null);
		try {
			const res = await getTopics({ limit: 100 });
			const nextTopics = (res.data ?? []).map((t) =>
				normalizeTopic(t as unknown as Record<string, unknown>),
			);
			setTopics(nextTopics);
			setExpandedRounds((prev) => {
				if (prev.size > 0) return prev;
				return nextTopics[0] ? new Set([nextTopics[0].round_name]) : new Set();
			});
			setSelectedTopicId((prev) => {
				if (prev && nextTopics.some((t) => t.id === prev)) return prev;
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
					[topicId]: (data ?? []).map((m) =>
						normalizeMember(m as unknown as Record<string, unknown>),
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

	const [refreshKey, setRefreshKey] = useState(0);
	const triggerRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);
	useRealtimeUpdate('topic', triggerRefresh);

	useEffect(() => {
		let cancelled = false;
		const load = async () => {
			setListLoading(true);
			setError(null);
			try {
				const res = await getTopics({ limit: 100 });
				if (cancelled) return;
				const nextTopics = (res.data ?? []).map((t) =>
					normalizeTopic(t as unknown as Record<string, unknown>),
				);
				setTopics(nextTopics);
				setExpandedRounds((prev) => {
					if (prev.size > 0) return prev;
					return nextTopics[0]
						? new Set([nextTopics[0].round_name])
						: new Set();
				});
				setSelectedTopicId((prev) => {
					if (prev && nextTopics.some((t) => t.id === prev)) return prev;
					return nextTopics[0]?.id ?? '';
				});
			} catch (err) {
				if (!cancelled)
					setError(
						err instanceof Error
							? err.message
							: 'Khong tai duoc danh sach de tai',
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

	useEffect(() => {
		if (!selectedTopicId || membersByTopic[selectedTopicId]) return;
		let cancelled = false;
		const load = async () => {
			setMemberLoading(true);
			try {
				const data = await getTopicMembers(selectedTopicId);
				if (!cancelled)
					setMembersByTopic((prev) => ({
						...prev,
						[selectedTopicId]: (data ?? []).map((m) =>
							normalizeMember(m as unknown as Record<string, unknown>),
						),
					}));
			} catch (err) {
				if (!cancelled)
					showToast(
						err instanceof Error
							? err.message
							: 'Khong tai duoc danh sach thanh vien',
						'error',
					);
			} finally {
				if (!cancelled) setMemberLoading(false);
			}
		};
		void load();
		return () => {
			cancelled = true;
		};
	}, [membersByTopic, selectedTopicId, showToast]);

	const toggleRound = useCallback((round: string) => {
		setExpandedRounds((prev) => {
			const next = new Set(prev);
			if (next.has(round)) next.delete(round);
			else next.add(round);
			return next;
		});
	}, []);

	const getFilteredTopics = useCallback(
		(topicList: Topic[], round: string) => {
			const q = (roundSearch[round] ?? '').toLowerCase().trim();
			if (!q) return topicList;
			return topicList.filter(
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
		return Array.from(map.entries()).map(([round, ts]) => ({
			round,
			topics: ts,
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
	const filteredMembers = useMemo(
		() =>
			topicMembers.filter((m) => {
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
			}),
		[topicMembers, search, roleFilter],
	);

	const stats = useMemo(
		() => ({
			total: topicMembers.length,
			granted: topicMembers.filter(
				(m) => m.account_granted || m.has_existing_account,
			).length,
			pending: topicMembers.filter(
				(m) => !m.account_granted && !m.has_existing_account,
			).length,
			chu_nhiem: topicMembers.filter((m) => m.role === 'chu_nhiem').length,
		}),
		[topicMembers],
	);

	const canGrant =
		selectedTopic?.status === 'approved' ||
		selectedTopic?.status === 'in_progress';

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
			(m) => !m.account_granted && !m.has_existing_account,
		);
		if (!pendingMembers.length) return;
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
			if (!targetTopics.length) return;
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
					err instanceof Error
						? err.message
						: 'Có lỗi xảy ra khi xử lý hàng loạt',
					'error',
				);
			} finally {
				setLoading(false);
			}
		},
		[topics, bulkTargetRound, loadTopics, showToast],
	);

	return {
		topics,
		membersByTopic,
		selectedTopicId,
		selectedTopic,
		topicMembers,
		filteredMembers,
		groupedTopics,
		search,
		roleFilter,
		modal,
		editingMember,
		deletingMember,
		loading,
		listLoading,
		memberLoading,
		error,
		toast,
		expandedRounds,
		roundSearch,
		bulkTargetRound,
		stats,
		canGrant,
		setSearch,
		setRoleFilter,
		setModal,
		setEditingMember,
		setDeletingMember,
		setSelectedTopicId,
		setBulkTargetRound,
		setRoundSearch,
		toggleRound,
		getFilteredTopics,
		handleAdd,
		handleEdit,
		handleDelete,
		handleGrant,
		handleBulkAction,
	};
}
