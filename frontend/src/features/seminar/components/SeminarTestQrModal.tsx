import { useState } from 'react';
import { CheckSvg, CopySvg, DownloadSvg, MonitorSvg } from '@/assets/icons';
import { Modal } from '@/shared/components';
import { BrandedQrCode, useBrandedQrImage } from '@/shared/components/BrandedQr';
import { isLoopbackOrigin, publicUrl } from '../../../shared/utils/publicUrl';
import type { Seminar, SeminarTest } from '../types/seminar.type';
import styles from '../pages/Seminar.module.css';
import { SeminarQrPresentation } from './SeminarQrPresentation';

/** Đường dẫn công khai trong QR chung của 1 đề (seminarTestQrService ở backend) */
const testQrPath = (t: SeminarTest) => `/hoi-nghi/kiem-tra/${t.qr_token}`;

// QR chung của 1 đề kiểm tra — ban tổ chức chiếu lên màn hình hội trường: người dự quét →
// nhập họ tên → làm bài, không cần vé QR cá nhân.
export function SeminarTestQrModal({
	seminar,
	test,
	onClose,
}: {
	seminar: Seminar;
	test: SeminarTest;
	onClose: () => void;
}) {
	const [copied, setCopied] = useState(false);
	const [presenting, setPresenting] = useState(false);
	const url = publicUrl(testQrPath(test));
	const qrImage = useBrandedQrImage({
		value: url,
		title: test.title,
		lines: [seminar.title],
		caption: 'Quét mã → nhập họ tên → làm bài kiểm tra',
		filename: `QR ${test.title} - ${seminar.title}`,
	});

	const copy = () =>
		void navigator.clipboard?.writeText(url).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		});

	if (presenting)
		return (
			<SeminarQrPresentation
				seminar={seminar}
				path={testQrPath(test)}
				cta={`Quét mã QR, nhập họ tên để làm "${test.title}"`}
				onClose={() => setPresenting(false)}
			/>
		);

	return (
		<>
			<Modal
				open
				onClose={onClose}
				title='Mã QR làm bài'
				subtitle={test.title}
				size='sm'
				footer={
					<>
						<button
							type='button'
							className={styles.btnGhost}
							onClick={() => setPresenting(true)}
							style={{ marginRight: 'auto' }}
						>
							<MonitorSvg /> Trình chiếu
						</button>
						<button
							type='button'
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
					{!test.qr_enabled && (
						<div className={`${styles.noticeBox} ${styles.noticeWarn}`}>
							Đang tắt làm bài bằng QR chung — quét mã sẽ báo chưa mở. Bật ở "Cấu hình" của đề.
						</div>
					)}
					{test.qr_enabled && !test.test_open && (
						<div className={`${styles.noticeBox} ${styles.noticeWarn}`}>
							Đề đang tắt — người quét chỉ vào làm được khi đề được mở.
						</div>
					)}
					<BrandedQrCode
						value={url}
						size={240}
					/>
					<span className={styles.hint}>
						Quét mã → nhập họ tên → làm bài.{' '}
						{test.counts_for_cme
							? test.qr_counts_for_cme
								? 'Bài nộp kiểu này được tính vào điều kiện CME.'
								: 'Bài nộp kiểu này không tính vào điều kiện CME.'
							: ''}
					</span>
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
							aria-label='Sao chép link làm bài'
						>
							{copied ? <CheckSvg /> : <CopySvg />}
						</button>
					</div>
					{isLoopbackOrigin() && (
						<div className={`${styles.noticeBox} ${styles.noticeWarn}`}>
							Link đang trỏ tới localhost — điện thoại không mở được. Đặt VITE_PUBLIC_APP_URL hoặc mở trang quản trị
							bằng địa chỉ IP/domain.
						</div>
					)}
				</div>
			</Modal>
			{qrImage.sheet}
		</>
	);
}
