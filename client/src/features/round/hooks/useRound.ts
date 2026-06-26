import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import {
	createRound,
	deleteRound as deleteRoundApi,
	formToPayload,
	getRounds,
	updateRound,
} from '../api/roundApi';
import type {
	ResearchRound,
	RoundForm,
	RoundStatus,
} from '../types/round.type';
import { uniqueYears } from '../utils/roundHelpers';

export function useRound() {
	const [rounds, setRounds] = useState<ResearchRound[]>([]);
	const [isLoadingData, setIsLoadingData] = useState(true);
	const [loadError, setLoadError] = useState('');
	const [yearFilter, setYearFilter] = useState<number | 'all'>('all');
	const [statusFilter, setStatusFilter] = useState<RoundStatus | 'all'>('all');
	const [showCreate, setShowCreate] = useState(false);
	const [editRound, setEditRound] = useState<ResearchRound | null>(null);
	const [deleteRound, setDeleteRound] = useState<ResearchRound | null>(null);
	const [toast, setToast] = useState<string | null>(null);
	const [refreshKey, setRefreshKey] = useState(0);

	const refreshData = useCallback(() => setRefreshKey((k) => k + 1), []);
	useRealtimeUpdate('round', refreshData);

	useEffect(() => {
		getRounds({ limit: 200 })
			.then((res) => setRounds(res.data))
			.catch(() => setLoadError('Không thể tải danh sách đợt nghiên cứu'))
			.finally(() => setIsLoadingData(false));
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
					if (yearFilter !== 'all' && r.year !== yearFilter) return false;
					if (statusFilter !== 'all' && r.status !== statusFilter) return false;
					return true;
				})
				.sort((a, b) => b.year - a.year || b.round_number - a.round_number),
		[rounds, yearFilter, statusFilter],
	);

	const handleCreate = useCallback(async (form: RoundForm): Promise<void> => {
		const created = await createRound(formToPayload(form));
		setRounds((prev) => [created, ...prev]);
		setShowCreate(false);
	}, []);

	const handleEdit = useCallback(
		async (form: RoundForm): Promise<void> => {
			if (!editRound) return;
			const updated = await updateRound(editRound.id, formToPayload(form));
			setRounds((prev) =>
				prev.map((r) => (r.id === editRound.id ? updated : r)),
			);
			setEditRound(null);
		},
		[editRound],
	);

	const handleDelete = useCallback(async (): Promise<void> => {
		if (!deleteRound) return;
		await deleteRoundApi(deleteRound.id);
		setRounds((prev) => prev.filter((r) => r.id !== deleteRound.id));
		setDeleteRound(null);
	}, [deleteRound]);

	const handleCopyLink = useCallback((token: string) => {
		const link = `${window.location.origin}/dang-ky-de-tai?token=${token}`;
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
		isLoadingData,
		loadError,
		yearFilter,
		statusFilter,
		showCreate,
		editRound,
		deleteRound,
		toast,
		stats,
		years,
		filtered,
		setYearFilter,
		setStatusFilter,
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
