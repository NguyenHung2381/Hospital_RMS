import { useUploadPolicy } from '@/shared/hooks/useUploadPolicy';
import { notify } from '@/shared/utils/feedback';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { BASE_URL } from '../../../shared/api/axios';
import styles from '../pages/Topic.module.css';
import type { TopicFile } from '../types/topic.type';
import {
	formatFileSize,
	getFileTypeColor,
	getMimeExtension,
} from '../utils/topicHelpers';
import { formatDateVN } from '../../../shared/utils/formatDate';
import { DocSvg as IcDoc, DownloadSvg as IcDownload, PlusSvg as IcPlus, TrashSvg as IcTrash, XSvg as IcX } from '@/assets/icons';

interface DrawerFilesTabProps {
	files: TopicFile[];
	fileInputRef: RefObject<HTMLInputElement | null>;
	pendingFiles: File[];
	setPendingFiles: Dispatch<SetStateAction<File[]>>;
	batchNote: string;
	setBatchNote: (v: string) => void;
	uploading: boolean;
	uploadError: string;
	dragging: boolean;
	setDragging: (v: boolean) => void;
	selectedIds: Set<string>;
	removePending: (idx: number) => void;
	toggleSelect: (id: string) => void;
	toggleSelectAll: () => void;
	handleDeleteFile: (file: TopicFile) => void;
	handleBulkDelete: () => void;
	handleBulkDownload: () => void;
	setShowUploadConfirm: (v: boolean) => void;
	setSelectedIds: Dispatch<SetStateAction<Set<string>>>;
}

