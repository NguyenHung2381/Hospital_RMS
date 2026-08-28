import { useState } from 'react';
import { CheckSvg, ChevDSvg, EditSvg, XSvg } from '@/assets/icons';
import type { SimpleItem, UpdateUserPayload } from '../api/userApi';
import styles from '../pages/UserList.module.css';

export function UserBulkEditModal({
	count,
	departments,
	roles,
	onClose,
	onSave,
	loading,
}: {
	count: number;
	departments: SimpleItem[];
	roles: SimpleItem[];
	onClose: () => void;
	onSave: (payload: UpdateUserPayload) => void;
	loading: boolean;
}) {
	const [departmentId, setDepartmentId] = useState('');
	const [roleId, setRoleId] = useState('');
	const [activeState, setActiveState] = useState<'' | 'active' | 'locked'>('');

	// Chỉ gửi trường được chọn — "Giữ nguyên" thì không đụng tới
	const payload: UpdateUserPayload = {
		...(departmentId ? { department_id: departmentId } : {}),
		...(roleId ? { role_id: roleId } : {}),
		...(activeState ? { is_active: activeState === 'active' } : {}),
	};
	const hasChange = Object.keys(payload).length > 0;

	return (
		<div
			className={styles.modalBackdrop}
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<div className={styles.modal}>
				<div className={styles.modalHeader}>
					<div className={styles.modalHeaderIcon}>
						<EditSvg />
					</div>
					<div>
						<div className={styles.modalTitle}>Sửa đồng loạt</div>
						<div className={styles.modalSubtitle}>{count} tài khoản đã chọn</div>
					</div>
					<button
						className={styles.modalClose}
						onClick={onClose}
					>
						<XSvg />
					</button>
				</div>

				<div className={styles.modalBody}>
					<div className={styles.formRow}>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Vai trò</label>
							<div className={styles.selectWrapper}>
								<select
									className={styles.formSelect}
									value={roleId}
									onChange={(e) => setRoleId(e.target.value)}
								>
									<option value=''>— Giữ nguyên —</option>
									{roles.map((r) => (
										<option
											key={r.id}
											value={r.id}
										>
											{r.name}
										</option>
									))}
								</select>
								<ChevDSvg />
							</div>
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Trạng thái</label>
							<div className={styles.selectWrapper}>
								<select
									className={styles.formSelect}
									value={activeState}
									onChange={(e) =>
										setActiveState(e.target.value as '' | 'active' | 'locked')
									}
								>
									<option value=''>— Giữ nguyên —</option>
									<option value='active'>Kích hoạt</option>
									<option value='locked'>Khoá</option>
								</select>
								<ChevDSvg />
							</div>
						</div>
					</div>
					<div className={styles.formRow}>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Phòng ban / Khoa</label>
							<div className={styles.selectWrapper}>
								<select
									className={styles.formSelect}
									value={departmentId}
									onChange={(e) => setDepartmentId(e.target.value)}
								>
									<option value=''>— Giữ nguyên —</option>
									{departments.map((d) => (
										<option
											key={d.id}
											value={d.id}
										>
											{d.name}
										</option>
									))}
								</select>
								<ChevDSvg />
							</div>
						</div>
						<div className={styles.formGroup} />
					</div>
				</div>

				<div className={styles.modalFooter}>
					<button
						className={styles.btnCancel}
						onClick={onClose}
						disabled={loading}
					>
						Huỷ
					</button>
					<button
						className={styles.btnConfirmBlue}
						onClick={() => onSave(payload)}
						disabled={loading || !hasChange}
					>
						{loading ? (
							<span className={styles.spinner} />
						) : (
							<CheckSvg />
						)}
						Áp dụng cho {count} tài khoản
					</button>
				</div>
			</div>
		</div>
	);
}
