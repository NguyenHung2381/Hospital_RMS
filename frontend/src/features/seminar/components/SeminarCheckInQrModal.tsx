import { useEffect, useState } from 'react';
import { QRCode } from 'antd';
import { XSvg } from '@/assets/icons';
import { getCheckInQrToken } from '../api/seminarApi';
import styles from '../pages/Seminar.module.css';

// Mirror AttendanceQrDisplay (courses) — làm mới trước khi JWT 75s hết hạn.
const REFRESH_MS = 28_000;

export function SeminarCheckInQrModal({ seminarId, onClose }: { seminarId: string; onClose: () => void }) {
	const [token, setToken] = useState<string | null>(null);
	const [error, setError] = useState('');

	useEffect(() => {
		let alive = true;
		const fetchToken = () => {
			getCheckInQrToken(seminarId)
				.then((r) => alive && setToken(r.token))
				.catch(() => alive && setError('Không thể tạo mã QR điểm danh'));
		};
		fetchToken();
		const interval = setInterval(fetchToken, REFRESH_MS);
		return () => {
			alive = false;
			clearInterval(interval);
		};
	}, [seminarId]);

	return (
		<div
			className={styles.modalBackdrop}
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<div className={`${styles.modal} ${styles.modalSm}`}>
				<div className={styles.modalHeader}>
					<div>
						<div className={styles.modalTitle}>Mã QR điểm danh</div>
						<div className={styles.modalSub}>Chiếu lên màn hình hội trường</div>
					</div>
					<button
						className={styles.modalClose}
						onClick={onClose}
					>
						<XSvg />
					</button>
				</div>
				<div
					className={styles.modalBody}
					style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}
				>
					{error && <div style={{ color: '#e24b4a', fontSize: 13 }}>{error}</div>}
					{token && <QRCode
							value={token}
							size={300}
							errorLevel='L' // xem AttendanceQrDisplay
							bgColor='#fff'
						/>}
					<div style={{ fontSize: 12, color: 'var(--color-gray-500)', textAlign: 'center' }}>
						Người tham dự mở mục "Điểm danh QR" trong ứng dụng và quét mã này — chỉ áp dụng cho
						người đã có trong danh sách tham dự. Mã tự làm mới liên tục.
					</div>
				</div>
			</div>
		</div>
	);
}
