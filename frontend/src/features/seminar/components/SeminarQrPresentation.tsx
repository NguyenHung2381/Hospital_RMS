import { useEffect, useState } from 'react';
import { MonitorSvg, XSvg } from '@/assets/icons';
import Logo from '@/assets/logo.png';
import { BrandedQrCode, HOSPITAL_NAME } from '@/shared/components/BrandedQr';
import { publicUrl } from '../../../shared/utils/publicUrl';
import { seminarWhen } from '../../public/utils/seminarWhen';
import type { Seminar } from '../types/seminar.type';
import styles from './SeminarQrPresentation.module.css';

const fullscreenEl = () => document.fullscreenElement ?? null;

const enterFullscreen = () => {
	if (!fullscreenEl()) void document.documentElement.requestFullscreen?.().catch(() => {});
};

// QR đăng ký chiếu toàn màn hình lên máy chiếu/TV hội trường — người tham dự
// quét bằng điện thoại để đăng ký. Cùng link với SeminarRegistrationQrModal.
export function SeminarQrPresentation({ seminar, onClose }: { seminar: Seminar; onClose: () => void }) {
	const url = publicUrl(`/hoi-nghi/${seminar.public_token}`);
	const when = seminarWhen(seminar);
	const [isFull, setIsFull] = useState(() => !!fullscreenEl());
	const [qrSize, setQrSize] = useState(0);

	// QR lấy hết chiều cao còn lại sau header + tiêu đề + dòng hướng dẫn + khung (~430px)
	useEffect(() => {
		const fit = () =>
			setQrSize(Math.round(Math.max(160, Math.min(window.innerWidth * 0.8, window.innerHeight - 430))));
		fit();
		window.addEventListener('resize', fit);
		return () => window.removeEventListener('resize', fit);
	}, []);

	// Mở từ nút bấm nên vẫn còn "thao tác người dùng" để trình duyệt cho vào toàn màn hình
	useEffect(() => {
		enterFullscreen();
		return () => {
			if (fullscreenEl()) void document.exitFullscreen().catch(() => {});
		};
	}, []);

	useEffect(() => {
		const onChange = () => setIsFull(!!fullscreenEl());
		// Esc khi đang toàn màn hình do trình duyệt xử lý (thoát toàn màn hình); Esc lần nữa mới đóng
		const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !fullscreenEl() && onClose();
		document.addEventListener('fullscreenchange', onChange);
		window.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('fullscreenchange', onChange);
			window.removeEventListener('keydown', onKey);
		};
	}, [onClose]);

	return (
		<div className={styles.screen}>
			<header className={styles.header}>
				<img
					src={Logo}
					alt=''
					className={styles.logo}
				/>
				<div>
					<div className={styles.hospital}>{HOSPITAL_NAME}</div>
					<div className={styles.sub}>Cổng thông tin Đào tạo</div>
				</div>
				<div className={styles.actions}>
					{!isFull && document.fullscreenEnabled && (
						<button
							className={styles.action}
							onClick={enterFullscreen}
						>
							<MonitorSvg /> Toàn màn hình
						</button>
					)}
					<button
						className={styles.action}
						onClick={onClose}
						title='Đóng (Esc)'
					>
						<XSvg /> Đóng
					</button>
				</div>
			</header>

			<main className={styles.body}>
				<h1 className={styles.title}>{seminar.title}</h1>
				{(when !== '—' || seminar.location) && (
					<div className={styles.meta}>
						{when !== '—' ? when : ''}
						{when !== '—' && seminar.location ? ' · ' : ''}
						{seminar.location}
					</div>
				)}
				<div className={styles.qrCard}>
					{qrSize > 0 && (
						<BrandedQrCode
							value={url}
							size={qrSize}
						/>
					)}
				</div>
				<div className={styles.cta}>Quét mã QR để đăng ký tham dự</div>
				<div className={styles.url}>{url}</div>
			</main>
		</div>
	);
}
