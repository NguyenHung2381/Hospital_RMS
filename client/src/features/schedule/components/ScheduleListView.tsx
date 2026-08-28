import React from 'react';
import { PlusSvg } from '@/assets/icons';
import { DEADLINE_TYPE_LABELS, type RoundDeadline } from '../../round/types/round.type';
import { DEADLINE_COLORS, STATUS_CFG, type RoundRow } from '../types/schedule.type';
import { formatDateVN } from '../../../shared/utils/formatDate';
import styles from './ScheduleListView.module.css';

interface ScheduleListViewProps {
	rows: RoundRow[];
	gc: (key: string, fallback: string) => string;
	onAddDeadline: (round: RoundRow) => void;
	onEditDeadline: (round: RoundRow, deadline: RoundDeadline) => void;
}

export function ScheduleListView({
	rows,
	gc,
	onAddDeadline,
	onEditDeadline,
}: ScheduleListViewProps) {
	if (rows.length === 0) return null;

	return (
		<div className={styles.container}>
			{rows.map((round) => {
				const status = STATUS_CFG[round.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.closed;
				const regDeadline = round.deadlines.find((d) => d.deadline_type === 'edit' && d.start_date);
				const supDeadline = round.deadlines.find((d) => d.deadline_type === 'supplement' && d.start_date);

				return (
					<div key={round.id} className={styles.roundCard}>
						{/* Card Header */}
						<div className={styles.cardHeader}>
							<div className={styles.headerLeft}>
								<div className={styles.roundTitleRow}>
									<span className={styles.roundId}>{round.id}</span>
									<h3 className={styles.roundName}>{round.name}</h3>
									<span
										className={styles.statusBadge}
										style={{ '--status-color': status.color } as React.CSSProperties}
									>
										{status.label}
									</span>
								</div>
								<div className={styles.metaRow}>
									<span>Đợt {round.round_number} · Năm {round.year}</span>
									<span>•</span>
									<span>{round.topic_active} đề tài đang mở ({round.topic_total} tổng số)</span>
								</div>
							</div>
							<button
								className={styles.addBtn}
								onClick={() => onAddDeadline(round)}
							>
								<PlusSvg style={{ width: 12, height: 12 }} />
								Thêm mốc thời gian
							</button>
						</div>

						{/* Main Phases Summary Grid */}
						<div className={styles.phasesGrid}>
							<div className={styles.phaseCard} style={{ '--phase-color': '#378add' } as React.CSSProperties}>
								<span className={styles.phaseTitle}>Giai đoạn Sửa</span>
								<span className={styles.phaseDate}>
									{regDeadline?.start_date ? `${formatDateVN(regDeadline.start_date)} ➔ ${formatDateVN(regDeadline.deadline_date)}` : 'Chưa thiết lập'}
								</span>
							</div>
							<div className={styles.phaseCard} style={{ '--phase-color': status.color } as React.CSSProperties}>
								<span className={styles.phaseTitle}>Giai đoạn Nghiên cứu</span>
								<span className={styles.phaseDate}>
									{formatDateVN(round.start_date)} ➔ {formatDateVN(round.end_date)}
								</span>
							</div>
							{supDeadline && (
								<div className={styles.phaseCard} style={{ '--phase-color': '#ef9f27' } as React.CSSProperties}>
									<span className={styles.phaseTitle}>Giai đoạn Bổ sung</span>
									<span className={styles.phaseDate}>
										{supDeadline.start_date ? `${formatDateVN(supDeadline.start_date)} ➔ ${formatDateVN(supDeadline.deadline_date)}` : formatDateVN(supDeadline.deadline_date)}
									</span>
								</div>
							)}
						</div>

						{/* Vertical Timeline for Deadlines */}
						<div className={styles.timelineSection}>
							<div className={styles.sectionTitle}>
								📌 Danh sách mốc & Hạn nộp chi tiết ({round.deadlines.length})
							</div>
							{round.deadlines.length === 0 ? (
								<div className={styles.emptyDeadlines}>Chưa có mốc thời gian nào được thêm.</div>
							) : (
								<div className={styles.verticalList}>
									{round.deadlines.map((dl) => {
										const color = gc(
											`deadline-${dl.id}`,
											DEADLINE_COLORS[dl.deadline_type ?? ''] ?? '#888888',
										);

										return (
											<div
												key={dl.id}
												className={styles.deadlineItem}
												onClick={() => onEditDeadline(round, dl)}
												title="Nhấp để chỉnh sửa mốc thời gian"
												style={{ '--dl-color': color } as React.CSSProperties}
											>
												<div className={styles.deadlineDot} />
												<div className={styles.deadlineInfo}>
													<span className={styles.deadlineName}>{dl.name}</span>
													<div className={styles.deadlineMeta}>
														{dl.phase && <span className={styles.phaseBadge}>P{dl.phase}</span>}
														<span>Loại: {dl.deadline_type ? (DEADLINE_TYPE_LABELS[dl.deadline_type] ?? dl.deadline_type) : 'Khác'}</span>
													</div>
												</div>
												<div className={styles.deadlineDateBadge}>
													{dl.start_date ? `${formatDateVN(dl.start_date)} ➔ ${formatDateVN(dl.deadline_date)}` : formatDateVN(dl.deadline_date)}
												</div>
											</div>
										);
									})}
								</div>
							)}
						</div>
					</div>
				);
			})}
		</div>
	);
}
