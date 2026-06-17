import { InfoSvg, TrashSvg } from '@/assets/icons';
import styles from '../pages/TopicMembers.module.css';
import type { TopicMember } from '../types/topicmember.type';

interface MemberDeleteModalProps {
	member: TopicMember;
	onClose: () => void;
	onConfirm: () => void;
	loading: boolean;
}

export function MemberDeleteModal({
	member,
	onClose,
	onConfirm,
	loading,
}: MemberDeleteModalProps) {
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
						className={`${styles.modalHeaderIcon} ${styles.iconDanger}`}
						style={{ margin: '0 auto' }}
					>
						<TrashSvg />
					</div>
					<div>
						<div className={styles.modalTitle}>Xoá thành viên</div>
						<div
							className={styles.modalSubtitle}
							style={{ marginTop: 6 }}
						>
							Bạn có chắc muốn xoá <strong>{member.ho_ten}</strong> khỏi nhóm
							nghiên cứu? Hành động này không thể hoàn tác.
						</div>
					</div>
					{member.account_granted && (
						<div className={styles.warnBox}>
							<InfoSvg />
							<span>
								Thành viên này đã có tài khoản hệ thống. Tài khoản sẽ bị vô hiệu
								hoá sau khi xoá.
							</span>
						</div>
					)}
				</div>
				<div className={styles.modalFooter}>
					<button
						className={styles.btnCancel}
						onClick={onClose}
					>
						Huỷ
					</button>
					<button
						className={styles.btnDanger}
						onClick={onConfirm}
						disabled={loading}
					>
						{loading ? (
							<>
								<span className={styles.spinner} /> Đang xoá...
							</>
						) : (
							<>
								<TrashSvg /> Xoá thành viên
							</>
						)}
					</button>
				</div>
			</div>
		</div>
	);
}
