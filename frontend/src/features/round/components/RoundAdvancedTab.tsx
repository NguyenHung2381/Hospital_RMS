import { useState } from 'react';
import type React from 'react';
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
import { toInputDate } from '../utils/roundHelpers';
import { DeadlineManager } from './DeadlineManager';
import styles from '../pages/Round.module.css';

interface RoundAdvancedTabProps {
	round: ResearchRound;
}

// Hai kiểu đăng ký đề tài dùng chung public_token của đợt:
// - Công khai (/de-xuat-de-tai): không cần tài khoản, form rút gọn + captcha.
// - Khoa/phòng (/dang-ky-de-tai): tài khoản khoa/phòng đăng nhập, form đầy đủ
//   (thành viên, file đính kèm, nhiều đề tài/lần).
const REGISTER_LINKS = [
	{
		key: 'public',
		path: '/de-xuat-de-tai',
		label: 'Liên kết đăng ký công khai',
		hint: 'Ai cũng mở được, không cần tài khoản — điền form rút gọn và xác nhận captcha.',
	},
	{
		key: 'department',
		path: '/dang-ky-de-tai',
		label: 'Liên kết đăng ký theo khoa/phòng',
		hint: 'Yêu cầu đăng nhập tài khoản khoa/phòng — form đầy đủ: thành viên, file đính kèm, nộp nhiều đề tài.',
	},
] as const;

export function RoundAdvancedTab({ round }: RoundAdvancedTabProps) {
	const [copiedKey, setCopiedKey] = useState<string | null>(null);

	const copy = async (key: string, text: string) => {
		try {
			await navigator.clipboard.writeText(text);
			setCopiedKey(key);
			setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 2000);
		} catch (err) {
			console.error('Copy failed', err);
		}
	};

	const buildLink = (path: string) =>
		`${window.location.origin}${path}?token=${round.public_token}`;

	const topicTotal = round.topic_total || 0;
	const topicActive = round.topic_active || 0;
	const topicCompleted = round.topic_completed || 0;
	const topicOther = Math.max(0, topicTotal - topicActive - topicCompleted);

	const activePct = topicTotal ? Math.round((topicActive / topicTotal) * 100) : 0;
	const completedPct = topicTotal ? Math.round((topicCompleted / topicTotal) * 100) : 0;
	const otherPct = topicTotal ? Math.round((topicOther / topicTotal) * 100) : 0;

	const copyButton = (key: string, text: string, idleIcon: React.ReactNode, idleLabel: string) => (
		<button
			type='button'
			className={`${styles.btnCopy} ${copiedKey === key ? styles.btnCopySuccess : ''}`}
			onClick={() => void copy(key, text)}
		>
			{copiedKey === key ? (
				<>
					<CheckSvg style={{ width: 14, height: 14 }} />
					<span>Đã chép!</span>
				</>
			) : (
				<>
					{idleIcon}
					<span>{idleLabel}</span>
				</>
			)}
		</button>
	);

	return (
		<>
			<div className={styles.formSection}>
				Mã truy cập &amp; Liên kết đăng ký đề tài
			</div>

			<div className={styles.tokenAccessCard}>
				<div className={styles.tokenHeader}>
					<KeySvg />
					<span>Cài đặt bảo mật &amp; Truy cập</span>
				</div>
				<div className={styles.tokenBody}>
					<span className={styles.tokenWarningText}>
						Đợt này có 2 cách đăng ký đề tài: công khai (không cần tài khoản) hoặc theo khoa/phòng (đăng nhập tài khoản khoa/phòng). Cả hai liên kết đều tự chọn sẵn đợt này.
					</span>
					<div className={styles.tokenRow}>
						<div className={styles.tokenValueBox} title='Mã token'>
							{round.public_token}
						</div>
						{copyButton('token', round.public_token, <CopySvg style={{ width: 14, height: 14 }} />, 'Sao chép mã')}
					</div>
					{REGISTER_LINKS.map((l) => {
						const link = buildLink(l.path);
						return (
							<div key={l.key}>
								<span className={styles.tokenWarningText}>
									<strong>{l.label}:</strong> {l.hint}
								</span>
								<div className={styles.tokenRow}>
									<div className={styles.tokenValueBox} title={l.label}>
										{link}
									</div>
									{copyButton(l.key, link, <LinkSvg style={{ width: 14, height: 14 }} />, 'Sao chép liên kết')}
								</div>
							</div>
						);
					})}
				</div>
			</div>

			<div className={styles.formSection}>Mốc thời gian &amp; Hạn nộp</div>
			<DeadlineManager
				roundId={round.id}
				roundStart={toInputDate(round.start_date)}
				roundEnd={toInputDate(round.end_date)}
			/>

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
