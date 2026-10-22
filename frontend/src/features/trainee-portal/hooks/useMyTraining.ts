import { useCallback, useEffect, useState } from 'react';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { getMyTraining, type MyTraining } from '../../portal/api/meApi';

/** Dữ liệu cổng học viên: khóa đang học, lịch 30 ngày tới, khóa đang mở đăng ký. */
export function useMyTraining() {
	const [data, setData] = useState<MyTraining | null>(null);
	const [error, setError] = useState('');
	const load = useCallback(() => {
		getMyTraining()
			.then((d) => {
				setData(d);
				setError('');
			})
			.catch((err) => setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu khóa học'));
	}, []);
	useEffect(load, [load]);
	useRealtimeUpdate(['course', 'course_enrollment', 'class_session'], load);
	return { data, error, reload: load };
}
