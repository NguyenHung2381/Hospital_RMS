import { DocumentView, type DocumentViewFile } from './DocumentView';
import styles from './FileViewerModal.module.css';

export { DocumentView } from './DocumentView';
export type { DocumentViewFile } from './DocumentView';

interface FileViewerModalProps {
	file: DocumentViewFile;
	onClose: () => void;
}

export function FileViewerModal({ file, onClose }: FileViewerModalProps) {
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
						type='button'
						className={styles.viewerClose}
						onClick={onClose}
						aria-label='Đóng'
					>
						<span aria-hidden='true'>✕</span>
					</button>
				</div>
				<DocumentView file={file} />
			</div>
		</div>
	);
}
