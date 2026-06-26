import { useEffect, useReducer, useState } from 'react';
import { getDeadlines, getRounds } from '../../round/api/roundApi';
import type { RoundRow } from '../types/schedule.type';

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
						try   { return { ...r, deadlines: await getDeadlines(r.id) }; }
						catch { return { ...r, deadlines: [] }; }
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
