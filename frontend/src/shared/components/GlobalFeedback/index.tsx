import { useEffect, useState, useSyncExternalStore } from 'react';
import { dismissToast, feedbackStore } from '../../utils/feedback';
import styles from './GlobalFeedback.module.css';

// Chỉ hiện chỉ báo khi tác vụ chạy đủ lâu — request nhanh không gây nhấp nháy.
const BAR_DELAY_MS = 200;
const OVERLAY_DELAY_MS = 400;

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
	const { reads, writes, toasts } = useSyncExternalStore(
		feedbackStore.subscribe,
		feedbackStore.getSnapshot,
	);
	const showBar = useDelayedFlag(reads + writes > 0, BAR_DELAY_MS);
	const showOverlay = useDelayedFlag(writes > 0, OVERLAY_DELAY_MS);

	return (
		<>
			{showBar && <div className={styles.bar} role='progressbar' aria-label='Đang tải dữ liệu' />}

			{showOverlay && (
				<div className={styles.overlay} aria-live='polite' aria-busy='true'>
					<div className={styles.savingCard}>
						<div className={styles.spinner} />
						Đang xử lý dữ liệu, vui lòng chờ…
					</div>
				</div>
			)}

			<div className={styles.toasts} aria-live='polite'>
				{toasts.map((t) => (
					<div key={t.id} className={`${styles.toast} ${styles[t.type]}`} role='status'>
						{icons[t.type]}
						<span className={styles.msg}>{t.msg}</span>
						<button type='button' className={styles.close} aria-label='Đóng' onClick={() => dismissToast(t.id)}>
							×
						</button>
					</div>
				))}
			</div>
		</>
	);
}
