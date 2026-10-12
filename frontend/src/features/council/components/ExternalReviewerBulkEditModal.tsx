import { Modal, ModalActions } from '@/shared/components';
import { useState } from 'react';
import { EditSvg, InfoSvg } from '@/assets/icons';
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
		<Modal
			open
			onClose={onClose}
			icon={<EditSvg />}
			title='Sửa đồng loạt'
			subtitle={<>{count} người đã chọn</>}
			className={`${styles.modal} ${styles.modalSm}`}
			bodyClassName={styles.modalBody}
			footer={
				<ModalActions
					onCancel={onClose}
					onConfirm={() => onSave(patch)}
					loading={loading}
					disabled={!hasChange}
					confirmLabel={<>Áp dụng cho {count} người</>}
				/>
			}
		>
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
		</Modal>
	);
}
