import { useEffect, useRef, useState } from 'react';
import { BASE_URL } from '../../../shared/api/axios';
import { getToken } from '../../../shared/utils/storage';
import styles from '../pages/Approval.module.css';

interface FileViewerModalProps {
	file: { url: string; name: string; isWord: boolean };
	onClose: () => void;
}

export function FileViewerModal({ file, onClose }: FileViewerModalProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const blobUrlRef = useRef<string | null>(null);
	const [renderState, setRenderState] = useState<'loading' | 'done' | 'error'>(
		'loading',
	);
	const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;

		const render = async () => {
			try {
				const token = getToken();
				const fetchUrl = file.url.startsWith('http')
					? file.url
					: `${BASE_URL}${file.url}`;
				const response = await fetch(fetchUrl, {
					headers: token ? { Authorization: `Bearer ${token}` } : {},
				});
				if (!response.ok) throw new Error(`${response.status}`);
				const buffer = await response.arrayBuffer();
				if (cancelled) return;

				if (file.isWord) {
					const { renderAsync } = await import('docx-preview');
					if (containerRef.current) {
						containerRef.current.innerHTML = '';
						await renderAsync(buffer, containerRef.current, undefined, {
							className: 'docxViewer',
							inWrapper: true,
							breakPages: true,
							useBase64URL: true,
						});
					}
				} else {
					const blob = new Blob([buffer], { type: 'application/pdf' });
					const url = URL.createObjectURL(blob);
					blobUrlRef.current = url;
					if (!cancelled) setPdfBlobUrl(url);
				}

				if (!cancelled) setRenderState('done');
			} catch {
				if (!cancelled) setRenderState('error');
			}
		};

		void render();
		return () => {
			cancelled = true;
			if (blobUrlRef.current) {
				URL.revokeObjectURL(blobUrlRef.current);
				blobUrlRef.current = null;
			}
		};
	}, [file.url, file.isWord]);

	return (
		<div
			className={styles.viewerBackdrop}
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<div className={styles.viewerModal}>
				<div className={styles.viewerHeader}>
					<span className={styles.viewerTitle}>{file.name}</span>
					<button
						className={styles.viewerClose}
						onClick={onClose}
					>
						✕
					</button>
				</div>

				{renderState === 'loading' && (
					<div className={styles.viewerStatus}>
						<span
							className={styles.spinner}
							style={{ borderTopColor: 'var(--color-primary)' }}
						/>
						Đang tải tài liệu...
					</div>
				)}
				{renderState === 'error' && (
					<div
						className={styles.viewerStatus}
						style={{ color: '#b91c1c' }}
					>
						Không thể tải tài liệu. Hãy thử tải về.
					</div>
				)}

				{file.isWord && (
					<div
						className={styles.viewerDocxWrap}
						style={{ display: renderState === 'done' ? 'block' : 'none' }}
					>
						<div ref={containerRef} />
					</div>
				)}

				{!file.isWord && renderState === 'done' && pdfBlobUrl && (
					<embed
						src={pdfBlobUrl}
						type='application/pdf'
						className={styles.viewerFrame}
					/>
				)}
			</div>
		</div>
	);
}
