import React, { useState } from 'react';
import type { GrantedAccount } from '../api/topicApi';
import styles from '../pages/Topic.module.css';
import type { TopicMember } from '../types/topic.type';
import { CheckSvg as IcCheck, WarnSvg as IcWarn, XSvg as IcX } from '@/assets/icons';

export function GrantedAccountsModal({
	accounts,
	members,
	onClose,
}: {
	accounts: GrantedAccount[];
	members: TopicMember[];
	onClose: () => void;
}) {
	const [copied, setCopied] = useState<string | null>(null);

	const copy = (text: string, key: string) => {
		navigator.clipboard.writeText(text).then(() => {
			setCopied(key);
			setTimeout(() => setCopied(null), 1500);
		});
	};

	const memberName = (acc: GrantedAccount) =>
		acc.full_name ||
		members.find((m) => m.id === acc.member_id)?.ho_ten ||
		acc.username;

	return (
		<div
			className={styles.modalBackdrop}
			style={{ zIndex: 1100 }}
		>
			<div
				className={`${styles.modal} ${styles.confirmModal}`}
				style={{ maxWidth: 480 }}
				role='dialog'
				aria-modal='true'
			>
				{/* Header */}
				<div
					className={styles.cfmHeader}
					style={
						{
							'--cfm-accent': '#f0fdf4',
							'--cfm-color': '#16a34a',
						} as React.CSSProperties
					}
				>
					<div className={styles.cfmHeaderIcon}>
						<IcCheck />
					</div>
					<div className={styles.cfmHeaderText}>
						<div className={styles.cfmHeaderTitle}>Tài khoản đã được cấp</div>
						<div className={styles.cfmHeaderSub}>
							{accounts.length} tài khoản mới
						</div>
					</div>
					<button
						className={styles.modalCloseBtn}
						onClick={onClose}
						aria-label='Đóng'
					>
						<IcX />
					</button>
				</div>

				{/* Body */}
				<div
					className={styles.modalBody}
					style={{ gap: 'var(--space-3)' }}
				>
					<div
						className={styles.cfmWarningBox}
						style={{
							background: '#fefce8',
							borderColor: '#fde68a',
							color: '#92400e',
						}}
					>
						<IcWarn />
						<span>
							Lưu thông tin ngay — mật khẩu chỉ hiển thị{' '}
							<strong>một lần duy nhất</strong>.
						</span>
					</div>

					<div className={styles.grantCredentialList}>
						{accounts.map((acc) => (
							<div
								key={acc.user_id}
								className={styles.grantCredentialCard}
							>
								<div className={styles.grantCredentialName}>
									{memberName(acc)}
								</div>
								<div className={styles.grantCredentialRow}>
									<span className={styles.grantCredentialLabel}>
										Tên đăng nhập
									</span>
									<span className={styles.grantCredentialValue}>
										{acc.username}
									</span>
									<button
										className={styles.grantCopyBtn}
										onClick={() => copy(acc.username, `u-${acc.user_id}`)}
									>
										{copied === `u-${acc.user_id}` ? '✓' : 'Sao chép'}
									</button>
								</div>
								<div className={styles.grantCredentialRow}>
									<span className={styles.grantCredentialLabel}>Mật khẩu</span>
									<span
										className={`${styles.grantCredentialValue} ${styles.grantCredentialPassword}`}
									>
										{acc.password_plain}
									</span>
									<button
										className={styles.grantCopyBtn}
										onClick={() => copy(acc.password_plain, `p-${acc.user_id}`)}
									>
										{copied === `p-${acc.user_id}` ? '✓' : 'Sao chép'}
									</button>
								</div>
							</div>
						))}
					</div>
				</div>

				{/* Footer */}
				<div className={styles.modalFooter}>
					<button
						className={styles.btnPrimary}
						onClick={onClose}
					>
						Đã lưu, đóng lại
					</button>
				</div>
			</div>
		</div>
	);
}
