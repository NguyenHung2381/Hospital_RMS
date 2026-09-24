import { useEffect, useState } from 'react';
import { UsersSvg, XSvg } from '@/assets/icons';
import { InlineLoading } from '@/shared/components';
import { getUsers } from '../../user/api/userApi';
import type { User } from '../../user/types/user.type';
import type { Role } from '../types/role.type';
import styles from '../pages/Roles.module.css';

const LIMIT = 200;

interface RoleUsersModalProps {
	role: Role;
	onClose: () => void;
}

// Danh sách tài khoản đang mang vai trò — xem trước khi đổi quyền của vai trò
// (đổi quyền là đổi cho TẤT CẢ những người này). Backend tự giới hạn theo
// phạm vi users của người xem (trong khoa / toàn viện).
export function RoleUsersModal({ role, onClose }: RoleUsersModalProps) {
	const [users, setUsers] = useState<User[]>([]);
	const [total, setTotal] = useState(0);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');

	useEffect(() => {
		getUsers({ role_id: role.id, limit: LIMIT, meta: 0 })
			.then((res) => {
				setUsers(res.data);
				setTotal(res.pagination.total);
			})
			.catch((e) => setError(e instanceof Error ? e.message : 'Không thể tải danh sách'))
			.finally(() => setLoading(false));
	}, [role.id]);

	return (
		<div
			className={styles.modalBackdrop}
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<div className={`${styles.modal} ${styles.modalLg}`}>
				<div className={styles.modalHeader}>
					<div className={styles.modalHeaderIcon}>
						<UsersSvg />
					</div>
					<div>
						<div className={styles.modalTitle}>Người dùng — {role.name}</div>
						<div className={styles.modalSub}>
							Đổi quyền của vai trò sẽ áp dụng cho tất cả tài khoản dưới đây
						</div>
					</div>
					{!loading && <span className={styles.permCount}>{total} người</span>}
					<button className={styles.modalClose} onClick={onClose}>
						<XSvg />
					</button>
				</div>
				<div className={styles.permModalBody}>
					{loading ? (
						<InlineLoading label='Đang tải…' />
					) : error ? (
						<div className={styles.viewEmpty}>{error}</div>
					) : users.length === 0 ? (
						<div className={styles.viewEmpty}>Chưa có tài khoản nào mang vai trò này.</div>
					) : (
						<table className={styles.permMatrix}>
							<thead>
								<tr>
									<th>Họ tên</th>
									<th>Tài khoản</th>
									<th>Mã NV</th>
									<th>Trạng thái</th>
								</tr>
							</thead>
							<tbody>
								{users.map((u) => (
									<tr key={u.id}>
										<td className={styles.permResourceCell}>
											<div className={styles.permResourceName}>{u.full_name}</div>
										</td>
										<td className={styles.viewCell}>{u.username}</td>
										<td className={styles.viewCell}>{u.staff_number ?? '—'}</td>
										<td className={styles.viewCell}>
											{u.is_active ? 'Hoạt động' : 'Ngừng hoạt động'}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					)}
					{total > users.length && (
						<div className={styles.viewEmpty}>
							Hiển thị {users.length}/{total} — xem đầy đủ ở trang Người dùng (lọc theo vai trò).
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
