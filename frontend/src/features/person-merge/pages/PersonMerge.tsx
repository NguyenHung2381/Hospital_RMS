import { InfoSvg, SearchSvg } from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { Badge } from '../../../shared/components/Badge';
import { SkeletonTable } from '../../../shared/components/Loading';
import { Pagination } from '../../../shared/components/Table/Pagination';
import { formatDateVN } from '../../../shared/utils/formatDate';
import { MergeCompareModal } from '../components/MergeCompareModal';
import { usePersonMerge } from '../hooks/usePersonMerge';
import {
	type MergeReason,
	type PersonSummary,
	REASON_LABEL,
	REASON_TONE,
	SOURCE_LABEL,
	STATUS_TABS,
} from '../types/personMerge.type';
import styles from './PersonMerge.module.css';

const REASON_OPTIONS = Object.keys(REASON_LABEL) as MergeReason[];

function PersonCell({ p }: { p: PersonSummary }) {
	const sub = [p.date_of_birth ? formatDateVN(p.date_of_birth) : null, p.email, p.phone].filter(Boolean).join(' · ');
	return (
		<div className={styles.person}>
			<span className={styles.personName}>{p.full_name}</span>
			<span className={styles.personSub} title={sub}>
				{sub || 'Chưa có ngày sinh / email / SĐT'}
			</span>
			<div className={styles.personTags}>
				{p.has_account && <Badge tone='green'>Có tài khoản</Badge>}
				{p.origin_table && <Badge tone='gray'>{SOURCE_LABEL[p.origin_table] ?? p.origin_table}</Badge>}
				<Badge tone='blue'>{p.ref_count} bản ghi</Badge>
			</div>
		</div>
	);
}

export default function PersonMerge() {
	const d = usePersonMerge();
	const COLS = 5;
	const pendingTotal = d.stats?.by_status.PENDING ?? 0;

	return (
		<AdminLayout
			pageTitle='Duyệt trùng danh tính'
			pageSubtitle='Các cặp hồ sơ có dấu hiệu là cùng một người — đối chiếu rồi gộp, hoặc đánh dấu không phải'
			breadcrumbs={[{ label: 'Hệ thống' }]}
		>
			<div className={styles.hint}>
				<InfoSvg />
				<div>
					Gộp chuyển toàn bộ bản ghi liên quan (tài khoản, học viên, giảng viên, thành viên đề tài, người dự hội thảo…) sang hồ sơ gốc.
					Hệ thống <b>không tự gộp</b> các cặp trùng tên. Mỗi lần gộp đều được ghi nhật ký.
					{pendingTotal > 0 && (
						<>
							{' '}
							Hiện còn <b>{pendingTotal}</b> cặp chờ duyệt.
						</>
					)}
				</div>
			</div>

			<div className={styles.tableCard}>
				<div className={styles.tabsRow}>
					{STATUS_TABS.map((t) => (
						<div
							key={t.key}
							className={`${styles.tab} ${d.status === t.key ? styles.tabActive : ''}`}
							onClick={() => d.changeStatus(t.key)}
						>
							{t.label}
							{d.stats && <span className={styles.tabBadge}>{d.stats.by_status[t.key] ?? 0}</span>}
						</div>
					))}
				</div>

				<div className={styles.tableHeader}>
					<div className={styles.tableHeaderLeft}>
						<span className={styles.tableTitle}>Cặp hồ sơ nghi trùng</span>
						<span className={styles.tableCount}>{d.total} cặp</span>
					</div>
					<div className={styles.tableControls}>
						<select
							className={styles.filterSelect}
							value={d.reason}
							onChange={(e) => d.changeReason(e.target.value as MergeReason | '')}
							aria-label='Lọc theo lý do'
						>
							<option value=''>Mọi lý do</option>
							{REASON_OPTIONS.map((r) => (
								<option key={r} value={r}>
									{REASON_LABEL[r]}
									{d.status === 'PENDING' && d.stats?.pending_by_reason[r] ? ` (${d.stats.pending_by_reason[r]})` : ''}
								</option>
							))}
						</select>
						<div className={styles.searchBox}>
							<SearchSvg className={styles.searchIcon} />
							<input
								className={styles.searchInput}
								placeholder='Tìm theo tên, email, SĐT…'
								value={d.search}
								onChange={(e) => d.changeSearch(e.target.value)}
							/>
						</div>
					</div>
				</div>

				<div className={styles.tableWrap}>
					<table className={styles.table}>
						<thead>
							<tr>
								<th className={styles.th}>#</th>
								<th className={styles.th}>Hồ sơ A</th>
								<th className={styles.th}>Hồ sơ B</th>
								<th className={styles.th}>Lý do nghi trùng</th>
								<th className={`${styles.th} ${styles.thRight}`}>Thao tác</th>
							</tr>
						</thead>
						<tbody>
							{d.isLoading ? (
								<SkeletonTable rows={8} cols={COLS} />
							) : d.rows.length === 0 ? (
								<tr>
									<td colSpan={COLS}>
										<div className={styles.emptyBlock}>
											<div className={styles.emptyTitle}>
												{d.status === 'PENDING' ? 'Không còn cặp nào chờ duyệt' : 'Chưa có cặp nào ở mục này'}
											</div>
											<div>{d.search || d.reason ? 'Thử bỏ bớt bộ lọc' : ' '}</div>
										</div>
									</td>
								</tr>
							) : (
								d.rows.map((c, i) => (
									<tr key={c.id} className={styles.tr} onClick={() => d.setOpenId(c.id)}>
										<td className={`${styles.td} ${styles.tdIdx}`}>{(d.page - 1) * d.pageSize + i + 1}</td>
										<td className={styles.td}>
											<PersonCell p={c.a} />
										</td>
										<td className={styles.td}>
											<PersonCell p={c.b} />
										</td>
										<td className={styles.td}>
											<Badge tone={REASON_TONE[c.reason]} dot>
												{REASON_LABEL[c.reason]}
											</Badge>
										</td>
										<td className={`${styles.td} ${styles.tdActions}`}>
											<button
												type='button'
												className={styles.reviewBtn}
												onClick={(e) => {
													e.stopPropagation();
													d.setOpenId(c.id);
												}}
											>
												{c.status === 'PENDING' ? 'Đối chiếu' : 'Xem'}
											</button>
										</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>

				{d.total > 0 && d.totalPages > 1 && (
					<Pagination
						page={d.page}
						totalPages={d.totalPages}
						total={d.total}
						rowsPerPage={d.pageSize}
						onPageChange={d.setPage}
						itemLabel='cặp'
						hideSizeSelect
					/>
				)}
			</div>

			{d.openId !== null && (
				<MergeCompareModal
					key={d.openId}
					id={d.openId}
					busy={d.busy}
					onClose={() => d.setOpenId(null)}
					onMerge={d.doMerge}
					onReject={d.doReject}
					onReopen={d.doReopen}
				/>
			)}

		</AdminLayout>
	);
}
