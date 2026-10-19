import { Link } from 'react-router-dom';
import { BadgeSvg, BookOpenSvg, CheckCircleSvg, ClipboardCheckSvg, ListSvg, UsersSvg } from '@/assets/icons';
import { saveBlob } from '@/shared/utils/saveBlob';
import { MetricCard } from '../../dashboard/components/MetricCard';
import dash from '../../dashboard/pages/Dashboard.module.css';
import { DISPLAY_STATUS_CFG } from '../../course/types/course.type';
import { exportTrainingReport, getTrainingReport } from '../api/reportApi';
import { useYearData } from '../hooks/useYearData';
import { buildTableHtml, fmtDate, openPrint } from '../utils/reportHelpers';
import styles from '../pages/Reports.module.css';
import { ReportCard } from './ReportCard';

const RESULT_LABELS = { pass: 'Đạt', fail: 'Không đạt' } as const;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function TrainingReports({ year }: { year: number }) {
	const { data, error } = useYearData(getTrainingReport, year);
	const courses = data?.courses ?? [];
	const trainees = data?.trainees ?? [];

	const running = courses.filter((c) => c.status === 'in_progress' || c.status === 'enrolling').length;
	const approved = sum(courses.map((c) => c.approved));
	const passed = sum(courses.map((c) => c.passed));
	const certificates = sum(courses.map((c) => c.certificates));
	const graded = trainees.filter((t) => t.result).length;

	const excel = (report: 'courses' | 'trainees') => async () =>
		saveBlob(
			await exportTrainingReport(year, report),
			`${report === 'courses' ? 'tong-hop-khoa-hoc' : 'ket-qua-hoc-vien'}-${year}.xlsx`,
		);

	return (
		<div className={styles.section}>
			<div className={styles.sectionHead}>
				<span className={styles.sectionTitle}>Đào tạo năm {year}</span>
				<Link
					to='/admin/dashboard/training'
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
						label='Khóa học trong năm'
						value={courses.length}
						loading={!data}
						compare={`${running} khóa đang tuyển sinh / đang học`}
						icon={<BookOpenSvg />}
						iconClass='iconGreen'
						accent='accentGreen'
					/>
					<MetricCard
						label='Lượt học viên đã duyệt'
						value={approved}
						loading={!data}
						compare={`${sum(courses.map((c) => c.enrollments))} lượt đăng ký`}
						icon={<UsersSvg />}
						iconClass='iconBlue'
						accent='accentBlue'
					/>
					<MetricCard
						label='Học viên đạt'
						value={passed}
						loading={!data}
						compare={`${graded} lượt đã có kết quả`}
						icon={<CheckCircleSvg />}
						iconClass='iconAmber'
						accent='accentAmber'
					/>
					<MetricCard
						label='Chứng chỉ đã cấp'
						value={certificates}
						loading={!data}
						compare='Chứng chỉ còn hiệu lực của các khóa trong năm'
						icon={<BadgeSvg />}
						iconClass='iconPink'
						accent='accentPink'
					/>
				</div>
			)}

			<div className={styles.cards}>
				<ReportCard
					icon={<ListSvg />}
					title='Tổng hợp khóa học'
					desc='Mỗi khóa bắt đầu trong năm: chương trình áp dụng, thời gian, trạng thái, số đăng ký / đã duyệt / đạt, điểm trung bình, chứng chỉ.'
					disabledReason={data && !courses.length ? `Chưa có khóa học nào bắt đầu trong năm ${year}.` : undefined}
					onExcel={excel('courses')}
					onPdf={async () =>
						openPrint(
							buildTableHtml(
								`Tổng hợp khóa đào tạo năm ${year}`,
								`${courses.length} khóa học`,
								['Khóa học', 'Chương trình', 'Thời gian', 'Trạng thái', 'Đăng ký', 'Đã duyệt', 'Đạt', 'Điểm TB', 'Chứng chỉ'],
								courses.map((c) => [
									c.name,
									c.program_names,
									[fmtDate(c.start_date), fmtDate(c.end_date)].filter(Boolean).join(' – '),
									DISPLAY_STATUS_CFG[c.status]?.label ?? c.status,
									c.enrollments,
									c.approved,
									c.passed,
									c.avg_score != null ? c.avg_score.toFixed(2) : '',
									c.certificates,
								]),
							),
							'landscape',
							'Tổng hợp khóa học',
						)
					}
				/>
				<ReportCard
					icon={<ClipboardCheckSvg />}
					title='Kết quả học viên'
					desc='Học viên đã được duyệt vào các khóa trong năm: khoa/phòng, điểm tổng kết, xếp loại, kết quả, số buổi tham dự.'
					disabledReason={data && !trainees.length ? `Chưa có học viên nào trong các khóa năm ${year}.` : undefined}
					onExcel={excel('trainees')}
					onPdf={async () =>
						openPrint(
							buildTableHtml(
								`Kết quả học tập của học viên năm ${year}`,
								`${trainees.length} lượt học viên`,
								['Học viên', 'Khoa/Phòng', 'Khóa học', 'Điểm', 'Xếp loại', 'Kết quả', 'Chuyên cần'],
								trainees.map((t) => [
									t.trainee_name,
									t.department_name,
									t.course_name,
									t.score,
									t.classification,
									t.result ? RESULT_LABELS[t.result] : '',
									t.total_sessions ? `${t.attended ?? 0}/${t.total_sessions}` : '',
								]),
							),
							'landscape',
							'Kết quả học viên',
						)
					}
				/>
			</div>
		</div>
	);
}
