import React, { useState } from 'react';
import styles from '../pages/Topic.module.css';
import { formatFileSize, getFileTypeColor } from '../utils/topicHelpers';
import { Ic } from './icons';

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
			setError(err instanceof Error ? err.message : 'Lỗi upload file');
			setLoading(false);
		}
	};

	const totalSize = files.reduce((s, f) => s + f.size, 0);

	return (
		<div
			className={styles.modalBackdrop}
			style={{ zIndex: 1100 }}
			onClick={(e) => {
				if (e.target === e.currentTarget && !loading) onClose();
			}}
		>
			<div
				className={`${styles.modal} ${styles.confirmModal} ${styles.confirmModalUpload}`}
				role='dialog'
				aria-modal='true'
			>
				{/* Header */}
				<div
					className={styles.cfmHeader}
					style={
						{
							'--cfm-accent': '#eff6ff',
							'--cfm-color': '#2563eb',
						} as React.CSSProperties
					}
				>
					<div className={styles.cfmHeaderIcon}>
						<Ic.Download />
					</div>
					<div className={styles.cfmHeaderText}>
						<div className={styles.cfmHeaderTitle}>Xác nhận tải lên</div>
						<div className={styles.cfmHeaderSub}>
							{files.length} file • {formatFileSize(totalSize)}
						</div>
					</div>
					<button
						className={styles.modalCloseBtn}
						onClick={onClose}
						disabled={loading}
						aria-label='Đóng'
					>
						<Ic.X />
					</button>
				</div>

				{/* Progress bar */}
				{loading && (
					<div className={styles.cfmProgress}>
						<div className={styles.cfmProgressFill} />
					</div>
				)}

				{/* Body */}
				<div
					className={styles.modalBody}
					style={{ gap: 'var(--space-3)' }}
				>
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
									<span className={styles.cfmUploadSize}>
										{formatFileSize(f.size)}
									</span>
								</div>
							);
						})}
					</div>
				</div>

				{/* Footer */}
				<div className={styles.modalFooter}>
					{error && (
						<span
							style={{ fontSize: 12, color: 'var(--color-red-600)', flex: 1 }}
						>
							<Ic.Alert /> {error}
						</span>
					)}
					<button
						className={styles.btnSecondary}
						onClick={onClose}
						disabled={loading}
					>
						Huỷ bỏ
					</button>
					<button
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
				</div>
			</div>
		</div>
	);
}
