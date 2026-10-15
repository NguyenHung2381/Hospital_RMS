import { useUploadPolicy } from '@/shared/hooks/useUploadPolicy';
import type { ReactNode } from 'react';
import { formatDateTimeVN } from '../../../shared/utils/formatDate';
import type { ProgressTopic } from '../../council/api/councilApi';
import { BASE_URL } from '../../../shared/api/axios';
import { fmtSize, getFileIcon } from '../utils/councilProgressHelpers';
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
}

/** Khung danh sách file có tiêu đề, nút tải lên (tuỳ chọn) và nút xoá từng file (tuỳ chọn). */
function FileBox({
	title,
	emptyText,
	files,
	upload,
	bindInput,
	onDelete,
	deleteTitle,
}: {
	title: string;
	emptyText: string;
	files: ProgressFile[];
	/** Nút tải lên (chỉ thư ký). */
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
		<div className={styles.filesBox}>
			<div className={styles.filesTitle}>
				<span>{title}</span>
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
							className={styles.uploadBtn}
							disabled={upload.uploading}
							onClick={upload.onClick}
						>
							{upload.uploading ? 'Đang tải lên…' : upload.label}
						</button>
					</>
				)}
			</div>
			{files.length === 0 ? (
				<div className={styles.noFiles}>{emptyText}</div>
			) : (
				<div className={styles.fileList}>
					{files.map((f) => (
						<div
							key={f.id}
							className={styles.fileRow}
						>
							<a
								href={`${BASE_URL}${f.file_url}`}
								target='_blank'
								rel='noreferrer'
								className={styles.fileName}
							>
								<span className={styles.fileIcon}>{getFileIcon(f.file_name)}</span>
								<span className={styles.fileText}>{f.file_name}</span>
							</a>
							<span className={styles.fileMeta}>
								{fmtSize(f.file_size)} · {f.uploaded_by_name ?? ''} · {formatDateTimeVN(f.created_at)}
							</span>
							{onDelete && (
								<button
									className={styles.fileDelete}
									title={deleteTitle}
									onClick={() => onDelete(f.id)}
								>
									✕
								</button>
							)}
						</div>
					))}
				</div>
			)}
		</div>
	);
}

const Row = ({ children }: { children: ReactNode }) => <div className={styles.filesRow}>{children}</div>;

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
}: ProgressFilesSectionProps) {
	return (
		<>
			{/* Tài liệu đề tài (thuyết minh, hồ sơ... do chủ nhiệm tải lên) */}
			<Row>
				<FileBox
					title='📎 Tài liệu đề tài'
					emptyText='Chưa có tài liệu đề tài nào được tải lên.'
					files={t.topic_files}
				/>
			</Row>

			{/* File đánh giá & Biên bản — chỉ thư ký được tải lên / xoá */}
			<Row>
				<FileBox
					title='📁 File đánh giá'
					emptyText={
						isSecretary
							? 'Chưa có file — thư ký tải file đánh giá lên tại đây.'
							: 'Thư ký chưa tải file đánh giá lên.'
					}
					files={t.evaluation_files}
					bindInput={(el) => setFileInputRef(t.id, el)}
					upload={
						isSecretary
							? {
									onFiles: (files) => onUpload(t, files),
									onClick: () => clickFileInput(t.id),
									uploading: uploadingId === t.id,
									label: '+ Tải file lên',
								}
							: undefined
					}
					onDelete={isSecretary ? (id) => onDeleteFile(t, id) : undefined}
					deleteTitle='Xóa file'
				/>
				<FileBox
					title='🗂️ Biên bản hội đồng'
					emptyText={
						isSecretary
							? 'Chưa có biên bản — thư ký tải biên bản họp lên tại đây.'
							: 'Thư ký chưa tải biên bản lên.'
					}
					files={t.minutes_files}
					bindInput={(el) => setMinutesInputRef(t.id, el)}
					upload={
						isSecretary
							? {
									onFiles: (files) => onUploadMinutes(t, files),
									onClick: () => clickMinutesInput(t.id),
									uploading: uploadingMinutesId === t.id,
									label: '+ Tải biên bản',
								}
							: undefined
					}
					onDelete={isSecretary ? (id) => onDeleteMinutes(t, id) : undefined}
					deleteTitle='Xóa biên bản'
				/>
			</Row>
		</>
	);
}
