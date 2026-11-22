import { Badge } from '@/shared/components';
import { cx } from '@/shared/utils/cx';
import type { RegistrationFileCheck } from '../../public/api/publicApi';
import styles from './FileCheckNote.module.css';

// Kết quả tự kiểm tra loại file hồ sơ (OCR / mã QR, backend docCheck/) cho người duyệt —
// chỉ là gợi ý, người duyệt vẫn mở file xem và quyết định.
export function FileCheckNote({ check }: { check: RegistrationFileCheck | null | undefined }) {
	if (!check) return null;
	if (check.level === 'ok')
		return (
			<span className={styles.inline} title={check.message}>
				<Badge tone='green'>Tự kiểm: đúng loại</Badge>
			</span>
		);
	if (check.level === 'info') return <span className={cx(styles.inline, styles.muted)}>{check.message}</span>;
	return (
		<div className={styles.warn} role='note'>
			<strong>Tự kiểm tra:</strong> {check.message}
			{check.warnings.length > 0 && (
				<ul className={styles.list}>
					{check.warnings.map((w) => (
						<li key={w.code}>{w.message}</li>
					))}
				</ul>
			)}
			<span className={styles.hint}>Kết quả máy đọc có thể sai — mở file để xác nhận.</span>
		</div>
	);
}
