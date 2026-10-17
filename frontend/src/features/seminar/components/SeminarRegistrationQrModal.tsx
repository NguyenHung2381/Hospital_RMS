import { useState } from 'react';
import { CheckSvg, CopySvg, DownloadSvg, MonitorSvg } from '@/assets/icons';
import { Modal } from '@/shared/components';
import { BrandedQrCode, useBrandedQrImage } from '@/shared/components/BrandedQr';
import { formatDateOr } from '@/shared/utils/formatDate';
import { isLoopbackOrigin, publicUrl } from '../../../shared/utils/publicUrl';
import type { Seminar } from '../types/seminar.type';
import styles from '../pages/Seminar.module.css';

// QR đăng ký tham dự (cố định, không hết hạn) — ban tổ chức tải ảnh về gắn vào
// văn bản/giấy mời hoặc chiếu lên màn hình hội trường.

// Ngày diễn ra cho tên file: "20-10-2026" hoặc "20-10-2026 đến 22-10-2026" ('/' không dùng được trong tên file)
const fileDates = (s: Seminar) => {
	const day = (d: string | null) => (d ? formatDateOr(d, '').replace(/\//g, '-') : '');
	const from = day(s.start_date);
	const to = s.end_date && s.end_date.slice(0, 10) !== s.start_date?.slice(0, 10) ? day(s.end_date) : '';
	if (from) return to ? `${from} đến ${to}` : from;
	return to || s.date_text || '';
};

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
	const dates = fileDates(seminar);
	// Chỉ mã QR (không khung/header) để chèn thẳng vào văn bản; tên file = tên hội nghị + ngày
	const qrImage = useBrandedQrImage({
		value: url,
		plain: true,
		filename: `QR ${seminar.title}${dates ? ` - ${dates}` : ''}`,
	});

	const copy = () =>
		void navigator.clipboard?.writeText(url).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		});

	return (
		<>
			<Modal
				open
				onClose={onClose}
				title='Mã QR đăng ký'
				subtitle={seminar.title}
				size='sm'
				footer={
					<>
						{onPresent && (
							<button
								className={styles.btnGhost}
								onClick={onPresent}
								style={{ marginRight: 'auto' }}
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
					</>
				}
			>
				<div className={styles.qrPanel}>
					<BrandedQrCode
						value={url}
						size={240}
					/>
					<span className={styles.hint}>Quét mã → điền thông tin → nhận vé QR cá nhân</span>
					<div className={styles.qrLink}>
						<a
							href={url}
							target='_blank'
							rel='noreferrer'
							title={url}
						>
							{url}
						</a>
						<button
							type='button'
							className={styles.actionBtn}
							onClick={copy}
							title='Sao chép link'
						>
							{copied ? <CheckSvg /> : <CopySvg />}
						</button>
					</div>
					{isLoopbackOrigin() && (
						<div className={`${styles.noticeBox} ${styles.noticeWarn}`}>
							Link đang trỏ tới localhost — điện thoại không mở được. Đặt VITE_PUBLIC_APP_URL hoặc mở trang
							quản trị bằng địa chỉ IP/domain.
						</div>
					)}
				</div>
			</Modal>
			{qrImage.sheet}
		</>
	);
}
