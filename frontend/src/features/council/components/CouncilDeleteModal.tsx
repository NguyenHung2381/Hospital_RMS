import { ConfirmDeleteModal } from '@/shared/components';
import { InfoSvg } from '@/assets/icons';
import type { Council } from '../types/council.type';

export function CouncilDeleteModal({
	council,
	onClose,
	onConfirm,
	loading,
}: {
	council: Council;
	onClose: () => void;
	onConfirm: () => void;
	loading: boolean;
}) {
	return (
		<ConfirmDeleteModal
			title='Xóa hội đồng'
			subtitle={council.name}
			onClose={onClose}
			onConfirm={onConfirm}
			loading={loading}
			warning={
				(council.topic_count ?? 0) > 0 && (
					<>
						<InfoSvg />
						<span>
							Có <strong>{council.topic_count} đề tài</strong> đang gán cho hội đồng này — sẽ tự
							động bỏ gán, và toàn bộ thành viên hội đồng sẽ bị xóa.
						</span>
					</>
				)
			}
		>
			Bạn có chắc muốn xóa <strong>{council.name}</strong> khỏi hệ thống?
		</ConfirmDeleteModal>
	);
}
