import { showToast } from '@/shared/utils/feedback';
import { useCallback, useEffect, useState } from 'react';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { runBulk } from '../../../shared/utils/runBulk';
import {
	addParticipant,
	bulkCmeStatus,
	deleteParticipant,
	getSeminar,
	issueCme,
	revokeCme,
	updateParticipant,
} from '../api/seminarApi';
import type {
	ParticipantForm,
	Seminar,
	SeminarParticipant,
} from '../types/seminar.type';

export function useSeminarDetail(id: string) {
	const [seminar, setSeminar] = useState<Seminar | null>(null);
	const [loadingData, setLoadingData] = useState(true);
	const [loading, setLoading] = useState(false);
	const [notFound, setNotFound] = useState(false);
	const [refreshKey, setRefreshKey] = useState(0);

	const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);
	useRealtimeUpdate('seminar', refresh);

	useEffect(() => {
		let alive = true;
		const load = () => {
			setLoadingData(true);
			getSeminar(id)
				.then((s) => {
					if (!alive) return;
					if (!s) setNotFound(true);
					else setSeminar(s);
				})
				.catch(() => alive && setNotFound(true))
				.finally(() => alive && setLoadingData(false));
		};
		load();
		return () => {
			alive = false;
		};
	}, [id, refreshKey]);

	const participants: SeminarParticipant[] = seminar?.participants ?? [];

	const addOne = useCallback(
		async (form: ParticipantForm) => {
			setLoading(true);
			try {
				await addParticipant(id, form);
				showToast('success', `Đã thêm "${form.full_name}"`);
				refresh();
				return true;
			} catch (e) {
				showToast('error', e instanceof Error ? e.message : 'Thêm thất bại');
				return false;
			} finally {
				setLoading(false);
			}
		},
		[id, refresh],
	);

	const editOne = useCallback(
		async (pid: string, form: ParticipantForm) => {
			setLoading(true);
			try {
				await updateParticipant(id, pid, form);
				showToast('success', 'Đã cập nhật');
				refresh();
				return true;
			} catch (e) {
				showToast('error', e instanceof Error ? e.message : 'Cập nhật thất bại');
				return false;
			} finally {
				setLoading(false);
			}
		},
		[id, refresh],
	);

	const removeOne = useCallback(
		async (pid: string) => {
			setLoading(true);
			try {
				await deleteParticipant(id, pid);
				showToast('success', 'Đã xoá');
				refresh();
			} catch (e) {
				showToast('error', e instanceof Error ? e.message : 'Xoá thất bại');
			} finally {
				setLoading(false);
			}
		},
		[id, refresh],
	);

	const removeMany = useCallback(
		async (ids: string[]) => {
			if (!ids.length) return;
			setLoading(true);
			try {
				const { okIds, failedCount } = await runBulk(ids, (pid) =>
					deleteParticipant(id, pid),
				);
				showToast(
					failedCount ? 'error' : 'success',
					failedCount
						? `Đã xoá ${okIds.size}, lỗi ${failedCount}`
						: `Đã xoá ${okIds.size} người`,
				);
				refresh();
			} finally {
				setLoading(false);
			}
		},
		[id, refresh],
	);

	const issue = useCallback(
		async (ids: string[], year?: number) => {
			setLoading(true);
			try {
				const res = await issueCme(id, ids, year);
				showToast(
					'success',
					(res.issued
						? `Đã cấp ${res.issued} số CME (${String(res.from).padStart(4, '0')}–${String(res.to).padStart(4, '0')} / ${res.year})`
						: 'Không có người nào được cấp số') +
						(res.skipped ? ` · ${res.skipped} người chưa điểm danh / chưa làm bài test` : ''),
				);
				refresh();
				return true;
			} catch (e) {
				showToast('error', e instanceof Error ? e.message : 'Cấp CME thất bại');
				return false;
			} finally {
				setLoading(false);
			}
		},
		[id, refresh],
	);

	const revoke = useCallback(
		async (pid: string) => {
			setLoading(true);
			try {
				await revokeCme(id, pid);
				showToast('success', 'Đã thu hồi số CME');
				refresh();
			} catch (e) {
				showToast('error', e instanceof Error ? e.message : 'Thu hồi thất bại');
			} finally {
				setLoading(false);
			}
		},
		[id, refresh],
	);

	const setStatus = useCallback(
		async (ids: string[], status: 'issued' | 'signed') => {
			if (!ids.length) return;
			setLoading(true);
			try {
				const res = await bulkCmeStatus(id, ids, status);
				showToast('success', `Đã cập nhật ${res.updated} bản ghi`);
				refresh();
			} catch (e) {
				showToast('error', e instanceof Error ? e.message : 'Cập nhật thất bại');
			} finally {
				setLoading(false);
			}
		},
		[id, refresh],
	);

	return {
		seminar,
		participants,
		loadingData,
		loading,
		notFound,
		refresh,
		addOne,
		editOne,
		removeOne,
		removeMany,
		issue,
		revoke,
		setStatus,
	};
}
