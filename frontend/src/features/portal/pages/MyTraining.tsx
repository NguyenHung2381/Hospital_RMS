import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRSvg, BookOpenSvg, CalendarSvg, ClockSvg, DocPlusSvg, LayersSvg, UsersSvg } from '@/assets/icons';
import { Badge, Button, Card, EmptyState, InlineLoading } from '@/shared/components';
import { formatDateVN } from '@/shared/utils/formatDate';
import { notify } from '@/shared/utils/feedback';
import UserLayout from '../../../layouts/UserLayout';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { DISPLAY_STATUS_CFG, ENROLLMENT_STATUS_CFG } from '../../course/types/course.type';
import {
	getMyTraining,
	registerMyCourse,
	type MyEnrolledCourse,
	type MyTeachingLesson,
	type MyTraining as Data,
	type OpenCourse,
} from '../api/meApi';
import { CourseProgramPicker } from '../../public/components/CourseProgramPicker';
import { GradingPanel } from '../../course/components/ExamsTab';
import { EXAM_PART_LABEL, type ExamAttemptDetail } from '../../exam/types/exam.type';
import { Modal } from '@/shared/components/Modal';
import { teachingApi, type PendingGrading } from '../api/teachingApi';
import { MyTraineeDocumentsCard } from '../components/MyTraineeDocumentsCard';
import styles from './SelfService.module.css';
import tbl from '@/shared/components/Table/Table.module.css';
import { useClientPaging } from '@/shared/hooks/useClientPaging';
import { Pagination } from '@/shared/components/Table/Pagination';

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const cfgBadge = (cfg?: { label: string; color: string; bg: string }) =>
	cfg && <Badge style={{ color: cfg.color, background: cfg.bg }}>{cfg.label}</Badge>;
const range = (a: string | null, b: string | null) =>
	a || b ? `${formatDateVN(a) || '…'} – ${formatDateVN(b) || '…'}` : 'Chưa xếp lịch';
const time = (t: string | null) => (t ? t.slice(0, 5) : '');
const num = (v: number | null) => (v == null ? '—' : v);

function EnrolledItem({ c }: { c: MyEnrolledCourse }) {
	const navigate = useNavigate();
	const grades = c.grades.filter(
		(g) => g.score != null || g.theory_score != null || g.practice_score != null || g.final_score != null || g.result,
	);
	// Lượt có điểm TX/GK/CK cũ thì hiện cột cũ, còn lại hiện Lý thuyết / Thực hành
	const legacy = grades.some((g) => g.regular_score != null || g.midterm_score != null || g.final_score != null);
	const part = (score: number | null, flag: 'absent' | 'exempt' | null) =>
		flag === 'absent' ? 'Vắng thi' : flag === 'exempt' ? 'Miễn thi' : num(score);
	const pg = useClientPaging(grades);
	return (
		<div
			className={`${styles.item} ${styles.clickable}`}
			role='link'
			tabIndex={0}
			onClick={() => navigate(`/user/khoa-hoc/${c.id}`)}
			onKeyDown={(e) => e.key === 'Enter' && navigate(`/user/khoa-hoc/${c.id}`)}
		>
			<div className={styles.itemHead}>
				<div className={styles.itemTitle}>{c.name}</div>
				<div className={styles.badges}>
					{c.open_exam_count > 0 && <Badge tone='red'>{c.open_exam_count} bài kiểm tra đang mở</Badge>}
					{c.enrollment_status !== 'approved' && cfgBadge(ENROLLMENT_STATUS_CFG[c.enrollment_status])}
					{cfgBadge(DISPLAY_STATUS_CFG[c.display_status])}
				</div>
			</div>
			<div className={styles.meta}>
				<span>
					Thời gian: <b>{range(c.start_date, c.end_date)}</b>
				</span>
				{c.program_name && (
					<span>
						Chương trình: <b>{c.program_name}</b>
					</span>
				)}
				{c.enrollment_status === 'approved' && c.session_count > 0 && (
					<span>
						Điểm danh:{' '}
						<b>
							{c.attended_count}/{c.session_count} buổi
						</b>
					</span>
				)}
				{c.enrollment_status === 'approved' && (
					<span>
						Tài liệu: <b>{c.document_count}</b>
					</span>
				)}
				{c.cert_no && (
					<span>
						Chứng chỉ:{' '}
						<b>
							{c.cert_no}
							{c.cert_status === 'revoked'
								? ' (đã thu hồi)'
								: c.cert_issue_date && ` — cấp ${formatDateVN(c.cert_issue_date)}`}
						</b>
					</span>
				)}
			</div>
			{grades.length > 0 && (
				<div className={styles.tableWrap}>
					<table className={styles.table}>
						<thead>
							<tr>
								<th className={tbl.thIdx}>STT</th>
								<th>Bài học</th>
								{legacy ? (
									<>
										<th>Thường xuyên</th>
										<th>Giữa kỳ</th>
										<th>Cuối kỳ</th>
									</>
								) : (
									<>
										<th>Lý thuyết</th>
										<th>Thực hành</th>
									</>
								)}
								<th>Tổng kết</th>
								<th>Kết quả</th>
							</tr>
						</thead>
						<tbody>
							{pg.paged.map((g, i) => (
								<tr key={i}>
									<td className={tbl.tdIdx}>{pg.offset + i + 1}</td>
									<td><span className={tbl.cellTitle}>{g.subject_name ?? 'Toàn khóa'}</span></td>
									{legacy ? (
										<>
											<td>{num(g.regular_score)}</td>
											<td>{num(g.midterm_score)}</td>
											<td>{num(g.final_score)}</td>
										</>
									) : (
										<>
											<td>{part(g.theory_score, g.theory_flag)}</td>
											<td>{part(g.practice_score, g.practice_flag)}</td>
										</>
									)}
									<td>
										<b>{num(g.score)}</b>
									</td>
									<td>{g.classification ?? (g.result === 'pass' ? 'Đạt' : g.result === 'fail' ? 'Chưa đạt' : (g.result ?? '—'))}</td>
								</tr>
							))}
						</tbody>
					</table>
					<Pagination
						{...pg.pagination}
						itemLabel='môn'
					/>
				</div>
			)}
		</div>
	);
}

