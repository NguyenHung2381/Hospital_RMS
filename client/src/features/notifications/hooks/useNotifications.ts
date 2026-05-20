import { useState, useEffect, useCallback } from 'react';
import {
	getNotifications,
	markNotificationRead,
	markAllNotificationsRead,
	type Notification,
} from '../api/notificationApi';
import { useRealtimeUpdate } from '../../../hooks/useRealtime';

export function useNotifications() {
	const [notifications, setNotifications] = useState<Notification[]>([]);
	const [unreadCount, setUnreadCount] = useState(0);

	const fetchAll = useCallback(async () => {
		try {
			const res = await getNotifications({ limit: 50 });
			setNotifications(res.data);
			setUnreadCount(res.data.filter((n) => !n.is_read).length);
		} catch {
			// ignore — user may not be logged in yet
		}
	}, []);

	useEffect(() => {
		getNotifications({ limit: 50 })
			.then((res) => {
				setNotifications(res.data);
				setUnreadCount(res.data.filter((n) => !n.is_read).length);
			})
			.catch(() => {});
	}, []);

	useRealtimeUpdate(['topic', 'round', 'department', 'user'], fetchAll);

	const markOne = useCallback(async (id: string) => {
		try {
			await markNotificationRead(id);
			setNotifications((prev) =>
				prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
			);
			setUnreadCount((c) => Math.max(0, c - 1));
		} catch {
			// ignore
		}
	}, []);

	const markAll = useCallback(async () => {
		try {
			await markAllNotificationsRead();
			setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
			setUnreadCount(0);
		} catch {
			// ignore
		}
	}, []);

	return { notifications, unreadCount, markOne, markAll, refresh: fetchAll };
}
