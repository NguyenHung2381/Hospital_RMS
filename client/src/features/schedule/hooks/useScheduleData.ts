import { useEffect, useReducer, useState } from 'react';
import { getCouncils } from '../../council/api/councilApi';
import { getDeadlines, getRounds } from '../../round/api/roundApi';
import type { RoundDeadline } from '../../round/types/round.type';
import type { RoundRow } from '../types/schedule.type';

// Ngày báo cáo (defense_date) của hội đồng không phải là RoundDeadline thật —
// gắn thêm vào deadlines[] chỉ để hiển thị lên lịch, không cho sửa/xóa (id
// "council-*" không khớp phase nào nên EventDetailModal phải tự ẩn nút sửa).
async function councilDeadlines(roundId: string): Promise<RoundDeadline[]> {
	try {
		const res = await getCouncils({ round_id: roundId, limit: 100 });
		return res.data
			.filter((c) => c.defense_date)
			.map((c) => ({
				id: `council-${c.id}`,
				round_id: roundId,
				phase: -1,
				name: `${c.name} — Ngày báo cáo`,
				deadline_date: c.defense_date as string,
				deadline_type: 'council_defense' as const,
			}));
	} catch {
		return [];
	}
}

type FetchState = { loading: boolean; error: string | null };
type FetchAction =
	| { type: 'start' }
	| { type: 'success' }
	| { type: 'error'; message: string };

function fetchReducer(_: FetchState, action: FetchAction): FetchState {
	if (action.type === 'start')   return { loading: true,  error: null };
	if (action.type === 'success') return { loading: false, error: null };
	return { loading: false, error: action.message };
}

export function useScheduleData(year: number) {
	const [rows, setRows] = useState<RoundRow[]>([]);
	const [{ loading, error }, dispatch] = useReducer(fetchReducer, {
		loading: true,
		error: null,
	});

	useEffect(() => {
		let cancelled = false;
		dispatch({ type: 'start' });
		getRounds({ year, limit: 50 })
			.then(async (res) => {
				const withDl = await Promise.all(
					res.data.map(async (r) => {
						try {
							const [deadlines, councilEvents] = await Promise.all([
								getDeadlines(r.id),
								councilDeadlines(r.id),
							]);
							return { ...r, deadlines: [...deadlines, ...councilEvents] };
						} catch {
							return { ...r, deadlines: [] };
						}
					}),
				);
				if (!cancelled) {
					setRows(withDl);
					dispatch({ type: 'success' });
				}
			})
			.catch((e: Error) => {
				if (!cancelled) dispatch({ type: 'error', message: e.message });
			});
		return () => { cancelled = true; };
	}, [year]);

	return { rows, loading, error, setRows };
}
