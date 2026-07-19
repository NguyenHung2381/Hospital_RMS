import { Fragment } from 'react';
import {
	BellSvg,
	CheckCircleSvg,
	ChevDSvg,
	RefreshSvg,
	SearchSvg,
	TrashSvg,
	WarnSvg,
} from '@/assets/icons';
import type { AdminNotification, NotificationRecipient } from '../api/notificationApi';
import { NOTIF_TYPES } from '../types/notification.type';
import { NOTIF_TYPE_MAP } from '../utils/notifUtils';
import { relativeTime } from '../../../shared/utils/formatDate';
import styles from '../pages/AdminNotifications.module.css';

interface NotificationHistoryTableProps {
	total: number;
	rows: AdminNotification[];
	page: number;
	setPage: (updater: (p: number) => number) => void;
	totalPages: number;
	search: string;
	setSearch: (v: string) => void;
	filterType: string;
	setFilterType: (v: string) => void;
	loading: boolean;
	expandedBatch: string | null;
	recipientsByBatch: Record<string, NotificationRecipient[]>;
	loadingRecipients: string | null;
	onToggleExpand: (batchKey: string) => void;
	onRefresh: () => void;
	onDeleteRequest: (row: AdminNotification) => void;
	onFilterChange: () => void;
}

export function NotificationHistoryTable({
	total,
	rows,
	page,
	setPage,
	totalPages,
	search,
	setSearch,
	filterType,
	setFilterType,
	loading,
	expandedBatch,
	recipientsByBatch,
	loadingRecipients,
	onToggleExpand,
	onRefresh,
	onDeleteRequest,
	onFilterChange,
}: NotificationHistoryTableProps) {
	const typeLabel = (t: string) => NOTIF_TYPES.find((x) => x.value === t)?.label ?? t;

	return (
		<section className={styles.card}>
			<div className={styles.cardHeader}>
				<div className={styles.cardHeaderIcon}>
					<BellSvg />
				</div>
				<div>
					<div className={styles.cardTitle}>Lịch sử thông báo</div>
					<div className={styles.cardSub}>Tổng cộng {total} thông báo trong hệ thống</div>
				</div>
				<button
					className={styles.btnRefresh}
					onClick={onRefresh}
					title='Làm mới'
				>
					<RefreshSvg style={{ width: 14, height: 14 }} />
				</button>
			</div>

			<div className={styles.historyToolbar}>
				<div className={styles.searchBox}>
					<SearchSvg />
					<input
						className={styles.searchInput}
						placeholder='Tìm tiêu đề...'
						value={search}
						onChange={(e) => {
							setSearch(e.target.value);
							onFilterChange();
						}}
					/>
				</div>
				<select
					className={styles.filterSelect}
					value={filterType}
					onChange={(e) => {
						setFilterType(e.target.value);
						onFilterChange();
					}}
				>
					<option value=''>Tất cả loại</option>
					{NOTIF_TYPES.map((t) => (
						<option
							key={t.value}
							value={t.value}
						>
							{t.label}
						</option>
					))}
				</select>
			</div>

			{loading ? (
				<div className={styles.loadingWrap}>
					<span className={styles.spinnerDark} />
				</div>
			) : rows.length === 0 ? (
				<div className={styles.emptyState}>
					<BellSvg
						style={{
							width: 36,
							height: 36,
							color: 'var(--color-gray-300)',
						}}
					/>
					<div className={styles.emptyTitle}>Chưa có thông báo nào</div>
				</div>
			) : (
				<div className={styles.tableWrap}>
					<table className={styles.table}>
						<thead>
							<tr>
								<th className={styles.th} />
								<th className={styles.th}>Loại</th>
								<th className={styles.th}>Tiêu đề / Nội dung</th>
								<th className={styles.th}>Người nhận</th>
								<th className={styles.th}>Đã đọc</th>
								<th className={styles.th}>Thời gian</th>
								<th className={styles.th} />
							</tr>
						</thead>
						<tbody>
							{rows.map((row) => {
								const category = NOTIF_TYPE_MAP[row.type] ?? 'system';
								const isExpanded = expandedBatch === row.batch_key;
								const allRead = row.read_count >= row.recipient_count;
								const recipients = recipientsByBatch[row.batch_key];
								return (
									<Fragment key={row.batch_key}>
										<tr className={styles.tr}>
											<td className={styles.td}>
												<button
													type='button'
													className={styles.expandBtn}
													onClick={() => onToggleExpand(row.batch_key)}
													title={isExpanded ? 'Thu gọn' : 'Xem người nhận'}
												>
													<ChevDSvg
														style={{
															width: 12,
															height: 12,
															transition: 'transform 180ms',
															transform: isExpanded ? 'none' : 'rotate(-90deg)',
														}}
													/>
												</button>
											</td>
											<td className={styles.td}>
												<span
													className={`${styles.typeBadge} ${styles[`type_${row.type}`] ?? styles[`type_${category}`]}`}
												>
													{typeLabel(row.type)}
												</span>
											</td>
											<td className={styles.td}>
												<div className={styles.rowTitle}>{row.title}</div>
												{row.message && <div className={styles.rowMsg}>{row.message}</div>}
											</td>
											<td className={styles.td}>
												<div className={styles.recipientName}>
													{row.recipient_count} người
												</div>
											</td>
											<td className={styles.td}>
												{allRead ? (
													<span className={styles.readBadge}>
														<CheckCircleSvg style={{ width: 12, height: 12 }} />
														{row.read_count}/{row.recipient_count}
													</span>
												) : (
													<span className={styles.unreadBadge}>
														<WarnSvg style={{ width: 12, height: 12 }} />
														{row.read_count}/{row.recipient_count}
													</span>
												)}
											</td>
											<td className={styles.td}>
												<div className={styles.timeText}>{relativeTime(row.created_at)}</div>
											</td>
											<td className={styles.td}>
												<button
													className={styles.btnDelete}
													onClick={() => onDeleteRequest(row)}
													title='Xoá'
												>
													<TrashSvg style={{ width: 14, height: 14 }} />
												</button>
											</td>
										</tr>
										{isExpanded && (
											<tr className={styles.recipientsRow}>
												<td
													className={styles.td}
													colSpan={7}
												>
													{loadingRecipients === row.batch_key ? (
														<div className={styles.recipientsLoading}>
															<span className={styles.spinnerDark} />
														</div>
													) : (
														<div className={styles.recipientsList}>
															{(recipients ?? []).map((r) => (
																<div
																	key={r.user_id}
																	className={styles.userNode}
																>
																	<span className={styles.userNodeName}>
																		{r.full_name}
																	</span>
																	<span className={styles.userNodeSub}>{r.username}</span>
																	{r.is_read ? (
																		<span className={styles.readBadge}>
																			<CheckCircleSvg style={{ width: 12, height: 12 }} />
																			Đã đọc
																		</span>
																	) : (
																		<span className={styles.unreadBadge}>
																			<WarnSvg style={{ width: 12, height: 12 }} />
																			Chưa đọc
																		</span>
																	)}
																</div>
															))}
														</div>
													)}
												</td>
											</tr>
										)}
									</Fragment>
								);
							})}
						</tbody>
					</table>
				</div>
			)}

			{totalPages > 1 && (
				<div className={styles.pagination}>
					<span className={styles.paginInfo}>
						Trang {page}/{totalPages} — {total} mục
					</span>
					<div className={styles.paginBtns}>
						<button
							className={styles.paginBtn}
							disabled={page === 1}
							onClick={() => setPage((p) => p - 1)}
						>
							‹
						</button>
						{Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map((p) => (
							<button
								key={p}
								className={`${styles.paginBtn} ${page === p ? styles.paginBtnActive : ''}`}
								onClick={() => setPage(() => p)}
							>
								{p}
							</button>
						))}
						<button
							className={styles.paginBtn}
							disabled={page === totalPages}
							onClick={() => setPage((p) => p + 1)}
						>
							›
						</button>
					</div>
				</div>
			)}
		</section>
	);
}
