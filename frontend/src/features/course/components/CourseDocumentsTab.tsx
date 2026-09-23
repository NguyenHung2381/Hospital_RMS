import { useMemo, useRef, useState } from 'react';
import { DownloadSvg, FileSvg, LinkSvg, TrashSvg, UploadSvg, XSvg } from '@/assets/icons';
import { Badge, type BadgeTone } from '@/shared/components';
import type { DocumentSource } from '../api/courseApi';
import {
	DOC_TYPE_CFG,
	EXAM_TYPE_CFG,
	type CourseDocument,
	type DocType,
	type ExamType,
	type SourceType,
} from '../types/course.type';
import styles from './CourseDocumentsTab.module.css';

// Khớp fileTypeAllowlist.js (backend, allowMedia = true cho course_document).
const ACCEPT =
	'.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf,.odt,.ods,.odp,.zip,.rar,.7z,' +
	'.png,.jpg,.jpeg,.gif,.webp,.bmp,.mp4,.mov,.avi,.mkv,.webm,.m4v,.mp3,.wav,.m4a,.aac';

const DOC_TYPE_TONE: Record<DocType, BadgeTone> = {
	material: 'blue',
	test_question: 'amber',
	test_answer: 'purple',
};

const DOC_TYPES = Object.keys(DOC_TYPE_CFG) as DocType[];
const isTestDoc = (t: DocType) => t === 'test_question' || t === 'test_answer';

const formatSize = (bytes: number) =>
	bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

type DocFilter = DocType | 'all';

