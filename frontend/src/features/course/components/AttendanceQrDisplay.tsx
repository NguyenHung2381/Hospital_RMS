import { useEffect, useState } from 'react';
import { QRCode } from 'antd';
import { getAttendanceQrToken } from '../api/courseApi';

// Mã hết hạn sau 75s ở backend — làm mới ở 28s để luôn có vùng đệm, tránh
// học viên quét/chụp hụt đúng lúc mã vừa hết hạn.
const REFRESH_MS = 28_000;

export function AttendanceQrDisplay({ sessionId }: { sessionId: string }) {
	const [token, setToken] = useState<string | null>(null);
	const [error, setError] = useState('');

	useEffect(() => {
		let alive = true;
		const fetchToken = () => {
			getAttendanceQrToken(sessionId)
				.then((r) => alive && setToken(r.token))
				.catch(() => alive && setError('Không thể tạo mã QR điểm danh'));
		};
		fetchToken();
		const interval = setInterval(fetchToken, REFRESH_MS);
		return () => {
			alive = false;
			clearInterval(interval);
		};
	}, [sessionId]);

	return (
		<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '12px 0' }}>
			{error && <div style={{ color: '#e24b4a', fontSize: 13 }}>{error}</div>}
			{token && <QRCode
					value={token}
					size={300}
					// JWT dài → QR dày đặc; mức sửa lỗi L cho module to nhất có thể, dễ đọc
					// hơn nhiều khi học viên chụp ảnh màn hình (moire, lóa sáng).
					errorLevel='L'
					bgColor='#fff'
				/>}
			<div style={{ fontSize: 12, color: 'var(--color-gray-500)' }}>
				Học viên mở "Điểm danh QR" trong ứng dụng và quét mã này — mã tự làm mới liên tục
			</div>
		</div>
	);
}
