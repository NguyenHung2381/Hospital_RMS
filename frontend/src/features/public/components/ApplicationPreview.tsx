import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import viewer from '@/shared/components/FileViewerModal/FileViewerModal.module.css';
import s from './ApplicationPreview.module.css';

interface Props {
	blob: Blob;
	title: string;
	onClose: () => void;
}

// Xem trước đơn đăng ký (.docx) bằng docx-preview và in từ chính bản xem trước.
// Không dùng FileViewerModal vì nó tải file bằng GET kèm token đăng nhập; đơn công khai
// lấy bằng POST nên blob đã có sẵn ở đây.
export function ApplicationPreview({ blob, title, onClose }: Props) {
	const bodyRef = useRef<HTMLDivElement>(null);
	const closeRef = useRef<HTMLButtonElement>(null);
	const [state, setState] = useState<'loading' | 'done' | 'error'>('loading');

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const { renderAsync } = await import('docx-preview');
				if (cancelled || !bodyRef.current) return;
				bodyRef.current.innerHTML = '';
				await renderAsync(blob, bodyRef.current, undefined, {
					className: 'docxViewer',
					inWrapper: true,
					breakPages: true,
					useBase64URL: true,
					// altChunk = HTML nhúng nguyên văn, đổ vào iframe cùng origin ⇒ không bật
					renderAltChunks: false,
				});
				if (!cancelled) setState('done');
			} catch {
				if (!cancelled) setState('error');
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [blob]);

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

	// In: ẩn toàn bộ ứng dụng, chỉ để bản xem trước (xem ApplicationPreview.module.css)
	const print = () => {
		document.body.classList.add('dtlt-printing');
		const done = () => {
			document.body.classList.remove('dtlt-printing');
			window.removeEventListener('afterprint', done);
		};
		window.addEventListener('afterprint', done);
		window.print();
	};

	return createPortal(
		<div
			className={`${viewer.viewerBackdrop} ${s.backdrop}`}
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<div
				className={`${viewer.viewerModal} ${s.modal}`}
				role='dialog'
				aria-modal='true'
				aria-label={title}
			>
				<div className={`${viewer.viewerHeader} ${s.toolbar}`}>
					<span className={viewer.viewerTitle}>{title}</span>
					<div className={s.toolbarActions}>
						<button
							type='button'
							className={s.printBtn}
							onClick={print}
							disabled={state !== 'done'}
						>
							In đơn
						</button>
						<button
							ref={closeRef}
							type='button'
							className={s.closeBtn}
							onClick={onClose}
						>
							Đóng
						</button>
					</div>
				</div>
				{state === 'loading' && (
					<div className={`${viewer.viewerStatus} ${s.status}`}>
						<span className={viewer.spinner} />
						Đang dựng bản xem trước...
					</div>
				)}
				{state === 'error' && (
					<div
						className={`${viewer.viewerStatus} ${s.status}`}
						role='alert'
					>
						Không dựng được bản xem trước. Hãy tải đơn về máy rồi mở bằng Word.
					</div>
				)}
				<div
					className={`${viewer.viewerDocxWrap} ${s.docWrap}`}
					style={{ display: state === 'done' ? 'block' : 'none' }}
				>
					<div ref={bodyRef} />
				</div>
			</div>
		</div>,
		document.body,
	);
}
