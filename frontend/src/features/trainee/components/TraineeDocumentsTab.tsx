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
import styles from '../pages/Trainees.module.css';
import ds from '../pages/TraineeDetail.module.css';

// Xem trực tiếp trên web; đuôi khác (.doc, .xlsx...) vẫn mở/tải như cũ.
const PREVIEWABLE = /\.(pdf|docx|png|jpe?g|gif|webp|bmp)$/i;

const STATE_CHIP = {
	done: { cls: ds.chipDone, label: 'Đã nộp' },
	pending: { cls: ds.chipPending, label: 'Chờ duyệt' },
	missing: { cls: ds.chipMissing, label: 'Thiếu' },
} as const;

const DOC_STATUS_LABEL: Record<ChecklistDocument['status'], string> = {
	approved: 'Đã duyệt',
	pending: 'Học viên tự nộp — chờ duyệt',
	rejected: 'Đã từ chối',
};

/**
 * Tab "Hồ sơ & file scan": checklist giấy tờ theo loại khóa học viên đã ghi danh
 * (danh mục Loại giấy tờ), xem trực tiếp, tải lên kéo-thả, duyệt file học viên tự nộp.
 */
export function TraineeDocumentsTab({ traineeId, canEdit }: { traineeId: string; canEdit: boolean }) {
	const uploadPolicy = useUploadPolicy();
	const [data, setData] = useState<DocumentChecklist | null>(null);
	const [error, setError] = useState('');
	const [busy, setBusy] = useState(false);
	const [docType, setDocType] = useState('');
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

	// Thiếu trước, rồi chờ duyệt; loại không bắt buộc & chưa nộp thì ẩn bớt
	const shown = data.items.filter((i) => i.required || i.documents.length);
	const optional = data.items.filter((i) => !i.required && !i.documents.length);
	const firstMissing = data.items.find((i) => i.required && i.state === 'missing');
	const selectedType = docType || firstMissing?.id || data.items[0]?.id || '';

	return (
		<>
			<div className={ds.summary}>
				<span>
					Giấy tờ bắt buộc: <b>{data.required_done}</b> / {data.required_total} đã nộp
				</span>
				{data.required_total > data.required_done && (
					<span className={ds.chipMissing}>Thiếu {data.required_total - data.required_done}</span>
				)}
				<span>· Danh sách bắt buộc theo loại khóa đã ghi danh — sửa ở Danh mục đào tạo → Loại giấy tờ.</span>
			</div>

			{canEdit && (
				<div className={ds.uploadBox}>
					<select
						className={styles.subSelect}
						value={selectedType}
						onChange={(e) => setDocType(e.target.value)}
						title='Loại giấy tờ'
					>
						{data.items.map((i) => (
							<option
								key={i.id}
								value={i.id}
							>
								{i.name}
								{i.required ? (i.state === 'missing' ? ' (thiếu)' : ' (bắt buộc)') : ''}
							</option>
						))}
					</select>
					<FileDropzone
						compact
						accept={uploadPolicy.accept}
						maxSizeMB={uploadPolicy.maxSizeMB}
						value={file}
						onChange={setFile}
						disabled={busy}
						className={styles.subDropzone}
					/>
					<button
						className={styles.btnGhost}
						disabled={busy || !file || !selectedType}
						onClick={() =>
							void run(async () => {
								await addTraineeDocument(traineeId, file!, selectedType);
								setFile(null);
							}, 'Đã tải lên')
						}
					>
						<PlusSvg /> Tải lên
					</button>
				</div>
			)}

			<div className={styles.subList}>
				{shown.map((item) => {
					const chip = STATE_CHIP[item.state];
					return (
						<div
							key={item.id}
							className={styles.subRow}
							style={{ alignItems: 'flex-start' }}
						>
							<div className={styles.subRowMain}>
								<div className={ds.name}>
									{item.name}{' '}
									{item.required ? (
										<span className={chip.cls}>{chip.label}</span>
									) : (
										<span className={ds.chipMuted}>Không bắt buộc</span>
									)}
								</div>
								{item.documents.length > 0 && (
									<div className={ds.files}>
										{item.documents.map((doc) => (
											<div
												key={doc.id}
												className={ds.fileRow}
											>
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
													{formatDate(doc.created_at)} · {DOC_STATUS_LABEL[doc.status]}
													{doc.review_note ? ` · ${doc.review_note}` : ''}
												</span>
												{canEdit && doc.status === 'pending' && (
													<>
														<button
															className={styles.btnGhost}
															disabled={busy}
															onClick={() =>
																void run(
																	() => traineeRecordApi.reviewDocument(doc.id, 'approved'),
																	'Đã duyệt hồ sơ',
																)
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
														title='Xoá file'
														disabled={busy}
														onClick={() => {
															if (confirm(`Xoá file "${doc.file_name}"?`))
																void run(() => removeTraineeDocument(doc.id), 'Đã xoá file');
														}}
													>
														<TrashSvg />
													</button>
												)}
											</div>
										))}
									</div>
								)}
							</div>
						</div>
					);
				})}
				{shown.length === 0 && (
					<div className={styles.subEmpty}>Chưa có giấy tờ nào và chưa có loại bắt buộc cho học viên này.</div>
				)}
			</div>
			{optional.length > 0 && (
				<div
					className={styles.subRowMeta}
					style={{ marginTop: 10 }}
				>
					Loại khác chưa nộp (không bắt buộc): {optional.map((i) => i.name).join(', ')}
				</div>
			)}
			{viewer && (
				<FileViewerModal
					file={viewer}
					onClose={() => setViewer(null)}
				/>
			)}
		</>
	);
}
