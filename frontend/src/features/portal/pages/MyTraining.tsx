import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpenSvg, CalendarSvg, DocPlusSvg, UsersSvg } from '@/assets/icons';
import { Badge, Button, Card, EmptyState, InlineLoading } from '@/shared/components';
import { formatDateVN } from '@/shared/utils/formatDate';
import { notify } from '@/shared/utils/feedback';
import UserLayout from '../../../layouts/UserLayout';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { DISPLAY_STATUS_CFG, ENROLLMENT_STATUS_CFG } from '../../course/types/course.type';
import { getMyTraining, registerMyCourse, type MyEnrolledCourse, type MyTraining as Data } from '../api/meApi';
import styles from './SelfService.module.css';

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const cfgBadge = (cfg?: { label: string; color: string; bg: string }) =>
	cfg && <Badge style={{ color: cfg.color, background: cfg.bg }}>{cfg.label}</Badge>;
const range = (a: string | null, b: string | null) =>
	a || b ? `${formatDateVN(a) || '…'} – ${formatDateVN(b) || '…'}` : 'Chưa xếp lịch';
const time = (t: string | null) => (t ? t.slice(0, 5) : '');
const num = (v: number | null) => (v == null ? '—' : v);

function EnrolledItem({ c }: { c: MyEnrolledCourse }) {
	const navigate = useNavigate();
	const grades = c.grades.filter((g) => g.score != null || g.final_score != null || g.result);
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
								<th>Môn học</th>
								<th>Thường xuyên</th>
								<th>Giữa kỳ</th>
								<th>Cuối kỳ</th>
								<th>Tổng kết</th>
								<th>Kết quả</th>
							</tr>
						</thead>
						<tbody>
							{grades.map((g, i) => (
								<tr key={i}>
									<td>{g.subject_name ?? 'Toàn khóa'}</td>
									<td>{num(g.regular_score)}</td>
									<td>{num(g.midterm_score)}</td>
									<td>{num(g.final_score)}</td>
									<td>
										<b>{num(g.score)}</b>
									</td>
									<td>{g.classification ?? g.result ?? '—'}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}

export default function MyTraining() {
	const [data, setData] = useState<Data | null>(null);
	const [error, setError] = useState('');
	const [registering, setRegistering] = useState('');

	const load = useCallback(() => {
		getMyTraining()
			.then(setData)
			.catch((err) => setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu khóa học'));
	}, []);
	useEffect(load, [load]);
	useRealtimeUpdate(['course', 'course_enrollment'], load);

	const register = async (id: string, name: string) => {
		if (!window.confirm(`Đăng ký tham gia khóa "${name}"?`)) return;
		setRegistering(id);
		try {
			await registerMyCourse(id);
			notify.success('Đã gửi đăng ký, vui lòng chờ phòng Đào tạo duyệt.');
			load();
		} catch (err) {
			notify.error(err instanceof Error ? err.message : 'Đăng ký thất bại');
		} finally {
			setRegistering('');
		}
	};

	const empty =
		data &&
		!data.enrolled.length &&
		!data.teaching.length &&
		!data.upcoming_sessions.length &&
		!data.open_courses.length;

	return (
		<UserLayout
			pageTitle='Khóa học của tôi'
			pageSubtitle='Lịch học, kết quả học tập, chứng chỉ và các khóa bạn giảng dạy'
		>
			{error && (
				<EmptyState
					title='Không thể tải dữ liệu'
					desc={error}
				/>
			)}
			{!data && !error && <InlineLoading />}
			{empty && (
				<EmptyState
					icon={<BookOpenSvg />}
					title='Bạn chưa tham gia khóa học nào'
					desc='Khi được ghi danh hoặc phân công giảng dạy, khóa học sẽ hiện ở đây.'
				/>
			)}

			{data && !empty && (
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
														{s.subject_name && <span>Môn: {s.subject_name}</span>}
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

					{data.enrolled.length > 0 && (
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

					{data.teaching.length > 0 && (
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
														Môn phụ trách: <b>{c.subjects}</b>
													</span>
												)}
												<span>
													Học viên: <b>{c.approved_count}</b>
												</span>
												<span>
													Số buổi: <b>{c.session_count}</b>
												</span>
											</div>
										</div>
									))}
								</div>
							</Card.Body>
						</Card>
					)}

					{data.open_courses.length > 0 && (
						<Card>
							<Card.Header
								icon={<DocPlusSvg />}
								title='Khóa học đang mở đăng ký'
								sub='Đăng ký sẽ được phòng Đào tạo xét duyệt'
							/>
							<Card.Body>
								<div className={styles.list}>
									{data.open_courses.map((c) => (
										<div
											key={c.id}
											className={styles.item}
										>
											<div className={styles.itemHead}>
												<div className={styles.itemTitle}>{c.name}</div>
												<Button
													size='sm'
													loading={registering === c.id}
													disabled={!!registering}
													onClick={() => register(c.id, c.name)}
												>
													Đăng ký
												</Button>
											</div>
											<div className={styles.meta}>
												<span>
													Thời gian: <b>{range(c.start_date, c.end_date)}</b>
												</span>
												{c.program_name && <span>Chương trình: {c.program_name}</span>}
												{c.capacity != null && <span>Chỉ tiêu: {c.capacity}</span>}
											</div>
										</div>
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
