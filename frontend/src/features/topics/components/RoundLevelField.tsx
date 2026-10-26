import { LayersSvg } from '@/assets/icons';
import styles from '../pages/TopicRegister.module.css';

// Cấp độ đề tài lấy theo đợt (mỗi đợt 1 cấp độ, server tự gán) — chỉ hiển thị, không cho chọn.
export function RoundLevelField({ levelName }: { levelName: string | null }) {
	return (
		<div
			className={styles.lockedField}
			title='Cấp độ đề tài lấy theo cấu hình của đợt nghiên cứu'
		>
			<LayersSvg className={styles.lockedFieldIcon} />
			<span
				className={styles.lockedFieldText}
				style={levelName ? undefined : { fontWeight: 400, color: 'var(--color-gray-400)' }}
			>
				{levelName ?? 'Đợt chưa cấu hình cấp độ'}
			</span>
			<span className={styles.lockedFieldTag}>Theo đợt</span>
		</div>
	);
}
