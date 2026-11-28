import { useUploadPolicy } from '@/shared/hooks/useUploadPolicy';
import { DownloadSvg, TrashSvg, UploadSvg } from '@/assets/icons';
import { formatDateTimeVN } from '../../../shared/utils/formatDate';
import type { ProgressTopic } from '../../council/api/councilApi';
import { BASE_URL } from '../../../shared/api/axios';
import { fileExt, fmtSize } from '../utils/councilProgressHelpers';
import styles from '../pages/CouncilProgress.module.css';

type ProgressFile = ProgressTopic['topic_files'][number];

interface ProgressFilesSectionProps {
	topic: ProgressTopic;
	isSecretary: boolean;
	setFileInputRef: (id: string, el: HTMLInputElement | null) => void;
	clickFileInput: (id: string) => void;
	uploadingId: string | null;
	onUpload: (t: ProgressTopic, files: FileList | null) => void;
	onDeleteFile: (t: ProgressTopic, fileId: string) => void;
	setMinutesInputRef: (id: string, el: HTMLInputElement | null) => void;
	clickMinutesInput: (id: string) => void;
	uploadingMinutesId: string | null;
	onUploadMinutes: (t: ProgressTopic, files: FileList | null) => void;
	onDeleteMinutes: (t: ProgressTopic, fileId: string) => void;
	/** Mở file vào khung "Đọc hồ sơ". */
	onOpen: (fileId: string) => void;
	/** File đang mở trong khung đọc. */
	activeFileId: string | null;
}

/** Một nhóm file: tiêu đề + số lượng, nút tải lên (chỉ thư ký), danh sách file. */
function FileGroup({
	title,
	emptyText,
	files,
	upload,
	bindInput,
	onDelete,
	deleteTitle,
	onOpen,
	activeFileId,
}: {
	onOpen: (fileId: string) => void;
	activeFileId: string | null;
	title: string;
	emptyText: string;
	files: ProgressFile[];
	upload?: {
		onFiles: (files: FileList | null) => void;
		onClick: () => void;
		uploading: boolean;
		label: string;
	};
	bindInput?: (el: HTMLInputElement | null) => void;
	onDelete?: (fileId: string) => void;
	deleteTitle?: string;
}) {
	const uploadPolicy = useUploadPolicy();
	return (
		<div className={styles.fileGroup}>
			<div className={styles.fileGroupHead}>
				<h4 className={styles.fileGroupTitle}>
					{title}
					{files.length > 0 && <span className={styles.fileCount}>{files.length}</span>}
				</h4>
				{upload && (
					<>
						<input
							ref={bindInput}
							type='file'
							accept={uploadPolicy.accept}
							multiple
							hidden
							onChange={(e) => upload.onFiles(e.target.files)}
						/>
						<button
							type='button'
							className={styles.uploadBtn}
							disabled={upload.uploading}
							onClick={upload.onClick}
						>
							<UploadSvg aria-hidden />
							{upload.uploading ? 'Đang tải…' : upload.label}
						</button>
					</>
				)}
			</div>
			{files.length === 0 ? (
				<p className={styles.fileEmpty}>{emptyText}</p>
			) : (
				<ul className={styles.fileList}>
					{files.map((f) => (
						<li
							key={f.id}
							className={`${styles.fileRow} ${f.id === activeFileId ? styles.fileRowActive : ''}`}
						>
							<span
								className={styles.fileExt}
								aria-hidden
							>
								{fileExt(f.file_name)}
							</span>
							<div className={styles.fileBody}>
								<button
									type='button'
									className={styles.fileName}
									title={`Đọc: ${f.file_name}`}
									aria-current={f.id === activeFileId ? 'true' : undefined}
									onClick={() => onOpen(f.id)}
								>
									{f.file_name}
								</button>
								<span className={styles.fileMeta}>
									{[fmtSize(f.file_size), f.uploaded_by_name, formatDateTimeVN(f.created_at)]
										.filter(Boolean)
										.join(' · ')}
								</span>
							</div>
							<a
								href={`${BASE_URL}${f.file_url}`}
								download={f.file_name}
								target='_blank'
								rel='noreferrer'
								className={styles.fileIconBtn}
								title='Tải về'
								aria-label={`Tải về: ${f.file_name}`}
							>
								<DownloadSvg aria-hidden />
							</a>
							{onDelete && (
								<button
									type='button'
									className={`${styles.fileIconBtn} ${styles.fileDelete}`}
									title={deleteTitle}
									aria-label={`${deleteTitle ?? 'Xóa file'}: ${f.file_name}`}
									onClick={() => onDelete(f.id)}
								>
									<TrashSvg aria-hidden />
								</button>
							)}
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

export function ProgressFilesSection({
	topic: t,
	isSecretary,
	setFileInputRef,
	clickFileInput,
	uploadingId,
	onUpload,
	onDeleteFile,
	setMinutesInputRef,
	clickMinutesInput,
	uploadingMinutesId,
	onUploadMinutes,
	onDeleteMinutes,
	onOpen,
	activeFileId,
}: ProgressFilesSectionProps) {
	const open = { onOpen, activeFileId };
	return (
		<section
			className={`${styles.panel} ${styles.filesPanel}`}
			aria-label='Tài liệu'
		>
			<header className={styles.panelHead}>
				<h3 className={styles.panelTitle}>Tài liệu</h3>
				{isSecretary && <span className={styles.panelHint}>Bạn là thư ký</span>}
			</header>

			{/* Thuyết minh, hồ sơ… do chủ nhiệm tải lên — đọc khi chấm */}
			<FileGroup
				{...open}
				title='Hồ sơ đề tài'
				emptyText='Chủ nhiệm chưa tải hồ sơ lên.'
				files={t.topic_files}
			/>

			{/* File đánh giá & biên bản — chỉ thư ký được tải lên / xóa */}
			<FileGroup
				{...open}
				title='File đánh giá'
				emptyText={isSecretary ? 'Chưa có — bạn tải file đánh giá lên tại đây.' : 'Thư ký chưa tải lên.'}
				files={t.evaluation_files}
				bindInput={(el) => setFileInputRef(t.id, el)}
				upload={
					isSecretary
						? {
								onFiles: (files) => onUpload(t, files),
								onClick: () => clickFileInput(t.id),
								uploading: uploadingId === t.id,
								label: 'Tải lên',
							}
						: undefined
				}
				onDelete={isSecretary ? (id) => onDeleteFile(t, id) : undefined}
				deleteTitle='Xóa file đánh giá'
			/>
			<FileGroup
				{...open}
				title='Biên bản hội đồng'
				emptyText={isSecretary ? 'Chưa có — bạn tải biên bản họp lên tại đây.' : 'Thư ký chưa tải lên.'}
				files={t.minutes_files}
				bindInput={(el) => setMinutesInputRef(t.id, el)}
				upload={
					isSecretary
						? {
								onFiles: (files) => onUploadMinutes(t, files),
								onClick: () => clickMinutesInput(t.id),
								uploading: uploadingMinutesId === t.id,
								label: 'Tải lên',
							}
						: undefined
				}
				onDelete={isSecretary ? (id) => onDeleteMinutes(t, id) : undefined}
				deleteTitle='Xóa biên bản'
			/>
		</section>
	);
}
