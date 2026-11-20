import { useState } from 'react';
import styles from '../pages/Topic.module.css';
import type { TopicFile } from '../types/topic.type';
import {
	formatFileSize,
	getFileTypeColor,
	getMimeExtension,
} from '../utils/topicHelpers';
import { formatDateVN } from '../../../shared/utils/formatDate';
import { AlertSvg as IcAlert, WarnSvg as IcWarn } from '@/assets/icons';
import { Modal } from '@/shared/components';

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
			setError(err instanceof Error ? err.message : 'Lỗi xóa file');
			setLoading(false);
		}
	};

	// Đang xóa thì không cho đóng (Esc, bấm nền, nút X) để tránh bỏ dở giữa chừng.
	const requestClose = () => {
		if (!loading) onClose();
	};

	return (
		<Modal
			open
			onClose={requestClose}
			title={isBulk ? `Xóa ${files.length} file?` : 'Xóa file?'}
			subtitle={
				isBulk
					? `${formatFileSize(totalSize)} • Hành động không thể hoàn tác`
					: 'Hành động này không thể hoàn tác'
			}
			icon={<IcWarn />}
			iconStyle={{ background: '#fef2f2', color: '#dc2626' }}
			size='sm'
			closeOnBackdrop={!loading}
			bodyClassName={styles.cfmModalBody}
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
								Đang xóa...
							</>
						) : isBulk ? (
							`Xóa ${files.length} file`
						) : (
							'Xác nhận xóa'
						)}
					</button>
				</>
			}
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
						const uploadedDate = formatDateVN(files[0].created_at);
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
				<IcWarn />
				<span>
					{isBulk
						? `${files.length} file sẽ bị xóa vĩnh viễn khỏi hệ thống và không thể khôi phục.`
						: 'File sẽ bị xóa vĩnh viễn khỏi hệ thống và không thể khôi phục.'}
				</span>
			</div>
		</Modal>
	);
}
