import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BookOpenSvg, CalendarSvg, ChevDSvg, ChevLSvg, ClockSvg, FileSvg, FileTextSvg, LinkSvg, QrSvg } from '@/assets/icons';
import { Badge, Button, Card, EmptyState, InlineLoading } from '@/shared/components';
import { FileViewerModal } from '@/shared/components/FileViewerModal';
import { formatDateVN } from '@/shared/utils/formatDate';
import { notify } from '@/shared/utils/feedback';
import UserLayout from '../../../layouts/UserLayout';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { DISPLAY_STATUS_CFG, DOC_TYPE_CFG, ENROLLMENT_STATUS_CFG, EXAM_TYPE_CFG } from '../../course/types/course.type';
import ExamTaking from '../../exam/components/ExamTaking';
import { examApi } from '../../exam/api/examApi';
import type { StartAttemptResult } from '../../exam/types/exam.type';
import { formatFileSize } from '../../topics/utils/topicHelpers';
import {
	getMyCourse,
	markDocumentOpened,
	type MyCourseDetail as Data,
	type MyLesson,
	type MyLessonDocument,
} from '../api/meApi';
import { isTraineeAccount, isTraineePath, TRAINEE_HOME } from '../../../app/router/authHelpers';
import { TraineeAttendanceTab } from '../../trainee/components/TraineeAttendanceTab';
import styles from './SelfService.module.css';

const ATTEMPT_LABEL: Record<string, { label: string; tone: 'amber' | 'blue' | 'green' }> = {
	in_progress: { label: 'Đang làm dở', tone: 'amber' },
	submitted: { label: 'Đã nộp — chờ chấm tự luận', tone: 'blue' },
	graded: { label: 'Đã có điểm', tone: 'green' },
};

// Xem ngay trong trang được: PDF, Word (.docx), ảnh. Còn lại (video, pptx, liên kết) mở tab mới.
const VIEWABLE = /\.(pdf|docx|png|jpe?g|gif|webp)$/i;

type OpenDoc = (doc: MyLessonDocument | Data['documents'][number], kind?: 'course' | 'lesson') => void;

const docMeta = (doc: Pick<MyLessonDocument, 'source_type' | 'file_name' | 'file_size'>) =>
	doc.source_type === 'link'
		? 'Liên kết ngoài'
		: `${doc.file_name ?? ''}${doc.file_size ? ` · ${formatFileSize(doc.file_size)}` : ''}`;

// Bài học theo chương trình đào tạo gắn với khóa — bấm để mở mô tả + tài liệu của bài.
function LessonsPanel({ lessons, onOpen }: { lessons: MyLesson[]; onOpen: OpenDoc }) {
	const [open, setOpen] = useState<string | null>(null);
	const programs = [...new Set(lessons.map((l) => l.program_name))];
	return (
		<>
			{lessons.length === 0 ? (
				<EmptyState title='Khóa học chưa có bài học nào' />
			) : (
				programs.map((pg) => (
					<div
						key={pg}
						className={styles.group}
					>
						{programs.length > 1 && <div className={styles.groupTitle}>{pg}</div>}
						<div className={styles.list}>
							{lessons
								.filter((l) => l.program_name === pg)
								.map((l, i) => {
									const key = `${l.program_id}-${l.id}`;
									const isOpen = open === key;
									return (
										<div
											key={key}
											className={styles.item}
										>
											<button
												type='button'
												className={styles.lessonHead}
												aria-expanded={isOpen}
												onClick={() => setOpen(isOpen ? null : key)}
											>
												<span className={styles.lessonNo}>{i + 1}</span>
												<span className={styles.lessonMain}>
													<span className={styles.itemTitle}>{l.title}</span>
													<span className={styles.meta}>
														<span>{l.code}</span>
														<span>
															LT {l.theory_hours} · TH {l.practice_hours} tiết
														</span>
														{l.credits > 0 && <span>{l.credits} tín chỉ</span>}
													</span>
												</span>
												{l.documents.length > 0 && <Badge tone='blue'>{l.documents.length} tài liệu</Badge>}
												<ChevDSvg className={`${styles.chev} ${isOpen ? styles.chevOpen : ''}`} />
											</button>
											{isOpen && (
												<div className={styles.lessonBody}>
													{l.description && <p className={styles.lessonDesc}>{l.description}</p>}
													{l.documents.length === 0
														? !l.description && <div className={styles.meta}>Bài học chưa có tài liệu.</div>
														: l.documents.map((doc) => (
																<button
																	key={doc.id}
																	type='button'
																	className={styles.docLink}
																	onClick={() => onOpen(doc, 'lesson')}
																>
																	{doc.source_type === 'link' ? <LinkSvg /> : <FileSvg />}
																	<span>{doc.title}</span>
																	<span className={styles.docMeta}>{docMeta(doc)}</span>
																</button>
															))}
												</div>
											)}
										</div>
									);
								})}
						</div>
					</div>
				))
			)}
		</>
	);
}

