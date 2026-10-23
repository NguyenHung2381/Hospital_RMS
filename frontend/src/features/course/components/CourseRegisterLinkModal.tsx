import { useState } from 'react';
import { CheckSvg, CopySvg, DownloadSvg, LinkSvg, WarnSvg } from '@/assets/icons';
import { Button, Modal } from '@/shared/components';
import { BrandedQrCode, useBrandedQrImage } from '@/shared/components/BrandedQr';
import { formatDateOr } from '@/shared/utils/formatDate';
import { isLoopbackOrigin, publicUrl } from '@/shared/utils/publicUrl';
import type { Course } from '../types/course.type';
import styles from './CourseRegisterLinkModal.module.css';

type LinkCourse = Pick<Course, 'id' | 'name' | 'start_date' | 'is_public_registration' | 'enrollment_open'>;

// Trang đăng ký công khai cho học viên; ?khoa=<id> mở thẳng vào 1 khóa
const REGISTER_PATH = '/dang-ky-khoa-hoc';
const courseRegisterUrl = (courseId?: string) =>
	publicUrl(courseId ? `${REGISTER_PATH}?khoa=${encodeURIComponent(courseId)}` : REGISTER_PATH);

/**
 * Link + mã QR để học viên tự đăng ký khóa học. Không truyền `course` ⇒ link
 * chung (học viên chọn trong các khóa đang mở). Ảnh QR tải về có header bệnh
 * viện + tên khóa để in dán thông báo hoặc gửi qua Zalo.
 */
export function CourseRegisterLinkModal({ course, onClose }: { course?: LinkCourse | null; onClose: () => void }) {
	const [copied, setCopied] = useState(false);
	const url = courseRegisterUrl(course?.id);
	const start = course?.start_date ? `Khai giảng ${formatDateOr(course.start_date)}` : null;
	const qrImage = useBrandedQrImage({
		value: url,
		title: course?.name ?? 'Đăng ký khóa học đào tạo',
		lines: [
			course ? 'Quét mã để đăng ký khóa học' : 'Quét mã để xem các khóa đang mở và đăng ký',
			...(start ? [start] : []),
		],
		caption: url,
		filename: `QR dang ky - ${course?.name ?? 'khoa hoc'}`,
	});

	const copy = () =>
		void navigator.clipboard?.writeText(url).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 1800);
		});

	// Link vẫn mở được nhưng học viên sẽ không thấy khóa này trong các trường hợp dưới
	const warnings = [
		course &&
			!course.is_public_registration &&
			'Khóa đang để "Nội bộ" nên không hiện trên trang đăng ký. Bật "Đăng ký công khai" trong Sửa thông tin.',
		course &&
			course.is_public_registration &&
			!course.enrollment_open &&
			'Khóa đang ngoài thời gian nhận đăng ký nên học viên chưa đăng ký được. Kiểm tra lại "Mở đăng ký từ/đến".',
		isLoopbackOrigin() &&
			'Link đang trỏ tới localhost nên điện thoại không mở được. Đặt VITE_PUBLIC_APP_URL hoặc mở trang quản trị bằng địa chỉ IP/domain.',
	].filter((w): w is string => !!w);

	return (
		<>
			<Modal
				open
				onClose={onClose}
				title={course ? 'Link & mã QR đăng ký' : 'Link đăng ký khóa học'}
				subtitle={course?.name ?? 'Trang chung: học viên chọn 1 trong các khóa đang mở đăng ký'}
				size='sm'
				footer={
					<>
						<Button
							variant='secondary'
							icon={copied ? <CheckSvg /> : <CopySvg />}
							onClick={copy}
						>
							{copied ? 'Đã sao chép' : 'Sao chép link'}
						</Button>
						<Button
							icon={<DownloadSvg />}
							onClick={() => qrImage.save()}
							disabled={!qrImage.ready}
						>
							Tải ảnh QR
						</Button>
					</>
				}
			>
				<div className={styles.panel}>
					{warnings.map((w) => (
						<div
							key={w}
							className={styles.warn}
						>
							<WarnSvg /> <span>{w}</span>
						</div>
					))}
					<div className={styles.qrBox}>
						<BrandedQrCode
							value={url}
							size={220}
						/>
					</div>
					<span className={styles.hint}>Học viên quét mã → chọn chương trình → điền thông tin → gửi đăng ký</span>
					<div className={styles.linkRow}>
						<LinkSvg />
						<a
							href={url}
							target='_blank'
							rel='noreferrer'
							title='Mở trang đăng ký'
						>
							{url}
						</a>
						<button
							type='button'
							className={styles.copyBtn}
							onClick={copy}
							title='Sao chép link'
							aria-label='Sao chép link'
						>
							{copied ? <CheckSvg /> : <CopySvg />}
						</button>
					</div>
				</div>
			</Modal>
			{qrImage.sheet}
		</>
	);
}
