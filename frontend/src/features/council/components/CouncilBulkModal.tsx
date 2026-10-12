import { Modal, ModalActions } from '@/shared/components';
import { useState } from 'react';
import { EditSvg, InfoSvg, TrashSvg } from '@/assets/icons';
import type { UpdateCouncilPayload } from '../api/councilApi';
import { STATUS_LABELS, type CouncilStatus } from '../types/council.type';
import styles from '../pages/Council.module.css';
import { DatePicker } from '../../../shared/components/Input/DatePicker';

export function CouncilBulkEditModal({
	count,
	onClose,
	onSave,
	loading,
}: {
	count: number;
	onClose: () => void;
	onSave: (payload: UpdateCouncilPayload) => void;
	loading: boolean;
}) {
	const [location, setLocation] = useState('');
	const [defenseDate, setDefenseDate] = useState('');
	const [status, setStatus] = useState<CouncilStatus | ''>('');

	// Chỉ gửi các trường được điền — trường bỏ trống giữ nguyên giá trị cũ
	const payload: UpdateCouncilPayload = {
		...(location.trim() ? { location: location.trim() } : {}),
		...(defenseDate ? { defense_date: defenseDate } : {}),
		...(status ? { status } : {}),
	};
	const hasChange = Object.keys(payload).length > 0;

	return (
		<Modal
			open
			onClose={onClose}
			icon={<EditSvg />}
			title='Sửa đồng loạt'
			subtitle={<>{count} hội đồng đã chọn</>}
			className={`${styles.modal} ${styles.modalSm}`}
			bodyClassName={styles.modalBody}
			footer={
				<ModalActions
					onCancel={onClose}
					onConfirm={() => onSave(payload)}
					loading={loading}
					disabled={!hasChange}
					confirmLabel={<>Áp dụng cho {count} hội đồng</>}
				/>
			}
		>
			<div className={styles.warnBox}>
				<InfoSvg />
				<span>Trường bỏ trống sẽ được giữ nguyên, không bị ghi đè.</span>
			</div>
			<div className={styles.formGrid2}>
				<div className={styles.formGroup}>
					<label className={styles.formLabel}>Trạng thái</label>
					<select
						className={styles.formInput}
						value={status}
						onChange={(e) => setStatus(e.target.value as CouncilStatus | '')}
					>
						<option value=''>-- Giữ nguyên --</option>
						{Object.entries(STATUS_LABELS).map(([v, label]) => (
							<option
								key={v}
								value={v}
							>
								{label}
							</option>
						))}
					</select>
				</div>
			</div>
			<div className={styles.formGrid2}>
				<div className={styles.formGroup}>
					<label className={styles.formLabel}>Địa điểm</label>
					<input
						className={styles.formInput}
						value={location}
						onChange={(e) => setLocation(e.target.value)}
						placeholder='Giữ nguyên'
					/>
				</div>
				<div className={styles.formGroup}>
					<label className={styles.formLabel}>Ngày bảo vệ</label>
					<DatePicker
						value={defenseDate}
						onChange={setDefenseDate}
						placeholder='Chọn ngày bảo vệ'
					/>
				</div>
			</div>
		</Modal>
	);
}

export function CouncilBulkDeleteModal({
	count,
	onClose,
	onConfirm,
	loading,
}: {
	count: number;
	onClose: () => void;
	onConfirm: () => void;
	loading: boolean;
}) {
	return (
		<Modal
			open
			onClose={onClose}
			icon={<TrashSvg />}
			tone='danger'
			title='Xoá hàng loạt'
			subtitle={<>{count} hội đồng đã chọn</>}
			className={`${styles.modal} ${styles.modalSm}`}
			bodyClassName={styles.modalBody}
			footer={
				<>
					<button
						className={styles.btnCancel}
						onClick={onClose}
						disabled={loading}
					>
						Huỷ
					</button>
					<button
						className={styles.btnDanger}
						onClick={onConfirm}
						disabled={loading}
					>
						{loading ? (
							<span className={`${styles.spinner} ${styles.spinnerDark}`} />
						) : (
							<TrashSvg />
						)}
						Xoá {count} hội đồng
					</button>
				</>
			}
		>
			<p className={styles.deleteDesc}>
				Bạn có chắc muốn xoá <strong>{count} hội đồng</strong> khỏi hệ thống?
			</p>
			<div className={styles.warnBox}>
				<InfoSvg />
				<span>
					Đề tài đang gán cho các hội đồng này sẽ tự động bỏ gán, và toàn bộ
					thành viên hội đồng sẽ bị xoá.
				</span>
			</div>
		</Modal>
	);
}
