import { useCallback, useEffect, useState } from 'react';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { getClassCalendar } from '../api/classScheduleApi';
import type { ClassCalendarResponse } from '../types/classSchedule.type';

type Loader = (from: string, to: string) => Promise<ClassCalendarResponse>;

interface LoadedState extends ClassCalendarResponse {
	year: number | null;
	error: string | null;
}

const INITIAL: LoadedState = { year: null, error: null, sessions: [], courses: [] };

/**
 * Buổi học của cả năm `year` — lấy dư 1 tuần mỗi đầu để ô ngày tháng trước/sau
 * và tuần vắt qua năm vẫn có dữ liệu. Cập nhật realtime cùng năm tải ngầm (giữ
 * dữ liệu cũ tới khi có mới) nên không nháy màn hình "Đang tải".
 */
export function useClassSchedule(year: number, load: Loader = getClassCalendar) {
	const [state, setState] = useState<LoadedState>(INITIAL);
	const [refreshKey, setRefreshKey] = useState(0);

	const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);
	useRealtimeUpdate(['class_session', 'course'], refresh);

	useEffect(() => {
		let cancelled = false;
		load(`${year - 1}-12-24`, `${year + 1}-01-07`)
			.then((res) => {
				if (!cancelled) setState({ year, error: null, ...res });
			})
			.catch((e: Error) => {
				if (!cancelled) {
					setState({ year, error: e.message || 'Không thể tải lịch học', sessions: [], courses: [] });
				}
			});
		return () => { cancelled = true; };
	}, [year, refreshKey, load]);

	return {
		sessions: state.sessions,
		courses:  state.courses,
		loading:  state.year !== year,
		error:    state.error,
	};
}
