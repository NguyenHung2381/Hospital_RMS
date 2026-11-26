import PortalHomeHeader from '@/shared/components/PortalHomeHeader';
import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { AlertSvg, ArrowRSvg, BadgeSvg, BookOpenSvg, CalendarSvg, DocPlusSvg, FileTextSvg, QrSvg, WalletSvg } from '@/assets/icons';
import { Card, EmptyState, InlineLoading } from '@/shared/components';
import { formatDateVN } from '@/shared/utils/formatDate';
import { getStoredUser, type StoredUser } from '@/shared/utils/storage';
import TraineeLayout from '../../../layouts/TraineeLayout';
import { TRAINEE_HOME } from '../../../app/router/authHelpers';
import { CourseCard, SessionItem } from '../components/TraineeCards';
import { useMyTraining } from '../hooks/useMyTraining';
import { coursePath } from '../utils/traineePaths';
import { myTuitionApi } from '../../tuition/api/tuitionApi';
import { formatVnd, type TuitionItem } from '../../tuition/types/tuition.type';
import styles from './TraineePortal.module.css';

/** Trang chủ cổng học viên: việc cần làm hôm nay + khóa đang học + lịch sắp tới. */
export default function TraineeHome() {
	const { data, error } = useMyTraining();
	// Học phí còn phải nộp (chưa tính khoản đang chờ xác nhận) — nhắc ở "Việc cần chú ý"
	const [unpaid, setUnpaid] = useState<TuitionItem[]>([]);
	useEffect(() => {
		myTuitionApi
			.get()
			.then((t) => setUnpaid(t.items.filter((i) => i.remaining - i.pending > 0)))
			.catch(() => setUnpaid([]));
	}, []);
	const name = getStoredUser<StoredUser>()?.full_name ?? '';

	const enrolled = data?.enrolled ?? [];
	const sessions = (data?.upcoming_sessions ?? []).filter((s) => s.my_role === 'learning');
	const next = sessions[0];
	const active = enrolled.filter((c) => c.enrollment_status === 'approved' && c.display_status !== 'completed');
	const examCourses = enrolled.filter((c) => c.open_exam_count > 0);
	const openExams = examCourses.reduce((t, c) => t + c.open_exam_count, 0);
	const pending = enrolled.filter((c) => c.enrollment_status === 'pending' || c.enrollment_status === 'waitlisted');
	const certs = enrolled.filter((c) => c.cert_no && c.cert_status !== 'revoked').length;
	const openCourses = data?.open_courses.length ?? 0;

	const stats = [
		{ to: `${TRAINEE_HOME}/khoa-hoc`, icon: <BookOpenSvg />, value: active.length, label: 'Khóa đang học' },
		{ to: `${TRAINEE_HOME}/lich-hoc`, icon: <CalendarSvg />, value: sessions.length, label: 'Buổi học 30 ngày tới' },
		{
			to: examCourses[0] ? coursePath(examCourses[0].id, 'exams') : `${TRAINEE_HOME}/khoa-hoc`,
			icon: <FileTextSvg />,
			value: openExams,
			label: 'Bài kiểm tra cần làm',
			alert: openExams > 0,
		},
		{ to: `${TRAINEE_HOME}/ket-qua`, icon: <BadgeSvg />, value: certs, label: 'Chứng chỉ đã cấp' },
	];

	return (
		<TraineeLayout>
			<PortalHomeHeader label={name ? 'Cổng học viên · ' + name : 'Cổng học viên'} title='Lịch học của tôi' detail={formatDateVN(new Date())}>
				{data && <>
					<p>Buổi học tiếp theo</p>
					<h2>{next ? next.subject_name || next.course_name : 'Chưa có lịch trong 30 ngày tới'}</h2>
					{next && <p>{[formatDateVN(next.session_date), next.start_time?.slice(0, 5), next.room].filter(Boolean).join(' · ')}</p>}
				</>}
				<div className={styles.heroActions}>
					<Link
						to={`${TRAINEE_HOME}/diem-danh`}
						className={styles.heroBtn}
					>
						<QrSvg /> Điểm danh QR
					</Link>
					<Link
						to={`${TRAINEE_HOME}/lich-hoc`}
						className={`${styles.heroBtn} ${styles.heroBtnGhost}`}
					>
						<CalendarSvg /> Lịch học
					</Link>
				</div>
			</PortalHomeHeader>

			{error && (
				<EmptyState
					title='Không thể tải dữ liệu'
					desc={error}
				/>
			)}
			{!data && !error && <InlineLoading />}

			{data && (
				<>
					{/* Việc cần làm — chỉ hiện khi có */}
					{(examCourses.length > 0 || unpaid.length > 0 || pending.length > 0 || openCourses > 0) && (
						<Card>
							<Card.Header
								icon={<AlertSvg />}
								title='Việc cần chú ý'
							/>
							<Card.Body className={styles.todoBody}>
								{examCourses.map((c) => (
									<Link
										key={c.enrollment_id}
										to={coursePath(c.id, 'exams')}
										className={`${styles.todo} ${styles.todoRed}`}
									>
										<FileTextSvg />
										<span>
											<b>{c.open_exam_count} bài kiểm tra</b> đang mở ở khóa {c.name}
										</span>
										<ArrowRSvg />
									</Link>
								))}
								{unpaid.map((t) => (
									<Link
										key={`tuition-${t.enrollment_id}`}
										to={`${TRAINEE_HOME}/hoc-phi`}
										className={`${styles.todo} ${styles.todoAmber}`}
									>
										<WalletSvg />
										<span>
											Học phí khóa {t.course_name}: còn <b>{formatVnd(t.remaining - t.pending)}</b>
											{t.start_date ? `, hạn nộp ngày khai giảng ${formatDateVN(t.start_date)}` : ''}
										</span>
										<ArrowRSvg />
									</Link>
								))}
								{pending.map((c) => (
									<Link
										key={c.enrollment_id}
										to={coursePath(c.id)}
										className={`${styles.todo} ${styles.todoAmber}`}
									>
										<BookOpenSvg />
										<span>
											{c.enrollment_status === 'waitlisted'
												? `Khóa ${c.name}: lớp đã đủ, bạn ở danh sách chờ${c.waitlist_position ? ` (vị trí ${c.waitlist_position})` : ''}`
												: `Đăng ký khóa ${c.name} đang chờ phòng Đào tạo duyệt`}
										</span>
										<ArrowRSvg />
									</Link>
								))}
								{openCourses > 0 && (
									<Link
										to={`${TRAINEE_HOME}/khoa-hoc?tab=dang-ky`}
										className={`${styles.todo} ${styles.todoGreen}`}
									>
										<DocPlusSvg />
										<span>
											<b>{openCourses} khóa học</b> đang mở đăng ký
										</span>
										<ArrowRSvg />
									</Link>
								)}
							</Card.Body>
						</Card>
					)}

					<div className={styles.stats}>
						{stats.map((s) => (
							<Link
								key={s.label}
								to={s.to}
								className={`${styles.stat} ${s.alert ? styles.statAlert : ''}`}
							>
								<span className={styles.statIcon}>{s.icon}</span>
								<span className={styles.statText}>
									<strong>{s.value}</strong>
									<span>{s.label}</span>
								</span>
							</Link>
						))}
					</div>

					<div className={styles.twoCol}>
						<Card>
							<Card.Header
								icon={<BookOpenSvg />}
								title='Khóa học của tôi'
								sub={`${enrolled.length} khóa`}
								actions={
									<Link
										to={`${TRAINEE_HOME}/khoa-hoc`}
										className={styles.more}
									>
										Tất cả
									</Link>
								}
							/>
							<Card.Body>
								{enrolled.length === 0 ? (
									<EmptyState
										icon={<BookOpenSvg />}
										title='Bạn chưa tham gia khóa học nào'
										desc={openCourses ? 'Xem các khóa đang mở đăng ký để đăng ký học.' : 'Khi được ghi danh, khóa học sẽ hiện ở đây.'}
									/>
								) : (
									<div className={styles.courseGrid}>
										{enrolled.slice(0, 4).map((c) => (
											<CourseCard
												key={c.enrollment_id}
												c={c}
											/>
										))}
									</div>
								)}
							</Card.Body>
						</Card>

						<Card>
							<Card.Header
								icon={<CalendarSvg />}
								title='Lịch sắp tới'
								actions={
									<Link
										to={`${TRAINEE_HOME}/lich-hoc`}
										className={styles.more}
									>
										Xem lịch
									</Link>
								}
							/>
							<Card.Body>
								{sessions.length === 0 ? (
									<div className={styles.muted}>Chưa có buổi học nào được xếp.</div>
								) : (
									<div className={styles.sessionList}>
										{sessions.slice(0, 6).map((s, i) => (
											<SessionItem
												key={s.id}
												s={s}
												highlight={i === 0}
											/>
										))}
									</div>
								)}
							</Card.Body>
						</Card>
					</div>
				</>
			)}
		</TraineeLayout>
	);
}
