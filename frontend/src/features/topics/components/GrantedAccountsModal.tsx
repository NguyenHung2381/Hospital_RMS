import { useState } from 'react';
import type { GrantedAccount } from '../api/topicApi';
import styles from '../pages/Topic.module.css';
import type { TopicMember } from '../types/topic.type';
import { CheckSvg as IcCheck, WarnSvg as IcWarn } from '@/assets/icons';
import { Modal } from '@/shared/components';

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
		<Modal
			open
			onClose={onClose}
			title='Tài khoản đã được cấp'
			subtitle={`${accounts.length} tài khoản mới`}
			icon={<IcCheck />}
			iconStyle={{ background: '#f0fdf4', color: '#16a34a' }}
			// Mật khẩu tạm chỉ hiện một lần: bấm nền không đóng nhầm.
			closeOnBackdrop={false}
			bodyClassName={styles.cfmModalBodyTight}
			footer={
				<button
					type='button'
					className={styles.btnPrimary}
					onClick={onClose}
				>
					Đã lưu, đóng lại
				</button>
			}
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
					Lưu thông tin ngay — mật khẩu tạm chỉ hiển thị{' '}
					<strong>một lần duy nhất</strong>. Người dùng phải đổi mật khẩu ở
					lần đăng nhập đầu.
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
								type='button'
								className={styles.grantCopyBtn}
								aria-label={`Sao chép tên đăng nhập của ${memberName(acc)}`}
								onClick={() => copy(acc.username, `u-${acc.user_id}`)}
							>
								{copied === `u-${acc.user_id}` ? '✓' : 'Sao chép'}
							</button>
						</div>
						<div className={styles.grantCredentialRow}>
							<span className={styles.grantCredentialLabel}>Mật khẩu</span>
							{acc.password_plain ? (
								<>
									<span
										className={`${styles.grantCredentialValue} ${styles.grantCredentialPassword}`}
									>
										{acc.password_plain}
									</span>
									<button
										type='button'
										className={styles.grantCopyBtn}
										aria-label={`Sao chép mật khẩu của ${memberName(acc)}`}
										onClick={() => copy(acc.password_plain ?? '', `p-${acc.user_id}`)}
									>
										{copied === `p-${acc.user_id}` ? '✓' : 'Sao chép'}
									</button>
								</>
							) : (
								// Tài khoản đã có từ trước — server không đổi mật khẩu
								<span className={styles.grantCredentialValue}>
									Giữ mật khẩu hiện tại
								</span>
							)}
						</div>
						{acc.note && (
							<div
								className={styles.grantCredentialRow}
								style={{ color: '#92400e', fontSize: 12 }}
							>
								{acc.note}
							</div>
						)}
					</div>
				))}
			</div>
		</Modal>
	);
}
