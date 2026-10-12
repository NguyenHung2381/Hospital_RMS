import { ConfirmDeleteModal } from '@/shared/components';
import type { AdminNotification } from '../api/notificationApi';

export function NotificationDeleteModal({
	notif,
	onClose,
	onConfirm,
	loading,
}: {
	notif: AdminNotification;
	onClose: () => void;
	onConfirm: () => void;
	loading: boolean;
}) {
	return (
		<ConfirmDeleteModal
			title='Xoá thông báo'
			subtitle={notif.title}
			onClose={onClose}
			onConfirm={onConfirm}
			loading={loading}
		>
			Xoá lượt gửi <strong>"{notif.title}"</strong> khỏi hộp thư của{' '}
			<strong>{notif.recipient_count} người nhận</strong>? Thao tác này không thể hoàn tác.
		</ConfirmDeleteModal>
	);
}