/** Bài tôi dạy — bài + khóa được phân công (GV chính / phụ, số tiết, số buổi đã xếp) */
function TeachingLessons({ lessons }: { lessons: MyTeachingLesson[] }) {
	const pg = useClientPaging(lessons);
	return (
		<Card>
			<Card.Header
				icon={<BookOpenSvg />}
				title='Bài tôi dạy'
				sub={`${lessons.length} bài`}
			/>
			<Card.Body>
				<div className={styles.tableWrap}>
					<table className={styles.table}>
						<thead>
							<tr>
								<th className={tbl.thIdx}>STT</th>
								<th>Bài học</th>
								<th>Khóa học</th>
								<th>Vai trò</th>
								<th>Số tiết</th>
								<th>Số buổi đã xếp</th>
							</tr>
						</thead>
						<tbody>
							{pg.paged.map((l, i) => (
								<tr key={l.id}>
									<td className={tbl.tdIdx}>{pg.offset + i + 1}</td>
									<td>
										<span className={tbl.cellTitle}>{l.lesson_title}</span>
										{l.lesson_code && <div className={tbl.cellCode}>{l.lesson_code}</div>}
									</td>
									<td>
										{l.course_name}
										<div className={tbl.cellSub}>{range(l.start_date, l.end_date)}</div>
									</td>
									<td>
										<Badge tone={l.role === 'main' ? 'purple' : 'gray'}>
											{l.role === 'main' ? 'GV chính' : 'GV phụ'}
										</Badge>
									</td>
									<td>{num(l.hours)}</td>
									<td>{l.session_count}</td>
								</tr>
							))}
						</tbody>
					</table>
					<Pagination
						{...pg.pagination}
						itemLabel='bài'
					/>
				</div>
			</Card.Body>
		</Card>
	);
}

// Số ngày còn lại tới hạn đăng ký (cột DATE, so theo ngày lịch máy người dùng)
const daysLeft = (d: string) =>
	Math.round((new Date(d.slice(0, 10)).getTime() - new Date(new Date().toLocaleDateString('en-CA')).getTime()) / 864e5);

