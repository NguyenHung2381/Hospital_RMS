import { useEffect, useLayoutEffect, useRef } from 'react';
import { getToken } from '../lib/authStorage';
import { BASE_URL } from '../lib/apiClient';

/**
 * Hook để lắng nghe các sự kiện cập nhật thời gian thực từ server (SSE).
 * Chấp nhận một hoặc nhiều entity — chỉ mở MỘT kết nối SSE duy nhất.
 */
export function useRealtimeUpdate(entities: string | string[], callback: () => void) {
	const callbackRef = useRef(callback);
	useLayoutEffect(() => {
		callbackRef.current = callback;
	});

	const entityKey = Array.isArray(entities) ? entities.join(',') : entities;

	useEffect(() => {
		const token = getToken();
		if (!token) return;

		const entityList = entityKey.split(',');

		const eventSource = new EventSource(
			`${BASE_URL}/api/v1/events?token=${token}`,
		);

		eventSource.addEventListener('update', (e) => {
			try {
				const data = JSON.parse(e.data);
				if (data.entity === 'all' || entityList.includes(data.entity)) {
					callbackRef.current();
				}
			} catch (err) {
				console.error('[Realtime] Parse error:', err);
			}
		});

		eventSource.onerror = () => {
			// Trình duyệt tự động thử kết nối lại
		};

		return () => {
			eventSource.close();
		};
	}, [entityKey]); // callback được đọc qua ref — không cần vào deps
}
