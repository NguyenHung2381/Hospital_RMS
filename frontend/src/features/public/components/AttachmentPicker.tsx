import { useRef, useState } from 'react';
import { FileSvg, TrashSvg, UploadSvg } from '@/assets/icons';
import { PUBLIC_UPLOAD_ACCEPT, PUBLIC_UPLOAD_MAX_FILES, PUBLIC_UPLOAD_MAX_MB } from '../api/publicApi';
import styles from '../pages/PublicPortal.module.css';

export interface Attachment<T extends string = string> {
	id: string;
	file: File;
	/** Loại hồ sơ — chỉ dùng khi truyền `typeOptions` */
	type?: T;
}

interface Props<T extends string> {
	value: Attachment<T>[];
	onChange: (next: Attachment<T>[]) => void;
	/** Có thì mỗi file có ô chọn loại hồ sơ (VD: CCCD, bằng cấp...) */
	typeOptions?: { value: T; label: string }[];
	defaultType?: T;
	hint?: string;
}

const ACCEPTED = new Set(PUBLIC_UPLOAD_ACCEPT.split(','));
const extOf = (name: string) => {
	const i = name.lastIndexOf('.');
	return i >= 0 ? name.slice(i).toLowerCase() : '';
};
const formatSize = (bytes: number) =>
	bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export function AttachmentPicker<T extends string>({ value, onChange, typeOptions, defaultType, hint }: Props<T>) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [dragging, setDragging] = useState(false);
	const [warn, setWarn] = useState('');

	const addFiles = (list: FileList | null) => {
		if (!list?.length) return;
		const problems: string[] = [];
		const next = [...value];
		for (const file of Array.from(list)) {
			if (next.length >= PUBLIC_UPLOAD_MAX_FILES) {
				problems.push(`Chỉ đính kèm tối đa ${PUBLIC_UPLOAD_MAX_FILES} file`);
				break;
			}
			if (!ACCEPTED.has(extOf(file.name))) {
				problems.push(`"${file.name}" không đúng định dạng cho phép`);
				continue;
			}
			if (file.size > PUBLIC_UPLOAD_MAX_MB * 1048576) {
				problems.push(`"${file.name}" vượt quá ${PUBLIC_UPLOAD_MAX_MB}MB`);
				continue;
			}
			if (next.some((a) => a.file.name === file.name && a.file.size === file.size)) continue;
			next.push({
				id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
				file,
				type: defaultType,
			});
		}
		setWarn(problems.join(' · '));
		onChange(next);
	};

	return (
		<div>
			<div
				className={`${styles.dropzone} ${dragging ? styles.dropzoneActive : ''}`}
				role='button'
				tabIndex={0}
				onClick={() => inputRef.current?.click()}
				onKeyDown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						inputRef.current?.click();
					}
				}}
				onDragOver={(e) => {
					e.preventDefault();
					setDragging(true);
				}}
				onDragLeave={() => setDragging(false)}
				onDrop={(e) => {
					e.preventDefault();
					setDragging(false);
					addFiles(e.dataTransfer.files);
				}}
			>
				<span className={styles.dropzoneIcon}>
					<UploadSvg />
				</span>
				<div className={styles.dropzoneText}>
					<strong>Bấm để chọn file</strong> hoặc kéo thả file vào đây
				</div>
				<div className={styles.dropzoneHint}>
					{hint ?? 'PDF, Word, Excel, ảnh, ZIP...'} · Tối đa {PUBLIC_UPLOAD_MAX_FILES} file, mỗi file ≤{' '}
					{PUBLIC_UPLOAD_MAX_MB}MB
				</div>
				<input
					ref={inputRef}
					type='file'
					multiple
					hidden
					accept={PUBLIC_UPLOAD_ACCEPT}
					onChange={(e) => {
						addFiles(e.target.files);
						e.target.value = '';
					}}
				/>
			</div>
			{warn && <div className={styles.fieldError}>{warn}</div>}

			{value.length > 0 && (
				<ul className={styles.fileList}>
					{value.map((a) => (
						<li
							key={a.id}
							className={styles.fileItem}
						>
							<span className={styles.fileIcon}>
								<FileSvg />
							</span>
							<div className={styles.fileInfo}>
								<div
									className={styles.fileName}
									title={a.file.name}
								>
									{a.file.name}
								</div>
								<div className={styles.fileSize}>{formatSize(a.file.size)}</div>
							</div>
							{typeOptions && (
								<select
									className={`${styles.select} ${styles.fileType}`}
									value={a.type ?? ''}
									aria-label='Loại hồ sơ'
									onChange={(e) =>
										onChange(value.map((x) => (x.id === a.id ? { ...x, type: e.target.value as T } : x)))
									}
								>
									{typeOptions.map((o) => (
										<option
											key={o.value}
											value={o.value}
										>
											{o.label}
										</option>
									))}
								</select>
							)}
							<button
								type='button'
								className={styles.fileRemove}
								aria-label={`Bỏ file ${a.file.name}`}
								onClick={() => onChange(value.filter((x) => x.id !== a.id))}
							>
								<TrashSvg />
							</button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
