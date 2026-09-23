import { useState } from 'react';
import { CheckSvg, EditSvg, InfoSvg, XSvg } from '@/assets/icons';
import { SPECIALTY_GROUPS } from '../../department/types/department.type';
import type { ExternalReviewerPatch } from '../api/externalReviewerApi';
import styles from '../pages/Council.module.css';

export function ExternalReviewerBulkEditModal({
	count,
	onClose,
	onSave,
	loading,
}: {
	count: number;
	onClose: () => void;
	onSave: (patch: ExternalReviewerPatch) => void;
	loading: boolean;
}) {
	const [organization, setOrganization] = useState('');
	const [specialtyGroup, setSpecialtyGroup] = useState('');

	// Chỉ gửi trường được điền — trường bỏ trống giữ nguyên giá trị cũ
	const patch: ExternalReviewerPatch = {
		...(organization.trim() ? { organization: organization.trim() } : {}),
		...(specialtyGroup ? { specialty_group: specialtyGroup } : {}),
	};
	const hasChange = Object.keys(patch).length > 0;

	return (
		<div
			className={styles.modalBackdrop}
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<div className={`${styles.modal} ${styles.modalSm}`}>
				<div className={styles.modalHeader}>
					<div className={styles.modalHeaderIcon}>
						<EditSvg />
					</div>
					<div>
						<div className={styles.modalTitle}>Sửa đồng loạt</div>
						<div className={styles.modalSub}>{count} người đã chọn</div>
					</div>
					<button
						className={styles.modalClose}
						onClick={onClose}
					>
						<XSvg />
					</button>
				</div>

				<div className={styles.modalBody}>
					<div className={styles.warnBox}>
						<InfoSvg />
						<span>Trường bỏ trống sẽ được giữ nguyên, không bị ghi đè.</span>
					</div>
					<div className={styles.formGrid2}>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Hệ chuyên môn</label>
							<select
								className={styles.formInput}
								value={specialtyGroup}
								onChange={(e) => setSpecialtyGroup(e.target.value)}
							>
								<option value=''>-- Giữ nguyên --</option>
								{SPECIALTY_GROUPS.map((g) => (
									<option
										key={g}
										value={g}
									>
										{g}
									</option>
								))}
							</select>
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Đơn vị công tác</label>
							<input
								className={styles.formInput}
								value={organization}
								onChange={(e) => setOrganization(e.target.value)}
								placeholder='Giữ nguyên'
							/>
						</div>
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
						className={styles.btnConfirmApprove}
						onClick={() => onSave(patch)}
						disabled={loading || !hasChange}
					>
						{loading ? <span className={styles.spinner} /> : <CheckSvg />}
						Áp dụng cho {count} người
					</button>
				</div>
			</div>
		</div>
	);
}
