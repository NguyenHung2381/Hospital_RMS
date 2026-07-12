import { useEffect, useRef, useState } from 'react';
import { sanitizeCommentHtml } from '../utils/sanitizeHtml';
import styles from './RichTextEditor.module.css';

interface Props {
	value: string;
	onChange: (html: string) => void;
	onUploadImage: (file: File) => Promise<string>;
	maxTextLength?: number;
	placeholder?: string;
}

export default function RichTextEditor({
	value,
	onChange,
	onUploadImage,
	maxTextLength,
	placeholder,
}: Props) {
	const editorRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const focused = useRef(false);
	const [textLength, setTextLength] = useState(0);
	const [uploading, setUploading] = useState(false);
	const [active, setActive] = useState({
		bold: false,
		italic: false,
		underline: false,
		ul: false,
		ol: false,
	});

	// Cập nhật trạng thái "đang bật" của toolbar theo định dạng tại vị trí con
	// trỏ/vùng chọn hiện tại — chỉ khi selection đang nằm trong ô soạn thảo này.
	const updateActiveStates = () => {
		const el = editorRef.current;
		const sel = document.getSelection();
		if (!el || !sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) return;
		setActive({
			bold: document.queryCommandState('bold'),
			italic: document.queryCommandState('italic'),
			underline: document.queryCommandState('underline'),
			ul: document.queryCommandState('insertUnorderedList'),
			ol: document.queryCommandState('insertOrderedList'),
		});
	};

	// selectionchange bắt cả các trường hợp di chuyển con trỏ bằng phím mũi
	// tên/click mà không phát sinh sự kiện input.
	useEffect(() => {
		document.addEventListener('selectionchange', updateActiveStates);
		return () => document.removeEventListener('selectionchange', updateActiveStates);
	}, []);

	// Đồng bộ nội dung từ ngoài vào (vd khi load dữ liệu đã lưu) — chỉ khi
	// đang không gõ dở, tránh nhảy con trỏ giữa chừng.
	useEffect(() => {
		if (focused.current) return;
		const el = editorRef.current;
		if (!el) return;
		const clean = sanitizeCommentHtml(value || '');
		if (el.innerHTML !== clean) el.innerHTML = clean;
		setTextLength(el.innerText.length);
	}, [value]);

	const handleInput = () => {
		const el = editorRef.current;
		if (!el) return;
		setTextLength(el.innerText.length);
		onChange(el.innerHTML);
	};

	const exec = (command: string, arg?: string) => {
		editorRef.current?.focus();
		document.execCommand(command, false, arg);
		handleInput();
		updateActiveStates();
	};

	const handleImageSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		e.target.value = '';
		if (!file) return;
		setUploading(true);
		try {
			const url = await onUploadImage(file);
			exec('insertImage', url);
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Tải ảnh thất bại');
		} finally {
			setUploading(false);
		}
	};

	const overLimit = maxTextLength != null && textLength > maxTextLength;

	// Click vào toolbar (mousedown) làm mất focus/selection của ô soạn thảo
	// trước khi onClick chạy — chặn mousedown để giữ nguyên vùng đang chọn.
	const keepSelection = (e: React.MouseEvent) => e.preventDefault();

	return (
		<div className={styles.wrapper}>
			<div className={styles.toolbar}>
				<button
					type='button'
					className={`${styles.toolBtn} ${active.bold ? styles.toolBtnActive : ''}`}
					onMouseDown={keepSelection}
					onClick={() => exec('bold')}
					title='Đậm'
				>
					<b>B</b>
				</button>
				<button
					type='button'
					className={`${styles.toolBtn} ${active.italic ? styles.toolBtnActive : ''}`}
					onMouseDown={keepSelection}
					onClick={() => exec('italic')}
					title='Nghiêng'
				>
					<i>I</i>
				</button>
				<button
					type='button'
					className={`${styles.toolBtn} ${active.underline ? styles.toolBtnActive : ''}`}
					onMouseDown={keepSelection}
					onClick={() => exec('underline')}
					title='Gạch chân'
				>
					<u>U</u>
				</button>
				<span className={styles.toolDivider} />
				<button
					type='button'
					className={`${styles.toolBtn} ${active.ul ? styles.toolBtnActive : ''}`}
					onMouseDown={keepSelection}
					onClick={() => exec('insertUnorderedList')}
					title='Danh sách'
				>
					☰
				</button>
				<button
					type='button'
					className={`${styles.toolBtn} ${active.ol ? styles.toolBtnActive : ''}`}
					onMouseDown={keepSelection}
					onClick={() => exec('insertOrderedList')}
					title='Danh sách số'
				>
					1.
				</button>
				<span className={styles.toolDivider} />
				<button
					type='button'
					className={styles.toolBtn}
					onMouseDown={keepSelection}
					onClick={() => fileInputRef.current?.click()}
					disabled={uploading}
					title='Chèn ảnh'
				>
					{uploading ? '…' : '🖼️'}
				</button>
				<input
					ref={fileInputRef}
					type='file'
					accept='image/png,image/jpeg,image/gif,image/webp'
					hidden
					onChange={handleImageSelected}
				/>
				{maxTextLength != null && (
					<span className={`${styles.counter} ${overLimit ? styles.counterOver : ''}`}>
						{textLength} / {maxTextLength}
					</span>
				)}
			</div>
			<div
				ref={editorRef}
				className={styles.editor}
				contentEditable
				onInput={handleInput}
				onFocus={() => {
					focused.current = true;
					updateActiveStates();
				}}
				onBlur={() => {
					focused.current = false;
					setActive({ bold: false, italic: false, underline: false, ul: false, ol: false });
				}}
				onPaste={(e) => {
					e.preventDefault();
					document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
				}}
				data-placeholder={placeholder}
				suppressContentEditableWarning
			/>
		</div>
	);
}
