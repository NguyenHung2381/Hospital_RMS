import { InfoSvg, KeySvg, ShieldSvg } from '@/assets/icons';
import styles from '../pages/TopicMembers.module.css';
import type { Topic } from '../types/topicmember.type';

interface MemberGrantModalProps {
	topic: Topic;
	pendingCount: number;
	onClose: () => void;
	onConfirm: () => void;
	loading: boolean;
}

export function MemberGrantModal({
	topic,
	pendingCount,
	onClose,
	onConfirm,
	loading,
}: MemberGrantModalProps) {
	return (
		<div
			className={styles.modalBackdrop}
			onClick={onClose}
		>
			<div
				className={`${styles.modal} ${styles.modalSm}`}
				onClick={(e) => e.stopPropagation()}
			>
				<div
					className={styles.modalBody}
					style={{ textAlign: 'center', gap: 16 }}
				>
					<div
						className={styles.modalHeaderIcon}
						style={{
							margin: '0 auto',
							background: '#faeeda',
							color: '#633806',
						}}
					>
						<KeySvg />
					</div>
					<div>
						<div className={styles.modalTitle}>Cấp tài khoản hàng loạt</div>
						<div
							className={styles.modalSubtitle}
							style={{ marginTop: 6 }}
						>
							Hệ thống sẽ tự động tạo tài khoản cho{' '}
							<strong>{pendingCount} thành viên</strong> chưa có tài khoản trong
							đề tài <em>{topic.id}</em>.
						</div>
					</div>
					<div className={styles.grantInfoBox}>
						<div className={styles.grantInfoRow}>
							<ShieldSvg />
							<span>Username được tạo từ phần đầu email</span>
						</div>
						<div className={styles.grantInfoRow}>
							<KeySvg />
							<span>Mật khẩu tạm thời gửi qua email</span>
						</div>
						<div className={styles.grantInfoRow}>
							<InfoSvg />
							<span>Thành viên phải đổi mật khẩu khi đăng nhập lần đầu</span>
						</div>
					</div>
				</div>
				<div className={styles.modalFooter}>
					<button
						className={styles.btnCancel}
						onClick={onClose}
					>
						Huỷ
					</button>
					<button
						className={styles.btnConfirmAmber}
						onClick={onConfirm}
						disabled={loading}
					>
						{loading ? (
							<>
								<span className={`${styles.spinner} ${styles.spinnerDark}`} />{' '}
								Đang cấp...
							</>
						) : (
							<>
								<KeySvg /> Cấp tài khoản ({pendingCount})
							</>
						)}
					</button>
				</div>
			</div>
		</div>
	);
}
