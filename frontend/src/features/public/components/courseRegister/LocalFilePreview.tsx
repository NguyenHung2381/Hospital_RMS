import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import viewer from '@/shared/components/FileViewerModal/FileViewerModal.module.css';
import s from '../../pages/CourseRegisterPublic.module.css';
import { isImageFile, isPdfFile } from '../../utils/registrationFiles';

interface Props {
	file: File;
	/** URL blob: đã tạo sẵn cho file (ô FileSlot giữ và thu hồi) */
	url: string;
	onClose: () => void;
}

// Xem lại file người dùng vừa chọn (chưa gửi lên máy chủ) — đọc thẳng từ máy qua URL blob:.
// Không dùng FileViewerModal vì nó tải file từ máy chủ kèm token đăng nhập.
// CSP (nginx.conf) đã cho img-src / object-src blob:.
export function LocalFilePreview({ file, url, onClose }: Props) {
	const closeRef = useRef<HTMLButtonElement>(null);

	// Esc đóng; trả focus về nút đã mở; khóa cuộn trang nền
	useEffect(() => {
		const opener = document.activeElement as HTMLElement | null;
		closeRef.current?.focus();
		const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
		document.addEventListener('keydown', onKey);
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.removeEventListener('keydown', onKey);
			document.body.style.overflow = prev;
			opener?.focus?.();
		};
	}, [onClose]);

	const image = isImageFile(file);
	const pdf = isPdfFile(file);

	return createPortal(
		<div
			className={viewer.viewerBackdrop}
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<div
				className={viewer.viewerModal}
				role='dialog'
				aria-modal='true'
				aria-label={`Xem file ${file.name}`}
			>
				<div className={viewer.viewerHeader}>
					<span className={viewer.viewerTitle}>{file.name}</span>
					<div className={s.previewActions}>
						{/* Trình duyệt điện thoại thường không hiển thị PDF nhúng ⇒ cho mở tab riêng */}
						<a
							className={s.linkBtn}
							href={url}
							target='_blank'
							rel='noopener noreferrer'
						>
							Mở tab mới
						</a>
						<button
							ref={closeRef}
							type='button'
							className={viewer.viewerClose}
							onClick={onClose}
							aria-label='Đóng'
						>
							✕
						</button>
					</div>
				</div>
				{image ? (
					<div className={`${viewer.viewerDocxWrap} ${s.previewImageWrap}`}>
						<img
							src={url}
							alt={file.name}
							className={s.previewImage}
						/>
					</div>
				) : pdf ? (
					<embed
						src={url}
						type='application/pdf'
						className={viewer.viewerFrame}
					/>
				) : (
					<div className={viewer.viewerStatus}>Không xem trước được loại file này.</div>
				)}
			</div>
		</div>,
		document.body,
	);
}
