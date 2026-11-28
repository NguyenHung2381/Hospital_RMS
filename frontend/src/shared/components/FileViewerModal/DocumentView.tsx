import { useEffect, useRef, useState } from 'react';
import { BASE_URL } from '../../api/axios';
import { getToken } from '../../utils/storage';
import styles from './FileViewerModal.module.css';

export interface DocumentViewFile {
	url: string;
	name: string;
	isWord: boolean;
}

/**
 * Phần thân trình xem tài liệu (PDF / Word / ảnh) — lấp đầy khung cha (flex cột).
 * Dùng trong FileViewerModal và ở các khung đọc nhúng trong trang.
 */
export function DocumentView({ file }: { file: DocumentViewFile }) {
	const containerRef = useRef<HTMLDivElement>(null);
	const blobUrlRef = useRef<string | null>(null);
	const [renderState, setRenderState] = useState<'loading' | 'done' | 'error'>('loading');
	const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
	const [imageBlobUrl, setImageBlobUrl] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		// eslint-disable-next-line react-hooks/set-state-in-effect
		setRenderState('loading');
		setPdfBlobUrl(null);
		setImageBlobUrl(null);

		const render = async () => {
			try {
				const token = getToken();
				const fetchUrl = file.url.startsWith('http') ? file.url : `${BASE_URL}${file.url}`;
				const response = await fetch(fetchUrl, {
					headers: token ? { Authorization: `Bearer ${token}` } : {},
				});
				if (!response.ok) throw new Error(`${response.status}`);
				const contentType = response.headers.get('content-type') ?? '';
				const buffer = await response.arrayBuffer();
				if (cancelled) return;

				if (contentType.startsWith('image/')) {
					const url = URL.createObjectURL(new Blob([buffer], { type: contentType }));
					blobUrlRef.current = url;
					setImageBlobUrl(url);
				} else if (file.isWord) {
					const { renderAsync } = await import('docx-preview');
					if (cancelled) return;
					if (containerRef.current) {
						containerRef.current.innerHTML = '';
						await renderAsync(buffer, containerRef.current, undefined, {
							className: 'docxViewer',
							inWrapper: true,
							breakPages: true,
							useBase64URL: true,
							// altChunk = HTML nhúng nguyên văn trong .docx, docx-preview đổ vào iframe
							// srcdoc cùng origin ứng dụng ⇒ file tải lên chạy được script nếu thiếu CSP.
							renderAltChunks: false,
						});
					}
				} else {
					const blob = new Blob([buffer], { type: 'application/pdf' });
					const url = URL.createObjectURL(blob);
					blobUrlRef.current = url;
					setPdfBlobUrl(url);
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
		<div className={styles.viewerBody}>
			{renderState === 'loading' && (
				<div className={styles.viewerStatus}>
					<span className={styles.spinner} />
					Đang tải tài liệu...
				</div>
			)}
			{renderState === 'error' && (
				<div
					className={styles.viewerStatus}
					style={{ color: 'var(--tone-red-fg)' }}
				>
					Không thể tải tài liệu. Hãy thử tải về.
				</div>
			)}

			{imageBlobUrl && (
				<div className={styles.viewerDocxWrap}>
					<img
						src={imageBlobUrl}
						alt={file.name}
						style={{ display: 'block', maxWidth: '100%', margin: '0 auto' }}
					/>
				</div>
			)}

			{file.isWord && !imageBlobUrl && (
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
					title={file.name}
					className={styles.viewerFrame}
				/>
			)}
		</div>
	);
}
