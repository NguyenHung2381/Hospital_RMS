import { useState } from 'react';
import { BadgeSvg, CheckSvg, XSvg } from '@/assets/icons';
import type { SeminarParticipant } from '../types/seminar.type';
import styles from '../pages/Seminar.module.css';

export function IssueCmeModal({
	targets,
	notEligible = 0,
	defaultYear,
	registerLastSeq,
	loading,
	onClose,
	onConfirm,
}: {
	targets: SeminarParticipant[];
	/** Số người đã chọn nhưng chưa điểm danh / chưa làm bài test — bị bỏ qua */
	notEligible?: number;
	defaultYear: number | null;
	registerLastSeq: number | null;
	loading: boolean;
	onClose: () => void;
	onConfirm: (year: number) => void;
}) {
	const [year, setYear] = useState<string>(
		defaultYear ? String(defaultYear) : String(new Date().getFullYear()),
	);
	const pending = targets.filter((t) => t.cme_seq == null);
	const from = (registerLastSeq ?? 0) + 1;
	const to = from + pending.length - 1;

	return (
		<div
			className={styles.modalBackdrop}
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<div className={`${styles.modal} ${styles.modalSm}`}>
				<div className={styles.modalHeader}>
					<BadgeSvg />
					<div>
						<div className={styles.modalTitle}>Cấp số quyết định CME</div>
						<div className={styles.modalSub}>
							Số chạy liên tục theo năm, không tự dồn khi thu hồi
						</div>
					</div>
					<button className={styles.modalClose} onClick={onClose}>
						<XSvg />
					</button>
				</div>
				<div className={styles.modalBody}>
					<div className={styles.formGroup} style={{ marginBottom: 12 }}>
						<label className={styles.formLabel}>Năm chu trình CME</label>
						<input
							className={styles.formInput}
							value={year}
							onChange={(e) => setYear(e.target.value)}
							inputMode='numeric'
						/>
					</div>
					{notEligible > 0 && (
						<p className={styles.muted}>
							Bỏ qua {notEligible} người tự đăng ký chưa điểm danh hoặc chưa làm bài test.
						</p>
					)}
					{pending.length === 0 ? (
						<p className={styles.muted}>
							Không có người nào cần / đủ điều kiện cấp số CME.
						</p>
					) : (
						<p>
							Cấp cho <strong>{pending.length}</strong> người — dải số dự kiến{' '}
							<strong className={styles.mono}>
								{String(from).padStart(4, '0')}–{String(to).padStart(4, '0')}
							</strong>{' '}
							/ {year}.
						</p>
					)}
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
						className={styles.btnPrimary}
						onClick={() => onConfirm(Number(year))}
						disabled={loading || pending.length === 0 || !/^\d{4}$/.test(year)}
					>
						{loading ? <span className={styles.spinner} /> : <CheckSvg />}
						Cấp {pending.length || ''} số
					</button>
				</div>
			</div>
		</div>
	);
}
