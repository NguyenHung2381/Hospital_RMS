import { formatDateTimeVN } from '../../../shared/utils/formatDate';
import type { ProgressTopic } from '../../council/api/councilApi';
import { BASE_URL } from '../../../shared/api/axios';
import { fmtSize, getFileIcon } from '../utils/councilProgressHelpers';
import styles from '../pages/CouncilProgress.module.css';

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
			{/* ── Tài liệu đề tài (thuyết minh, hồ sơ... do chủ nhiệm tải lên) ── */}
			<div className={styles.filesRow}>
				<div className={styles.filesBox}>
					<div className={styles.filesTitle}>
						<span>📎 Tài liệu đề tài</span>
					</div>
					{t.topic_files.length === 0 ? (
						<div className={styles.noFiles}>
							Chưa có tài liệu đề tài nào được tải lên.
						</div>
					) : (
						<div className={styles.fileList}>
							{t.topic_files.map((f) => (
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
										<span className={styles.fileIcon}>
											{getFileIcon(f.file_name)}
										</span>
										<span className={styles.fileText}>{f.file_name}</span>
									</a>
									<span className={styles.fileMeta}>
										{fmtSize(f.file_size)} · {f.uploaded_by_name ?? ''} ·{' '}
										{formatDateTimeVN(f.created_at)}
									</span>
								</div>
							))}
						</div>
					)}
				</div>
			</div>

			{/* ── File đánh giá & Biên bản (Always visible at the bottom to fill empty space) ── */}
			<div className={styles.filesRow}>
				{/* File đánh giá */}
				<div className={styles.filesBox}>
					<div className={styles.filesTitle}>
						<span>📁 File đánh giá</span>
						{isSecretary && (
							<>
								<input
									ref={(el) => setFileInputRef(t.id, el)}
									type='file'
									multiple
									hidden
									onChange={(e) => onUpload(t, e.target.files)}
								/>
								<button
									className={styles.uploadBtn}
									disabled={uploadingId === t.id}
									onClick={() => clickFileInput(t.id)}
								>
									{uploadingId === t.id ? 'Đang tải lên…' : '+ Tải file lên'}
								</button>
							</>
						)}
					</div>
					{t.evaluation_files.length === 0 ? (
						<div className={styles.noFiles}>
							{isSecretary
								? 'Chưa có file — thư ký tải file đánh giá lên tại đây.'
								: 'Thư ký chưa tải file đánh giá lên.'}
						</div>
					) : (
						<div className={styles.fileList}>
							{t.evaluation_files.map((f) => (
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
										<span className={styles.fileIcon}>
											{getFileIcon(f.file_name)}
										</span>
										<span className={styles.fileText}>{f.file_name}</span>
									</a>
									<span className={styles.fileMeta}>
										{fmtSize(f.file_size)} · {f.uploaded_by_name ?? ''} ·{' '}
										{formatDateTimeVN(f.created_at)}
									</span>
									{isSecretary && (
										<button
											className={styles.fileDelete}
											title='Xóa file'
											onClick={() => onDeleteFile(t, f.id)}
										>
											✕
										</button>
									)}
								</div>
							))}
						</div>
					)}
				</div>

				{/* Biên bản hội đồng */}
				<div className={styles.filesBox}>
					<div className={styles.filesTitle}>
						<span>🗂️ Biên bản hội đồng</span>
						{isSecretary && (
							<>
								<input
									ref={(el) => setMinutesInputRef(t.id, el)}
									type='file'
									multiple
									hidden
									onChange={(e) => onUploadMinutes(t, e.target.files)}
								/>
								<button
									className={styles.uploadBtn}
									disabled={uploadingMinutesId === t.id}
									onClick={() => clickMinutesInput(t.id)}
								>
									{uploadingMinutesId === t.id
										? 'Đang tải lên…'
										: '+ Tải biên bản'}
								</button>
							</>
						)}
					</div>
					{t.minutes_files.length === 0 ? (
						<div className={styles.noFiles}>
							{isSecretary
								? 'Chưa có biên bản — thư ký tải biên bản họp lên tại đây.'
								: 'Thư ký chưa tải biên bản lên.'}
						</div>
					) : (
						<div className={styles.fileList}>
							{t.minutes_files.map((f) => (
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
										<span className={styles.fileIcon}>
											{getFileIcon(f.file_name)}
										</span>
										<span className={styles.fileText}>{f.file_name}</span>
									</a>
									<span className={styles.fileMeta}>
										{fmtSize(f.file_size)} · {f.uploaded_by_name ?? ''} ·{' '}
										{formatDateTimeVN(f.created_at)}
									</span>
									{isSecretary && (
										<button
											className={styles.fileDelete}
											title='Xóa biên bản'
											onClick={() => onDeleteMinutes(t, f.id)}
										>
											✕
										</button>
									)}
								</div>
							))}
						</div>
					)}
				</div>
			</div>
		</>
	);
}
