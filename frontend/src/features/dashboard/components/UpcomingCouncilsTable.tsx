import { formatDateVN } from '../../../shared/utils/formatDate';
import { useNavigate } from 'react-router-dom';
import { ShieldSvg } from '@/assets/icons';
import { SkeletonTable, TableEmpty } from '@/shared/components';
import type { Council } from '@/features/council/types/council.type';
import styles from '../pages/Dashboard.module.css';

interface UpcomingCouncilsTableProps {
	councils: Council[];
	loading: boolean;
	error: boolean;
}

export function UpcomingCouncilsTable({
	councils,
	loading,
	error,
}: UpcomingCouncilsTableProps) {
	const navigate = useNavigate();

	return (
		<div className={styles.tableSection}>
			<div className={styles.tableSectionHeader}>
				<div className={styles.tableSectionLeft}>
					<span className={styles.tableSectionTitle}>
						Kế hoạch Hội đồng Đánh giá & Bảo vệ
					</span>
					<span className={styles.tableCount}>{councils.length} hội đồng</span>
				</div>
			</div>

			<div className={styles.tableWrap}>
				<table className={styles.table}>
					<thead>
						<tr>
							<th>Hội đồng Khoa học</th>
							<th>Đợt nghiên cứu / Khóa</th>
							<th>Thời gian tổ chức</th>
							<th>Chủ tịch Hội đồng</th>
							<th>Số lượng đề tài</th>
						</tr>
					</thead>
					<tbody>
						{loading ? (
							<SkeletonTable
								rows={5}
								cols={5}
							/>
						) : error ? (
							<TableEmpty
								colSpan={5}
								icon={<ShieldSvg />}
								title='Không thể tải lịch hội đồng khoa học. Vui lòng thử lại.'
							/>
						) : councils.length === 0 ? (
							<TableEmpty
								colSpan={5}
								icon={<ShieldSvg />}
								title='Hiện chưa có lịch họp bảo vệ hoặc đánh giá hội đồng nào sắp diễn ra.'
							/>
						) : (
							councils.map((c) => (
								<tr
									key={c.id}
									onClick={() => navigate('/admin/councils')}
								>
									<td>
										<span className={styles.topicTitleText}>{c.name}</span>
									</td>
									<td>
										<span style={{ fontSize: 13 }}>{c.round_name ?? '—'}</span>
									</td>
									<td>
										<span style={{ fontSize: 13 }}>{c.defense_date ? formatDateVN(c.defense_date) : "—"}</span>
									</td>
									<td>
										<span style={{ fontSize: 13 }}>{c.chairman_name ?? '—'}</span>
									</td>
									<td>
										<span style={{ fontSize: 13 }}>{c.topic_count ?? 0}</span>
									</td>
								</tr>
							))
						)}
					</tbody>
				</table>
			</div>
		</div>
	);
}
