import { ConfirmDeleteModal } from '@/shared/components';
import { InfoSvg } from '@/assets/icons';
import type { Department } from '../types/department.type';

export function DeptDeleteModal({
	dept,
	onClose,
	onConfirm,
	loading,
}: {
	dept: Department;
	onClose: () => void;
	onConfirm: () => void;
	loading: boolean;
}) {
	const users = dept.user_count ?? 0;
	const topics = dept.topic_count ?? 0;
	return (
		<ConfirmDeleteModal
			title='Xóa khoa/phòng'
			subtitle={dept.name}
			onClose={onClose}
			onConfirm={onConfirm}
			loading={loading}
			warning={
				(users > 0 || topics > 0) && (
					<>
						<InfoSvg />
						<span>
							Có {users > 0 && <strong>{users} người dùng</strong>}
							{users > 0 && topics > 0 && ' và '}
							{topics > 0 && <strong>{topics} đề tài</strong>} đang liên kết với khoa/phòng này.
							Khi xóa, các bản ghi này sẽ được gỡ liên kết (không bị xóa theo).
						</span>
					</>
				)
			}
		>
			Bạn có chắc muốn xóa <strong>{dept.name}</strong> ({dept.abbreviation}) khỏi hệ thống?
		</ConfirmDeleteModal>
	);
}
