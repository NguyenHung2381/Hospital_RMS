import { notify } from '../../../shared/utils/feedback';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DocSvg, DownloadSvg, PlusSvg, TrashSvg, XSvg } from '@/assets/icons';
import {
	addLessonDocument,
	getLessonDocuments,
	incrementLessonDocumentDownload,
	removeLessonDocument,
	type LessonDocumentSource,
} from '../api/trainingProgramApi';
import type { LessonDocument, SourceType } from '../types/trainingProgram.type';
import styles from '../pages/TrainingPrograms.module.css';

// Chỉ cần id + title — tài liệu gắn theo lesson_id (nội dung dùng chung),
// không phụ thuộc đang xem từ chương trình nào.
export function LessonDocumentsModal({
	lesson,
	onClose,
}: {
	lesson: { id: string; title: string };
	onClose: () => void;
}) {
	const [docs, setDocs] = useState<LessonDocument[]>([]);
	const [loading, setLoading] = useState(true);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [form, setForm] = useState<{ title: string; isPublic: boolean; sourceType: SourceType; externalUrl: string }>({
		title: '',
		isPublic: true,
		sourceType: 'file',
		externalUrl: '',
	});

	const load = useCallback(() => {
		return getLessonDocuments(lesson.id)
			.then(setDocs)
			.catch((err) => setError(err instanceof Error ? err.message : 'Không thể tải tài liệu'))
			.finally(() => setLoading(false));
	}, [lesson.id]);

	useEffect(() => {
		load();
	}, [load]);

	const handleAdd = async () => {
		if (!form.title.trim()) return;
		let source: LessonDocumentSource;
		if (form.sourceType === 'file') {
			const file = fileInputRef.current?.files?.[0];
			if (!file) return;
			source = { type: 'file', file };
		} else {
			if (!form.externalUrl.trim()) return;
			source = { type: 'link', external_url: form.externalUrl.trim() };
		}
		setBusy(true);
		setError('');
		try {
			await addLessonDocument(lesson.id, source, { title: form.title, is_public: form.isPublic });
			notify.success('Đã thêm tài liệu');
			setForm({ title: '', isPublic: true, sourceType: 'file', externalUrl: '' });
			if (fileInputRef.current) fileInputRef.current.value = '';
			await load();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Thêm tài liệu thất bại');
		} finally {
			setBusy(false);
		}
	};

	const handleRemove = async (docId: string) => {
		setBusy(true);
		try {
			await removeLessonDocument(docId);
			notify.success('Đã xoá tài liệu');
			await load();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Xoá thất bại');
		} finally {
			setBusy(false);
		}
	};

	const handleDownloadClick = (docId: string) => {
		incrementLessonDocumentDownload(docId).catch(() => {});
		setDocs((prev) => prev.map((d) => (d.id === docId ? { ...d, download_count: d.download_count + 1 } : d)));
	};

	return (
		<div
			className={styles.modalBackdrop}
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<div className={`${styles.modal} ${styles.modalWide}`}>
				<div className={styles.modalHeader}>
					<div className={styles.modalHeaderIcon}>
						<DocSvg />
					</div>
					<div>
						<div className={styles.modalTitle}>Tài liệu bài học</div>
						<div className={styles.modalSub}>{lesson.title}</div>
					</div>
					<button
						className={styles.modalClose}
						onClick={onClose}
					>
						<XSvg />
					</button>
				</div>

				<div className={styles.modalBody}>
					{error && <div className={styles.errorBanner}>{error}</div>}

					<div className={styles.subToolbar}>
						<input
							className={styles.subInput}
							placeholder='Tiêu đề'
							value={form.title}
							onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
						/>
						<label className={styles.attRadio}>
							<input
								type='checkbox'
								checked={form.isPublic}
								onChange={(e) => setForm((f) => ({ ...f, isPublic: e.target.checked }))}
							/>
							Công khai
						</label>
						<select
							className={styles.subSelect}
							value={form.sourceType}
							onChange={(e) => setForm((f) => ({ ...f, sourceType: e.target.value as SourceType }))}
						>
							<option value='file'>Tải file lên</option>
							<option value='link'>Dán link</option>
						</select>
						{form.sourceType === 'file' ? (
							<input
								type='file'
								ref={fileInputRef}
								className={styles.subInput}
							/>
						) : (
							<input
								className={styles.subInput}
								placeholder='https://...'
								value={form.externalUrl}
								onChange={(e) => setForm((f) => ({ ...f, externalUrl: e.target.value }))}
							/>
						)}
						<button
							className={styles.btnGhost}
							disabled={busy || !form.title.trim()}
							onClick={handleAdd}
						>
							<PlusSvg /> Thêm tài liệu
						</button>
					</div>

					{loading ? (
						<div className={styles.subEmpty}>Đang tải...</div>
					) : docs.length === 0 ? (
						<div className={styles.subEmpty}>Chưa có tài liệu nào.</div>
					) : (
						<div className={styles.subList}>
							{docs.map((doc) => (
								<div
									key={doc.id}
									className={styles.subRow}
								>
									<div className={styles.subRowMain}>
										<a
											href={doc.source_type === 'link' ? (doc.external_url ?? '#') : (doc.file_url ?? '#')}
											target='_blank'
											rel='noreferrer'
											className={styles.docLink}
											onClick={() => handleDownloadClick(doc.id)}
										>
											{doc.title}
										</a>
										<div className={styles.subRowMeta}>
											{doc.source_type === 'link' ? 'Liên kết ngoài' : doc.file_name}
											{!doc.is_public ? ' · Chưa công khai' : ''}
											{' · '}
											<DownloadSvg /> {doc.download_count}
										</div>
									</div>
									<button
										className={styles.actionBtn}
										title='Xoá'
										disabled={busy}
										onClick={() => handleRemove(doc.id)}
									>
										<TrashSvg />
									</button>
								</div>
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
