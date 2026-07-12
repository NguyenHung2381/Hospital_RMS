import {
	BellSvg,
	CheckCircleSvg,
	RefreshSvg,
	SearchSvg,
	TrashSvg,
	WarnSvg,
} from '@/assets/icons';
import type { AdminNotification } from '../api/notificationApi';
import { NOTIF_TYPES } from '../types/notification.type';
import { toNotif } from '../utils/notifUtils';
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
	deleting: string | null;
	onRefresh: () => void;
	onDelete: (id: string) => void;
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
	deleting,
	onRefresh,
	onDelete,
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
								<th className={styles.th}>Loại</th>
								<th className={styles.th}>Tiêu đề / Nội dung</th>
								<th className={styles.th}>Người nhận</th>
								<th className={styles.th}>Trạng thái</th>
								<th className={styles.th}>Thời gian</th>
								<th className={styles.th} />
							</tr>
						</thead>
						<tbody>
							{rows.map((row) => {
								const notif = toNotif(row);
								return (
									<tr
										key={row.id}
										className={styles.tr}
									>
										<td className={styles.td}>
											<span
												className={`${styles.typeBadge} ${styles[`type_${notif.type}`]}`}
											>
												{typeLabel(row.type)}
											</span>
										</td>
										<td className={styles.td}>
											<div className={styles.rowTitle}>{row.title}</div>
											{row.message && <div className={styles.rowMsg}>{row.message}</div>}
										</td>
										<td className={styles.td}>
											<div className={styles.recipientName}>{row.full_name}</div>
											<div className={styles.recipientId}>{row.user_id}</div>
										</td>
										<td className={styles.td}>
											{row.is_read ? (
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
										</td>
										<td className={styles.td}>
											<div className={styles.timeText}>{notif.time}</div>
										</td>
										<td className={styles.td}>
											<button
												className={styles.btnDelete}
												onClick={() => onDelete(row.id)}
												disabled={deleting === row.id}
												title='Xoá'
											>
												{deleting === row.id ? (
													<span className={styles.spinnerSm} />
												) : (
													<TrashSvg style={{ width: 14, height: 14 }} />
												)}
											</button>
										</td>
									</tr>
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
