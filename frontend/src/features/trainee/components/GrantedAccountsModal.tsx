import { useState } from 'react';
import { Modal } from '@/shared/components';
import type { GrantedTraineeAccount } from '../api/traineeApi';

// Danh sách tài khoản vừa cấp — mật khẩu chỉ hiện MỘT LẦN nên phải cho sao
// chép ngay tại đây (mirror frontend/src/features/topics/components/
// GrantedAccountsModal.tsx, viết lại dùng shared Modal thay vì CSS riêng của
// feature topics để tránh import chéo feature).
export function GrantedAccountsModal({
	accounts,
	onClose,
}: {
	accounts: GrantedTraineeAccount[];
	onClose: () => void;
}) {
	const [copied, setCopied] = useState<string | null>(null);

	const copy = (text: string, key: string) => {
		void navigator.clipboard.writeText(text).then(() => {
			setCopied(key);
			setTimeout(() => setCopied(null), 1500);
		});
	};

	return (
		<Modal
			open
			onClose={onClose}
			title={`Tài khoản đã được cấp (${accounts.length})`}
			footer={
				<button
					className='btnPrimary'
					onClick={onClose}
					style={{
						padding: '8px 16px',
						borderRadius: 8,
						border: 'none',
						background: 'var(--color-primary)',
						color: '#fff',
						fontWeight: 600,
						cursor: 'pointer',
					}}
				>
					Đã lưu, đóng lại
				</button>
			}
		>
			<div
				style={{
					background: '#fefce8',
					border: '1px solid #fde68a',
					color: '#92400e',
					borderRadius: 8,
					padding: '8px 12px',
					fontSize: 13,
					marginBottom: 12,
				}}
			>
				Lưu thông tin ngay — mật khẩu chỉ hiển thị <strong>một lần duy nhất</strong>.
			</div>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
				{accounts.map((acc) => (
					<div
						key={acc.user_id}
						style={{
							border: '1px solid var(--color-gray-200)',
							borderRadius: 8,
							padding: 10,
						}}
					>
						<div style={{ fontWeight: 700, marginBottom: 6 }}>{acc.full_name}</div>
						<div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
							<span style={{ color: 'var(--color-gray-500)', width: 100 }}>Tên đăng nhập</span>
							<span style={{ fontFamily: 'var(--font-mono)' }}>{acc.username}</span>
							<button
								onClick={() => copy(acc.username, `u-${acc.user_id}`)}
								style={{ marginLeft: 'auto', fontSize: 12, cursor: 'pointer' }}
							>
								{copied === `u-${acc.user_id}` ? '✓' : 'Sao chép'}
							</button>
						</div>
						<div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginTop: 4 }}>
							<span style={{ color: 'var(--color-gray-500)', width: 100 }}>Mật khẩu</span>
							<span style={{ fontFamily: 'var(--font-mono)' }}>{acc.password_plain}</span>
							<button
								onClick={() => copy(acc.password_plain, `p-${acc.user_id}`)}
								style={{ marginLeft: 'auto', fontSize: 12, cursor: 'pointer' }}
							>
								{copied === `p-${acc.user_id}` ? '✓' : 'Sao chép'}
							</button>
						</div>
					</div>
				))}
			</div>
		</Modal>
	);
}
