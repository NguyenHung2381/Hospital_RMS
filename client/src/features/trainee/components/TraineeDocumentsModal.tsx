import { useEffect, useRef, useState } from 'react';
import { FileTextSvg, PlusSvg, TrashSvg, XSvg } from '@/assets/icons';
import {
	addTraineeDocument,
	getTraineeDocuments,
	removeTraineeDocument,
	type TraineeDocument,
} from '../api/traineeDocumentApi';
import type { Trainee } from '../types/trainee.type';
import styles from '../pages/Trainees.module.css';

const DOC_TYPE_LABEL: Record<string, string> = {
	national_id: 'CCCD/CMND',
	degree: 'Bằng cấp',
	other: 'Khác',
};

export function TraineeDocumentsModal({ trainee, onClose }: { trainee: Trainee; onClose: () => void }) {
	const [docs, setDocs] = useState<TraineeDocument[]>([]);
	const [loading, setLoading] = useState(true);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const [docType, setDocType] = useState('national_id');
	const fileInputRef = useRef<HTMLInputElement>(null);

	const load = () => {
		setLoading(true);
		getTraineeDocuments(trainee.id)
			.then(setDocs)
			.catch((err) => setError(err instanceof Error ? err.message : 'Không thể tải hồ sơ'))
			.finally(() => setLoading(false));
	};

	useEffect(load, [trainee.id]);

	const handleUpload = async () => {
		const file = fileInputRef.current?.files?.[0];
		if (!file) return;
		setBusy(true);
		setError('');
		try {
			await addTraineeDocument(trainee.id, file, docType);
			if (fileInputRef.current) fileInputRef.current.value = '';
			load();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Tải lên thất bại');
		} finally {
			setBusy(false);
		}
	};

	const handleRemove = async (docId: string) => {
		setBusy(true);
		try {
			await removeTraineeDocument(docId);
			load();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Xoá thất bại');
		} finally {
			setBusy(false);
		}
	};

	return (
		<div
			className={styles.modalBackdrop}
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<div className={styles.modal}>
				<div className={styles.modalHeader}>
					<div className={styles.modalHeaderIcon}>
						<FileTextSvg />
					</div>
					<div>
						<div className={styles.modalTitle}>Hồ sơ học viên</div>
						<div className={styles.modalSub}>{trainee.full_name} — dữ liệu nhạy cảm</div>
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
						<select
							className={styles.subSelect}
							value={docType}
							onChange={(e) => setDocType(e.target.value)}
						>
							<option value='national_id'>CCCD/CMND</option>
							<option value='degree'>Bằng cấp</option>
							<option value='other'>Khác</option>
						</select>
						<input
							type='file'
							ref={fileInputRef}
							className={styles.subInput}
						/>
						<button
							className={styles.btnCancel}
							style={{ flex: 'unset', padding: '7px 14px' }}
							disabled={busy}
							onClick={handleUpload}
						>
							<PlusSvg /> Tải lên
						</button>
					</div>

					{loading ? (
						<div className={styles.subEmpty}>Đang tải...</div>
					) : docs.length === 0 ? (
						<div className={styles.subEmpty}>Chưa có hồ sơ nào được tải lên.</div>
					) : (
						<div className={styles.subList}>
							{docs.map((doc) => (
								<div
									key={doc.id}
									className={styles.subRow}
								>
									<div className={styles.subRowMain}>
										<a
											href={doc.file_url}
											target='_blank'
											rel='noreferrer'
											className={styles.docLink}
										>
											{doc.file_name}
										</a>
										<div className={styles.subRowMeta}>
											{DOC_TYPE_LABEL[doc.doc_type] ?? doc.doc_type}
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

				<div className={styles.modalFooter}>
					<button
						className={styles.btnCancel}
						onClick={onClose}
					>
						Đóng
					</button>
				</div>
			</div>
		</div>
	);
}
