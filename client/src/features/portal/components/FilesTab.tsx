import { BASE_URL } from '../../../lib/apiClient';
import type { TopicFile } from '../../topics/types/topic.type';
import {
	formatFileSize,
	getFileTypeColor,
	getMimeExtension,
} from '../../topics/utils/topicHelpers';
import styles from '../pages/TopicDetail.module.css';
import { DownloadIcon, TrashIcon, UploadIcon, XIcon } from './TopicIcons';

type Props = {
	files: TopicFile[];
	canUploadFiles: boolean;
	canDeleteFiles: boolean;
	fileInputRef: React.RefObject<HTMLInputElement | null>;
	pendingFiles: File[];
	setPendingFiles: React.Dispatch<React.SetStateAction<File[]>>;
	batchNote: string;
	setBatchNote: React.Dispatch<React.SetStateAction<string>>;
	uploading: boolean;
	uploadError: string;
	dragging: boolean;
	setDragging: React.Dispatch<React.SetStateAction<boolean>>;
	selectedIds: Set<string>;
	handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
	handleUpload: () => void;
	toggleSelect: (id: string) => void;
	toggleSelectAll: () => void;
	handleDeleteFile: (id: string) => void;
	handleBulkDelete: () => void;
	handleBulkDownload: () => void;
};

