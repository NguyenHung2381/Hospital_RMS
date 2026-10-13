import { useEffect, useState } from 'react';
import { DownloadSvg } from '@/assets/icons';
import { InlineLoading } from '../../../shared/components/Loading';
import { exportTrainingReport, getTrainingReport, type TrainingReport } from '../api/reportApi';
import styles from '../pages/Reports.module.css';
import tbl from '@/shared/components/Table/Table.module.css';
import { useClientPaging } from '@/shared/hooks/useClientPaging';
import { Pagination } from '@/shared/components/Table/Pagination';

// Báo cáo Đào tạo — 3 báo cáo (theo khóa+chương trình, DS học viên+kết quả,
// thống kê tổng), đối chiếu QLNCKHDTCDT-main (BAO_CAO_BUS) mà RMS trước đây
// chưa có báo cáo chuyên biệt cho mảng Đào tạo.
export function TrainingReportPanel() {
	const [report, setReport] = useState<TrainingReport | null>(null);
	const pg = useClientPaging(report?.by_course_program ?? []);
	const [loading, setLoading] = useState(true);
	const [exporting, setExporting] = useState(false);
	const [from, setFrom] = useState('');
	const [to, setTo] = useState('');
	const [refreshKey, setRefreshKey] = useState(0);

	useEffect(() => {
		const load = () => {
			setLoading(true);
			getTrainingReport({ from: from || undefined, to: to || undefined })
				.then(setReport)
				.finally(() => setLoading(false));
		};
		load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [refreshKey]);

	const handleExport = async () => {
		setExporting(true);
		try {
			const blob = await exportTrainingReport({ from: from || undefined, to: to || undefined });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = 'bao-cao-dao-tao.xlsx';
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		} finally {
			setExporting(false);
		}
	};

	return (
		<div>
			<div className={styles.filterPanel}>
				<div className={styles.filterGrid}>
					<div className={styles.fg}>
						<label className={styles.fl}>Từ ngày</label>
						<input type='date' className={styles.fi} value={from} onChange={(e) => setFrom(e.target.value)} />
					</div>
					<div className={styles.fg}>
						<label className={styles.fl}>Đến ngày</label>
						<input type='date' className={styles.fi} value={to} onChange={(e) => setTo(e.target.value)} />
					</div>
					<div className={styles.fg} style={{ alignSelf: 'flex-end' }}>
						<button
							className={`${styles.btnExport} ${styles.btnExport_green}`}
							onClick={() => setRefreshKey((k) => k + 1)}
						>
							Lọc
						</button>
					</div>
				</div>
			</div>

			{loading ? (
				<InlineLoading />
			) : report ? (
				<>
					<div className={styles.filterFoot}>
						<span className={styles.countText}>
							<strong>{report.summary.course_count}</strong> khóa học ·{' '}
							<strong>{report.summary.enrollment_count}</strong> lượt đăng ký ·{' '}
							<strong>{report.summary.approved_count}</strong> đã duyệt ·{' '}
							<strong>{report.summary.certificate_count}</strong> chứng chỉ đã cấp
						</span>
						<button
							className={`${styles.btnExport} ${styles.btnExport_green}`}
							onClick={handleExport}
							disabled={exporting}
						>
							{exporting ? <span className={styles.spinner} /> : <DownloadSvg style={{ width: 14, height: 14 }} />}
							Xuất Excel (3 sheet)
						</button>
					</div>

					<div className={styles.optPanel}>
						<div className={styles.optHead}>
							<span className={styles.optHeadTitle}>Theo khóa học & chương trình</span>
						</div>
						<div style={{ overflowX: 'auto' }}>
							<table className={tbl.table}>
								<thead>
									<tr>
										<th className={tbl.thIdx}>STT</th>
										<th>Khóa học</th>
										<th>Chương trình</th>
										<th className={tbl.thCenter}>Đăng ký</th>
										<th className={tbl.thCenter}>Đã duyệt</th>
										<th className={tbl.thCenter}>Điểm TB</th>
										<th className={tbl.thCenter}>Chứng chỉ</th>
									</tr>
								</thead>
								<tbody>
									{pg.paged.map((r, i) => (
										<tr key={`${r.course_id}-${i}`}>
											<td className={tbl.tdIdx}>{pg.offset + i + 1}</td>
											<td><span className={tbl.cellTitle}>{r.course_name}</span></td>
											<td>{r.program_name ?? '—'}</td>
											<td className={tbl.tdCenter}>{r.total_enrollments}</td>
											<td className={tbl.tdCenter}>{r.approved_count}</td>
											<td className={tbl.tdCenter}>
												{r.avg_score != null ? r.avg_score.toFixed(2) : '—'}
											</td>
											<td className={tbl.tdCenter}>{r.certificate_count}</td>
										</tr>
									))}
								</tbody>
							</table>
							<Pagination
								{...pg.pagination}
								itemLabel='khóa học'
							/>
						</div>
					</div>
				</>
			) : null}
		</div>
	);
}
