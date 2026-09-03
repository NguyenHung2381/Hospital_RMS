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
import {
	BulkBar,
	Card,
	EmptyState,
	Pagination,
	SelectCheckbox,
} from '@/shared/components';
import { PAGE_SIZE_OPTIONS } from '@/shared/utils';
import sel from '@/shared/components/Table/RowSelect.module.css';
import { useRowSelection } from '@/shared/hooks/useRowSelection';
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
	onBulkDelete: (batchKeys: string[]) => Promise<void> | void;
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
	onBulkDelete,
	onFilterChange,
}: NotificationHistoryTableProps) {
	const typeLabel = (t: string) => NOTIF_TYPES.find((x) => x.value === t)?.label ?? t;
	const rowSel = useRowSelection(rows.map((r) => r.batch_key));

	return (
		<Card>
			<Card.Header
				icon={<BellSvg />}
				title='Lịch sử thông báo'
				sub={`Tổng cộng ${total} thông báo trong hệ thống`}
				actions={
					<button
						className={styles.btnRefresh}
						onClick={onRefresh}
						title='Làm mới'
					>
						<RefreshSvg style={{ width: 14, height: 14 }} />
					</button>
				}
			/>

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
				<EmptyState
					icon={<BellSvg />}
					title='Chưa có thông báo nào'
				/>
			) : (
				<div className={styles.tableWrap}>
					<BulkBar
						rowSel={rowSel}
						itemLabel='thông báo'
						loading={loading}
						onBulkDelete={onBulkDelete}
						deleteNote='Toàn bộ bản ghi thông báo tới người nhận trong các lô này sẽ bị xoá.'
					/>
					<table className={styles.table}>
						<thead>
							<tr>
								<th className={sel.checkCol}>
									<SelectCheckbox
										title='Chọn tất cả'
										checked={rowSel.allPageSelected}
										indeterminate={rowSel.somePageSelected}
										onChange={rowSel.toggleSelectAll}
									/>
								</th>
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
										<tr
											className={`${styles.tr} ${rowSel.isSelected(row.batch_key) ? sel.rowSelected : ''}`}
										>
											<td className={sel.checkCol}>
												<SelectCheckbox
													title='Chọn thông báo'
													checked={rowSel.isSelected(row.batch_key)}
													onChange={() => rowSel.toggleSelect(row.batch_key)}
												/>
											</td>
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
													colSpan={8}
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
				<Pagination
					page={page}
					totalPages={totalPages}
					total={total}
					rowsPerPage={Math.ceil(total / totalPages) || total}
					pageSizeOptions={PAGE_SIZE_OPTIONS}
					onPageChange={(p) => setPage(() => p)}
					onRowsPerPageChange={() => {}}
					itemLabel='mục'
					hideSizeSelect
				/>
			)}
		</Card>
	);
}
