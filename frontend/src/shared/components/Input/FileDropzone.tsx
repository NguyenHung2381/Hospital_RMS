import { useId, useRef, useState } from 'react';
import { FileSvg, UploadSvg, XSvg } from '@/assets/icons';
import styles from './FileDropzone.module.css';

interface FileDropzoneProps {
	/** File đang chọn (controlled) — null = chưa chọn. */
	value: File | null;
	onChange: (file: File | null) => void;
	/** Giống thuộc tính accept của <input type=file>, VD: '.xlsx' hoặc 'image/*,.pdf'. */
	accept?: string;
	/** Dòng gợi ý dưới tiêu đề, VD: "Chỉ nhận file .xlsx". Mặc định suy từ accept. */
	hint?: string;
	/** Giới hạn dung lượng (MB) — vượt thì báo lỗi, không nhận file. */
	maxSizeMB?: number;
	/** compact = 1 dòng gọn, dùng trong toolbar/hàng có nhiều input khác. */
	compact?: boolean;
	disabled?: boolean;
	id?: string;
	className?: string;
}

const fmtSize = (bytes: number) =>
	bytes < 1024
		? `${bytes} B`
		: bytes < 1024 * 1024
			? `${(bytes / 1024).toFixed(0)} KB`
			: `${(bytes / 1024 / 1024).toFixed(1)} MB`;

// Khớp file với chuỗi accept: đuôi (.xlsx), MIME đầy đủ (application/pdf) hoặc MIME nhóm (image/*)
const matchesAccept = (file: File, accept?: string) => {
	if (!accept) return true;
	const name = file.name.toLowerCase();
	const type = file.type.toLowerCase();
	return accept
		.split(',')
		.map((a) => a.trim().toLowerCase())
		.filter(Boolean)
		.some((a) =>
			a.startsWith('.')
				? name.endsWith(a)
				: a.endsWith('/*')
					? type.startsWith(a.slice(0, -1))
					: type === a,
		);
};

/**
 * Ô chọn file dùng chung: kéo-thả hoặc bấm để chọn, hiện tên + dung lượng file
 * đã chọn kèm nút đổi / bỏ. Thay cho <input type="file"> mặc định của trình duyệt.
 */
export function FileDropzone({
	value,
	onChange,
	accept,
	hint,
	maxSizeMB,
	compact = false,
	disabled = false,
	id,
	className,
}: FileDropzoneProps) {
	const autoId = useId();
	const inputId = id ?? autoId;
	const inputRef = useRef<HTMLInputElement>(null);
	const [dragOver, setDragOver] = useState(false);
	const [error, setError] = useState('');

	const pick = (file: File | null) => {
		// Reset input để chọn lại đúng file vừa bỏ vẫn kích hoạt onChange
		if (inputRef.current) inputRef.current.value = '';
		if (!file) {
			setError('');
			onChange(null);
			return;
		}
		if (!matchesAccept(file, accept)) {
			setError(`File "${file.name}" không đúng định dạng (${accept}).`);
			return;
		}
		if (maxSizeMB && file.size > maxSizeMB * 1024 * 1024) {
			setError(`File vượt quá ${maxSizeMB} MB.`);
			return;
		}
		setError('');
		onChange(file);
	};

	const open = () => !disabled && inputRef.current?.click();

	const hintText =
		hint ??
		[accept && `Định dạng: ${accept}`, maxSizeMB && `tối đa ${maxSizeMB} MB`]
			.filter(Boolean)
			.join(' · ');

	const input = (
		<input
			ref={inputRef}
			id={inputId}
			type='file'
			accept={accept}
			disabled={disabled}
			className={styles.nativeInput}
			onChange={(e) => pick(e.target.files?.[0] ?? null)}
		/>
	);

	const dropHandlers = {
		onDragOver: (e: React.DragEvent) => {
			e.preventDefault();
			if (!disabled) setDragOver(true);
		},
		onDragLeave: () => setDragOver(false),
		onDrop: (e: React.DragEvent) => {
			e.preventDefault();
			setDragOver(false);
			if (!disabled) pick(e.dataTransfer.files?.[0] ?? null);
		},
	};

	const rootClass = [
		styles.root,
		compact ? styles.compact : '',
		dragOver ? styles.dragOver : '',
		value ? styles.hasFile : '',
		disabled ? styles.disabled : '',
	]
		.filter(Boolean)
		.join(' ');

	return (
		<div className={className ? `${styles.wrap} ${className}` : styles.wrap}>
			{value ? (
				<div
					className={rootClass}
					{...dropHandlers}
				>
					{input}
					<span className={styles.fileIcon}>
						<FileSvg />
					</span>
					<span className={styles.fileInfo}>
						<span
							className={styles.fileName}
							title={value.name}
						>
							{value.name}
						</span>
						<span className={styles.fileMeta}>{fmtSize(value.size)}</span>
					</span>
					<button
						type='button'
						className={styles.linkBtn}
						onClick={open}
						disabled={disabled}
					>
						Đổi file
					</button>
					<button
						type='button'
						className={styles.removeBtn}
						onClick={() => pick(null)}
						disabled={disabled}
						title='Bỏ file'
						aria-label='Bỏ file'
					>
						<XSvg />
					</button>
				</div>
			) : (
				<label
					htmlFor={inputId}
					className={rootClass}
					{...dropHandlers}
				>
					{input}
					<span className={styles.uploadIcon}>
						<UploadSvg />
					</span>
					<span className={styles.texts}>
						<span className={styles.title}>
							<b>Bấm để chọn file</b> {compact ? 'hoặc kéo thả' : 'hoặc kéo thả vào đây'}
						</span>
						{hintText && !compact && <span className={styles.hint}>{hintText}</span>}
					</span>
				</label>
			)}
			{error && <div className={styles.error}>{error}</div>}
		</div>
	);
}
