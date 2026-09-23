import type { Dispatch, RefObject, SetStateAction } from 'react';
import { DownloadSvg, EyeSvg, FileTextSvg, UploadSvg, XSvg } from '@/assets/icons';
import { BASE_URL } from '../../../shared/api/axios';
import { formatDate } from '../../../shared/utils/formatDate';
import type { TopicFile } from '../../topics/types/topic.type';
import { getFileTypeMeta, getFileViewerUrl } from '../utils/myTopicsHelpers';
import styles from '../pages/MyTopics.module.css';

interface TopicFilesSectionProps {
	detailFiles: TopicFile[];
	canUploadFiles: boolean;
	setFileViewer: (
		v: { url: string; name: string; isWord: boolean } | null,
	) => void;
	fileInputRef: RefObject<HTMLInputElement | null>;
	pendingFiles: File[];
	setPendingFiles: Dispatch<SetStateAction<File[]>>;
	batchNote: string;
	setBatchNote: (v: string) => void;
	uploadLoading: boolean;
	uploadError: string;
	handleUpload: () => void;
	formatFileSize: (size: number) => string;
}

export function TopicFilesSection({
	detailFiles,
	canUploadFiles,
	setFileViewer,
	fileInputRef,
	pendingFiles,
	setPendingFiles,
	batchNote,
	setBatchNote,
	uploadLoading,
	uploadError,
	handleUpload,
	formatFileSize,
}: TopicFilesSectionProps) {
	return (
		<div>
			<div className={styles.sectionLabel}>
				Tài liệu đính kèm ({detailFiles.length} tệp)
			</div>

			{canUploadFiles && (
				<div className={styles.uploadArea}>
					<div
						className={styles.uploadDropzone}
						onClick={() => fileInputRef.current?.click()}
						onDragOver={(e) => e.preventDefault()}
						onDrop={(e) => {
							e.preventDefault();
							const droppedFiles = Array.from(e.dataTransfer.files);
							setPendingFiles((prev) => [
								...prev,
								...droppedFiles,
							]);
						}}
					>
						<input
							ref={fileInputRef}
							type='file'
							multiple
							style={{ display: 'none' }}
							onChange={(e) => {
								const selectedFiles = Array.from(e.target.files ?? []);
								setPendingFiles((prev) => [
									...prev,
									...selectedFiles,
								]);
								e.target.value = '';
							}}
						/>
						<UploadSvg />
						<span>Kéo thả file vào đây hoặc chọn từ máy tính</span>
					</div>
					{pendingFiles.length > 0 && (
						<>
							<div className={styles.pendingList}>
								{pendingFiles.map((f, i) => (
									<div
										key={i}
										className={styles.pendingItem}
									>
										<FileTextSvg />
										<span className={styles.pendingName}>
											{f.name}
										</span>
										<span className={styles.pendingSize}>
											{formatFileSize(f.size)}
										</span>
										<button
											className={styles.pendingRemove}
											onClick={() =>
												setPendingFiles((prev) =>
													prev.filter((_, j) => j !== i),
												)
											}
											disabled={uploadLoading}
										>
											<XSvg />
										</button>
									</div>
								))}
							</div>

							<input
								className={styles.batchNoteInput}
								placeholder='Ghi chú đợt upload (tùy chọn)'
								value={batchNote}
								onChange={(e) => setBatchNote(e.target.value)}
								disabled={uploadLoading}
							/>

							<div className={styles.uploadFooter}>
								<button
									className={styles.btnUpload}
									onClick={() => void handleUpload()}
									disabled={uploadLoading}
								>
									{uploadLoading ? (
										<>
											<span className={styles.spinnerSm} />
											Đang tải lên...
										</>
									) : (
										<>
											<UploadSvg />
											Tải lên {pendingFiles.length} file
										</>
									)}
								</button>
							</div>
							{uploadError && (
								<div className={styles.uploadError}>
									{uploadError}
								</div>
							)}
						</>
					)}
				</div>
			)}

			{detailFiles.length === 0 ? (
				<div className={styles.filesEmpty}>
					Chưa có tài liệu nào được đính kèm
				</div>
			) : (
				<div className={styles.filesList}>
					{detailFiles.map((f) => {
						const meta = getFileTypeMeta(f);
						const viewerUrl = getFileViewerUrl(f);
						return (
							<div
								key={f.id}
								className={styles.fileItem}
							>
								<div
									className={`${styles.fileIcon} ${styles[meta.cls as keyof typeof styles]}`}
								>
									<FileTextSvg />
								</div>
								<div className={styles.fileInfo}>
									<div
										className={styles.fileName}
										title={f.file_name}
									>
										{f.file_name}
									</div>
									<div className={styles.fileMeta}>
										<span
											className={`${styles.fileTypeBadge} ${styles[meta.cls as keyof typeof styles]}`}
										>
											{meta.label}
										</span>
										· {formatFileSize(f.file_size)} ·{' '}
										{f.uploaded_by_name} ·{' '}
										{formatDate(f.created_at)}
									</div>
								</div>
								<div className={styles.fileActions}>
									{viewerUrl && (
										<button
											className={styles.btnFileView}
											onClick={() =>
												setFileViewer({
													url: viewerUrl,
													name: f.file_name,
													isWord: meta.label !== 'PDF',
												})
											}
										>
											<EyeSvg /> Xem
										</button>
									)}
									<a
										className={styles.btnFileDownload}
										href={`${BASE_URL}${f.file_url}`}
										download={f.file_name}
										target='_blank'
										rel='noreferrer'
									>
										<DownloadSvg />
									</a>
								</div>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
