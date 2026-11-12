import { useRef, useState } from 'react';
import { FileSvg, TrashSvg, UploadSvg } from '@/assets/icons';
import { useUploadPolicy } from '@/shared/hooks/useUploadPolicy';
import { PUBLIC_UPLOAD_MAX_FILES } from '../api/publicApi';
import styles from '../pages/PublicPortal.module.css';

export interface Attachment {
	id: string;
	file: File;
}

interface Props {
	value: Attachment[];
	onChange: (next: Attachment[]) => void;
	hint?: string;
	/** Số file tối đa (mặc định PUBLIC_UPLOAD_MAX_FILES). 1 = chọn file mới thay file cũ. */
	maxFiles?: number;
	/** Chỉ nhận các đuôi này (VD ['.pdf']) — giao với định dạng cho phép của hệ thống. */
	extensions?: string[];
}

const formatSize = (bytes: number) =>
	bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export function AttachmentPicker({ value, onChange, hint, maxFiles = PUBLIC_UPLOAD_MAX_FILES, extensions }: Props) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [dragging, setDragging] = useState(false);
	const [warn, setWarn] = useState('');
	const policy = useUploadPolicy();
	const exts = extensions ?? policy.extensions;
	const accept = extensions ? extensions.join(',') : policy.accept;

	const addFiles = (list: FileList | null) => {
		if (!list?.length) return;
		const problems: string[] = [];
		// 1 file: chọn file mới thay file cũ
		const next = maxFiles === 1 ? [] : [...value];
		for (const file of Array.from(list)) {
			if (next.length >= maxFiles) {
				problems.push(maxFiles === 1 ? 'Chỉ đính kèm 1 file' : `Chỉ đính kèm tối đa ${maxFiles} file`);
				break;
			}
			const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
			const problem =
				extensions && !extensions.includes(ext) ? `"${file.name}": chỉ nhận ${extensions.join(', ')}` : policy.check(file);
			if (problem) {
				problems.push(problem);
				continue;
			}
			if (next.some((a) => a.file.name === file.name && a.file.size === file.size)) continue;
			next.push({
				id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
				file,
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
					{hint && `${hint} · `}
					{exts.join(', ')} · {maxFiles === 1 ? '1 file' : `Tối đa ${maxFiles} file`}, mỗi file ≤{' '}
					{policy.maxSizeMB}MB
				</div>
				<input
					ref={inputRef}
					type='file'
					multiple={maxFiles > 1}
					hidden
					accept={accept}
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
