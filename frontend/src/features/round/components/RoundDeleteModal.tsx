import { ConfirmDeleteModal } from '@/shared/components';
import type { ResearchRound } from '../types/round.type';

export function RoundDeleteModal({
	round,
	onClose,
	onConfirm,
}: {
	round: ResearchRound;
	onClose: () => void;
	onConfirm: () => Promise<void>;
}) {
	return (
		<ConfirmDeleteModal
			title='Xoá đợt nghiên cứu?'
			subtitle={round.name}
			onClose={onClose}
			onConfirm={onConfirm}
		>
			Bạn sắp xoá đợt <strong>"{round.name}"</strong>.
			{round.topic_total > 0
				? ` Đợt này có ${round.topic_total} đề tài liên kết — tất cả sẽ mất liên kết với đợt nghiên cứu này.`
				: ' Hành động không thể hoàn tác.'}
		</ConfirmDeleteModal>
	);
}
