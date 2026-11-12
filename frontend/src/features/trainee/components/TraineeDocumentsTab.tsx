import { useCallback, useEffect, useState } from 'react';
import { CheckSvg, PlusSvg, TrashSvg, XSvg } from '@/assets/icons';
import { FileDropzone } from '@/shared/components';
import { FileViewerModal } from '@/shared/components/FileViewerModal';
import { useUploadPolicy } from '@/shared/hooks/useUploadPolicy';
import { showToast } from '@/shared/utils/feedback';
import { formatDate } from '../../../shared/utils/formatDate';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { addTraineeDocument, removeTraineeDocument } from '../api/traineeDocumentApi';
import { traineeRecordApi, type ChecklistDocument, type DocumentChecklist } from '../api/traineeRecordApi';
import { TraineeDocStateBadge } from './TraineeDocState';
import { DOC_STATE_META } from '../utils/docState';
import styles from '../pages/Trainees.module.css';
import ds from '../pages/TraineeDetail.module.css';

// Xem trực tiếp trên web; đuôi khác (.doc, .xlsx...) vẫn mở/tải như cũ.
const PREVIEWABLE = /\.(pdf|docx|png|jpe?g|gif|webp|bmp)$/i;

const DOC_STATUS_LABEL: Record<ChecklistDocument['status'], string> = {
	approved: 'Đã duyệt',
	pending: 'Học viên tự nộp — chờ duyệt',
	rejected: 'Đã từ chối',
};

const PDF_ACCEPT = '.pdf,application/pdf';

/**
 * Tab "Hồ sơ": mỗi học viên nộp 1 file PDF đầy đủ thông tin (không chia loại giấy tờ).
 * Xem trực tiếp, tải lên kéo-thả, duyệt / từ chối file học viên tự nộp.
 */
export function TraineeDocumentsTab({ traineeId, canEdit }: { traineeId: string; canEdit: boolean }) {
	const uploadPolicy = useUploadPolicy();
	const [data, setData] = useState<DocumentChecklist | null>(null);
	const [error, setError] = useState('');
	const [busy, setBusy] = useState(false);
	const [file, setFile] = useState<File | null>(null);
	const [viewer, setViewer] = useState<{ url: string; name: string; isWord: boolean } | null>(null);

	const load = useCallback(
		() =>
			traineeRecordApi
				.checklist(traineeId)
				.then((d) => {
					setData(d);
					setError('');
				})
				.catch((err) => setError(err instanceof Error ? err.message : 'Không tải được hồ sơ')),
		[traineeId],
	);
	useEffect(() => {
		void load();
	}, [load]);
	useRealtimeUpdate('trainee_document', load);

	const run = async (fn: () => Promise<unknown>, ok: string) => {
		setBusy(true);
		try {
			await fn();
			showToast('success', ok);
			await load();
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Thao tác thất bại');
		} finally {
			setBusy(false);
		}
	};

	if (error) return <div className={styles.errorBanner}>{error}</div>;
	if (!data) return <div className={styles.subEmpty}>Đang tải...</div>;

	const meta = DOC_STATE_META[data.state];
	const hasFile = data.documents.length > 0;

	return (
		<>
			<div className={ds.summary}>
				<TraineeDocStateBadge state={data.state} />
				<span>{meta.hint}. Học viên chỉ cần nộp 1 file PDF gộp đủ thông tin.</span>
			</div>

			{canEdit && (
				<div className={ds.uploadBox}>
					<FileDropzone
						compact
						accept={PDF_ACCEPT}
						hint='Chỉ nhận file PDF'
						maxSizeMB={uploadPolicy.maxSizeMB}
						value={file}
						onChange={setFile}
						disabled={busy}
						className={styles.subDropzone}
					/>
					<button
						className={styles.btnGhost}
						disabled={busy || !file}
						onClick={() =>
							void run(async () => {
								await addTraineeDocument(traineeId, file!);
								setFile(null);
							}, 'Đã tải lên hồ sơ')
						}
					>
						<PlusSvg /> {hasFile ? 'Tải bản mới' : 'Tải lên'}
					</button>
				</div>
			)}

			<div className={styles.subList}>
				{data.documents.map((doc) => (
					<div
						key={doc.id}
						className={styles.subRow}
					>
						<div className={styles.subRowMain}>
							<div className={ds.fileRow}>
								<a
									href={doc.file_url}
									target='_blank'
									rel='noreferrer'
									className={styles.docLink}
									onClick={(e) => {
										if (!PREVIEWABLE.test(doc.file_name)) return;
										e.preventDefault();
										setViewer({
											url: doc.file_url,
											name: doc.file_name,
											isWord: /\.docx$/i.test(doc.file_name),
										});
									}}
								>
									{doc.file_name}
								</a>
								<span className={styles.subRowMeta}>
									{doc.doc_type_name ? `${doc.doc_type_name} (nộp theo loại cũ) · ` : ''}
									{formatDate(doc.created_at)} · {DOC_STATUS_LABEL[doc.status]}
									{doc.review_note ? ` · ${doc.review_note}` : ''}
								</span>
								{canEdit && doc.status === 'pending' && (
									<>
										<button
											className={styles.btnGhost}
											disabled={busy}
											onClick={() =>
												void run(() => traineeRecordApi.reviewDocument(doc.id, 'approved'), 'Đã duyệt hồ sơ')
											}
										>
											<CheckSvg /> Duyệt
										</button>
										<button
											className={styles.btnGhost}
											disabled={busy}
											onClick={() => {
												const note = window.prompt('Lý do từ chối (học viên sẽ thấy):');
												if (note !== null)
													void run(
														() => traineeRecordApi.reviewDocument(doc.id, 'rejected', note),
														'Đã từ chối hồ sơ',
													);
											}}
										>
											<XSvg /> Từ chối
										</button>
									</>
								)}
								{canEdit && (
									<button
										className={styles.actionBtn}
										title='Xóa file'
										disabled={busy}
										onClick={() => {
											if (confirm(`Xóa file "${doc.file_name}"?`))
												void run(() => removeTraineeDocument(doc.id), 'Đã xóa file');
										}}
									>
										<TrashSvg />
									</button>
								)}
							</div>
						</div>
					</div>
				))}
				{!hasFile && <div className={styles.subEmpty}>Học viên chưa nộp file hồ sơ PDF.</div>}
			</div>
			{viewer && (
				<FileViewerModal
					file={viewer}
					onClose={() => setViewer(null)}
				/>
			)}
		</>
	);
}
