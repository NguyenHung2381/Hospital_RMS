import { Link } from 'react-router-dom';
import { AlertSvg, BadgeSvg, CalendarSvg, CheckCircleSvg, ListSvg, UsersSvg } from '@/assets/icons';
import { saveBlob } from '@/shared/utils/saveBlob';
import { MetricCard } from '../../dashboard/components/MetricCard';
import dash from '../../dashboard/pages/Dashboard.module.css';
import { exportCmeReport, exportSeminarList, getSeminarReport, type SeminarReportRow } from '../api/reportApi';
import { useYearData } from '../hooks/useYearData';
import { buildTableHtml, fmtDate, openPrint } from '../utils/reportHelpers';
import styles from '../pages/Reports.module.css';
import { ReportCard } from './ReportCard';

const SCOPE_LABELS = { hosted: 'BV tổ chức', external: 'Cử cán bộ đi dự' } as const;

// Số người: ưu tiên số nhập tay, không có thì đếm từ danh sách người dự (giống file Excel)
const participants = (s: SeminarReportRow) => s.manual_participant_count ?? s.participant_count;
const cmeIssued = (s: SeminarReportRow) => s.manual_cme_count ?? s.cme_issued_count;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const fmt1 = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 2 });

export function SeminarReports({ year }: { year: number }) {
	const { data, error } = useYearData(getSeminarReport, year);
	const seminars = data?.seminars ?? [];
	const people = data?.cme_people ?? [];

	const hosted = seminars.filter((s) => s.scope === 'hosted').length;
	// Chỉ nhân sự đang làm việc có ngưỡng năm mới được đánh giá đạt / chưa đạt
	const assessed = people.filter((p) => p.is_active && p.required != null);
	const failed = assessed.filter((p) => p.total < (p.required ?? 0));
	const credits = sum(people.map((p) => p.total));

	return (
		<div className={styles.section}>
			<div className={styles.sectionHead}>
				<span className={styles.sectionTitle}>Hội thảo – Hội nghị & CME năm {year}</span>
				<Link
					to='/admin/dashboard/seminar'
					className={styles.sectionLink}
				>
					Xem biểu đồ ở Bảng điều khiển →
				</Link>
			</div>

			{error ? (
				<p className={styles.error}>{error}</p>
			) : (
				<div className={dash.metricsGrid}>
					<MetricCard
						label='Hội thảo, hội nghị'
						value={seminars.length}
						loading={!data}
						compare={`${hosted} BV tổ chức · ${seminars.length - hosted} cử cán bộ đi dự`}
						icon={<CalendarSvg />}
						iconClass='iconGreen'
						accent='accentGreen'
					/>
					<MetricCard
						label='Lượt tham dự'
						value={sum(seminars.map(participants))}
						loading={!data}
						compare={`${sum(seminars.map(cmeIssued))} chứng nhận CME đã cấp`}
						icon={<UsersSvg />}
						iconClass='iconBlue'
						accent='accentBlue'
					/>
					<MetricCard
						label='Tiết CME ghi nhận'
						value={fmt1(credits)}
						loading={!data}
						compare={`${people.filter((p) => p.total > 0).length} nhân sự có tiết CME`}
						icon={<BadgeSvg />}
						iconClass='iconPink'
						accent='accentPink'
					/>
					<MetricCard
						label='Nhân sự chưa đạt CME'
						value={failed.length}
						loading={!data}
						compare={
							assessed.length
								? `Trên ${assessed.length} nhân sự có yêu cầu năm ${year}`
								: `Chưa cấu hình ngưỡng CME năm ${year}`
						}
						deltaType={failed.length ? 'down' : 'neutral'}
						icon={failed.length ? <AlertSvg /> : <CheckCircleSvg />}
						iconClass='iconAmber'
						accent='accentAmber'
					/>
				</div>
			)}

			<div className={styles.cards}>
				<ReportCard
					icon={<ListSvg />}
					title='Danh sách hội thảo, hội nghị'
					desc='Mọi sự kiện trong năm: hình thức, phạm vi, thời gian, địa điểm, chủ trì, số người tham dự, số chứng nhận CME.'
					disabledReason={data && !seminars.length ? `Chưa có hội thảo, hội nghị nào năm ${year}.` : undefined}
					onExcel={async () => saveBlob(await exportSeminarList(year), `hoi-thao-hoi-nghi-${year}.xlsx`)}
					onPdf={async () =>
						openPrint(
							buildTableHtml(
								`Danh sách hội thảo, hội nghị năm ${year}`,
								`${seminars.length} sự kiện`,
								['Tên hội thảo/hội nghị', 'Phạm vi', 'Thời gian', 'Địa điểm', 'Số người dự', 'Cấp CME'],
								seminars.map((s) => [
									s.title,
									s.scope ? SCOPE_LABELS[s.scope] : '',
									s.date_text ||
										[fmtDate(s.start_date), fmtDate(s.end_date)].filter(Boolean).join(' – '),
									s.location,
									participants(s),
									s.grants_cme ? cmeIssued(s) : '—',
								]),
							),
							'landscape',
							'Hội thảo, hội nghị',
						)
					}
				/>
				<ReportCard
					icon={<BadgeSvg />}
					title='Tín chỉ CME theo nhân sự'
					desc='Mẫu báo cáo CME của bệnh viện: Excel gồm "BC tổng" và "BC chi tiết" theo nhóm hình thức; PDF in bảng tổng có đối chiếu ngưỡng.'
					onExcel={async () => saveBlob(await exportCmeReport(year), `bao-cao-cme-${year}.xlsx`)}
					onPdf={async () =>
						openPrint(
							buildTableHtml(
								`Báo cáo tín chỉ CME năm ${year}`,
								`${people.length} nhân sự`,
								['MNV', 'Họ và tên', 'Khoa/Phòng', 'Tổng số tiết', 'Yêu cầu', 'Đánh giá'],
								people.map((p) => [
									p.staff_number,
									p.full_name,
									p.department_name,
									fmt1(p.total),
									p.required != null ? fmt1(p.required) : '',
									p.is_active && p.required != null ? (p.total >= p.required ? 'Đạt' : 'Chưa đạt') : '',
								]),
							),
							'portrait',
							'Báo cáo CME',
						)
					}
				/>
			</div>
		</div>
	);
}
