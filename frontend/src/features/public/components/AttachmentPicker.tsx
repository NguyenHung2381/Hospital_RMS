import { useRef, useState } from 'react';
import { FileSvg, TrashSvg, UploadSvg } from '@/assets/icons';
import { useUploadPolicy } from '@/shared/hooks/useUploadPolicy';
import { PUBLIC_UPLOAD_MAX_FILES } from '../api/publicApi';
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

const formatSize = (bytes: number) =>
	bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export function AttachmentPicker<T extends string>({ value, onChange, typeOptions, defaultType, hint }: Props<T>) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [dragging, setDragging] = useState(false);
	const [warn, setWarn] = useState('');
	const policy = useUploadPolicy();

	const addFiles = (list: FileList | null) => {
		if (!list?.length) return;
		const problems: string[] = [];
		const next = [...value];
		for (const file of Array.from(list)) {
			if (next.length >= PUBLIC_UPLOAD_MAX_FILES) {
				problems.push(`Chỉ đính kèm tối đa ${PUBLIC_UPLOAD_MAX_FILES} file`);
				break;
			}
			const problem = policy.check(file);
			if (problem) {
				problems.push(problem);
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
					{hint && `${hint} · `}
					{policy.extensions.join(', ')} · Tối đa {PUBLIC_UPLOAD_MAX_FILES} file, mỗi file ≤{' '}
					{policy.maxSizeMB}MB
				</div>
				<input
					ref={inputRef}
					type='file'
					multiple
					hidden
					accept={policy.accept}
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
