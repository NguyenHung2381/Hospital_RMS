import { formatDateVN } from '../../../shared/utils/formatDate';
import { useNavigate } from 'react-router-dom';
import { ShieldSvg } from '@/assets/icons';
import { SkeletonTable, TableEmpty } from '@/shared/components';
import type { Council } from '@/features/council/types/council.type';
import styles from '../pages/Dashboard.module.css';
import tbl from '@/shared/components/Table/Table.module.css';
import { useClientPaging } from '@/shared/hooks/useClientPaging';
import { Pagination } from '@/shared/components/Table/Pagination';

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
	const pg = useClientPaging(councils);

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
							<th className={tbl.thIdx}>STT</th>
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
								cols={6}
							/>
						) : error ? (
							<TableEmpty
								colSpan={6}
								icon={<ShieldSvg />}
								title='Không thể tải lịch hội đồng khoa học. Vui lòng thử lại.'
							/>
						) : councils.length === 0 ? (
							<TableEmpty
								colSpan={6}
								icon={<ShieldSvg />}
								title='Hiện chưa có lịch họp bảo vệ hoặc đánh giá hội đồng nào sắp diễn ra.'
							/>
						) : (
							pg.paged.map((c, i) => (
								<tr
									key={c.id}
									onClick={() => navigate('/admin/councils')}
								>
									<td className={tbl.tdIdx}>{pg.offset + i + 1}</td>
									<td>
										<span className={styles.topicTitleText}>{c.name}</span>
									</td>
									<td>
										{c.round_name ?? '—'}
									</td>
									<td>
										{c.defense_date ? formatDateVN(c.defense_date) : '—'}
									</td>
									<td>
										{c.chairman_name ?? '—'}
									</td>
									<td>
										{c.topic_count ?? 0}
									</td>
								</tr>
							))
						)}
					</tbody>
				</table>
			</div>
			<Pagination
				{...pg.pagination}
				itemLabel='hội đồng'
			/>
		</div>
	);
}
