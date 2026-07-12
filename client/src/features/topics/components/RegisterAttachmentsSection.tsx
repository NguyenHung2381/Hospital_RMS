import type { RefObject } from 'react';
import { AlertSvg, PaperclipSvg, UploadSvg, XSvg } from '@/assets/icons';
import styles from '../pages/TopicRegister.module.css';

interface RegisterAttachmentsSectionProps {
	attachments: File[];
	fileError: string;
	isDragging: boolean;
	fileInputRef: RefObject<HTMLInputElement | null>;
	handleFiles: (files: FileList | null) => void;
	removeAttachment: (name: string) => void;
	setIsDragging: (v: boolean) => void;
}

export function RegisterAttachmentsSection({
	attachments,
	fileError,
	isDragging,
	fileInputRef,
	handleFiles,
	removeAttachment,
	setIsDragging,
}: RegisterAttachmentsSectionProps) {
	return (
		<div className={styles.formGroup}>
			<div
				className={`${styles.dropZone} ${isDragging ? styles.dropZoneActive : ''}`}
				onClick={() => fileInputRef.current?.click()}
				onDragOver={(e) => {
					e.preventDefault();
					setIsDragging(true);
				}}
				onDragLeave={() => setIsDragging(false)}
				onDrop={(e) => {
					e.preventDefault();
					setIsDragging(false);
					handleFiles(e.dataTransfer.files);
				}}
			>
				<span className={styles.dropZoneIcon}>
					<UploadSvg />
				</span>
				<span className={styles.dropZoneText}>
					Kéo thả file vào đây hoặc{' '}
					<span className={styles.dropZoneLink}>chọn file</span>
				</span>
				<span className={styles.dropZoneHint}>
					Dung lượng tối đa: 150MB mỗi file
				</span>
				<input
					ref={fileInputRef}
					type='file'
					multiple
					style={{ display: 'none' }}
					onChange={(e) => handleFiles(e.target.files)}
				/>
			</div>
			{fileError && (
				<div className={styles.formError}>
					<AlertSvg /> {fileError}
				</div>
			)}
			{attachments.length > 0 && (
				<div className={styles.fileList}>
					{attachments.map((f) => (
						<div
							key={f.name}
							className={styles.fileItem}
						>
							<span className={styles.fileItemIcon}>
								<PaperclipSvg />
							</span>
							<span className={styles.fileItemName}>{f.name}</span>
							<span className={styles.fileItemSize}>
								{(f.size / (1024 * 1024)).toFixed(1)} MB
							</span>
							<button
								type='button'
								className={styles.removeBtn}
								onClick={() => removeAttachment(f.name)}
								title='Xoá file'
							>
								<XSvg />
							</button>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
