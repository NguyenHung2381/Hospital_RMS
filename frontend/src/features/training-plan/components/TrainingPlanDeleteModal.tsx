import { ConfirmDeleteModal } from '@/shared/components';
import type { TrainingPlan } from '../types/trainingPlan.type';

export function TrainingPlanDeleteModal({
	item,
	onClose,
	onConfirm,
	loading,
}: {
	item: TrainingPlan;
	onClose: () => void;
	onConfirm: () => void;
	loading: boolean;
}) {
	return (
		<ConfirmDeleteModal
			title='Xoá kế hoạch'
			subtitle={item.title}
			onClose={onClose}
			onConfirm={onConfirm}
			loading={loading}
		>
			Bạn có chắc muốn xoá <strong>{item.title}</strong> khỏi hệ thống? Toàn bộ hạng mục trong
			kế hoạch cũng sẽ bị xoá. Thao tác này không thể hoàn tác.
		</ConfirmDeleteModal>
	);
}
