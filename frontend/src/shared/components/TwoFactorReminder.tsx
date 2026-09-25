import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getStoredUser, type StoredUser } from '../utils/storage';

// Nhắc tài khoản quản trị bật 2FA trong thời gian chuyển tiếp (backend
// permissions/twoFactorPolicy.js). Quá hạn thì router đã chuyển thẳng tới màn
// bật 2FA nên banner chỉ hiện ở trạng thái 'grace'.
export default function TwoFactorReminder() {
	// Mốc thời gian lấy 1 lần khi mount — đủ chính xác cho số ngày còn lại
	const [now] = useState(() => Date.now());
	const user = getStoredUser<StoredUser>();
	if (user?.twofa_state !== 'grace') return null;
	const deadline = user.twofa_deadline ? new Date(user.twofa_deadline) : null;
	const daysLeft = deadline ? Math.max(0, Math.ceil((deadline.getTime() - now) / 86_400_000)) : null;

	return (
		<div
			role='status'
			style={{
				display: 'flex',
				flexWrap: 'wrap',
				alignItems: 'center',
				gap: 8,
				padding: '10px 14px',
				marginBottom: 16,
				borderRadius: 8,
				border: '1px solid #fde68a',
				background: '#fefce8',
				color: '#92400e',
				fontSize: 14,
			}}
		>
			<span style={{ flex: 1, minWidth: 220 }}>
				Tài khoản quản trị phải bật <strong>xác thực 2 lớp</strong>
				{deadline && (
					<>
						{' '}
						trước <strong>{deadline.toLocaleDateString('vi-VN')}</strong>
						{daysLeft !== null && ` (còn ${daysLeft} ngày)`}
					</>
				)}
				. Quá hạn, các chức năng sẽ bị tạm khoá cho tới khi bật.
			</span>
			<Link to='/bat-2fa' style={{ fontWeight: 600, color: '#92400e', textDecoration: 'underline' }}>
				Bật ngay
			</Link>
		</div>
	);
}
