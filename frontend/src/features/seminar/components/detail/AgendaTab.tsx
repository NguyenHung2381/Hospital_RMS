import { EditSvg, PlusSvg } from '@/assets/icons';
import tbl from '@/shared/components/Table/Table.module.css';
import type { SeminarAgendaItem } from '../../types/seminar.type';
import sem from '../../pages/Seminar.module.css';
import s from './Detail.module.css';
import { fmtDate, timeRange } from './detailUtils';
import type { TabProps } from './types';

/** Tab "Chương trình": danh sách bài học / bài báo cáo. */
export function AgendaTab({ agenda, perms, actions }: Pick<TabProps, 'perms' | 'actions'> & { agenda: SeminarAgendaItem[] }) {
	return (
		<div className={sem.tableCard}>
			<div className={sem.tableHeader}>
				<div className={sem.tableHeaderLeft}>
					<span className={sem.tableTitle}>Chương trình</span>
					<span className={sem.tableCount}>{agenda.length} bài</span>
				</div>
				{perms.canUpdate && (
					<div className={sem.tableControls}>
						<button
							className={agenda.length ? sem.btnGhost : sem.btnPrimary}
							onClick={actions.openAgenda}
						>
							{agenda.length ? <EditSvg /> : <PlusSvg />} {agenda.length ? 'Sửa chương trình' : 'Thêm bài học'}
						</button>
					</div>
				)}
			</div>
			{agenda.length > 0 ? (
				<div className={sem.tableWrap}>
					<table className={sem.table}>
						<thead>
							<tr>
								<th className={tbl.thIdx}>STT</th>
								<th>Thời gian</th>
								<th>Tên bài học / bài báo cáo</th>
								<th>Báo cáo viên</th>
								<th>Ghi chú</th>
							</tr>
						</thead>
						<tbody>
							{agenda.map((a, i) => (
								<tr key={i}>
									<td className={sem.tdIdx}>{i + 1}</td>
									<td className={s.nowrap}>
										{timeRange(a.start_time, a.end_time) || <span className={sem.muted}>—</span>}
										{a.date && <div className={s.sub}>{fmtDate(a.date)}</div>}
									</td>
									<td>
										<span className={tbl.cellTitle}>{a.title}</span>
									</td>
									<td>{a.speaker || <span className={sem.muted}>—</span>}</td>
									<td>{a.note || <span className={sem.muted}>—</span>}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : (
				<div className={s.empty}>
					<b>Chưa có chương trình</b>
					{perms.canUpdate ? 'Thêm các bài học / bài báo cáo kèm thời gian và báo cáo viên.' : 'Ban tổ chức chưa nhập chương trình.'}
				</div>
			)}
		</div>
	);
}
