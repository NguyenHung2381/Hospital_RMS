import { CheckSmSvg } from '@/assets/icons';
import type { User } from '../../user/types/user.type';
import styles from '../pages/AdminNotifications.module.css';

interface UserTargetPickerProps {
	loadingUsers: boolean;
	filteredUsers: User[];
	targetIds: string[];
	toggleUser: (userId: string) => void;
}

export function UserTargetPicker({
	loadingUsers,
	filteredUsers,
	targetIds,
	toggleUser,
}: UserTargetPickerProps) {
	return (
		<div className={styles.deptGrid}>
			{loadingUsers ? (
				<div className={styles.emptyDeptText}>Đang tải danh sách người dùng...</div>
			) : filteredUsers.length === 0 ? (
				<div className={styles.emptyDeptText}>Không tìm thấy người dùng nào</div>
			) : (
				filteredUsers.map((u) => {
					const isSel = targetIds.includes(u.id);
					return (
						<label
							key={u.id}
							className={`${styles.deptCheck} ${isSel ? styles.deptCheckActive : ''}`}
						>
							<input
								type='checkbox'
								checked={isSel}
								onChange={() => toggleUser(u.id)}
							/>
							<span
								className={`${styles.customBox} ${isSel ? styles.customBoxActive : ''}`}
							>
								{isSel && (
									<CheckSmSvg
										style={{ width: 10, height: 8, color: '#fff' }}
									/>
								)}
							</span>
							<span className={styles.itemLabel}>
								{u.full_name} <small style={{ opacity: 0.65 }}>({u.username})</small>
							</span>
						</label>
					);
				})
			)}
		</div>
	);
}
