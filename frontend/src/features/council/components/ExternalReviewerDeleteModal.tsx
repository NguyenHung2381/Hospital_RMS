import { ConfirmDeleteModal } from '@/shared/components';
import type { ExternalReviewer } from '../types/council.type';

export function ExternalReviewerDeleteModal({
	reviewer,
	onClose,
	onConfirm,
	loading,
}: {
	reviewer: ExternalReviewer;
	onClose: () => void;
	onConfirm: () => void;
	loading: boolean;
}) {
	return (
		<ConfirmDeleteModal
			title='Xóa chuyên gia ngoài viện'
			subtitle={reviewer.full_name}
			onClose={onClose}
			onConfirm={onConfirm}
			loading={loading}
		>
			Bạn có chắc muốn xóa <strong>{reviewer.full_name}</strong> khỏi danh sách? Nếu người này đã
			từng ngồi ghế hội đồng, hồ sơ sẽ được vô hiệu hóa thay vì xóa hẳn để giữ lịch sử.
		</ConfirmDeleteModal>
	);
}
