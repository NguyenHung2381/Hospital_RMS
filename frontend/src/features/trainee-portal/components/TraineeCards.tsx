import { Link } from 'react-router-dom';
import { ArrowRSvg, CalendarSvg, ClockSvg, LayersSvg } from '@/assets/icons';
import { Badge } from '@/shared/components';
import { formatDateVN } from '@/shared/utils/formatDate';
import { DISPLAY_STATUS_CFG, ENROLLMENT_STATUS_CFG } from '../../course/types/course.type';
import type { MyEnrolledCourse, MySession } from '../../portal/api/meApi';
import { coursePath, dateRange } from '../utils/traineePaths';
import styles from './TraineeCards.module.css';

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : '');

const cfgBadge = (cfg?: { label: string; color: string; bg: string }) =>
	cfg && <Badge style={{ color: cfg.color, background: cfg.bg }}>{cfg.label}</Badge>;

/** Thẻ 1 khóa đang tham gia: trạng thái, chương trình, tiến độ điểm danh, việc cần làm. */
export function CourseCard({ c }: { c: MyEnrolledCourse }) {
	const approved = c.enrollment_status === 'approved';
	const pct = c.session_count ? Math.round((c.attended_count / c.session_count) * 100) : 0;
	return (
		<Link
			to={coursePath(c.id, c.open_exam_count > 0 ? 'exams' : undefined)}
			className={styles.course}
		>
			<div className={styles.courseTop}>
				{approved ? cfgBadge(DISPLAY_STATUS_CFG[c.display_status]) : cfgBadge(ENROLLMENT_STATUS_CFG[c.enrollment_status])}
				{c.open_exam_count > 0 && <Badge tone='red'>{c.open_exam_count} bài kiểm tra cần làm</Badge>}
				{c.waitlist_position != null && <Badge tone='amber'>Chờ lớp · vị trí {c.waitlist_position}</Badge>}
			</div>
			<div className={styles.courseName}>{c.name}</div>
			<ul className={styles.courseInfo}>
				{c.program_name && (
					<li>
						<LayersSvg />
						{c.program_name}
					</li>
				)}
				<li>
					<CalendarSvg />
					{dateRange(c.start_date, c.end_date)}
				</li>
			</ul>
			{approved && c.session_count > 0 && (
				<div className={styles.progress}>
					<div className={styles.progressHead}>
						<span>Đã học</span>
						<b>
							{c.attended_count}/{c.session_count} buổi
						</b>
					</div>
					<div
						className={styles.progressBar}
						role='progressbar'
						aria-valuenow={pct}
						aria-valuemin={0}
						aria-valuemax={100}
					>
						<span style={{ width: `${pct}%` }} />
					</div>
				</div>
			)}
			{c.cert_no && c.cert_status !== 'revoked' && (
				<div className={styles.cert}>Đã cấp chứng chỉ số {c.cert_no}</div>
			)}
			<span className={styles.cta}>
				{approved ? (c.open_exam_count > 0 ? 'Làm bài kiểm tra' : 'Vào lớp học') : 'Xem chi tiết'} <ArrowRSvg />
			</span>
		</Link>
	);
}

/** 1 buổi học: ô ngày + giờ, bài, phòng, giảng viên. */
export function SessionItem({ s, highlight }: { s: MySession; highlight?: boolean }) {
	const d = new Date(s.session_date);
	return (
		<Link
			to={coursePath(s.course_id)}
			className={`${styles.session} ${highlight ? styles.sessionNext : ''}`}
		>
			<span className={styles.dateBox}>
				<span>{WEEKDAYS[d.getDay()]}</span>
				<strong>{formatDateVN(s.session_date).slice(0, 5)}</strong>
			</span>
			<span className={styles.sessionMain}>
				<span className={styles.sessionTitle}>{s.subject_name ?? s.course_name}</span>
				<span className={styles.sessionMeta}>
					{(s.start_time || s.end_time) && (
						<span>
							<ClockSvg />
							{hhmm(s.start_time)}–{hhmm(s.end_time)}
						</span>
					)}
					{s.room && <span>Phòng {s.room}</span>}
					{s.lecturer_name && <span>GV {s.lecturer_name}</span>}
				</span>
				{s.subject_name && <span className={styles.sessionCourse}>{s.course_name}</span>}
			</span>
		</Link>
	);
}
