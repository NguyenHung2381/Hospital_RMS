import { useEffect, useId, useRef } from 'react';
import { useFocusTrap } from '@/shared/hooks/useFocusTrap';
import { CheckCircleSvg, MessageSvg, XCircleSvg } from '@/assets/icons';
import styles from '../pages/Approval.module.css';
import { SignToggle } from '../../signing/components/SignToggle';
import { useSignPreference } from '../../signing/hooks/useSignPreference';

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
		title: 'Không phê duyệt đề tài',
		desc: 'Đề tài sẽ không được phê duyệt. Vui lòng nêu rõ lý do để nhóm nghiên cứu có thể điều chỉnh và cải thiện.',
		placeholder: 'Nêu rõ lý do không phê duyệt (bắt buộc)...',
		iconCls: 'iconReject',
		btnCls: 'btnConfirmReject',
		btnLabel: 'Xác nhận không phê duyệt',
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
	const dialogRef = useRef<HTMLDivElement>(null);
	const commentRef = useRef<HTMLTextAreaElement>(null);
	const titleId = useId();
	const descId = useId();
	// Giữ focus trong hộp thoại, Esc để đóng, trả focus về nút đã mở khi đóng
	useFocusTrap(dialogRef, { active: true, onEscape: onClose });
	useEffect(() => {
		commentRef.current?.focus();
	}, []);

	const cfg = MODAL_CFG[type];
	// Đọc cùng khóa ở useApproval.handleAction
	const [sign, setSign] = useSignPreference('topic-approval');
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
				ref={dialogRef}
				className={styles.modal}
				role='dialog'
				aria-modal='true'
				aria-labelledby={titleId}
				aria-describedby={descId}
				tabIndex={-1}
			>
				<div className={styles.modalBody}>
					<div
						className={`${styles.modalIcon} ${styles[cfg.iconCls as keyof typeof styles]}`}
					>
						<Icon />
					</div>
					<h2 id={titleId} className={styles.modalTitle}>{cfg.title}</h2>
					<p id={descId} className={styles.modalDesc}>
						Đề tài:{' '}
						<strong>
							"{topicTitle.slice(0, 70)}
							{topicTitle.length > 70 ? '...' : ''}"
						</strong>
						<br />
						{cfg.desc}
					</p>
					<textarea
						ref={commentRef}
						className={styles.modalComment}
						aria-label={needComment ? (type === 'reject' ? 'Lý do không phê duyệt' : 'Thông tin cần bổ sung') : 'Nhận xét'}
						aria-required={needComment}
						placeholder={cfg.placeholder}
						value={comment}
						onChange={(e) => onChangeComment(e.target.value)}
						rows={3}
						maxLength={500}
					/>
					<SignToggle
						feature='topic_approval'
						source='personal'
						checked={sign}
						onChange={setSign}
						disabled={loading}
						style={{ marginTop: 'var(--space-3)', textAlign: 'left' }}
					/>
					{sign && (
						<p className={styles.modalDesc} style={{ marginTop: 'var(--space-2)', marginBottom: 0 }}>
							Hệ thống tạo phiếu phê duyệt PDF, ký bằng chứng thư của bạn rồi lưu vào tài liệu đề tài. Ký không
							được thì quyết định chưa được ghi.
						</p>
					)}
				</div>
				<div className={styles.modalFooter}>
					<button
						type='button'
						className={styles.btnCancel}
						onClick={onClose}
					>
						Hủy
					</button>
					<button
						type='button'
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
