import { useUploadPolicy } from '@/shared/hooks/useUploadPolicy';
import { useState } from 'react';
import { DownloadSvg, FileSvg, LinkSvg, TrashSvg, UploadSvg } from '@/assets/icons';
import { Badge, FileDropzone } from '@/shared/components';
import type { DocumentSource } from '../api/courseApi';
import { DOC_TYPE_CFG, EXAM_TYPE_CFG, type CourseDocument, type DocType, type SourceType } from '../types/course.type';
import styles from './CourseDocumentsTab.module.css';

const formatSize = (bytes: number) =>
	bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

// Chỉ còn tài liệu học tập — kiểm tra/thi làm ở bước "Thi & Kiểm tra" (đề online).
// Đề/đáp án dạng file tải lên trước đây vẫn hiện trong danh sách, kèm nhãn.
export function CourseDocumentsTab({
	documents,
	busy,
	onAdd,
	onRemove,
	onOpen,
}: {
	documents: CourseDocument[];
	busy: boolean;
	onAdd: (source: DocumentSource, data: { doc_type: DocType; title: string; is_public: boolean }) => Promise<boolean>;
	onRemove: (docId: string) => void;
	onOpen: (docId: string) => void;
}) {
	// Tài liệu theo Cấu hình hệ thống + video/audio bài giảng (allowMedia ở backend)
	const uploadPolicy = useUploadPolicy({ allowMedia: true });
	const [title, setTitle] = useState('');
	const [isPublic, setIsPublic] = useState(true);
	const [sourceType, setSourceType] = useState<SourceType>('file');
	const [file, setFile] = useState<File | null>(null);
	const [externalUrl, setExternalUrl] = useState('');
	const [formError, setFormError] = useState('');

	const submit = async () => {
		setFormError('');
		let source: DocumentSource;
		if (sourceType === 'file') {
			if (!file) return setFormError('Vui lòng chọn file cần tải lên.');
			const err = uploadPolicy.check(file);
			if (err) return setFormError(err);
			source = { type: 'file', file };
		} else {
			const url = externalUrl.trim();
			if (!/^https?:\/\//i.test(url)) return setFormError('Đường dẫn phải bắt đầu bằng http:// hoặc https://');
			source = { type: 'link', external_url: url };
		}
		const ok = await onAdd(source, {
			doc_type: 'material',
			// Để trống → backend dùng tên file làm tiêu đề.
			title: title.trim() || (sourceType === 'link' ? 'Liên kết' : ''),
			is_public: isPublic,
		});
		if (ok) {
			setTitle('');
			setExternalUrl('');
			setFile(null);
		}
	};

	return (
		<>
			<div className={styles.uploadCard}>
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
						<FileDropzone
							accept={uploadPolicy.accept}
							value={file}
							onChange={(f) => {
								setFile(f);
								setFormError('');
							}}
							disabled={busy}
						/>
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
						placeholder={sourceType === 'file' ? 'Để trống sẽ dùng tên file' : 'VD: Bài giảng Hồi sức cơ bản'}
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

			{documents.length === 0 ? (
				<div className={styles.empty}>Chưa có tài liệu nào.</div>
			) : (
				<div className={styles.list}>
					{documents.map((doc) => (
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
									{doc.doc_type !== 'material' && (
										<Badge tone='amber'>
											{DOC_TYPE_CFG[doc.doc_type]}
											{doc.exam_type ? ` · ${EXAM_TYPE_CFG[doc.exam_type]}` : ''}
										</Badge>
									)}
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
