import { useId, useRef, useState, type ReactNode } from 'react';
import { FileSvg, UploadSvg } from '@/assets/icons';
import { checkRegistrationFile, formatFileSize } from '../../utils/registrationFiles';
import styles from '../../pages/PublicPortal.module.css';
import s from '../../pages/CourseRegisterPublic.module.css';

interface Props {
	kind: string;
	label: string;
	hint?: string;
	required: boolean;
	file: File | null;
	onChange: (f: File | null) => void;
	/** Lỗi từ bước (thiếu file…) — hiện dưới ô, đọc to cho trình đọc màn hình */
	error?: string;
	extensions: string[];
	maxSizeMB: number;
	/** Dòng trạng thái do máy chủ báo (dùng ở trang tra cứu) */
	status?: ReactNode;
	disabled?: boolean;
	/** Nút thao tác dưới cùng (vd "Nộp" ở trang tra cứu) */
	actions?: ReactNode;
}

// 1 ô nộp 1 loại hồ sơ: chọn / kéo thả / đổi / bỏ file. id gốc `f-file_<kind>` để form tìm ô lỗi đầu tiên
// và đưa focus tới nút "Chọn file" (phần tử đầu tiên bấm được trong ô).
export function FileSlot({
	kind,
	label,
	hint,
	required,
	file,
	onChange,
	error,
	extensions,
	maxSizeMB,
	status,
	disabled,
	actions,
}: Props) {
	const uid = useId();
	const inputRef = useRef<HTMLInputElement>(null);
	const [dragging, setDragging] = useState(false);
	const [pickError, setPickError] = useState('');
	const labelId = `${uid}-label`;
	const hintId = `${uid}-hint`;
	const errId = `${uid}-err`;
	const shownError = pickError || error;

	const take = (list: FileList | null | undefined) => {
		const picked = list?.[0];
		if (!picked) return;
		const problem =
			list.length > 1 ? 'Mỗi ô chỉ nhận 1 file' : checkRegistrationFile(picked, extensions, maxSizeMB);
		setPickError(problem ?? '');
		if (!problem) onChange(picked);
	};

	const describedBy = [hint ? hintId : '', shownError ? errId : ''].filter(Boolean).join(' ') || undefined;

	return (
		<div
			id={`f-file_${kind}`}
			className={`${s.slot} ${shownError ? s.slotError : ''}`}
		>
			<div className={s.slotHead}>
				<span
					id={labelId}
					className={s.slotLabel}
				>
					{label}
					{required && (
						<span
							className={styles.required}
							aria-hidden='true'
						>
							{' '}
							*
						</span>
					)}
				</span>
				{required && <span className={s.srOnly}>(bắt buộc)</span>}
			</div>
			{hint && (
				<p
					id={hintId}
					className={s.hint}
				>
					{hint}
				</p>
			)}
			{status && <div className={s.slotStatus}>{status}</div>}

			{file ? (
				<div className={s.slotFile}>
					<span
						className={s.slotFileIcon}
						aria-hidden='true'
					>
						<FileSvg />
					</span>
					<div className={s.slotFileInfo}>
						<div
							className={s.slotFileName}
							title={file.name}
						>
							{file.name}
						</div>
						<div className={s.slotFileSize}>{formatFileSize(file.size)}</div>
					</div>
					<button
						type='button'
						className={s.linkBtn}
						onClick={() => inputRef.current?.click()}
						disabled={disabled}
						aria-describedby={describedBy}
					>
						Đổi file
					</button>
					<button
						type='button'
						className={s.linkBtn}
						onClick={() => {
							setPickError('');
							onChange(null);
						}}
						disabled={disabled}
						aria-label={`Bỏ file ${file.name}`}
					>
						Bỏ
					</button>
				</div>
			) : (
				<div
					className={`${s.slotDrop} ${dragging ? s.slotDropActive : ''}`}
					onDragOver={(e) => {
						if (disabled) return;
						e.preventDefault();
						setDragging(true);
					}}
					onDragLeave={() => setDragging(false)}
					onDrop={(e) => {
						e.preventDefault();
						setDragging(false);
						if (!disabled) take(e.dataTransfer.files);
					}}
				>
					<span
						className={s.slotDropIcon}
						aria-hidden='true'
					>
						<UploadSvg />
					</span>
					<button
						type='button'
						className={s.ghostBtn}
						onClick={() => inputRef.current?.click()}
						disabled={disabled}
						aria-describedby={describedBy}
						aria-invalid={shownError ? true : undefined}
					>
						Chọn file
					</button>
					<span className={s.slotDropText}>hoặc kéo thả file vào đây</span>
				</div>
			)}
			<input
				ref={inputRef}
				type='file'
				hidden
				accept={extensions.join(',')}
				aria-labelledby={labelId}
				onChange={(e) => {
					take(e.target.files);
					e.target.value = '';
				}}
			/>
			<p className={s.slotLimit}>PDF, JPG hoặc PNG · tối đa {maxSizeMB} MB</p>
			{shownError && (
				<div
					id={errId}
					className={s.fieldError}
					role='alert'
				>
					{shownError}
				</div>
			)}
			{actions && <div className={s.slotActions}>{actions}</div>}
		</div>
	);
}
