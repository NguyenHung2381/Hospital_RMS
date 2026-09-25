import {
	CalendarSvg,
	EditSvg,
	LinkSvg,
	TrashSvg,
} from '@/assets/icons';
import { Badge } from '@/shared/components';
import type { ResearchRound } from '../types/round.type';
import {
	calcDaysLeft,
	calcTimeProgress,
	getProgressColor,
	STATUS_CFG,
} from '../utils/roundHelpers';
import { formatDateVN } from '../../../shared/utils/formatDate';
import styles from '../pages/Round.module.css';

interface RoundCardProps {
	round: ResearchRound;
	onEdit: () => void;
	onDelete: () => void;
	onCopyLink: (token: string) => void;
}

export function RoundCard({
	round,
	onEdit,
	onDelete,
	onCopyLink,
}: RoundCardProps) {
	const sc = STATUS_CFG[round.status] ?? STATUS_CFG.draft;
	const timePct =
		round.status === 'active'
			? calcTimeProgress(round.start_date, round.end_date)
			: round.status === 'closed'
				? 100
				: 0;
	const daysLeft = round.status === 'active' ? calcDaysLeft(round.end_date) : 0;
	const topicPct =
		round.topic_total > 0
			? Math.round((round.topic_completed / round.topic_total) * 100)
			: 0;

	return (
		<div
			className={`${styles.roundCard} ${round.status === 'active' ? styles.isActive : ''}`}
		>
			<div
				className={`${styles.roundCardBar} ${styles[sc.barCls as keyof typeof styles]}`}
			/>

			<div className={styles.roundCardBody}>
				<div className={styles.roundCardHeader}>
					<div style={{ flex: 1, minWidth: 0 }}>
						<div className={styles.roundCardId}>{round.id}</div>
						<div className={styles.roundCardName}>{round.name}</div>
						<div className={styles.roundCardSubname}>
							Đợt {round.round_number} · Năm {round.year}
							{round.round_type_name ? ` · ${round.round_type_name}` : ''}
						</div>
					</div>
					<Badge
						tone={sc.tone}
						dot
					>
						{sc.label}
					</Badge>
				</div>

				<div className={styles.dateRange}>
					<CalendarSvg />
					<span>{formatDateVN(round.start_date)}</span>
					<div className={styles.dateSep} />
					<span>{formatDateVN(round.end_date)}</span>
					{round.status === 'active' && daysLeft > 0 && (
						<span
							style={{
								marginLeft: 'auto',
								fontSize: 11,
								fontWeight: 700,
								color: daysLeft <= 30 ? '#A32D2D' : 'var(--color-primary-dark)',
								background:
									daysLeft <= 30 ? '#FCEBEB' : 'var(--color-primary-pale)',
								padding: '2px 8px',
								borderRadius: 999,
							}}
						>
							{daysLeft} ngày còn lại
						</span>
					)}
				</div>

				{round.status === 'draft' && (
					<div className={styles.scheduledInfo}>
						<CalendarSvg />
						<span>Chưa mở đăng ký</span>
					</div>
				)}

				{round.status === 'active' && (
					<div className={styles.cardProgressWrap}>
						<div className={styles.cardProgressLabel}>
							<span>Tiến độ thời gian</span>
							<strong>{timePct}%</strong>
						</div>
						<div className={styles.progressTrack}>
							<div
								className={styles.progressFill}
								style={{
									width: `${timePct}%`,
									background: getProgressColor(timePct),
								}}
							/>
						</div>
					</div>
				)}

				{round.status === 'closed' && round.topic_total > 0 && (
					<div className={styles.cardProgressWrap}>
						<div className={styles.cardProgressLabel}>
							<span>Tỷ lệ đề tài hoàn thành</span>
							<strong>{topicPct}%</strong>
						</div>
						<div className={styles.progressTrack}>
							<div
								className={styles.progressFill}
								style={{ width: `${topicPct}%`, background: '#0A9B4A' }}
							/>
						</div>
					</div>
				)}

				<div className={styles.cardStats}>
					<div className={styles.cardStat}>
						<div className={styles.cardStatVal}>{round.topic_total}</div>
						<div className={styles.cardStatLbl}>Tổng đề tài</div>
					</div>
					<div className={styles.cardStat}>
						<div
							className={styles.cardStatVal}
							style={{ color: round.topic_active > 0 ? '#0C447C' : 'inherit' }}
						>
							{round.topic_active}
						</div>
						<div className={styles.cardStatLbl}>Đang thực hiện</div>
					</div>
					<div className={styles.cardStat}>
						<div
							className={styles.cardStatVal}
							style={{
								color: round.topic_completed > 0 ? '#085028' : 'inherit',
							}}
						>
							{round.topic_completed}
						</div>
						<div className={styles.cardStatLbl}>Hoàn thành</div>
					</div>
				</div>
			</div>

			<div className={styles.roundCardFooter}>
				<div
					className={styles.linkRow}
					onClick={() => onCopyLink(round.public_token)}
					title='Sao chép link đăng ký đề tài'
				>
					<LinkSvg />
					<span className={styles.linkRowText}>
						/dang-ky-de-tai?token={round.public_token.slice(0, 10)}…
					</span>
					<span className={styles.linkRowHint}>Sao chép</span>
				</div>
				<div className={styles.roundCardActions}>
					<div
						className={styles.actionBtn}
						title='Chỉnh sửa'
						onClick={onEdit}
					>
						<EditSvg style={{ width: 14, height: 14 }} />
					</div>
					<div
						className={`${styles.actionBtn} ${styles.danger}`}
						title='Xoá đợt'
						onClick={onDelete}
					>
						<TrashSvg />
					</div>
				</div>
			</div>
		</div>
	);
}