export default function FilesTab({
	files,
	canUploadFiles,
	canDeleteFiles,
	fileInputRef,
	pendingFiles,
	setPendingFiles,
	batchNote,
	setBatchNote,
	uploading,
	uploadError,
	dragging,
	setDragging,
	selectedIds,
	handleFileSelect,
	handleUpload,
	toggleSelect,
	toggleSelectAll,
	handleDeleteFile,
	handleBulkDelete,
	handleBulkDownload,
}: Props) {
	return (
		<>
			{canUploadFiles ? (
				<>
					<input
						ref={fileInputRef}
						type='file'
						multiple
						style={{ display: 'none' }}
						onChange={handleFileSelect}
					/>
					<div
						className={`${styles.uploadZone} ${dragging ? styles.uploadZoneActive : ''}`}
						onClick={() => fileInputRef.current?.click()}
						onDragOver={(e) => {
							e.preventDefault();
							setDragging(true);
						}}
						onDragLeave={() => setDragging(false)}
						onDrop={(e) => {
							e.preventDefault();
							setDragging(false);
							const f = Array.from(e.dataTransfer.files);
							if (f.length) setPendingFiles((p) => [...p, ...f]);
						}}
					>
						<div className={styles.uploadZoneIcon}>
							<UploadIcon />
						</div>
						<div className={styles.uploadZoneText}>
							Kéo thả file vào đây hoặc <span>chọn từ máy tính</span>
						</div>
						<div className={styles.uploadZoneHint}>
							PDF, Word, Excel, ZIP, hình ảnh — tối đa 50 MB/file
						</div>
					</div>
				</>
			) : (
				<div className={styles.noUploadNotice}>
					Không trong thời gian cho phép tải lên tài liệu.
				</div>
			)}

			{pendingFiles.length > 0 && (
				<div className={styles.pendingWrap}>
					<div className={styles.pendingHeader}>
						<span className={styles.pendingCount}>
							{pendingFiles.length} file đã chọn —{' '}
							{formatFileSize(pendingFiles.reduce((s, f) => s + f.size, 0))}{' '}
							tổng
						</span>
						<button
							className={styles.pendingClearBtn}
							onClick={() => setPendingFiles([])}
						>
							Xoá tất cả
						</button>
					</div>
					<div className={styles.pendingList}>
						{pendingFiles.map((f, i) => {
							const ext = f.name.split('.').pop()?.toLowerCase() ?? 'file';
							const color = getFileTypeColor(ext);
							return (
								<div
									key={i}
									className={styles.pendingRow}
								>
									<span
										className={styles.pendingExt}
										style={{ background: color + '1a', color }}
									>
										{ext.toUpperCase()}
									</span>
									<span className={styles.pendingName}>{f.name}</span>
									<span className={styles.pendingSize}>
										{formatFileSize(f.size)}
									</span>
									<button
										className={styles.pendingRemove}
										onClick={() =>
											setPendingFiles((p) => p.filter((_, j) => j !== i))
										}
									>
										<XIcon />
									</button>
								</div>
							);
						})}
					</div>
					<input
						className={styles.noteInput}
						placeholder='Ghi chú đợt tải lên (tuỳ chọn)'
						value={batchNote}
						onChange={(e) => setBatchNote(e.target.value)}
						disabled={uploading}
					/>
					{uploadError && <p className={styles.uploadError}>{uploadError}</p>}
					<button
						className={styles.btnPrimary}
						onClick={handleUpload}
						disabled={uploading}
					>
						<UploadIcon />{' '}
						{uploading
							? 'Đang tải lên...'
							: `Tải lên ${pendingFiles.length} file`}
					</button>
				</div>
			)}

			<div className={styles.filesHeader}>
				<label className={styles.filesSelectAll}>
					<input
						type='checkbox'
						className={styles.fileCheckbox}
						checked={files.length > 0 && selectedIds.size === files.length}
						ref={(el) => {
							if (el)
								el.indeterminate =
									selectedIds.size > 0 && selectedIds.size < files.length;
						}}
						onChange={toggleSelectAll}
					/>
				</label>
				<span className={styles.filesTitle}>
					Tài liệu đã tải lên — {files.length} file
				</span>
			</div>

			{selectedIds.size > 0 && (
				<div className={styles.bulkBar}>
					<span className={styles.bulkCount}>
						{selectedIds.size} file đã chọn
					</span>
					<button
						className={styles.bulkBtn}
						onClick={handleBulkDownload}
					>
						<DownloadIcon /> Tải xuống
					</button>
					{canDeleteFiles && (
						<button
							className={`${styles.bulkBtn} ${styles.bulkBtnDanger}`}
							onClick={handleBulkDelete}
						>
							<TrashIcon /> Xoá
						</button>
					)}
				</div>
			)}

			{files.length === 0 ? (
				<div className={styles.emptyFiles}>
					Chưa có tài liệu nào. Hãy tải lên file đầu tiên.
				</div>
			) : (
				<div className={styles.fileList}>
					{files.map((f) => {
						const ext =
							getMimeExtension(f.mime_type) ??
							f.file_name.split('.').pop() ??
							'file';
						const color = getFileTypeColor(ext);
						const isSelected = selectedIds.has(f.id);
						return (
							<div
								key={f.id}
								className={`${styles.fileRow} ${isSelected ? styles.fileRowSelected : ''}`}
							>
								<input
									type='checkbox'
									className={styles.fileCheckbox}
									checked={isSelected}
									onChange={() => toggleSelect(f.id)}
								/>
								<span
									className={styles.fileExt}
									style={{ background: color + '1a', color }}
								>
									{ext.toUpperCase()}
								</span>
								<div className={styles.fileInfo}>
									<div className={styles.fileName}>{f.file_name}</div>
									<div className={styles.fileMeta}>
										{formatFileSize(f.file_size)} · {f.uploaded_by_name} ·{' '}
										{new Date(f.created_at).toLocaleDateString('vi-VN')}
										{f.batch_note && (
											<span className={styles.batchNote}>{f.batch_note}</span>
										)}
									</div>
								</div>
								<div className={styles.fileActions}>
									<a
										href={`${BASE_URL}${f.file_url}`}
										download={f.file_name}
										className={styles.fileActionBtn}
										title='Tải xuống'
										onClick={(e) => e.stopPropagation()}
									>
										<DownloadIcon />
									</a>
									{canDeleteFiles && (
										<button
											className={`${styles.fileActionBtn} ${styles.fileActionDanger}`}
											title='Xoá file'
											onClick={() => handleDeleteFile(f.id)}
										>
											<TrashIcon />
										</button>
									)}
								</div>
							</div>
						);
					})}
				</div>
			)}
		</>
	);
}
