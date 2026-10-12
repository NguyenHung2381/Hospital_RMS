import { ConfirmDeleteModal } from '@/shared/components';
import type { WorkflowDefinition } from '../types/workflow.type';

export function WorkflowDeleteModal({
	item,
	onClose,
	onConfirm,
	loading,
}: {
	item: WorkflowDefinition;
	onClose: () => void;
	onConfirm: () => void;
	loading: boolean;
}) {
	return (
		<ConfirmDeleteModal
			title='Xoá workflow'
			subtitle={item.name}
			onClose={onClose}
			onConfirm={onConfirm}
			loading={loading}
		>
			Bạn có chắc muốn xoá <strong>{item.name}</strong>? Nếu workflow này đang bật, đề tài sẽ quay
			lại đường duyệt 1 bước mặc định. Thao tác này không thể hoàn tác.
		</ConfirmDeleteModal>
	);
}
