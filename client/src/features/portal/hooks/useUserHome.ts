import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { getStoredUser, type StoredUser } from '../../../shared/utils/storage';
import { getTopics } from '../../topics/api/topicApi';
import type { Topic, TopicStatus } from '../../topics/types/topic.type';

export const STATUS_LABELS: Record<
	TopicStatus,
	{ label: string; color: string; bg: string }
> = {
	submitted: { label: 'Chờ duyệt', color: '#c17d10', bg: '#fdf3dc' },
	approved: { label: 'Đang thực hiện', color: '#1e9460', bg: '#e8f7f0' },
	rejected: { label: 'Từ chối', color: '#991b1b', bg: '#fee2e2' },
	supplement: { label: 'Bổ sung', color: '#5b21b6', bg: '#ede9fe' },
	cancelled: { label: 'Đã hủy', color: '#374151', bg: '#f3f4f6' },
};

export function useUserHome() {
	const navigate = useNavigate();
	const user = getStoredUser<StoredUser>() ?? {};

	const fullName: string = user.full_name ?? user.username ?? 'Người dùng';
	const roleName: string = user.role_name ?? user.role ?? 'Thành viên';
	const dept: string = user.department ?? '';
	const currentUserId: string = user.id ?? '';

	const initials = fullName
		.split(' ')
		.map((w: string) => w[0])
		.filter(Boolean)
		.slice(-2)
		.join('')
		.toUpperCase();

	const [topics, setTopics] = useState<Topic[]>([]);
	const [loading, setLoading] = useState(!!currentUserId);
	const [error, setError] = useState('');
	const [refreshKey, setRefreshKey] = useState(0);

	const refreshData = useCallback(() => setRefreshKey((k) => k + 1), []);
	useRealtimeUpdate('topic', refreshData);

	useEffect(() => {
		if (!currentUserId) return;
		let cancelled = false;
		getTopics({ limit: 0, participant_id: currentUserId })
			.then((res) => {
				if (!cancelled) {
					setTopics(res.data);
					setLoading(false);
				}
			})
			.catch(() => {
				if (!cancelled) {
					setError('Không thể tải dữ liệu.');
					setLoading(false);
				}
			});
		return () => {
			cancelled = true;
		};
	}, [currentUserId, refreshKey]);

	const pendingCount = topics.filter((t) => t.status === 'submitted').length;
	const recentTopics = topics.slice(0, 3);

	return {
		navigate,
		fullName,
		roleName,
		dept,
		initials,
		topics,
		loading,
		error,
		pendingCount,
		recentTopics,
	};
}
