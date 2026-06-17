import { relativeTime } from '../../../shared/utils/formatDate';
import type { Notification as ApiNotif } from '../api/notificationApi';

export interface Notif {
	id: string;
	type: 'approval' | 'topic' | 'system' | 'warning';
	title: string;
	desc: string;
	time: string;
	read: boolean;
}

export const NOTIF_TYPE_MAP: Record<string, Notif['type']> = {
	topic_approved: 'approval',
	topic_rejected: 'approval',
	topic_submitted: 'approval',
	deadline_reminder: 'warning',
	member_added: 'topic',
	account_granted: 'system',
};

export function toNotif(n: ApiNotif): Notif {
	return {
		id: n.id,
		type: NOTIF_TYPE_MAP[n.type] ?? 'system',
		title: n.title,
		desc: n.message ?? '',
		time: relativeTime(n.created_at),
		read: n.is_read,
	};
}
