import { ConfirmDeleteModal } from '@/shared/components';
import type { Trainee } from '../types/trainee.type';

export function TraineeDeleteModal({
	trainee,
	onClose,
	onConfirm,
	loading,
}: {
	trainee: Trainee;
	onClose: () => void;
	onConfirm: () => void;
	loading: boolean;
}) {
	return (
		<ConfirmDeleteModal
			title='Xóa học viên'
			subtitle={trainee.full_name}
			onClose={onClose}
			onConfirm={onConfirm}
			loading={loading}
		>
			Bạn có chắc muốn xóa hồ sơ <strong>{trainee.full_name}</strong> khỏi hệ thống? Thao tác
			này không thể hoàn tác.
		</ConfirmDeleteModal>
	);
}
