import logo from '../../../assets/logo-spinner.png';
import styles from './Loading.module.css';

/** Màn chờ toàn trang (tải bundle / phiên đăng nhập) — chỉ báo không xác định, không có phần trăm giả. */
export default function PageLoading() {
	return (
		<div
			className={styles.wrapper}
			role='status'
			aria-live='polite'
		>
			<span className={styles.srOnly}>Đang tải…</span>
			<div
				className={styles.glowOrb}
				aria-hidden='true'
			/>
			<div
				className={styles.glowOrb}
				aria-hidden='true'
			/>

			<div
				className={styles.spinnerWrapper}
				aria-hidden='true'
			>
				<div className={styles.ringOuter} />
				<div className={styles.ringInner} />
				<img
					src={logo}
					alt=''
					className={styles.logoCircle}
					fetchPriority='high'
				/>
			</div>

			<div
				className={styles.progressTrack}
				aria-hidden='true'
			>
				<div className={styles.progressIndeterminate} />
			</div>
		</div>
	);
}

export {
	Skeleton,
	InlineLoading,
	SkeletonTable,
	SkeletonCard,
} from './Skeleton';
