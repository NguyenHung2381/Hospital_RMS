import { useEffect, useState } from 'react';
import { ExcelActions, type ExcelColumn } from '@/shared/components/Excel';
import { InlineLoading } from '@/shared/components/Loading';
import { Pagination } from '@/shared/components/Table/Pagination';
import tbl from '@/shared/components/Table/Table.module.css';
import { useClientPaging } from '@/shared/hooks/useClientPaging';
import { showToast } from '@/shared/utils/feedback';
import { getRequiredAbsentees } from '../api/seminarApi';
import type { RequiredAbsentee } from '../types/seminar.type';
import styles from '../pages/Seminar.module.css';

const REASON_LABELS: Record<RequiredAbsentee['reason'], string> = {
	not_listed: 'Chưa có trong danh sách',
	not_checked_in: 'Đăng ký nhưng chưa điểm danh',
};

const EXCEL_COLS: ExcelColumn<RequiredAbsentee>[] = [
	{ header: 'Mã NV', value: (x) => x.staff_number },
	{ header: 'Họ và tên', value: (x) => x.full_name },
	{ header: 'Khoa/phòng', value: (x) => x.department_name },
	{ header: 'Tình trạng', value: (x) => REASON_LABELS[x.reason] },
];

/** Tập huấn bệnh viện: nhân viên thuộc khoa bắt buộc nhưng chưa tham dự. */
export function RequiredAbsenteesCard({ seminarId, version }: { seminarId: string; version: unknown }) {
	const [rows, setRows] = useState<RequiredAbsentee[]>([]);
	const [loading, setLoading] = useState(true);

	// version: đổi khi chi tiết buổi tập huấn tải lại (thêm/xoá người, điểm danh)
	useEffect(() => {
		let alive = true;
		getRequiredAbsentees(seminarId)
			.then((r) => alive && setRows(r))
			.catch(() => alive && showToast('error', 'Không tải được danh sách chưa tham dự'))
			.finally(() => alive && setLoading(false));
		return () => {
			alive = false;
		};
	}, [seminarId, version]);

	const pg = useClientPaging(rows);

	return (
		<div className={styles.tableCard} style={{ marginTop: 16 }}>
			<div className={styles.tableHeader}>
				<div className={styles.tableHeaderLeft}>
					<span className={styles.tableTitle}>Khoa bắt buộc — chưa tham dự</span>
					<span className={styles.tableCount}>{rows.length} người</span>
				</div>
				<div className={styles.tableControls}>
					<ExcelActions
						fileName='chua-tham-du-tap-huan'
						itemLabel='người chưa tham dự'
						columns={EXCEL_COLS}
						getRows={() => rows}
					/>
				</div>
			</div>
			{loading ? (
				<InlineLoading />
			) : (
				<>
					<div className={styles.tableWrap}>
						<table className={styles.table}>
							<thead>
								<tr>
									<th className={tbl.thIdx}>STT</th>
									<th>Mã NV</th>
									<th>Họ tên</th>
									<th>Khoa/phòng</th>
									<th>Tình trạng</th>
								</tr>
							</thead>
							<tbody>
								{rows.length === 0 ? (
									<tr>
										<td colSpan={5}>
											<div className={styles.emptyState}>
												<div className={styles.emptyDesc}>Mọi nhân viên thuộc khoa bắt buộc đã tham dự</div>
											</div>
										</td>
									</tr>
								) : (
									pg.paged.map((x, i) => (
										<tr key={x.id}>
											<td className={tbl.tdIdx}>{pg.offset + i + 1}</td>
											<td className={tbl.cellCode}>{x.staff_number ?? '—'}</td>
											<td className={tbl.cellTitle}>{x.full_name}</td>
											<td>{x.department_name || <span className={styles.muted}>—</span>}</td>
											<td>{REASON_LABELS[x.reason]}</td>
										</tr>
									))
								)}
							</tbody>
						</table>
					</div>
					<Pagination {...pg.pagination} itemLabel='người' />
				</>
			)}
		</div>
	);
}
