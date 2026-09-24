import { useCallback, useEffect, useState } from 'react';
import { hasPermission } from '../../../shared/utils/permissions';
import { useNavigate } from 'react-router-dom';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { getStoredUser, type StoredUser } from '../../../shared/utils/storage';
import { getTopics } from '../../topics/api/topicApi';
import type { Topic, TopicStatus } from '../../topics/types/topic.type';
import { getRounds } from '../../round/api/roundApi';
import type { ResearchRound } from '../../round/types/round.type';
import { getNotifications } from '../../notifications/api/notificationApi';

export const STATUS_LABELS: Record<
	TopicStatus,
	{ label: string; color: string; bg: string; border: string }
> = {
	submitted: {
		label: 'Chờ duyệt',
		color: '#b45309',
		bg: '#fef3c7',
		border: '#fde68a',
	},
	approved: {
		label: 'Đang thực hiện',
		color: '#0f766e',
		bg: '#ccfbf1',
		border: '#99f6e4',
	},
	rejected: {
		label: 'Từ chối',
		color: '#b91c1c',
		bg: '#fee2e2',
		border: '#fca5a5',
	},
	supplement: {
		label: 'Bổ sung',
		color: '#6d28d9',
		bg: '#ede9fe',
		border: '#ddd6fe',
	},
	cancelled: {
		label: 'Đã hủy',
		color: '#475569',
		bg: '#f1f5f9',
		border: '#cbd5e1',
	},
};

export const ROLE_LABELS: Record<
	string,
	{ label: string; color: string; bg: string }
> = {
	leader: { label: 'Chủ nhiệm', color: '#0369a1', bg: '#e0f2fe' },
	secretary: { label: 'Thư ký', color: '#7c3aed', bg: '#ede9fe' },
	member: { label: 'Thành viên', color: '#475569', bg: '#f1f5f9' },
};

function parseDate(dateStr?: string): Date | null {
	if (!dateStr) return null;
	if (dateStr.includes('/')) {
		const [d, m, y] = dateStr.split('/').map(Number);
		if (!d || !m || !y) return null;
		return new Date(y, m - 1, d);
	}
	if (dateStr.includes('-')) {
		const parts = dateStr.split('T')[0].split('-').map(Number);
		if (parts.length === 3) {
			const [y, m, d] = parts;
			return new Date(y, m - 1, d);
		}
	}
	const dt = new Date(dateStr);
	return isNaN(dt.getTime()) ? null : dt;
}

function calculateDaysRemaining(endDateStr?: string): number | null {
	const end = parseDate(endDateStr);
	if (!end) return null;
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	end.setHours(23, 59, 59, 999);
	const diffMs = end.getTime() - today.getTime();
	return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

export function useUserHome() {
	const navigate = useNavigate();
	const user = getStoredUser<StoredUser>() ?? {};

	const fullName: string = user.full_name ?? user.username ?? 'Người dùng';
	const roleName: string = user.role_name ?? user.role ?? 'Thành viên';
	const dept: string = user.department ?? '';
	const currentUserId: string = user.id ?? '';

	const canCreateTopic = hasPermission(user, 'topics:create');

	const initials = fullName
		.split(' ')
		.map((w: string) => w[0])
		.filter(Boolean)
		.slice(-2)
		.join('')
		.toUpperCase();

	const [topics, setTopics] = useState<Topic[]>([]);
	const [activeRound, setActiveRound] = useState<ResearchRound | null>(null);
	const [unreadCount, setUnreadCount] = useState<number>(0);
	const [loading, setLoading] = useState(!!currentUserId);
	const [error, setError] = useState('');
	const [refreshKey, setRefreshKey] = useState(0);

	const refreshData = useCallback(() => setRefreshKey((k) => k + 1), []);
	useRealtimeUpdate(['topic', 'round', 'notification'], refreshData);

	useEffect(() => {
		if (!currentUserId) return;
		let cancelled = false;

		const fetchAll = async () => {
			try {
				const [topicsRes, roundsRes, notifsRes] = await Promise.allSettled([
					getTopics({ limit: 0, participant_id: currentUserId }),
					getRounds({ limit: 10 }),
					getNotifications({ limit: 30 }),
				]);

				if (cancelled) return;

				if (topicsRes.status === 'fulfilled') {
					setTopics(topicsRes.value.data);
				} else {
					setError('Không thể tải dữ liệu đề tài.');
				}

				if (roundsRes.status === 'fulfilled') {
					const allRounds: ResearchRound[] = roundsRes.value.data ?? [];
					const active =
						allRounds.find((r: ResearchRound) => r.status === 'active') ??
						allRounds[0] ??
						null;
					setActiveRound(active);
				}

				if (notifsRes.status === 'fulfilled') {
					const unread = notifsRes.value.data.filter((n) => !n.is_read).length;
					setUnreadCount(unread);
				}
			} catch {
				if (!cancelled) {
					setError('Không thể tải thông tin trang chủ.');
				}
			} finally {
				if (!cancelled) {
					setLoading(false);
				}
			}
		};

		fetchAll();

		return () => {
			cancelled = true;
		};
	}, [currentUserId, refreshKey]);

	const pendingCount = topics.filter((t) => t.status === 'submitted').length;
	const inProgressCount = topics.filter((t) => t.status === 'approved').length;
	const recentTopics = topics.slice(0, 4);

	const daysRemaining = activeRound?.end_date
		? calculateDaysRemaining(activeRound.end_date)
		: null;

	// Chỉ hiện lối tắt "Đăng ký đề tài mới" khi đợt đang mở cửa sổ đăng ký
	// (server trả cờ registration_open; đợt chưa cấu hình mốc này coi như mở).
	const canRegisterTopic =
		canCreateTopic &&
		!!activeRound &&
		activeRound.registration_open !== false;

	const greetingTime = (() => {
		const hour = new Date().getHours();
		if (hour >= 5 && hour < 12) return 'Chào buổi sáng';
		if (hour >= 12 && hour < 18) return 'Chào buổi chiều';
		return 'Chào buổi tối';
	})();

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
		inProgressCount,
		recentTopics,
		activeRound,
		daysRemaining,
		unreadCount,
		canRegisterTopic,
		greetingTime,
	};
}
