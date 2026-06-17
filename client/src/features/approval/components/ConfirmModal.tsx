import { CheckCircleSvg, MessageSvg, XCircleSvg } from '@/assets/icons';
import styles from '../pages/Approval.module.css';

type ActionType = 'approve' | 'reject' | 'request';

interface ConfirmModalProps {
	type: ActionType;
	topicTitle: string;
	comment: string;
	onChangeComment: (v: string) => void;
	onConfirm: () => void;
	onClose: () => void;
	loading: boolean;
}

const MODAL_CFG = {
	approve: {
		title: 'Phê duyệt đề tài',
		desc: 'Xác nhận phê duyệt đề tài này. Chủ nhiệm đề tài sẽ nhận thông báo và có thể bắt đầu triển khai.',
		placeholder: 'Nhận xét (không bắt buộc)...',
		iconCls: 'iconApprove',
		btnCls: 'btnConfirmApprove',
		btnLabel: 'Xác nhận phê duyệt',
	},
	reject: {
		title: 'Từ chối đề tài',
		desc: 'Đề tài sẽ bị từ chối. Vui lòng nêu rõ lý do để nhóm nghiên cứu có thể cải thiện.',
		placeholder: 'Nêu rõ lý do từ chối (bắt buộc)...',
		iconCls: 'iconReject',
		btnCls: 'btnConfirmReject',
		btnLabel: 'Xác nhận từ chối',
	},
	request: {
		title: 'Yêu cầu bổ sung hồ sơ',
		desc: 'Gửi yêu cầu bổ sung thông tin đến chủ nhiệm đề tài.',
		placeholder: 'Nêu rõ thông tin cần bổ sung (bắt buộc)...',
		iconCls: 'iconRequest',
		btnCls: 'btnConfirmRequest',
		btnLabel: 'Gửi yêu cầu',
	},
} as const;

export function ConfirmModal({
	type,
	topicTitle,
	comment,
	onChangeComment,
	onConfirm,
	onClose,
	loading,
}: ConfirmModalProps) {
	const cfg = MODAL_CFG[type];
	const needComment = type !== 'approve';
	const canSubmit = !needComment || comment.trim().length > 0;

	const Icon =
		type === 'approve'
			? CheckCircleSvg
			: type === 'reject'
				? XCircleSvg
				: MessageSvg;

	return (
		<div
			className={styles.modalBackdrop}
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<div
				className={styles.modal}
				role='alertdialog'
				aria-modal='true'
			>
				<div className={styles.modalBody}>
					<div
						className={`${styles.modalIcon} ${styles[cfg.iconCls as keyof typeof styles]}`}
					>
						<Icon />
					</div>
					<h2 className={styles.modalTitle}>{cfg.title}</h2>
					<p className={styles.modalDesc}>
						Đề tài:{' '}
						<strong>
							"{topicTitle.slice(0, 70)}
							{topicTitle.length > 70 ? '...' : ''}"
						</strong>
						<br />
						{cfg.desc}
					</p>
					<textarea
						className={styles.modalComment}
						placeholder={cfg.placeholder}
						value={comment}
						onChange={(e) => onChangeComment(e.target.value)}
						rows={3}
						maxLength={500}
					/>
				</div>
				<div className={styles.modalFooter}>
					<button
						className={styles.btnCancel}
						onClick={onClose}
					>
						Huỷ
					</button>
					<button
						className={styles[cfg.btnCls as keyof typeof styles] as string}
						onClick={onConfirm}
						disabled={loading || !canSubmit}
					>
						{loading ? (
							<>
								<span
									className={styles.spinner}
									style={
										type !== 'approve' ? { borderTopColor: 'currentColor' } : {}
									}
								/>{' '}
								Đang xử lý...
							</>
						) : (
							cfg.btnLabel
						)}
					</button>
				</div>
			</div>
		</div>
	);
}
