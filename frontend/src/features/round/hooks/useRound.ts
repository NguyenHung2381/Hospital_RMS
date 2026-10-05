import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { notify } from '../../../shared/utils/feedback';
import { publicUrl } from '../../../shared/utils/publicUrl';
import {
	createRound,
	deleteRound as deleteRoundApi,
	formToPayload,
	getRounds,
	getRoundTypes,
	updateRound,
} from '../api/roundApi';
import type {
	ResearchRound,
	RoundForm,
	RoundStatus,
	RoundType,
} from '../types/round.type';
import { uniqueYears } from '../utils/roundHelpers';

export function useRound() {
	const [rounds, setRounds] = useState<ResearchRound[]>([]);
	const [roundTypes, setRoundTypes] = useState<RoundType[]>([]);
	const [isLoadingData, setIsLoadingData] = useState(true);
	const [loadError, setLoadError] = useState('');
	// Rỗng = tất cả năm; chọn được nhiều năm cùng lúc
	const [yearFilter, setYearFilter] = useState<Set<string>>(new Set());
	const [statusFilter, setStatusFilter] = useState<RoundStatus | 'all'>('all');
	const [typeFilter, setTypeFilter] = useState<string | 'all'>('all');
	const [viewTab, setViewTab] = useState<'current' | 'scheduled'>('current');
	const [showCreate, setShowCreate] = useState(false);
	const [editRound, setEditRound] = useState<ResearchRound | null>(null);
	const [deleteRound, setDeleteRound] = useState<ResearchRound | null>(null);
	const [toast, setToast] = useState<string | null>(null);
	const [refreshKey, setRefreshKey] = useState(0);

	const refreshData = useCallback(() => setRefreshKey((k) => k + 1), []);
	useRealtimeUpdate('round', refreshData);
	useRealtimeUpdate('round_type', refreshData);

	useEffect(() => {
		getRounds({ limit: 0 })
			.then((res) => setRounds(res.data))
			.catch(() => setLoadError('Không thể tải danh sách đợt nghiên cứu'))
			.finally(() => setIsLoadingData(false));
	}, [refreshKey]);

	useEffect(() => {
		getRoundTypes()
			.then(setRoundTypes)
			.catch(() => setRoundTypes([]));
	}, [refreshKey]);

	useEffect(() => {
		if (!toast) return;
		const t = setTimeout(() => setToast(null), 2500);
		return () => clearTimeout(t);
	}, [toast]);

	const stats = useMemo(
		() => ({
			total: rounds.length,
			active: rounds.filter((r) => r.status === 'active').length,
			closed: rounds.filter((r) => r.status === 'closed').length,
			draft: rounds.filter((r) => r.status === 'draft').length,
			topicSum: rounds.reduce((s, r) => s + r.topic_total, 0),
		}),
		[rounds],
	);

	const years = useMemo(() => uniqueYears(rounds), [rounds]);

	const filtered = useMemo(
		() =>
			rounds
				.filter((r) => {
					if (typeFilter !== 'all' && r.round_type_id !== typeFilter)
						return false;
					if (viewTab === 'scheduled') return r.status === 'draft';
					if (r.status === 'draft') return false;
					if (yearFilter.size > 0 && !yearFilter.has(String(r.year))) return false;
					if (statusFilter !== 'all' && r.status !== statusFilter) return false;
					return true;
				})
				.sort((a, b) => b.year - a.year || b.round_number - a.round_number),
		[rounds, yearFilter, statusFilter, typeFilter, viewTab],
	);

	const handleCreate = useCallback(async (form: RoundForm): Promise<void> => {
		const created = await createRound(formToPayload(form));
		setRounds((prev) => [created, ...prev]);
		setShowCreate(false);
		notify.success('Đã tạo đợt mới');
	}, []);

	const handleEdit = useCallback(
		async (form: RoundForm): Promise<void> => {
			if (!editRound) return;
			const updated = await updateRound(editRound.id, formToPayload(form));
			setRounds((prev) =>
				prev.map((r) => (r.id === editRound.id ? updated : r)),
			);
			setEditRound(null);
			notify.success('Đã cập nhật đợt');
		},
		[editRound],
	);

	const handleDelete = useCallback(async (): Promise<void> => {
		if (!deleteRound) return;
		await deleteRoundApi(deleteRound.id);
		setRounds((prev) => prev.filter((r) => r.id !== deleteRound.id));
		setDeleteRound(null);
		notify.success('Đã xoá đợt');
	}, [deleteRound]);

	const handleCopyLink = useCallback((token: string) => {
		const link = publicUrl(`/dang-ky-de-tai?token=${token}`);
		const fallback = (text: string) => {
			const ta = document.createElement('textarea');
			ta.value = text;
			ta.style.cssText = 'position:fixed;opacity:0';
			document.body.appendChild(ta);
			ta.focus();
			ta.select();
			const ok = document.execCommand('copy');
			document.body.removeChild(ta);
			setToast(ok ? 'Đã sao chép link đăng ký vào clipboard' : `Link: ${text}`);
		};
		if (navigator.clipboard) {
			navigator.clipboard.writeText(link).then(
				() => setToast('Đã sao chép link đăng ký vào clipboard'),
				() => fallback(link),
			);
		} else {
			fallback(link);
		}
	}, []);

	return {
		rounds,
		roundTypes,
		isLoadingData,
		loadError,
		yearFilter,
		statusFilter,
		typeFilter,
		viewTab,
		setViewTab,
		showCreate,
		editRound,
		deleteRound,
		toast,
		stats,
		years,
		filtered,
		setYearFilter,
		setStatusFilter,
		setTypeFilter,
		setShowCreate,
		setEditRound,
		setDeleteRound,
		setRounds,
		handleCreate,
		handleEdit,
		handleDelete,
		handleCopyLink,
	};
}
