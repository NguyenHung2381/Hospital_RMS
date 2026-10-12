import { DownloadSvg, EyeSvg, FileTextSvg } from '@/assets/icons';
import { BASE_URL } from '../../../shared/api/endpoints';
import { formatDate } from '../../../shared/utils/formatDate';
import type { TopicFile } from '../types/topic.type';
import { formatFileSize } from '../utils/topicHelpers';
import styles from './TopicFileItem.module.css';

type FileKind = 'pdf' | 'word' | 'excel' | 'image' | 'other';

const KIND_LABEL: Record<FileKind, string> = {
	pdf: 'PDF',
	word: 'Word',
	excel: 'Excel',
	image: 'Ảnh',
	other: 'Tệp',
};

function fileKind(file: TopicFile): FileKind {
	const mime = file.mime_type ?? '';
	const name = file.file_name.toLowerCase();
	if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
	if (mime.includes('wordprocessingml') || /\.docx?$/.test(name)) return 'word';
	if (mime.includes('spreadsheetml') || /\.xlsx?$/.test(name)) return 'excel';
	if (mime.startsWith('image/')) return 'image';
	return 'other';
}

export interface FileViewTarget {
	url: string;
	name: string;
	isWord: boolean;
}

/** Một tài liệu đính kèm của đề tài: icon loại file, tên, dung lượng/người tải/ngày, nút Xem + Tải. */
export function TopicFileItem({
	file,
	onView,
}: {
	file: TopicFile;
	/** Mở trình xem (PDF / Word / ảnh). */
	onView: (target: FileViewTarget) => void;
}) {
	const kind = fileKind(file);
	const viewable = kind === 'pdf' || kind === 'word' || kind === 'image';
	return (
		<div className={styles.fileItem}>
			<div className={`${styles.fileIcon} ${styles[kind]}`}>
				<FileTextSvg />
			</div>
			<div className={styles.fileInfo}>
				<div
					className={styles.fileName}
					title={file.file_name}
				>
					{file.file_name}
				</div>
				<div className={styles.fileMeta}>
					<span className={`${styles.fileTypeBadge} ${styles[kind]}`}>{KIND_LABEL[kind]}</span>·{' '}
					{formatFileSize(file.file_size)} · {file.uploaded_by_name} · {formatDate(file.created_at)}
				</div>
			</div>
			<div className={styles.fileActions}>
				{viewable && (
					<button
						className={styles.btnFileView}
						onClick={() => onView({ url: file.file_url, name: file.file_name, isWord: kind === 'word' })}
					>
						<EyeSvg /> Xem
					</button>
				)}
				<a
					className={styles.btnFileDownload}
					href={`${BASE_URL}${file.file_url}`}
					download={file.file_name}
					target='_blank'
					rel='noreferrer'
				>
					<DownloadSvg />
				</a>
			</div>
		</div>
	);
}

/** Danh sách tài liệu đính kèm (kèm trạng thái rỗng). */
export function TopicFileList({
	files,
	onView,
}: {
	files: TopicFile[];
	onView: (target: FileViewTarget) => void;
}) {
	if (files.length === 0) return <div className={styles.filesEmpty}>Chưa có tài liệu nào được đính kèm</div>;
	return (
		<div className={styles.filesList}>
			{files.map((f) => (
				<TopicFileItem
					key={f.id}
					file={f}
					onView={onView}
				/>
			))}
		</div>
	);
}
