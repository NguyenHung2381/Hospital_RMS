import { ConfirmDeleteModal } from '@/shared/components';
import type { Lecturer } from '../types/lecturer.type';

export function LecturerDeleteModal({
	lecturer,
	onClose,
	onConfirm,
	loading,
}: {
	lecturer: Lecturer;
	onClose: () => void;
	onConfirm: () => void;
	loading: boolean;
}) {
	return (
		<ConfirmDeleteModal
			title='Xóa giảng viên'
			subtitle={lecturer.full_name}
			onClose={onClose}
			onConfirm={onConfirm}
			loading={loading}
		>
			Bạn có chắc muốn xóa <strong>{lecturer.full_name}</strong> khỏi hệ thống? Nếu giảng viên đã
			từng được phân công giảng dạy, hệ thống sẽ chỉ vô hiệu hóa thay vì xóa hẳn.
		</ConfirmDeleteModal>
	);
}
