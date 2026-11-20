import { useState } from 'react';
import styles from '../pages/Topic.module.css';
import { formatFileSize, getFileTypeColor } from '../utils/topicHelpers';
import { AlertSvg as IcAlert, DownloadSvg as IcDownload } from '@/assets/icons';
import { Modal } from '@/shared/components';

export function ConfirmUploadModal({
	files,
	batchNote,
	onClose,
	onConfirm,
}: {
	files: File[];
	batchNote: string;
	onClose: () => void;
	onConfirm: () => Promise<void>;
}) {
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');

	const go = async () => {
		setLoading(true);
		setError('');
		try {
			await onConfirm();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Lỗi tải lên file');
			setLoading(false);
		}
	};

	const totalSize = files.reduce((s, f) => s + f.size, 0);

	// Đang tải lên thì không cho đóng (Esc, bấm nền, nút X) để tránh bỏ dở giữa chừng.
	const requestClose = () => {
		if (!loading) onClose();
	};

	return (
		<Modal
			open
			onClose={requestClose}
			title='Xác nhận tải lên'
			subtitle={`${files.length} file • ${formatFileSize(totalSize)}`}
			icon={<IcDownload />}
			iconStyle={{ background: '#eff6ff', color: '#2563eb' }}
			closeOnBackdrop={!loading}
			bodyClassName={styles.cfmModalBodyTight}
			footer={
				<>
					{error && (
						<span
							role='alert'
							style={{ fontSize: 12, color: 'var(--tone-red-fg)', flex: 1 }}
						>
							<IcAlert /> {error}
						</span>
					)}
					<button
						type='button'
						className={styles.btnSecondary}
						onClick={onClose}
						disabled={loading}
					>
						Hủy bỏ
					</button>
					<button
						type='button'
						className={styles.btnPrimary}
						onClick={go}
						disabled={loading}
					>
						{loading ? (
							<>
								<span className={styles.spinner} />
								Đang tải lên...
							</>
						) : (
							`Tải lên ${files.length} file`
						)}
					</button>
				</>
			}
		>
			{/* Thanh tiến trình */}
			{loading && (
				<div
					className={styles.cfmProgress}
					role='progressbar'
					aria-label='Đang tải lên'
				>
					<div className={styles.cfmProgressFill} />
				</div>
			)}

			{batchNote && (
				<div className={styles.cfmNoteRow}>
					<span className={styles.cfmNoteLabel}>Ghi chú</span>
					<span className={styles.cfmNoteValue}>"{batchNote}"</span>
				</div>
			)}

			<div className={styles.cfmUploadList}>
				{files.map((f, i) => {
					const ext = f.name.split('.').pop()?.toLowerCase() ?? 'file';
					const color = getFileTypeColor(ext);
					return (
						<div
							key={i}
							className={styles.cfmUploadRow}
						>
							<div
								className={styles.cfmFileBadge}
								style={{ background: color + '1a', color }}
							>
								{ext.toUpperCase()}
							</div>
							<span className={styles.cfmUploadName}>{f.name}</span>
							<span className={styles.cfmUploadSize}>{formatFileSize(f.size)}</span>
						</div>
					);
				})}
			</div>
		</Modal>
	);
}
