import { relativeTime } from '../../../shared/utils/formatDate';
import type { Notification as ApiNotif } from '../api/notificationApi';
import type { NotifCategory } from '../types/notification.type';

export interface Notif {
	id: string;
	type: NotifCategory;
	title: string;
	desc: string;
	time: string;
	read: boolean;
}

export const NOTIF_TYPE_MAP: Record<string, NotifCategory> = {
	topic_approved: 'approval',
	topic_rejected: 'approval',
	topic_submitted: 'approval',
	topic_supplement_requested: 'approval',
	supplement_opened: 'approval',
	supplement_closed: 'approval',
	deadline_reminder: 'warning',
	warning: 'warning',
	member_added: 'topic',
	account_granted: 'system',
	broadcast: 'system',
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
