import { ConfirmDeleteModal } from '@/shared/components';
import type { User } from '../types/user.type';

export function UserDeleteModal({
	user,
	onClose,
	onConfirm,
}: {
	user: User;
	onClose: () => void;
	onConfirm: () => Promise<void>;
}) {
	return (
		<ConfirmDeleteModal
			title='Xoá tài khoản?'
			subtitle={user.username}
			onClose={onClose}
			onConfirm={onConfirm}
		>
			Bạn chắc chắn muốn xoá tài khoản <strong>{user.full_name}</strong> ({user.username})? Hành
			động này không thể hoàn tác.
		</ConfirmDeleteModal>
	);
}
