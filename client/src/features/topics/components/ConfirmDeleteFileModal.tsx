import React, { useState } from 'react';
import type { TopicFile } from '../types/topic.type';
import styles from '../pages/Topic.module.css';
import { formatFileSize, getFileTypeColor, getMimeExtension } from '../utils/topicHelpers';
import { Ic } from '../utils/topicIcons';

export function ConfirmDeleteFileModal({
	files,
	onClose,
	onConfirm,
}: {
	files: TopicFile[];
	onClose: () => void;
	onConfirm: () => Promise<void>;
}) {
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');

	const totalSize = files.reduce((s, f) => s + f.file_size, 0);
	const isBulk = files.length > 1;

	const go = async () => {
		setLoading(true);
		setError('');
		try {
			await onConfirm();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Lỗi xoá file');
			setLoading(false);
		}
	};

	return (
		<div
			className={styles.modalBackdrop}
			style={{ zIndex: 1100 }}
			onClick={(e) => {
				if (e.target === e.currentTarget && !loading) onClose();
			}}
		>
			<div
				className={`${styles.modal} ${styles.confirmModal}`}
				role='alertdialog'
				aria-modal='true'
			>
				{/* Header */}
				<div
					className={styles.cfmHeader}
					style={
						{
							'--cfm-accent': '#fef2f2',
							'--cfm-color': '#dc2626',
						} as React.CSSProperties
					}
				>
					<div className={styles.cfmHeaderIcon}>
						<Ic.Warn />
					</div>
					<div className={styles.cfmHeaderText}>
						<div className={styles.cfmHeaderTitle}>
							{isBulk ? `Xoá ${files.length} file?` : 'Xoá file?'}
						</div>
						<div className={styles.cfmHeaderSub}>
							{isBulk
								? `${formatFileSize(totalSize)} • Hành động không thể hoàn tác`
								: 'Hành động này không thể hoàn tác'}
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

				{/* Body */}
				<div
					className={styles.modalBody}
					style={{ gap: 'var(--space-4)' }}
				>
					{isBulk ? (
						<div className={styles.cfmUploadList}>
							{files.map((f) => {
								const ext = getMimeExtension(f.mime_type);
								const color = getFileTypeColor(ext);
								return (
									<div
										key={f.id}
										className={styles.cfmUploadRow}
									>
										<div
											className={styles.cfmFileBadge}
											style={{ background: color + '1a', color }}
										>
											{ext.toUpperCase()}
										</div>
										<span className={styles.cfmUploadName}>{f.file_name}</span>
										<span className={styles.cfmUploadSize}>
											{formatFileSize(f.file_size)}
										</span>
									</div>
								);
							})}
						</div>
					) : (
						<div className={styles.cfmFileCard}>
							{(() => {
								const ext = getMimeExtension(files[0].mime_type);
								const color = getFileTypeColor(ext);
								const uploadedDate = new Date(
									files[0].created_at,
								).toLocaleDateString('vi-VN', {
									day: '2-digit',
									month: '2-digit',
									year: 'numeric',
								});
								return (
									<>
										<div
											className={styles.cfmFileBadge}
											style={{ background: color + '1a', color }}
										>
											{ext.toUpperCase()}
										</div>
										<div className={styles.cfmFileInfo}>
											<div className={styles.cfmFileName}>
												{files[0].file_name}
											</div>
											<div className={styles.cfmFileMeta}>
												<span>{formatFileSize(files[0].file_size)}</span>
												<span className={styles.cfmMetaDot} />
												<span>{files[0].uploaded_by_name}</span>
												<span className={styles.cfmMetaDot} />
												<span>{uploadedDate}</span>
											</div>
										</div>
									</>
								);
							})()}
						</div>
					)}

					<div className={styles.cfmWarningBox}>
						<Ic.Warn />
						<span>
							{isBulk
								? `${files.length} file sẽ bị xoá vĩnh viễn khỏi hệ thống và không thể khôi phục.`
								: 'File sẽ bị xoá vĩnh viễn khỏi hệ thống và không thể khôi phục.'}
						</span>
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
						className={styles.btnDanger}
						onClick={go}
						disabled={loading}
					>
						{loading ? (
							<>
								<span
									className={styles.spinner}
									style={{ borderTopColor: '#791F1F' }}
								/>
								Đang xoá...
							</>
						) : isBulk ? (
							`Xoá ${files.length} file`
						) : (
							'Xác nhận xoá'
						)}
					</button>
				</div>
			</div>
		</div>
	);
}
