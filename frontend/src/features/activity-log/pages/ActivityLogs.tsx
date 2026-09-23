import { ListSvg, RefreshSvg, SearchSvg } from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { InlineLoading } from '../../../shared/components';
import { useActivityLogs } from '../hooks/useActivityLogs';
import { formatDateTimeVN } from '../../../shared/utils/formatDate';
import styles from './ActivityLogs.module.css';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

export default function ActivityLogs() {
	const {
		rows,
		hasMore,
		method,
		setMethod,
		search,
		setSearch,
		loading,
		loadingMore,
		loadMore,
		refresh,
	} = useActivityLogs();

	return (
		<AdminLayout
			pageTitle='Nhật ký hoạt động'
			pageSubtitle='Lịch sử tác động (tạo/sửa/xoá, đăng nhập) của người dùng lên hệ thống'
		>
			<section className={styles.tableCard}>
				<div className={styles.tableHeader}>
					<div className={styles.tableHeaderLeft}>
						<span className={styles.tableTitle}>Nhật ký hoạt động</span>
						<span className={styles.tableCount}>
							{rows.length} bản ghi
						</span>
					</div>
					<div className={styles.tableControls}>
						<div className={styles.searchBox}>
							<SearchSvg className={styles.searchIcon} />
							<input
								className={styles.searchInput}
								placeholder='Tìm theo đường dẫn API...'
								value={search}
								onChange={(e) => setSearch(e.target.value)}
							/>
						</div>
						<select
							className={styles.filterSelect}
							value={method}
							onChange={(e) => setMethod(e.target.value)}
						>
							<option value=''>Tất cả thao tác</option>
							{METHODS.map((m) => (
								<option
									key={m}
									value={m}
								>
									{m}
								</option>
							))}
						</select>
						<button
							className={styles.btnRefresh}
							onClick={refresh}
							title='Làm mới'
						>
							<RefreshSvg style={{ width: 14, height: 14 }} />
						</button>
					</div>
				</div>

				{loading ? (
					<InlineLoading />
				) : rows.length === 0 ? (
					<div className={styles.emptyState}>
						<ListSvg
							style={{ width: 36, height: 36, color: 'var(--color-gray-300)' }}
						/>
						<div className={styles.emptyTitle}>Chưa có log nào</div>
					</div>
				) : (
					<div className={styles.tableWrap}>
						<table className={styles.table}>
							<thead>
								<tr>
									<th className={styles.th}>Người dùng</th>
									<th className={styles.th}>Thao tác</th>
									<th className={styles.th}>Đường dẫn</th>
									<th className={styles.th}>Trạng thái</th>
									<th className={styles.th}>IP</th>
									<th className={styles.th}>Thời gian</th>
								</tr>
							</thead>
							<tbody>
								{rows.map((row) => (
									<tr
										key={row.id}
										className={styles.tr}
									>
										<td className={styles.td}>
											<div className={styles.actorName}>
												{row.actor_username ?? 'Không xác định'}
											</div>
											{row.actor_id && (
												<div className={styles.actorId}>{row.actor_id}</div>
											)}
										</td>
										<td className={styles.td}>
											<span
												className={`${styles.methodBadge} ${styles[`method_${row.method}`] ?? ''}`}
											>
												{row.method}
											</span>
										</td>
										<td className={styles.td}>
											<span className={styles.path}>{row.path}</span>
										</td>
										<td className={styles.td}>
											<span
												className={
													row.status_code && row.status_code < 400
														? styles.statusOk
														: styles.statusErr
												}
											>
												{row.status_code}
											</span>
										</td>
										<td className={styles.td}>{row.ip_address}</td>
										<td className={styles.td}>
											<span className={styles.timeText}>
												{formatDateTimeVN(row.created_at)}
											</span>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}

				{hasMore && !loading && (
					<div className={styles.footer}>
						<button
							className={styles.btnLoadMore}
							onClick={loadMore}
							disabled={loadingMore}
						>
							{loadingMore ? 'Đang tải...' : 'Tải thêm'}
						</button>
					</div>
				)}
			</section>
		</AdminLayout>
	);
}
