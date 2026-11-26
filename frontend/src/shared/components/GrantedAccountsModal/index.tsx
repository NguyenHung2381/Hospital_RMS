import { useEffect, useRef, useState } from 'react';
import { CheckSvg, WarnSvg } from '@/assets/icons';
import { Button } from '../Button';
import { Modal } from '../Modal';
import styles from './GrantedAccountsModal.module.css';

/** Một tài khoản vừa cấp. `password_plain = null`: tài khoản có từ trước, server giữ nguyên mật khẩu. */
export interface GrantedCredential {
	user_id: string;
	username: string;
	full_name: string;
	password_plain: string | null;
	/** Ghi chú (vd dùng lại tài khoản có sẵn, tài khoản đang bị khóa) */
	note?: string | null;
}

/**
 * Danh sách tài khoản vừa cấp (thành viên đề tài, học viên…). Mật khẩu tạm chỉ hiện
 * MỘT LẦN nên cho sao chép ngay tại đây; bấm nền không đóng để tránh mất thông tin.
 * Mật khẩu chỉ nằm trong state của hộp thoại — không ghi ra URL / localStorage.
 */
export function GrantedAccountsModal<T extends GrantedCredential>({
	accounts,
	nameOf = (acc) => acc.full_name || acc.username,
	onClose,
}: {
	accounts: T[];
	/** Tên hiển thị của từng tài khoản (mặc định: họ tên, không có thì tên đăng nhập) */
	nameOf?: (acc: T) => string;
	onClose: () => void;
}) {
	const [copied, setCopied] = useState<string | null>(null);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(() => () => {
		if (timer.current) clearTimeout(timer.current);
	}, []);

	const copy = (text: string, key: string) => {
		void navigator.clipboard.writeText(text).then(() => {
			setCopied(key);
			if (timer.current) clearTimeout(timer.current);
			timer.current = setTimeout(() => setCopied(null), 1500);
		});
	};

	const copyBtn = (text: string, key: string, label: string) => (
		<Button
			variant='secondary'
			size='sm'
			className={styles.copyBtn}
			aria-label={label}
			onClick={() => copy(text, key)}
		>
			{copied === key ? '✓ Đã chép' : 'Sao chép'}
		</Button>
	);

	return (
		<Modal
			open
			onClose={onClose}
			title='Tài khoản đã được cấp'
			subtitle={`${accounts.length} tài khoản mới`}
			icon={<CheckSvg />}
			iconStyle={{ background: 'var(--tone-green-bg)', color: 'var(--tone-green-fg)' }}
			closeOnBackdrop={false}
			bodyClassName={styles.body}
			footer={<Button onClick={onClose}>Đã lưu, đóng lại</Button>}
		>
			<div
				className={styles.warning}
				role='note'
			>
				<WarnSvg aria-hidden='true' />
				<span>
					Lưu thông tin ngay — mật khẩu tạm chỉ hiển thị <strong>một lần duy nhất</strong>. Người dùng
					phải đổi mật khẩu ở lần đăng nhập đầu.
				</span>
			</div>

			<div className={styles.list}>
				{accounts.map((acc) => {
					const name = nameOf(acc);
					return (
						<div
							key={acc.user_id}
							className={styles.card}
						>
							<div className={styles.name}>{name}</div>
							<div className={styles.row}>
								<span className={styles.label}>Tên đăng nhập</span>
								<span className={styles.value}>{acc.username}</span>
								{copyBtn(acc.username, `u-${acc.user_id}`, `Sao chép tên đăng nhập của ${name}`)}
							</div>
							<div className={styles.row}>
								<span className={styles.label}>Mật khẩu</span>
								{acc.password_plain ? (
									<>
										<span className={`${styles.value} ${styles.password}`}>{acc.password_plain}</span>
										{copyBtn(acc.password_plain, `p-${acc.user_id}`, `Sao chép mật khẩu của ${name}`)}
									</>
								) : (
									<span className={styles.value}>Giữ mật khẩu hiện tại</span>
								)}
							</div>
							{acc.note && <div className={`${styles.row} ${styles.note}`}>{acc.note}</div>}
						</div>
					);
				})}
			</div>
		</Modal>
	);
}
