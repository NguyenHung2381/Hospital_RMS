import { useRef, useState } from 'react';
import { QRCode } from 'antd';
import { CopySvg, DownloadSvg, XSvg } from '@/assets/icons';
import { downloadQrPng } from '../../../shared/utils/qrPng';
import type { Seminar } from '../types/seminar.type';
import styles from '../pages/Seminar.module.css';

// QR đăng ký tham dự (cố định, không hết hạn) — ban tổ chức tải ảnh về gắn vào
// văn bản/giấy mời. Khác SeminarCheckInQrModal (QR điểm danh động cho tài khoản nội bộ).
export function SeminarRegistrationQrModal({ seminar, onClose }: { seminar: Seminar; onClose: () => void }) {
	const qrRef = useRef<HTMLDivElement>(null);
	const [copied, setCopied] = useState(false);
	const url = `${window.location.origin}/hoi-nghi/${seminar.public_token}`;

	return (
		<div
			className={styles.modalBackdrop}
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<div className={`${styles.modal} ${styles.modalSm}`}>
				<div className={styles.modalHeader}>
					<div>
						<div className={styles.modalTitle}>Mã QR đăng ký tham dự</div>
						<div className={styles.modalSub}>Gắn vào văn bản / giấy mời — quét để đăng ký</div>
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
					<div ref={qrRef}>
						<QRCode
							type='canvas'
							value={url}
							size={260}
							bgColor='#fff'
						/>
					</div>
					<a
						href={url}
						target='_blank'
						rel='noreferrer'
						className={styles.mono}
						style={{ fontSize: 12, wordBreak: 'break-all', textAlign: 'center' }}
					>
						{url}
					</a>
					<div style={{ fontSize: 12, color: 'var(--color-gray-500)', textAlign: 'center' }}>
						Người tham dự quét mã → điền thông tin → nhận vé QR cá nhân (tự lưu về máy). Đến hội nghị, dùng
						"Quét vé điểm danh" để điểm danh; cuối buổi mở "Bài test".
					</div>
				</div>
				<div className={styles.modalFooter}>
					<button
						className={styles.btnGhost}
						onClick={() =>
							void navigator.clipboard?.writeText(url).then(() => {
								setCopied(true);
								setTimeout(() => setCopied(false), 1500);
							})
						}
					>
						<CopySvg /> {copied ? 'Đã sao chép' : 'Sao chép link'}
					</button>
					<button
						className={styles.btnPrimary}
						onClick={() => downloadQrPng(qrRef.current, ['Quét mã để đăng ký tham dự', seminar.title], `qr-dang-ky-${seminar.id}`)}
					>
						<DownloadSvg /> Tải ảnh QR
					</button>
				</div>
			</div>
		</div>
	);
}