function OpenCourseCard({ course: c, onOpen }: { course: OpenCourse; onOpen: () => void }) {
	const left = c.enrollment_end_date ? daysLeft(c.enrollment_end_date) : null;
	return (
		<button
			type='button'
			className={styles.openCard}
			onClick={onOpen}
		>
			<div className={styles.openTop}>
				<span className={styles.openIcon}>
					<BookOpenSvg />
				</span>
				{left == null ? (
					<Badge tone='green'>Đang nhận đăng ký</Badge>
				) : left <= 7 ? (
					<Badge tone='amber'>{left <= 0 ? 'Hết hạn hôm nay' : `Còn ${left} ngày`}</Badge>
				) : (
					<Badge tone='green'>Hạn {formatDateVN(c.enrollment_end_date)}</Badge>
				)}
			</div>
			<div className={styles.openName}>{c.name}</div>
			<ul className={styles.openInfo}>
				<li>
					<CalendarSvg />
					{range(c.start_date, c.end_date)}
				</li>
				<li>
					<LayersSvg />
					{c.programs.length > 1
						? `${c.programs.length} chương trình để chọn`
						: (c.program_name ?? 'Chưa chia chương trình')}
				</li>
				{c.capacity != null && (
					<li>
						<UsersSvg />
						Chỉ tiêu {c.capacity} học viên
					</li>
				)}
				{left != null && left <= 7 && (
					<li>
						<ClockSvg />
						Hạn đăng ký {formatDateVN(c.enrollment_end_date)}
					</li>
				)}
			</ul>
			<span className={styles.openCta}>
				Xem chương trình & đăng ký <ArrowRSvg />
			</span>
		</button>
	);
}

// Mở 1 khóa đang tuyển ⇒ xem chi tiết, chọn 1 chương trình rồi gửi đăng ký
function OpenCourseDetail({ course, onBack, onDone }: { course: OpenCourse; onBack: () => void; onDone: () => void }) {
	const [programId, setProgramId] = useState(course.programs.length === 1 ? course.programs[0].id : '');
	const [saving, setSaving] = useState(false);

	const submit = async () => {
		setSaving(true);
		try {
			await registerMyCourse(course.id, programId || undefined);
			notify.success('Đã gửi đăng ký, vui lòng chờ phòng Đào tạo duyệt.');
			onDone();
		} catch (err) {
			notify.error(err instanceof Error ? err.message : 'Đăng ký thất bại');
			setSaving(false);
		}
	};

	return (
		<Card>
			<Card.Body>
				<CourseProgramPicker
					course={course}
					value={programId}
					onChange={setProgramId}
					onBack={onBack}
					backLabel='Khóa học của tôi'
					footer={
						<Button
							loading={saving}
							disabled={course.programs.length > 0 && !programId}
							onClick={submit}
						>
							Gửi đăng ký
						</Button>
					}
				/>
			</Card.Body>
		</Card>
	);
}

