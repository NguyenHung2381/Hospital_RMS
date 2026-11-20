import { useEffect, useState, useSyncExternalStore } from 'react';
import { cancelUploads, dismissToast, feedbackStore } from '../../utils/feedback';
import styles from './GlobalFeedback.module.css';

// Chỉ hiện chỉ báo khi tác vụ chạy đủ lâu — request nhanh không gây nhấp nháy.
const BAR_DELAY_MS = 200;
const OVERLAY_DELAY_MS = 400;
const UPLOAD_MIN_BYTES = 256 * 1024;

const fmtMB = (bytes: number) => `${(bytes / 1048576).toFixed(1).replace('.', ',')} MB`;

function useDelayedFlag(active: boolean, delay: number) {
	const [shown, setShown] = useState(false);
	useEffect(() => {
		if (!active) return;
		const t = setTimeout(() => setShown(true), delay);
		return () => {
			clearTimeout(t);
			setShown(false);
		};
	}, [active, delay]);
	return active && shown;
}

const icons = {
	success: (
		<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.4' strokeLinecap='round' strokeLinejoin='round'>
			<circle cx='12' cy='12' r='10' />
			<path d='m8 12.5 2.7 2.7L16 9.8' />
		</svg>
	),
	error: (
		<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.4' strokeLinecap='round'>
			<circle cx='12' cy='12' r='10' />
			<path d='M12 7.5v5.5M12 16.5h.01' />
		</svg>
	),
	info: (
		<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.4' strokeLinecap='round'>
			<circle cx='12' cy='12' r='10' />
			<path d='M12 11v5.5M12 7.5h.01' />
		</svg>
	),
};

/**
 * Phản hồi toàn cục, gắn 1 lần ở AppProviders:
 *   - thanh tiến trình trên cùng khi có bất kỳ request nào đang chạy
 *   - lớp phủ "Đang lưu dữ liệu…" khi thao tác ghi chạy lâu (chặn bấm lưu 2 lần)
 *   - toast từ notify.success / notify.error
 */
export function GlobalFeedback() {
	const { reads, writes, toasts, upload } = useSyncExternalStore(
		feedbackStore.subscribe,
		feedbackStore.getSnapshot,
	);
	const showBar = useDelayedFlag(reads + writes > 0, BAR_DELAY_MS);
	const showOverlay = useDelayedFlag(writes > 0, OVERLAY_DELAY_MS);

	// Form nhỏ không kèm file gửi xong gần như tức thì — chỉ hiện tiến trình khi đáng kể
	const uploading = upload && upload.total >= UPLOAD_MIN_BYTES ? upload : null;
	const pct = uploading ? Math.min(100, Math.floor((uploading.loaded / uploading.total) * 100)) : 0;
	// Gửi đủ byte rồi nhưng máy chủ còn kiểm tra định dạng, quét virus, ghi CSDL
	const sent = !!uploading && uploading.loaded >= uploading.total;

	return (
		<>
			{showBar && <div className={styles.bar} role='progressbar' aria-label='Đang tải dữ liệu' />}

			{showOverlay && (
				<div className={styles.overlay} aria-live='polite' aria-busy='true'>
					{uploading ? (
						<div className={`${styles.savingCard} ${styles.uploadCard}`}>
							<div className={styles.uploadHead}>
								<div className={styles.spinner} />
								<span className={styles.uploadTitle}>
									{sent ? 'Đã gửi xong, máy chủ đang kiểm tra và lưu file…' : 'Đang tải file lên…'}
								</span>
								{!sent && (
									<span className={styles.uploadPct} aria-hidden='true'>
										{pct}%
									</span>
								)}
							</div>
							<div
								className={styles.uploadTrack}
								role='progressbar'
								aria-label='Tiến trình tải lên'
								aria-valuemin={0}
								aria-valuemax={100}
								aria-valuenow={pct}
							>
								<div className={styles.uploadFill} style={{ transform: `scaleX(${pct / 100})` }} />
							</div>
							<div className={styles.uploadFoot}>
								<span aria-hidden='true'>
									{fmtMB(uploading.loaded)} / {fmtMB(uploading.total)}
								</span>
								{!sent && (
									<button type='button' className={styles.action} onClick={cancelUploads}>
										Hủy
									</button>
								)}
							</div>
						</div>
					) : (
						<div className={styles.savingCard}>
							<div className={styles.spinner} />
							Đang xử lý dữ liệu, vui lòng chờ…
						</div>
					)}
				</div>
			)}

			<div className={styles.toasts} aria-live='polite'>
				{toasts.map((t) => (
					<div key={t.id} className={`${styles.toast} ${styles[t.type]}`} role='status'>
						{icons[t.type]}
						<span className={styles.msg}>{t.msg}</span>
						{t.action && (
							<button
								type='button'
								className={styles.action}
								onClick={() => {
									dismissToast(t.id);
									t.action?.onClick();
								}}
							>
								{t.action.label}
							</button>
						)}
						<button type='button' className={styles.close} aria-label='Đóng' onClick={() => dismissToast(t.id)}>
							×
						</button>
					</div>
				))}
			</div>
		</>
	);
}
