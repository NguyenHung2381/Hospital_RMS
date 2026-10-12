import { ConfirmDeleteModal } from '@/shared/components';
import type { Seminar } from '../types/seminar.type';

export function SeminarDeleteModal({
	seminar,
	loading,
	onClose,
	onConfirm,
}: {
	seminar: Seminar;
	loading: boolean;
	onClose: () => void;
	onConfirm: () => void;
}) {
	return (
		<ConfirmDeleteModal
			title='Xoá hội thảo / hội nghị'
			subtitle='Hành động không thể hoàn tác'
			onClose={onClose}
			onConfirm={onConfirm}
			loading={loading}
			warning={
				!!seminar.cme_issued_count &&
				`Sự kiện đã cấp ${seminar.cme_issued_count} số CME — cần thu hồi trước khi xoá.`
			}
		>
			Xoá <strong>{seminar.title}</strong> cùng {seminar.participant_count ?? 0} người tham dự?
		</ConfirmDeleteModal>
	);
}
