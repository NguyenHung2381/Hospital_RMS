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
			title='Xoá giảng viên'
			subtitle={lecturer.full_name}
			onClose={onClose}
			onConfirm={onConfirm}
			loading={loading}
		>
			Bạn có chắc muốn xoá <strong>{lecturer.full_name}</strong> khỏi hệ thống? Nếu giảng viên đã
			từng được phân công giảng dạy, hệ thống sẽ chỉ vô hiệu hoá thay vì xoá hẳn.
		</ConfirmDeleteModal>
	);
}
