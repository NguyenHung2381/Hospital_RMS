import { ConfirmDeleteModal } from '@/shared/components';
import type { Survey } from '../types/survey.type';

export function SurveyDeleteModal({
	item,
	onClose,
	onConfirm,
	loading,
}: {
	item: Survey;
	onClose: () => void;
	onConfirm: () => void;
	loading: boolean;
}) {
	return (
		<ConfirmDeleteModal
			title='Xóa khảo sát'
			subtitle={item.title}
			onClose={onClose}
			onConfirm={onConfirm}
			loading={loading}
		>
			Bạn có chắc muốn xóa <strong>{item.title}</strong>? Toàn bộ câu hỏi và phản hồi đã nhận (
			{item.response_count}) cũng sẽ bị xóa. Thao tác này không thể hoàn tác.
		</ConfirmDeleteModal>
	);
}