export function CourseDocumentsTab({
	documents,
	busy,
	onAdd,
	onRemove,
	onOpen,
}: {
	documents: CourseDocument[];
	busy: boolean;
	onAdd: (
		source: DocumentSource,
		data: { doc_type: DocType; title: string; is_public: boolean; exam_type?: ExamType | '' },
	) => Promise<boolean>;
	onRemove: (docId: string) => void;
	onOpen: (docId: string) => void;
}) {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [docType, setDocType] = useState<DocType>('test_question');
	const [examType, setExamType] = useState<ExamType | ''>('');
	const [title, setTitle] = useState('');
	const [isPublic, setIsPublic] = useState(false);
	const [sourceType, setSourceType] = useState<SourceType>('file');
	const [file, setFile] = useState<File | null>(null);
	const [externalUrl, setExternalUrl] = useState('');
	const [dragOver, setDragOver] = useState(false);
	const [formError, setFormError] = useState('');
	const [filter, setFilter] = useState<DocFilter>('all');

	const counts = useMemo(() => {
		const c: Record<DocFilter, number> = { all: documents.length, material: 0, test_question: 0, test_answer: 0 };
		documents.forEach((doc) => (c[doc.doc_type] += 1));
		return c;
	}, [documents]);
	const visibleDocs = filter === 'all' ? documents : documents.filter((doc) => doc.doc_type === filter);

	const changeDocType = (t: DocType) => {
		setDocType(t);
		// Đề/đáp án mặc định không công khai để học viên không xem trước.
		setIsPublic(!isTestDoc(t));
		if (!isTestDoc(t)) setExamType('');
	};

	const pickFile = (f: File | undefined | null) => {
		setFormError('');
		setFile(f ?? null);
	};

	const clearFile = () => {
		setFile(null);
		if (fileInputRef.current) fileInputRef.current.value = '';
	};

	const submit = async () => {
		setFormError('');
		let source: DocumentSource;
		if (sourceType === 'file') {
			if (!file) return setFormError('Vui lòng chọn file cần tải lên.');
			source = { type: 'file', file };
		} else {
			const url = externalUrl.trim();
			if (!/^https?:\/\//i.test(url)) return setFormError('Đường dẫn phải bắt đầu bằng http:// hoặc https://');
			source = { type: 'link', external_url: url };
		}
		if (isTestDoc(docType) && !examType) return setFormError('Vui lòng chọn loại kiểm tra.');

		const ok = await onAdd(source, {
			doc_type: docType,
			// Để trống → backend dùng tên file làm tiêu đề.
			title: title.trim() || (sourceType === 'link' ? 'Liên kết' : ''),
			is_public: isPublic,
			exam_type: isTestDoc(docType) ? examType : '',
		});
		if (ok) {
			setTitle('');
			setExternalUrl('');
			clearFile();
		}
	};

	return (
		<>
			<div className={styles.uploadCard}>
				<div className={styles.field}>
					<span className={styles.label}>Loại tài liệu</span>
					<div className={styles.segment}>
						{DOC_TYPES.map((t) => (
							<button
								key={t}
								type='button'
								className={`${styles.segBtn} ${docType === t ? styles.segBtnActive : ''}`}
								onClick={() => changeDocType(t)}
							>
								{DOC_TYPE_CFG[t]}
							</button>
						))}
					</div>
				</div>

				{isTestDoc(docType) && (
					<div className={styles.field}>
						<span className={styles.label}>
							Loại kiểm tra <span className={styles.req}>*</span>
						</span>
						<div className={styles.segment}>
							{(Object.keys(EXAM_TYPE_CFG) as ExamType[]).map((k) => (
								<button
									key={k}
									type='button'
									className={`${styles.segBtn} ${examType === k ? styles.segBtnActive : ''}`}
									onClick={() => {
										setExamType(k);
										setFormError('');
									}}
								>
									{EXAM_TYPE_CFG[k]}
								</button>
							))}
						</div>
					</div>
				)}

				<div className={styles.field}>
					<div className={styles.labelRow}>
						<span className={styles.label}>
							Nguồn <span className={styles.req}>*</span>
						</span>
						<div className={styles.segmentSm}>
							<button
								type='button'
								className={`${styles.segBtn} ${sourceType === 'file' ? styles.segBtnActive : ''}`}
								onClick={() => setSourceType('file')}
							>
								<UploadSvg /> Tải file
							</button>
							<button
								type='button'
								className={`${styles.segBtn} ${sourceType === 'link' ? styles.segBtnActive : ''}`}
								onClick={() => setSourceType('link')}
							>
								<LinkSvg /> Dán link
							</button>
						</div>
					</div>

					{sourceType === 'file' ? (
						<>
							<input
								ref={fileInputRef}
								type='file'
								accept={ACCEPT}
								hidden
								onChange={(e) => pickFile(e.target.files?.[0])}
							/>
							{file ? (
								<div className={styles.fileChip}>
									<FileSvg className={styles.fileChipIcon} />
									<div className={styles.fileChipMain}>
										<div className={styles.fileChipName}>{file.name}</div>
										<div className={styles.fileChipMeta}>{formatSize(file.size)}</div>
									</div>
									<button
										type='button'
										className={styles.iconBtn}
										title='Bỏ chọn file'
										onClick={clearFile}
									>
										<XSvg />
									</button>
								</div>
							) : (
								<button
									type='button'
									className={`${styles.dropZone} ${dragOver ? styles.dropZoneActive : ''}`}
									onClick={() => fileInputRef.current?.click()}
									onDragOver={(e) => {
										e.preventDefault();
										setDragOver(true);
									}}
									onDragLeave={() => setDragOver(false)}
									onDrop={(e) => {
										e.preventDefault();
										setDragOver(false);
										pickFile(e.dataTransfer.files?.[0]);
									}}
								>
									<UploadSvg className={styles.dropIcon} />
									<span className={styles.dropTitle}>Kéo thả file vào đây hoặc bấm để chọn</span>
									<span className={styles.dropHint}>PDF, Word, Excel, PowerPoint, ảnh, video, âm thanh, ZIP</span>
								</button>
							)}
						</>
					) : (
						<input
							className={styles.input}
							placeholder='https://...'
							value={externalUrl}
							onChange={(e) => {
								setExternalUrl(e.target.value);
								setFormError('');
							}}
						/>
					)}
				</div>

				<div className={styles.field}>
					<span className={styles.label}>Tiêu đề</span>
					<input
						className={styles.input}
						placeholder={
							sourceType === 'file' ? 'Để trống sẽ dùng tên file' : 'VD: Đề kiểm tra giữa kỳ - Nội khoa'
						}
						value={title}
						onChange={(e) => setTitle(e.target.value)}
					/>
				</div>

				<div className={styles.footer}>
					<label className={styles.check}>
						<input
							type='checkbox'
							checked={isPublic}
							onChange={(e) => setIsPublic(e.target.checked)}
						/>
						Công khai cho học viên
					</label>
					{formError && <span className={styles.formError}>{formError}</span>}
					<button
						type='button'
						className={styles.submitBtn}
						disabled={busy}
						onClick={submit}
					>
						<UploadSvg /> {busy ? 'Đang tải lên...' : 'Tải lên'}
					</button>
				</div>
			</div>

			<div className={styles.filterBar}>
				{(['all', ...DOC_TYPES] as DocFilter[]).map((f) => (
					<button
						key={f}
						type='button'
						className={`${styles.filterChip} ${filter === f ? styles.filterChipActive : ''}`}
						onClick={() => setFilter(f)}
					>
						{f === 'all' ? 'Tất cả' : DOC_TYPE_CFG[f]} <span className={styles.filterCount}>{counts[f]}</span>
					</button>
				))}
			</div>

			{visibleDocs.length === 0 ? (
				<div className={styles.empty}>
					{filter === 'all' ? 'Chưa có tài liệu nào.' : `Chưa có ${DOC_TYPE_CFG[filter].toLowerCase()} nào.`}
				</div>
			) : (
				<div className={styles.list}>
					{visibleDocs.map((doc) => (
						<div
							key={doc.id}
							className={styles.row}
						>
							<div className={styles.rowIcon}>{doc.source_type === 'link' ? <LinkSvg /> : <FileSvg />}</div>
							<div className={styles.rowMain}>
								<a
									href={doc.source_type === 'link' ? (doc.external_url ?? '#') : (doc.file_url ?? '#')}
									target='_blank'
									rel='noreferrer'
									className={styles.rowTitle}
									onClick={() => onOpen(doc.id)}
								>
									{doc.title}
								</a>
								<div className={styles.rowMeta}>
									<Badge tone={DOC_TYPE_TONE[doc.doc_type]}>
										{DOC_TYPE_CFG[doc.doc_type]}
										{doc.exam_type ? ` · ${EXAM_TYPE_CFG[doc.exam_type]}` : ''}
									</Badge>
									{!doc.is_public && <Badge tone='gray'>Chưa công khai</Badge>}
									<span>
										{doc.source_type === 'link'
											? 'Liên kết ngoài'
											: `${doc.file_name ?? ''}${doc.file_size ? ` · ${formatSize(doc.file_size)}` : ''}`}
									</span>
									<span className={styles.downloads}>
										<DownloadSvg /> {doc.download_count}
									</span>
								</div>
							</div>
							<button
								className={styles.iconBtn}
								title='Xoá'
								disabled={busy}
								onClick={() => onRemove(doc.id)}
							>
								<TrashSvg />
							</button>
						</div>
					))}
				</div>
			)}
		</>
	);
}
