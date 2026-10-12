import { ConfirmDeleteModal } from '@/shared/components';
import type { TrainingProgram } from '../types/trainingProgram.type';

export function TrainingProgramDeleteModal({
	program,
	onClose,
	onConfirm,
	loading,
}: {
	program: TrainingProgram;
	onClose: () => void;
	onConfirm: () => void;
	loading: boolean;
}) {
	return (
		<ConfirmDeleteModal
			title='Xoá chương trình đào tạo'
			subtitle={program.name}
			onClose={onClose}
			onConfirm={onConfirm}
			loading={loading}
		>
			Bạn có chắc muốn xoá <strong>{program.name}</strong> khỏi hệ thống? Thao tác này không thể
			hoàn tác.
		</ConfirmDeleteModal>
	);
}
