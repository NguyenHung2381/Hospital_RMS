import { useEffect, useState } from 'react';
import { DownloadSvg } from '@/assets/icons';
import { InlineLoading } from '../../../shared/components/Loading';
import { exportTrainingReport, getTrainingReport, type TrainingReport } from '../api/reportApi';
import styles from '../pages/Reports.module.css';

// Báo cáo Đào tạo — 3 báo cáo (theo khóa+chương trình, DS học viên+kết quả,
// thống kê tổng), đối chiếu QLNCKHDTCDT-main (BAO_CAO_BUS) mà RMS trước đây
// chưa có báo cáo chuyên biệt cho mảng Đào tạo.
export function TrainingReportPanel() {
	const [report, setReport] = useState<TrainingReport | null>(null);
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
							<table style={{ width: '100%', fontSize: 13 }}>
								<thead>
									<tr>
										<th style={{ textAlign: 'left', padding: 8 }}>Khóa học</th>
										<th style={{ textAlign: 'left', padding: 8 }}>Chương trình</th>
										<th style={{ padding: 8 }}>Đăng ký</th>
										<th style={{ padding: 8 }}>Đã duyệt</th>
										<th style={{ padding: 8 }}>Điểm TB</th>
										<th style={{ padding: 8 }}>Chứng chỉ</th>
									</tr>
								</thead>
								<tbody>
									{report.by_course_program.map((r, i) => (
										<tr key={`${r.course_id}-${i}`} style={{ borderTop: '1px solid var(--color-gray-100)' }}>
											<td style={{ padding: 8 }}>{r.course_name}</td>
											<td style={{ padding: 8 }}>{r.program_name ?? '—'}</td>
											<td style={{ padding: 8, textAlign: 'center' }}>{r.total_enrollments}</td>
											<td style={{ padding: 8, textAlign: 'center' }}>{r.approved_count}</td>
											<td style={{ padding: 8, textAlign: 'center' }}>
												{r.avg_score != null ? r.avg_score.toFixed(2) : '—'}
											</td>
											<td style={{ padding: 8, textAlign: 'center' }}>{r.certificate_count}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>
				</>
			) : null}
		</div>
	);
}
