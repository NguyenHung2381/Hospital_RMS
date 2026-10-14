import { useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { ImageSvg, TrashSvg, UploadSvg } from '@/assets/icons';
import { BASE_URL } from '../../api/endpoints';
import styles from './QuestionImage.module.css';

// Khớp middlewares/uploadImage.js ở backend
const ACCEPT = 'image/png,image/jpeg,image/gif,image/webp';
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Ảnh minh hoạ của câu hỏi — bấm để mở ảnh gốc ở tab mới. url là link /uploads
 * đã ký từ API, hoặc data URI (xem trước hình trích từ file Word, chưa tải lên).
 */
export function QuestionImageView({ url, compact = false }: { url: string | null | undefined; compact?: boolean }) {
	if (!url) return null;
	const local = url.startsWith('data:');
	const src = local ? url : `${BASE_URL}${url}`;
	// Không dùng loading='lazy': khung inline-block co theo ảnh nên ảnh chưa tải có
	// kích thước 0×0 → trình duyệt coi như không hiển thị và không bao giờ tải ảnh
	const img = (
		<img
			src={src}
			alt='Hình minh hoạ câu hỏi'
		/>
	);
	const className = `${styles.view} ${compact ? styles.compact : ''}`;
	// Trình duyệt chặn mở data URI ở tab mới — chỉ hiện ảnh
	if (local) return <span className={className}>{img}</span>;
	return (
		<a
			href={src}
			target='_blank'
			rel='noreferrer'
			className={className}
			title='Bấm để xem ảnh gốc'
		>
			{img}
		</a>
	);
}

/**
 * Chọn / đổi / bỏ ảnh minh hoạ cho câu hỏi. Ảnh được tải lên ngay khi chọn
 * (upload trả về đường dẫn), đường dẫn lưu cùng câu hỏi khi bấm Lưu.
 * Nhận cả kéo-thả và dán (Ctrl+V) ảnh chụp màn hình.
 */
export function QuestionImageField({
	value,
	onChange,
	upload,
	disabled = false,
}: {
	value: string | null | undefined;
	onChange: (url: string | null) => void;
	upload: (file: File) => Promise<{ url: string }>;
	disabled?: boolean;
}) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [uploading, setUploading] = useState(false);
	const [dragOver, setDragOver] = useState(false);
	const [error, setError] = useState('');

	const pick = async (file: File | undefined | null) => {
		if (!file) return;
		setError('');
		if (!ACCEPT.split(',').includes(file.type)) return setError('Chỉ nhận ảnh PNG, JPEG, GIF hoặc WEBP');
		if (file.size > MAX_BYTES) return setError('Ảnh vượt quá 5MB');
		setUploading(true);
		try {
			onChange((await upload(file)).url);
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Tải ảnh thất bại');
		} finally {
			setUploading(false);
		}
	};

	const onDrop = (e: DragEvent) => {
		e.preventDefault();
		setDragOver(false);
		if (!disabled && !uploading) void pick(e.dataTransfer.files[0]);
	};
	const onPaste = (e: ClipboardEvent) => {
		const file = [...e.clipboardData.files].find((f) => f.type.startsWith('image/'));
		if (!file || disabled || uploading) return;
		e.preventDefault();
		void pick(file);
	};

	const busy = disabled || uploading;
	return (
		<div className={styles.field}>
			<input
				ref={inputRef}
				type='file'
				accept={ACCEPT}
				className={styles.nativeInput}
				tabIndex={-1}
				onChange={(e) => {
					void pick(e.target.files?.[0]);
					e.target.value = '';
				}}
			/>
			{value ? (
				<div className={styles.preview}>
					<QuestionImageView url={value} />
					<div className={styles.previewActions}>
						<button
							type='button'
							className={styles.btn}
							disabled={busy}
							onClick={() => inputRef.current?.click()}
						>
							<UploadSvg /> {uploading ? 'Đang tải...' : 'Đổi ảnh'}
						</button>
						<button
							type='button'
							className={`${styles.btn} ${styles.danger}`}
							disabled={busy}
							onClick={() => onChange(null)}
						>
							<TrashSvg /> Bỏ ảnh
						</button>
					</div>
				</div>
			) : (
				<button
					type='button'
					className={`${styles.zone} ${dragOver ? styles.dragOver : ''}`}
					disabled={busy}
					onClick={() => inputRef.current?.click()}
					onPaste={onPaste}
					onDragOver={(e) => {
						e.preventDefault();
						setDragOver(true);
					}}
					onDragLeave={() => setDragOver(false)}
					onDrop={onDrop}
				>
					{uploading ? <span className={styles.spinner} /> : <ImageSvg />}
					<span>
						{uploading ? 'Đang tải ảnh...' : 'Thêm hình minh hoạ'}
						{!uploading && <span className={styles.hint}> — bấm chọn, kéo thả hoặc dán ảnh (tối đa 5MB)</span>}
					</span>
				</button>
			)}
			{error && <div className={styles.error}>{error}</div>}
		</div>
	);
}
