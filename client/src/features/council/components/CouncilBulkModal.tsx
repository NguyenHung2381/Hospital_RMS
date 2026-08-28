import { useState } from 'react';
import { CheckSvg, EditSvg, InfoSvg, TrashSvg, XSvg } from '@/assets/icons';
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
						<div className={styles.modalSub}>{count} hội đồng đã chọn</div>
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
						onClick={() => onSave(payload)}
						disabled={loading || !hasChange}
					>
						{loading ? <span className={styles.spinner} /> : <CheckSvg />}
						Áp dụng cho {count} hội đồng
					</button>
				</div>
			</div>
		</div>
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
		<div
			className={styles.modalBackdrop}
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<div className={`${styles.modal} ${styles.modalSm}`}>
				<div className={styles.modalHeader}>
					<div className={styles.modalHeaderIconDanger}>
						<TrashSvg />
					</div>
					<div>
						<div className={styles.modalTitle}>Xoá hàng loạt</div>
						<div className={styles.modalSub}>{count} hội đồng đã chọn</div>
					</div>
					<button
						className={styles.modalClose}
						onClick={onClose}
					>
						<XSvg />
					</button>
				</div>
				<div className={styles.modalBody}>
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
				</div>
			</div>
		</div>
	);
}
