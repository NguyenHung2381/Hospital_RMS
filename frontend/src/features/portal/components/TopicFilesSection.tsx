import { TopicFileList } from '@/features/topics/components/TopicFileItem';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { FileTextSvg, UploadSvg, XSvg } from '@/assets/icons';
import type { TopicFile } from '../../topics/types/topic.type';
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

			<TopicFileList
				files={detailFiles}
				onView={setFileViewer}
			/>
		</div>
	);
}
