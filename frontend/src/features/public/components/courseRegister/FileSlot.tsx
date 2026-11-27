import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { EyeSvg, FileSvg, UploadSvg } from '@/assets/icons';
import { checkRegistrationFile, formatFileSize, isImageFile } from '../../utils/registrationFiles';
import { LocalFilePreview } from './LocalFilePreview';
import styles from '../../pages/PublicPortal.module.css';
import s from '../../pages/CourseRegisterPublic.module.css';

interface Props {
	kind: string;
	label: string;
	hint?: string;
	required: boolean;
	/** Không bắt buộc lúc gửi — hiện nhãn "Có thể nộp sau" */
	later?: boolean;
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
	later,
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
	const [previewing, setPreviewing] = useState(false);
	const closePreview = useCallback(() => setPreviewing(false), []);

	// URL blob: cho file đang chọn — dùng cho ảnh thu nhỏ và hộp xem lại; thu hồi khi đổi/bỏ file.
	// Ghép kèm file để không dùng nhầm URL của file trước trong lúc effect chưa chạy lại.
	const [blob, setBlob] = useState<{ file: File; url: string } | null>(null);
	useEffect(() => {
		if (!file) return;
		const url = URL.createObjectURL(file);
		// Đồng bộ với tài nguyên ngoài React (URL blob phải thu hồi khi đổi file / gỡ ô)
		// eslint-disable-next-line react-hooks/set-state-in-effect
		setBlob({ file, url });
		return () => URL.revokeObjectURL(url);
	}, [file]);
	const fileUrl = blob && blob.file === file ? blob.url : null;
	const isImage = !!file && isImageFile(file);

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
				{!required && later && <span className={s.optionalTag}>Có thể nộp sau</span>}
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
					{isImage && fileUrl ? (
						<button
							type='button'
							className={s.slotThumb}
							onClick={() => setPreviewing(true)}
							aria-label={`Xem ảnh ${file.name}`}
						>
							<img
								src={fileUrl}
								alt=''
							/>
						</button>
					) : (
						<span
							className={s.slotFileIcon}
							aria-hidden='true'
						>
							<FileSvg />
						</span>
					)}
					<div className={s.slotFileInfo}>
						<div
							className={s.slotFileName}
							title={file.name}
						>
							{file.name}
						</div>
						<div className={s.slotFileSize}>{formatFileSize(file.size)}</div>
					</div>
					<div className={s.slotFileActions}>
						<button
							type='button'
							className={s.linkBtn}
							onClick={() => setPreviewing(true)}
							disabled={!fileUrl}
							aria-label={`Xem file ${file.name}`}
						>
							<EyeSvg aria-hidden='true' /> Xem
						</button>
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
							className={`${s.linkBtn} ${s.slotRemove}`}
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
						// Nhiều ô file trên cùng trang: tên nút kèm tên giấy tờ ("Chọn file Căn cước…")
						aria-label={`Chọn file ${label}`}
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
			{previewing && file && fileUrl && (
				<LocalFilePreview
					file={file}
					url={fileUrl}
					onClose={closePreview}
				/>
			)}
		</div>
	);
}
