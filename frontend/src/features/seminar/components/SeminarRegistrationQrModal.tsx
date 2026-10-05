import { useState } from 'react';
import { CopySvg, DownloadSvg, MonitorSvg, XSvg } from '@/assets/icons';
import { BrandedQrCode, useBrandedQrImage } from '@/shared/components/BrandedQr';
import { isLoopbackOrigin, publicUrl } from '../../../shared/utils/publicUrl';
import type { Seminar } from '../types/seminar.type';
import styles from '../pages/Seminar.module.css';

// QR đăng ký tham dự (cố định, không hết hạn) — ban tổ chức tải ảnh về gắn vào
// văn bản/giấy mời. Khác SeminarCheckInQrModal (QR điểm danh động cho tài khoản nội bộ).
export function SeminarRegistrationQrModal({
	seminar,
	onClose,
	onPresent,
}: {
	seminar: Seminar;
	onClose: () => void;
	/** Chuyển sang chiếu toàn màn hình (SeminarQrPresentation) */
	onPresent?: () => void;
}) {
	const [copied, setCopied] = useState(false);
	const url = publicUrl(`/hoi-nghi/${seminar.public_token}`);
	const qrImage = useBrandedQrImage({
		value: url,
		title: 'Quét mã để đăng ký tham dự',
		lines: [seminar.title],
		caption: url,
		filename: `qr-dang-ky-${seminar.id}`,
	});

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
					<BrandedQrCode
						value={url}
						size={260}
					/>
					<a
						href={url}
						target='_blank'
						rel='noreferrer'
						className={styles.mono}
						style={{ fontSize: 12, wordBreak: 'break-all', textAlign: 'center' }}
					>
						{url}
					</a>
					{isLoopbackOrigin() && (
						<div style={{ fontSize: 12, color: 'var(--color-danger, #d4380d)', textAlign: 'center' }}>
							Link đang trỏ tới localhost — thiết bị khác không mở được. Đặt VITE_PUBLIC_APP_URL (vd
							http://&lt;IP-máy-chủ&gt;:5173) hoặc mở trang quản trị bằng địa chỉ IP/domain rồi tạo lại QR.
						</div>
					)}
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
					{onPresent && (
						<button
							className={styles.btnGhost}
							onClick={onPresent}
						>
							<MonitorSvg /> Trình chiếu
						</button>
					)}
					<button
						className={styles.btnPrimary}
						onClick={() => qrImage.save()}
						disabled={!qrImage.ready}
					>
						<DownloadSvg /> Tải ảnh QR
					</button>
				</div>
			</div>
			{qrImage.sheet}
		</div>
	);
}
