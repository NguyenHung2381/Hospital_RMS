import { useState } from 'react';
import {
	ActivitySvg,
	CheckCircleSvg,
	CheckSvg,
	ClipboardSvg,
	CopySvg,
	KeySvg,
	LinkSvg,
} from '@/assets/icons';
import type { ResearchRound } from '../types/round.type';
import { DeadlineManager } from './DeadlineManager';
import styles from '../pages/Round.module.css';

interface RoundAdvancedTabProps {
	round: ResearchRound;
}

export function RoundAdvancedTab({ round }: RoundAdvancedTabProps) {
	const [tokenCopied, setTokenCopied] = useState(false);
	const [linkCopied, setLinkCopied] = useState(false);

	const handleCopyToken = async (token: string) => {
		try {
			await navigator.clipboard.writeText(token);
			setTokenCopied(true);
			setTimeout(() => setTokenCopied(false), 2000);
		} catch (err) {
			console.error('Copy failed', err);
		}
	};

	const handleCopyLink = async (token: string) => {
		try {
			const link = `${window.location.origin}/portal?token=${token}`;
			await navigator.clipboard.writeText(link);
			setLinkCopied(true);
			setTimeout(() => setLinkCopied(false), 2000);
		} catch (err) {
			console.error('Copy failed', err);
		}
	};

	const topicTotal = round.topic_total || 0;
	const topicActive = round.topic_active || 0;
	const topicCompleted = round.topic_completed || 0;
	const topicOther = Math.max(0, topicTotal - topicActive - topicCompleted);

	const activePct = topicTotal ? Math.round((topicActive / topicTotal) * 100) : 0;
	const completedPct = topicTotal ? Math.round((topicCompleted / topicTotal) * 100) : 0;
	const otherPct = topicTotal ? Math.round((topicOther / topicTotal) * 100) : 0;

	return (
		<>
			<div className={styles.formSection}>
				Mã truy cập &amp; Liên kết đăng ký công khai
			</div>

			<div className={styles.tokenAccessCard}>
				<div className={styles.tokenHeader}>
					<KeySvg />
					<span>Cài đặt bảo mật &amp; Truy cập công khai</span>
				</div>
				<div className={styles.tokenBody}>
					<span className={styles.tokenWarningText}>
						Cung cấp mã khóa này hoặc liên kết trực tiếp cho các khoa/phòng để họ có thể tự đăng ký đề tài nghiên cứu mà không cần phải có tài khoản hệ thống.
					</span>
					<div className={styles.tokenRow}>
						<div className={styles.tokenValueBox} title='Mã token'>
							{round.public_token}
						</div>
						<button
							type='button'
							className={`${styles.btnCopy} ${tokenCopied ? styles.btnCopySuccess : ''}`}
							onClick={() => void handleCopyToken(round.public_token)}
						>
							{tokenCopied ? (
								<>
									<CheckSvg style={{ width: 14, height: 14 }} />
									<span>Đã chép!</span>
								</>
							) : (
								<>
									<CopySvg style={{ width: 14, height: 14 }} />
									<span>Sao chép mã</span>
								</>
							)}
						</button>
					</div>
					<div className={styles.tokenRow}>
						<div className={styles.tokenValueBox} title='Đường dẫn đăng ký đề tài'>
							{`${window.location.origin}/portal?token=${round.public_token}`}
						</div>
						<button
							type='button'
							className={`${styles.btnCopy} ${linkCopied ? styles.btnCopySuccess : ''}`}
							onClick={() => void handleCopyLink(round.public_token)}
						>
							{linkCopied ? (
								<>
									<CheckSvg style={{ width: 14, height: 14 }} />
									<span>Đã chép!</span>
								</>
							) : (
								<>
									<LinkSvg style={{ width: 14, height: 14 }} />
									<span>Sao chép liên kết</span>
								</>
							)}
						</button>
					</div>
				</div>
			</div>

			<div className={styles.formSection}>Mốc thời gian &amp; Hạn nộp</div>
			<DeadlineManager roundId={round.id} />

			<div className={styles.formSection}>
				Thống kê đề tài trong đợt
			</div>

			<div className={styles.modalStatsGrid}>
				<div className={`${styles.modalStatCard} ${styles.total}`}>
					<div className={styles.modalStatIcon}>
						<ClipboardSvg />
					</div>
					<div className={styles.modalStatBody}>
						<div className={styles.modalStatValue}>{topicTotal}</div>
						<div className={styles.modalStatLabel}>Tổng đề tài</div>
					</div>
				</div>

				<div className={`${styles.modalStatCard} ${styles.active}`}>
					<div className={styles.modalStatIcon}>
						<ActivitySvg />
					</div>
					<div className={styles.modalStatBody}>
						<div className={styles.modalStatValue}>{topicActive}</div>
						<div className={styles.modalStatLabel}>Đang chạy</div>
					</div>
				</div>

				<div className={`${styles.modalStatCard} ${styles.completed}`}>
					<div className={styles.modalStatIcon}>
						<CheckCircleSvg />
					</div>
					<div className={styles.modalStatBody}>
						<div className={styles.modalStatValue}>{topicCompleted}</div>
						<div className={styles.modalStatLabel}>Hoàn thành</div>
					</div>
				</div>
			</div>

			<div className={styles.progressSection}>
				<div className={styles.progressHeader}>
					<span className={styles.progressTitle}>Tỷ lệ hoàn thành đề tài</span>
					<span className={styles.progressPercent}>
						{topicTotal ? Math.round((topicCompleted / topicTotal) * 100) : 0}%
					</span>
				</div>

				<div className={styles.segmentedProgressTrack}>
					<div
						className={`${styles.progressSegment} ${styles.segmentCompleted}`}
						style={{ width: `${completedPct}%` }}
						title={`Hoàn thành: ${completedPct}%`}
					/>
					<div
						className={`${styles.progressSegment} ${styles.segmentActive}`}
						style={{ width: `${activePct}%` }}
						title={`Đang thực hiện: ${activePct}%`}
					/>
					<div
						className={`${styles.progressSegment} ${styles.segmentOther}`}
						style={{ width: `${otherPct}%` }}
						title={`Trạng thái khác: ${otherPct}%`}
					/>
				</div>

				<div className={styles.progressLegend}>
					<div className={styles.legendItem}>
						<span className={styles.legendDot} style={{ background: '#10b981' }} />
						<span>Hoàn thành ({topicCompleted})</span>
					</div>
					<div className={styles.legendItem}>
						<span className={styles.legendDot} style={{ background: '#3b82f6' }} />
						<span>Đang thực hiện ({topicActive})</span>
					</div>
					{topicOther > 0 && (
						<div className={styles.legendItem}>
							<span className={styles.legendDot} style={{ background: '#9ca3af' }} />
							<span>Khác ({topicOther})</span>
						</div>
					)}
				</div>
			</div>
		</>
	);
}
