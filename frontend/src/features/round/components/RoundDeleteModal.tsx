import { useState } from 'react';
import { WarnSvg } from '@/assets/icons';
import type { ResearchRound } from '../types/round.type';
import styles from '../pages/Round.module.css';

interface RoundDeleteModalProps {
	round: ResearchRound;
	onClose: () => void;
	onConfirm: () => Promise<void>;
}

export function RoundDeleteModal({
	round,
	onClose,
	onConfirm,
}: RoundDeleteModalProps) {
	const [loading, setLoading] = useState(false);
	const [deleteError, setDeleteError] = useState('');

	const go = async () => {
		setLoading(true);
		setDeleteError('');
		try {
			await onConfirm();
		} catch (err) {
			setDeleteError(err instanceof Error ? err.message : 'Xoá thất bại');
			setLoading(false);
		}
	};

	return (
		<div
			className={styles.modalBackdrop}
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<div
				className={`${styles.modal} ${styles.confirmModal}`}
				role='alertdialog'
				aria-modal='true'
			>
				<div className={styles.modalBody}>
					<div className={styles.confirmIcon}>
						<WarnSvg />
					</div>
					<h2 className={styles.confirmTitle}>Xoá đợt nghiên cứu?</h2>
					<p className={styles.confirmDesc}>
						Bạn sắp xoá đợt <strong>"{round.name}"</strong>.
						{round.topic_total > 0
							? ` Đợt này có ${round.topic_total} đề tài liên kết — tất cả sẽ mất liên kết với đợt nghiên cứu này.`
							: ' Hành động không thể hoàn tác.'}
					</p>
				</div>
				<div className={styles.modalFooter}>
					{deleteError && (
						<span style={{ color: '#A32D2D', fontSize: 13, flex: 1 }}>
							{deleteError}
						</span>
					)}
					<button
						className={styles.btnSecondary}
						onClick={onClose}
					>
						Huỷ bỏ
					</button>
					<button
						className={styles.btnDanger}
						onClick={() => void go()}
						disabled={loading}
					>
						{loading ? (
							<>
								<span
									className={styles.spinner}
									style={{ borderTopColor: '#791F1F' }}
								/>
								Đang xoá...
							</>
						) : (
							'Xác nhận xoá'
						)}
					</button>
				</div>
			</div>
		</div>
	);
}
