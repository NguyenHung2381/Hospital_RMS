import { CheckSvg, KeySvg, UsersSvg, XSvg } from '@/assets/icons';
import styles from '../pages/UserList.module.css';
import { Skeleton } from '../../../shared/components/Loading';

interface UserStatsRowProps {
	total: number;
	active: number;
	inactive: number;
	pwdWarn: number;
	loading?: boolean;
}

export function UserStatsRow({
	total,
	active,
	inactive,
	pwdWarn,
	loading,
}: UserStatsRowProps) {
	return (
		<div className={styles.statsRow}>
			<div className={`${styles.statCard} ${styles.statGreen}`}>
				<div className={`${styles.statIcon} ${styles.iconGreen}`}>
					<UsersSvg />
				</div>
				<div className={styles.statBody}>
					<div className={styles.statValue}>
						{loading ? <Skeleton width={50} height={28} style={{ verticalAlign: 'middle' }} /> : total}
					</div>
					<div className={styles.statLabel}>Tổng tài khoản</div>
				</div>
			</div>
			<div className={`${styles.statCard} ${styles.statBlue}`}>
				<div className={`${styles.statIcon} ${styles.iconBlue}`}>
					<CheckSvg />
				</div>
				<div className={styles.statBody}>
					<div className={styles.statValue}>
						{loading ? <Skeleton width={50} height={28} style={{ verticalAlign: 'middle' }} /> : active}
					</div>
					<div className={styles.statLabel}>Đang hoạt động</div>
					<div className={`${styles.statDelta} ${styles.deltaUp}`}>
						{loading ? (
							<Skeleton width={80} height={14} />
						) : (
							`${total > 0 ? Math.round((active / total) * 100) : 0}% tổng tài khoản`
						)}
					</div>
				</div>
			</div>
			<div className={`${styles.statCard} ${styles.statAmber}`}>
				<div className={`${styles.statIcon} ${styles.iconAmber}`}>
					<XSvg />
				</div>
				<div className={styles.statBody}>
					<div className={styles.statValue}>
						{loading ? <Skeleton width={50} height={28} style={{ verticalAlign: 'middle' }} /> : inactive}
					</div>
					<div className={styles.statLabel}>Tạm khoá</div>
				</div>
			</div>
			<div className={`${styles.statCard} ${styles.statRed}`}>
				<div className={`${styles.statIcon} ${styles.iconRed}`}>
					<KeySvg />
				</div>
				<div className={styles.statBody}>
					<div className={styles.statValue}>
						{loading ? <Skeleton width={50} height={28} style={{ verticalAlign: 'middle' }} /> : pwdWarn}
					</div>
					<div className={styles.statLabel}>Mật khẩu cũ &gt;90 ngày</div>
					<div className={`${styles.statDelta} ${styles.deltaDown}`}>
						{loading ? <Skeleton width={80} height={14} /> : 'Cần nhắc đổi mật khẩu'}
					</div>
				</div>
			</div>
		</div>
	);
}
