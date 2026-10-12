import { ConfirmDeleteModal } from '@/shared/components';
import type { Topic } from '../types/topic.type';

export function DeleteModal({
	topic,
	onClose,
	onConfirm,
}: {
	topic: Topic;
	onClose: () => void;
	onConfirm: () => Promise<void>;
}) {
	const title = topic.title.length > 60 ? `${topic.title.slice(0, 60)}...` : topic.title;
	return (
		<ConfirmDeleteModal
			title='Xác nhận xóa đề tài?'
			subtitle={topic.id}
			onClose={onClose}
			onConfirm={onConfirm}
		>
			Bạn sắp thực hiện xóa đề tài <strong>"{title}"</strong>. Toàn bộ thông tin thành viên, tiến độ và
			tài liệu liên quan cũng sẽ bị xóa bỏ. Hành động này không thể hoàn tác.
		</ConfirmDeleteModal>
	);
}