/** Bài chờ chấm — bài tự luận của đề mình là người chấm (giai đoạn 4.4) */
function PendingGradingCard({ onCount }: { onCount?: (n: number) => void }) {
	const [items, setItems] = useState<PendingGrading[]>([]);
	const [attempt, setAttempt] = useState<ExamAttemptDetail | null>(null);
	const load = useCallback(() => {
		teachingApi
			.listPendingGrading()
			.then(setItems)
			.catch(() => setItems([]));
	}, []);
	useEffect(() => onCount?.(items.length), [items.length, onCount]);
	useEffect(load, [load]);
	useRealtimeUpdate(['exam_attempt'], load);
	const pg = useClientPaging(items);

	const openAttempt = (id: string) =>
		teachingApi
			.getAttempt(id)
			.then(setAttempt)
			.catch((err) => notify.error(err instanceof Error ? err.message : 'Không mở được bài làm'));

	if (!items.length && !attempt) return null;
	return (
		<Card>
			<Card.Header
				icon={<LayersSvg />}
				title='Bài chờ chấm'
				sub={`${items.length} bài tự luận`}
			/>
			<Card.Body>
				<div className={styles.tableWrap}>
					<table className={styles.table}>
						<thead>
							<tr>
								<th className={tbl.thIdx}>STT</th>
								<th>Đề thi</th>
								<th>Khóa học</th>
								<th>Bài làm</th>
								<th>Câu chưa chấm</th>
								<th />
							</tr>
						</thead>
						<tbody>
							{pg.paged.map((p, i) => (
								<tr key={p.attempt_id}>
									<td className={tbl.tdIdx}>{pg.offset + i + 1}</td>
									<td>
										<span className={tbl.cellTitle}>{p.paper_title}</span>
										<div className={tbl.cellSub}>{EXAM_PART_LABEL[p.exam_part]}</div>
									</td>
									<td>{p.course_name}</td>
									<td>{p.trainee_name ?? <span className={tbl.cellCode}>{p.attempt_id}</span>}</td>
									<td>{p.pending_count}</td>
									<td>
										<Button
											size='sm'
											variant='secondary'
											onClick={() => void openAttempt(p.attempt_id)}
										>
											Chấm
										</Button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
					<Pagination
						{...pg.pagination}
						itemLabel='bài'
					/>
				</div>
			</Card.Body>
			<Modal
				open={!!attempt}
				onClose={() => {
					setAttempt(null);
					load();
				}}
				title='Chấm bài tự luận'
				size='lg'
			>
				{attempt && (
					<GradingPanel
						attempt={attempt}
						gradeAnswer={teachingApi.gradeAnswer}
						backLabel='← Đóng'
						onBack={() => {
							setAttempt(null);
							load();
						}}
						onGraded={setAttempt}
					/>
				)}
			</Modal>
		</Card>
	);
}

export default function MyTraining() {
	const [data, setData] = useState<Data | null>(null);
	const [error, setError] = useState('');
	const [opening, setOpening] = useState<OpenCourse | null>(null);
	const [pendingGrading, setPendingGrading] = useState(0);
	const [params, setParams] = useSearchParams();
	const navigate = useNavigate();

	const load = useCallback(() => {
		getMyTraining()
			.then(setData)
			.catch((err) => setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu khóa học'));
	}, []);
	useEffect(load, [load]);
	useRealtimeUpdate(['course', 'course_enrollment', 'lecturer_assignment'], load);

	const open = (c: OpenCourse) => {
		setOpening(c);
		window.scrollTo({ top: 0 });
	};

	const empty =
		data &&
		!data.enrolled.length &&
		!data.teaching.length &&
		!data.upcoming_sessions.length &&
		!data.open_courses.length;
	// Vừa học vừa dạy thì tách 2 tab; chỉ một vai trò thì hiện thẳng các mục của vai trò đó
	const isLearner = !!data && (data.enrolled.length > 0 || data.open_courses.length > 0);
	const isTeacher = !!data && (data.teaching.length > 0 || data.teaching_lessons.length > 0);
	const split = isLearner && isTeacher;
	const view: 'learning' | 'teaching' = split ? (params.get('tab') === 'giang-day' ? 'teaching' : 'learning') : isTeacher ? 'teaching' : 'learning';
	const showLearning = !split || view === 'learning';
	const showTeaching = !split || view === 'teaching';

	return (
		<UserLayout
			pageTitle='Khóa học của tôi'
			pageSubtitle='Lịch học, kết quả học tập, chứng chỉ và các khóa bạn giảng dạy'
		>
			{opening && (
				<OpenCourseDetail
					key={opening.id}
					course={opening}
					onBack={() => setOpening(null)}
					onDone={() => {
						setOpening(null);
						load();
					}}
				/>
			)}
			{!opening && error && (
				<EmptyState
					title='Không thể tải dữ liệu'
					desc={error}
				/>
			)}
			{!opening && !data && !error && <InlineLoading />}
			{!opening && empty && (
				<EmptyState
					icon={<BookOpenSvg />}
					title='Bạn chưa tham gia khóa học nào'
					desc='Khi được ghi danh hoặc phân công giảng dạy, khóa học sẽ hiện ở đây.'
				/>
			)}

			{!opening && data && !empty && (
				<div className={styles.stack}>
					{data.upcoming_sessions.length > 0 && (
						<Card>
							<Card.Header
								icon={<CalendarSvg />}
								title='Lịch học 30 ngày tới'
								sub={`${data.upcoming_sessions.length} buổi`}
							/>
							<Card.Body>
								<div className={styles.list}>
									{data.upcoming_sessions.map((s) => {
										const d = new Date(s.session_date);
										return (
											<div
												key={s.id}
												className={`${styles.item} ${styles.session}`}
											>
												<div className={styles.dateBox}>
													<span>{WEEKDAYS[d.getDay()]}</span>
													<strong>{formatDateVN(s.session_date).slice(0, 5)}</strong>
												</div>
												<div style={{ flex: 1, minWidth: 0 }}>
													<div className={styles.itemHead}>
														<div className={styles.itemTitle}>{s.course_name}</div>
														<Badge tone={s.my_role === 'teaching' ? 'purple' : 'green'}>
															{s.my_role === 'teaching' ? 'Giảng dạy' : 'Học'}
														</Badge>
													</div>
													<div className={styles.meta}>
														{(s.start_time || s.end_time) && (
															<span>
																<b>
																	{time(s.start_time)} – {time(s.end_time)}
																</b>
															</span>
														)}
														{s.subject_name && <span>Bài: {s.subject_name}</span>}
														{s.room && <span>Phòng: {s.room}</span>}
														{s.lecturer_name && s.my_role === 'learning' && (
															<span>Giảng viên: {s.lecturer_name}</span>
														)}
													</div>
												</div>
											</div>
										);
									})}
								</div>
							</Card.Body>
						</Card>
					)}

					{split && (
						<Card>
							<div
								className={styles.tabs}
								role='tablist'
							>
								{[
									{ key: 'learning' as const, label: 'Học tập', icon: <BookOpenSvg />, count: data.enrolled.length, alert: false },
									{
										key: 'teaching' as const,
										label: 'Giảng dạy',
										icon: <UsersSvg />,
										count: pendingGrading || data.teaching.length,
										alert: pendingGrading > 0,
									},
								].map((t) => (
									<button
										key={t.key}
										type='button'
										role='tab'
										aria-selected={view === t.key}
										className={`${styles.tab} ${view === t.key ? styles.tabActive : ''}`}
										title={t.alert ? `${pendingGrading} bài tự luận chờ chấm` : undefined}
										onClick={() => setParams(t.key === 'teaching' ? { tab: 'giang-day' } : {}, { replace: true })}
									>
										{t.icon}
										{t.label}
										<span className={`${styles.tabCount} ${t.alert ? styles.tabCountAlert : ''}`}>{t.count}</span>
									</button>
								))}
							</div>
						</Card>
					)}

					{showLearning && data.enrolled.length > 0 && (
						<Card>
							<Card.Header
								icon={<BookOpenSvg />}
								title='Khóa học đang tham gia'
								sub={`${data.enrolled.length} khóa · bấm vào khóa để xem tài liệu và làm bài kiểm tra`}
							/>
							<Card.Body>
								<div className={styles.list}>
									{data.enrolled.map((c) => (
										<EnrolledItem
											key={c.enrollment_id}
											c={c}
										/>
									))}
								</div>
							</Card.Body>
						</Card>
					)}

					{showTeaching && data.teaching.length > 0 && (
						<Card>
							<Card.Header
								icon={<UsersSvg />}
								title='Khóa học giảng dạy'
								sub={`${data.teaching.length} khóa`}
							/>
							<Card.Body>
								<div className={styles.list}>
									{data.teaching.map((c) => (
										<div
											key={c.id}
											className={styles.item}
										>
											<div className={styles.itemHead}>
												<div className={styles.itemTitle}>{c.name}</div>
												{cfgBadge(DISPLAY_STATUS_CFG[c.display_status])}
											</div>
											<div className={styles.meta}>
												<span>
													Thời gian: <b>{range(c.start_date, c.end_date)}</b>
												</span>
												{c.subjects && (
													<span>
														Bài phụ trách: <b>{c.subjects}</b>
													</span>
												)}
												<span>
													Học viên: <b>{c.approved_count}</b>
												</span>
												<span>
													Số buổi: <b>{c.session_count}</b>
												</span>
											</div>
											<div>
												<Button
													size='sm'
													variant='secondary'
													onClick={() => navigate(`/user/giang-day/${c.id}/diem`)}
												>
													Nhập điểm
												</Button>
											</div>
										</div>
									))}
								</div>
							</Card.Body>
						</Card>
					)}

					{showLearning && data.enrolled.length > 0 && <MyTraineeDocumentsCard />}

					{/* Luôn mount để đếm bài chờ chấm cho tab; ẩn khi đang ở tab Học tập */}
					{data.teaching.length > 0 && (
						<div style={{ display: showTeaching ? 'contents' : 'none' }}>
							<PendingGradingCard onCount={setPendingGrading} />
						</div>
					)}

					{showTeaching && data.teaching_lessons.length > 0 && <TeachingLessons lessons={data.teaching_lessons} />}

					{showLearning && data.open_courses.length > 0 && (
						<Card>
							<Card.Header
								icon={<DocPlusSvg />}
								title='Khóa học đang mở đăng ký'
								sub='Đăng ký sẽ được phòng Đào tạo xét duyệt'
							/>
							<Card.Body>
								<div className={styles.openGrid}>
									{data.open_courses.map((c) => (
										<OpenCourseCard
											key={c.id}
											course={c}
											onOpen={() => open(c)}
										/>
									))}
								</div>
							</Card.Body>
						</Card>
					)}
				</div>
			)}
		</UserLayout>
	);
}