type Tab = 'lessons' | 'documents' | 'exams' | 'attendance';
const TABS: Tab[] = ['lessons', 'documents', 'exams', 'attendance'];

export default function MyCourseDetail() {
	const { id = '' } = useParams();
	const navigate = useNavigate();
	const { pathname } = useLocation();
	// Tab giữ trên URL (?tab=) — tải lại / quay lại vẫn đúng tab đang xem.
	const [params, setParams] = useSearchParams();
	const tab: Tab = TABS.find((t) => t === params.get('tab')) ?? 'lessons';
	const setTab = (t: Tab) => setParams({ tab: t }, { replace: true });
	const [data, setData] = useState<Data | null>(null);
	const [error, setError] = useState('');
	const [viewer, setViewer] = useState<{
		url: string;
		name: string;
		isWord: boolean;
	} | null>(null);
	const [taking, setTaking] = useState<{
		paperId: string;
		data: StartAttemptResult;
	} | null>(null);
	const [starting, setStarting] = useState('');

	const load = useCallback(() => {
		getMyCourse(id)
			.then(setData)
			.catch((err) => setError(err instanceof Error ? err.message : 'Không thể tải khóa học'));
	}, [id]);
	useEffect(load, [load]);
	useRealtimeUpdate(['course', 'course_enrollment', 'course_document', 'program_lesson', 'lesson_document'], load);

	const openDoc: OpenDoc = (doc, kind = 'course') => {
		void markDocumentOpened(doc.id, kind).catch(() => {});
		const name = doc.file_name ?? doc.title;
		if (doc.source_type === 'file' && doc.file_url && VIEWABLE.test(name)) {
			setViewer({ url: doc.file_url, name, isWord: /\.docx$/i.test(name) });
			return;
		}
		const url = doc.source_type === 'link' ? doc.external_url : doc.file_url;
		if (url) window.open(url, '_blank', 'noopener,noreferrer');
	};

	const startExam = async (paperId: string) => {
		setStarting(paperId);
		try {
			setTaking({ paperId, data: await examApi.startAttempt(paperId) });
		} catch (err) {
			notify.error(err instanceof Error ? err.message : 'Không thể bắt đầu làm bài');
		} finally {
			setStarting('');
		}
	};

	// Tài khoản học viên: cổng /hoc-vien (TraineeLayout tự có nút quay lại).
	const trainee = isTraineeAccount() || isTraineePath(pathname);
	const listPath = trainee ? `${TRAINEE_HOME}/khoa-hoc` : '/user/khoa-hoc';
	const checkInPath = trainee ? `${TRAINEE_HOME}/diem-danh` : '/user/diem-danh';
	const layout = {
		breadcrumbs: [{ label: 'Khóa học của tôi', path: listPath }],
		pageTitle: data?.name ?? 'Chi tiết khóa học',
	};

	if (taking) {
		return (
			<UserLayout
				{...layout}
				pageSubtitle='Làm bài trong thời gian quy định'
			>
				<ExamTaking
					paperId={taking.paperId}
					data={taking.data}
					onCancel={() => setTaking(null)}
					onDone={() => {
						setTaking(null);
						notify.success('Đã nộp bài thi thành công.');
						load();
					}}
				/>
			</UserLayout>
		);
	}

	const status = data && DISPLAY_STATUS_CFG[data.display_status];
	const approved = data?.enrollment_status === 'approved';
	const totalHours = data?.lessons.reduce((t, l) => t + (l.total_hours || 0), 0) ?? 0;
	const openExams = data?.papers.filter((p) => !p.attempt_status || p.attempt_status === 'in_progress').length ?? 0;
	const tabs: {
		key: Tab;
		label: string;
		icon: ReactNode;
		count: number | string;
		alert?: boolean;
	}[] = data
		? [
				{
					key: 'lessons',
					label: 'Bài học',
					icon: <BookOpenSvg />,
					count: data.lessons.length,
				},
				{
					key: 'documents',
					label: 'Tài liệu',
					icon: <FileSvg />,
					count: data.documents.length,
				},
				{
					key: 'exams',
					label: 'Bài kiểm tra',
					icon: <FileTextSvg />,
					count: data.papers.length,
					alert: openExams > 0,
				},
				{
					key: 'attendance',
					label: 'Điểm danh',
					icon: <ClockSvg />,
					count: `${data.attended_count}/${data.session_count}`,
				},
			]
		: [];

	return (
		<UserLayout
			{...layout}
			headerActions={
				!trainee && <Button
					variant='secondary'
					size='sm'
					icon={<ChevLSvg />}
					onClick={() => navigate(listPath)}
				>
					Quay lại
				</Button>
			}
		>
			{error && (
				<EmptyState
					title='Không thể tải khóa học'
					desc={error}
				/>
			)}
			{!data && !error && <InlineLoading />}

			{data && (
				<div className={styles.stack}>
					{/* Tóm tắt khóa: trạng thái, thời gian, mô tả + số liệu nhanh (bấm để chuyển tab) */}
					<Card>
						<Card.Body>
							<div className={styles.summary}>
								<div className={styles.summaryInfo}>
									<div className={styles.badges}>
										{status && <Badge style={{ color: status.color, background: status.bg }}>{status.label}</Badge>}
										{!approved && (
											<Badge
												style={{
													color: ENROLLMENT_STATUS_CFG[data.enrollment_status].color,
													background: ENROLLMENT_STATUS_CFG[data.enrollment_status].bg,
												}}
											>
												{ENROLLMENT_STATUS_CFG[data.enrollment_status].label}
											</Badge>
										)}
									</div>
									<div className={styles.summaryDates}>
										<CalendarSvg />
										{formatDateVN(data.start_date) || '…'} – {formatDateVN(data.end_date) || '…'}
									</div>
									{data.description && <p className={styles.lessonDesc}>{data.description}</p>}
								</div>
								{approved && (
									<div className={styles.stats}>
										{[
											{
												key: 'lessons' as Tab,
												value: data.lessons.length,
												label: `Bài học · ${totalHours} tiết`,
											},
											{
												key: 'documents' as Tab,
												value: data.documents.length,
												label: 'Tài liệu',
											},
											{
												key: 'exams' as Tab,
												value: openExams,
												label: 'Bài kiểm tra cần làm',
											},
											{
												key: 'attendance' as Tab,
												value: `${data.attended_count}/${data.session_count}`,
												label: 'Buổi có mặt',
											},
										].map((s) => (
											<button
												key={s.key}
												type='button'
												className={`${styles.stat} ${s.key === 'exams' && openExams > 0 ? styles.statAlert : ''}`}
												onClick={() => setTab(s.key)}
											>
												<strong>{s.value}</strong>
												<span>{s.label}</span>
											</button>
										))}
									</div>
								)}
							</div>
						</Card.Body>
					</Card>

					{!approved ? (
						<EmptyState
							title='Đăng ký của bạn chưa được duyệt'
							desc='Bài học, tài liệu và bài kiểm tra sẽ hiện ở đây sau khi phòng Đào tạo duyệt đăng ký.'
						/>
					) : (
						<Card>
							<div
								className={styles.tabs}
								role='tablist'
							>
								{tabs.map((t) => (
									<button
										key={t.key}
										type='button'
										role='tab'
										aria-selected={tab === t.key}
										className={`${styles.tab} ${tab === t.key ? styles.tabActive : ''}`}
										onClick={() => setTab(t.key)}
									>
										{t.icon}
										{t.label}
										<span className={`${styles.tabCount} ${t.alert ? styles.tabCountAlert : ''}`}>{t.count}</span>
									</button>
								))}
							</div>
							<Card.Body>
								{tab === 'lessons' && (
									<LessonsPanel
										lessons={data.lessons}
										onOpen={openDoc}
									/>
								)}

								{tab === 'documents' &&
									(data.documents.length === 0 ? (
										<EmptyState title='Giảng viên chưa đăng tài liệu nào' />
									) : (
										<div className={styles.list}>
											{data.documents.map((doc) => (
												<button
													key={doc.id}
													type='button'
													className={`${styles.item} ${styles.clickable}`}
													onClick={() => openDoc(doc)}
												>
													<div className={styles.itemHead}>
														<div className={styles.itemTitle}>
															{doc.source_type === 'link' ? <LinkSvg /> : <FileSvg />} {doc.title}
														</div>
														<Badge tone={doc.doc_type === 'material' ? 'blue' : 'purple'}>
															{DOC_TYPE_CFG[doc.doc_type]}
															{doc.exam_type ? ` · ${EXAM_TYPE_CFG[doc.exam_type]}` : ''}
														</Badge>
													</div>
													<div className={styles.meta}>
														<span>{docMeta(doc)}</span>
														<span>Đăng ngày {formatDateVN(doc.created_at)}</span>
													</div>
												</button>
											))}
										</div>
									))}

								{tab === 'exams' &&
									(data.papers.length === 0 ? (
										<EmptyState title='Chưa có bài kiểm tra nào đang mở' />
									) : (
										<div className={styles.list}>
											{data.papers.map((p) => {
												const att = p.attempt_status ? ATTEMPT_LABEL[p.attempt_status] : null;
												const canTake = !p.attempt_status || p.attempt_status === 'in_progress';
												return (
													<div
														key={p.id}
														className={styles.item}
													>
														<div className={styles.itemHead}>
															<div>
																<div className={styles.itemTitle}>{p.title}</div>
																<div className={styles.meta}>
																	<span>Thời gian làm bài: {p.duration_minutes} phút</span>
																	{p.purpose === 'entrance' && <Badge tone='blue'>Kiểm tra đầu vào</Badge>}
																	{p.retake_no && <Badge tone='amber'>Thi lại lần {p.retake_no - 1}</Badge>}
																	{att && <Badge tone={att.tone}>{att.label}</Badge>}
																</div>
															</div>
															{canTake && (
																<Button
																	size='sm'
																	loading={starting === p.id}
																	disabled={!!starting}
																	onClick={() => void startExam(p.id)}
																>
																	{p.attempt_status === 'in_progress' ? 'Tiếp tục làm bài' : 'Bắt đầu làm bài'}
																</Button>
															)}
														</div>
													</div>
												);
											})}
										</div>
									))}

								{tab === 'attendance' && (
									<>
										<div className={styles.tabToolbar}>
											<span className={styles.meta}>
												Đến lớp, quét mã QR giảng viên chiếu trên màn hình để điểm danh.
											</span>
											<Button
												size='sm'
												icon={<QrSvg />}
												onClick={() => navigate(checkInPath)}
											>
												Điểm danh QR
											</Button>
										</div>
										<TraineeAttendanceTab courseId={data.id} />
									</>
								)}
							</Card.Body>
						</Card>
					)}
				</div>
			)}

			{viewer && (
				<FileViewerModal
					file={viewer}
					onClose={() => setViewer(null)}
				/>
			)}
		</UserLayout>
	);
}
