import { DownloadSvg } from '@/assets/icons';
import { Modal } from '@/shared/components';
import { BrandedQrCode, useBrandedQrImage } from '@/shared/components/BrandedQr';
import { publicUrl } from '../../../shared/utils/publicUrl';
import type { Seminar, SeminarParticipant } from '../types/seminar.type';
import styles from '../pages/Seminar.module.css';

// Vé QR của 1 người đã tự đăng ký — khi người tham dự mất / không lưu vé, ban tổ
// chức mở vé ở đây để in / cho quét / gửi lại.
export function SeminarTicketQrModal({
	seminar,
	participant,
	onClose,
}: {
	seminar: Seminar;
	participant: SeminarParticipant & { ticket_code: string };
	onClose: () => void;
}) {
	const url = publicUrl(`/hoi-nghi/ve/${participant.ticket_code}`);
	const holder = `${participant.title_prefix ? `${participant.title_prefix} ` : ''}${participant.full_name}`;
	const qrImage = useBrandedQrImage({
		value: url,
		title: holder,
		lines: [seminar.title],
		caption: 'Vé tham dự hội nghị — đưa mã này cho ban tổ chức quét để điểm danh',
		filename: `ve-hoi-nghi-${participant.full_name}`,
	});

	return (
		<>
			<Modal
				open
				onClose={onClose}
				title='Vé QR điểm danh'
				subtitle={holder}
				size='sm'
				footer={
					<button
						className={styles.btnPrimary}
						onClick={() => qrImage.save()}
						disabled={!qrImage.ready}
					>
						<DownloadSvg /> Tải ảnh vé
					</button>
				}
			>
				<div className={styles.qrPanel}>
					<BrandedQrCode
						value={url}
						size={240}
					/>
					<span className={styles.hint}>Quét mã để điểm danh, sau đó người tham dự làm bài kiểm tra trên vé</span>
					<div className={styles.qrLink}>
						<a
							href={url}
							target='_blank'
							rel='noreferrer'
							title={url}
						>
							Mở trang vé
						</a>
					</div>
				</div>
			</Modal>
			{qrImage.sheet}
		</>
	);
}