export function DrawerFilesTab({
	files,
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
	removePending,
	toggleSelect,
	toggleSelectAll,
	handleDeleteFile,
	handleBulkDelete,
	handleBulkDownload,
	setShowUploadConfirm,
	setSelectedIds,
}: DrawerFilesTabProps) {
	const uploadPolicy = useUploadPolicy();
	// Kiểm tra định dạng / dung lượng ngay lúc chọn — file sai báo luôn, không đưa vào danh sách chờ
	const addFiles = (list: File[]) => {
		const valid = uploadPolicy.filterValid(list, notify.error);
		if (valid.length) setPendingFiles((prev) => [...prev, ...valid]);
	};
	return (
		<>
			<input
				ref={fileInputRef}
				type='file'
				accept={uploadPolicy.accept}
				multiple
				style={{ display: 'none' }}
				onChange={(e) => {
					addFiles(Array.from(e.target.files ?? []));
					e.target.value = '';
				}}
			/>
			<button
				type='button'
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
					addFiles(Array.from(e.dataTransfer.files));
				}}
			>
				<div className={styles.uploadZoneIcon}>
					<IcPlus />
				</div>
				<div className={styles.uploadZoneText}>
					Kéo thả file vào đây hoặc <span>chọn từ máy tính</span>
				</div>
				<div className={styles.uploadZoneHint}>
					Tối đa {uploadPolicy.maxSizeMB} MB mỗi file
				</div>
				<div className={styles.uploadZoneFormats}>
					{uploadPolicy.extensions.map((ext) => (
						<span
							key={ext}
							className={styles.formatBadge}
						>
							{ext.slice(1)}
						</span>
					))}
				</div>
			</button>

			{pendingFiles.length > 0 && (
				<div className={styles.uploadPendingWrap}>
					<div className={styles.uploadPendingHeader}>
						<span className={styles.uploadPendingCount}>
							{pendingFiles.length} file đã chọn
							<span className={styles.uploadPendingDot} />
							{formatFileSize(
								pendingFiles.reduce((s, f) => s + f.size, 0),
							)}{' '}
							tổng
						</span>
						<button
							type='button'
							className={styles.uploadClearAll}
							onClick={() => setPendingFiles([])}
							disabled={uploading}
						>
							Xóa tất cả
						</button>
					</div>

					<div className={styles.uploadPendingList}>
						{pendingFiles.map((f, i) => {
							const ext = f.name.split('.').pop()?.toLowerCase() ?? 'file';
							const color = getFileTypeColor(ext);
							return (
								<div
									key={i}
									className={styles.uploadPendingRow}
								>
									<div
										className={styles.uploadPendingBadge}
										style={{ background: color + '1a', color }}
									>
										{ext.toUpperCase()}
									</div>
									<span className={styles.uploadPendingName}>{f.name}</span>
									<span className={styles.uploadPendingSize}>
										{formatFileSize(f.size)}
									</span>
									<button
										type='button'
										className={styles.uploadPendingRemove}
										onClick={() => removePending(i)}
										title='Bỏ file này'
										aria-label={`Bỏ file ${f.name} khỏi danh sách tải lên`}
										disabled={uploading}
									>
										<IcX />
									</button>
								</div>
							);
						})}
					</div>

					<input
						className={styles.formInput}
						aria-label='Ghi chú lần tải lên'
						placeholder='Ghi chú lần tải lên (tùy chọn)'
						value={batchNote}
						onChange={(e) => setBatchNote(e.target.value)}
						disabled={uploading}
					/>

					{uploadError && <p className={styles.uploadError}>{uploadError}</p>}

					<button
						type='button'
						className={styles.btnPrimary}
						style={{ width: '100%' }}
						onClick={() => setShowUploadConfirm(true)}
						disabled={uploading}
					>
						{uploading ? (
							<>
								<span className={styles.spinner} />
								<span>Đang tải lên...</span>
							</>
						) : (
							<>
								<IcPlus />
								<span>Tải lên {pendingFiles.length} file</span>
							</>
						)}
					</button>
				</div>
			)}

			<div
				className={styles.fileListHeader}
				style={{ marginTop: 'var(--space-2)' }}
			>
				<label
					className={styles.fileSelectAllWrap}
					title='Chọn tất cả'
				>
					<input
						type='checkbox'
						aria-label='Chọn tất cả file'
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
				<span
					className={styles.drawerSection}
					style={{ margin: 0, flex: 1 }}
				>
					Tài liệu đã tải lên — {files.length} file
				</span>
			</div>

			{selectedIds.size > 0 && (
				<div className={styles.fileBulkBar}>
					<span className={styles.fileBulkCount}>
						{selectedIds.size} file đã chọn
					</span>
					<button
						type='button'
						className={styles.fileBulkBtn}
						onClick={handleBulkDownload}
					>
						<IcDownload /> Tải về
					</button>
					<button
						type='button'
						className={`${styles.fileBulkBtn} ${styles.fileBulkBtnDanger}`}
						onClick={handleBulkDelete}
					>
						<IcTrash /> Xóa
					</button>
					<button
						type='button'
						className={styles.fileBulkClear}
						onClick={() => setSelectedIds(new Set())}
						title='Bỏ chọn'
						aria-label='Bỏ chọn tất cả file'
					>
						<IcX />
					</button>
				</div>
			)}

			{files.length === 0 ? (
				<div className={styles.emptyState}>
					<div className={styles.emptyIcon}>
						<IcDoc />
					</div>
					<div className={styles.emptyTitle}>Chưa có tài liệu</div>
					<div className={styles.emptyDesc}>
						Tải lên file đầu tiên bằng khu vực phía trên
					</div>
				</div>
			) : (
				<div className={styles.fileList}>
					{files.map((f) => {
						const ext = getMimeExtension(f.mime_type);
						const color = getFileTypeColor(ext);
						const uploadedDate = formatDateVN(f.created_at);
						const isSelected = selectedIds.has(f.id);
						return (
							<label
								key={f.id}
								className={`${styles.fileRow} ${isSelected ? styles.fileRowSelected : ''}`}
							>
								<input
									type='checkbox'
									className={styles.fileCheckbox}
									checked={isSelected}
									aria-label={`Chọn file ${f.file_name}`}
									onChange={() => toggleSelect(f.id)}
								/>
								<div
									className={styles.fileRowBadge}
									style={{ background: color + '1a', color }}
								>
									{ext.toUpperCase()}
								</div>
								<div className={styles.fileRowInfo}>
									<div className={styles.fileRowName}>{f.file_name}</div>
									<div className={styles.fileRowMeta}>
										<span>{formatFileSize(f.file_size)}</span>
										<span className={styles.cfmMetaDot} />
										<span>{f.uploaded_by_name}</span>
										<span className={styles.cfmMetaDot} />
										<span>{uploadedDate}</span>
										{f.batch_note && (
											<>
												<span className={styles.cfmMetaDot} />
												<span style={{ fontStyle: 'italic' }}>
													{f.batch_note}
												</span>
											</>
										)}
									</div>
								</div>
								<div className={styles.fileRowActions}>
									<a
										href={`${BASE_URL}${f.file_url}`}
										download={f.file_name}
										target='_blank'
										rel='noreferrer'
										className={styles.fileActionBtn}
										title='Tải về'
										aria-label={`Tải về ${f.file_name}`}
									>
										<IcDownload />
									</a>
									<button
										type='button'
										className={`${styles.fileActionBtn} ${styles.fileActionDanger}`}
										title='Xóa file'
										aria-label={`Xóa file ${f.file_name}`}
										onClick={() => handleDeleteFile(f)}
									>
										<IcTrash />
									</button>
								</div>
							</label>
						);
					})}
				</div>
			)}
		</>
	);
}
