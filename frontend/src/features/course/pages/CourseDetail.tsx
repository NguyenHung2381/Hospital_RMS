import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Dropdown } from 'antd';
import { CalendarSvg, ChevDSvg, ChevLSvg, CopySvg, EditSvg, MoreVSvg, QrSvg } from '@/assets/icons';
import { CourseCloneModal } from '../components/CourseCloneModal';
import AdminLayout from '../../../layouts/AdminLayout';
import { Button, InlineLoading } from '@/shared/components';
import { showToast } from '@/shared/utils/feedback';
import { formatDateOr } from '@/shared/utils';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { getCourse, updateCourse } from '../api/courseApi';
import { AttendanceModal } from '../components/AttendanceModal';
import { CourseDocumentsTab } from '../components/CourseDocumentsTab';
import { CourseProgramList, type ProgramStats } from '../components/CourseProgramList';
import { programClassStatus, programDates } from '../utils/programClass';
import { CourseFormModal } from '../components/CourseFormModal';
import { CourseRegisterLinkModal } from '../components/CourseRegisterLinkModal';
import { EnrollmentsTab } from '../components/EnrollmentsTab';
import { ExamsTab } from '../components/ExamsTab';
import { ResultsTab } from '../components/ResultsTab';
import { SessionsTab } from '../components/SessionsTab';
import { useCourseDetail, type DetailTab } from '../hooks/useCourseDetail';
import { DISPLAY_STATUS_CFG, TRAINING_TYPE, type Course, type CourseFormData } from '../types/course.type';
import ProgramTags from '../components/ProgramTags';
import styles from './Courses.module.css';
import { CustomValuesInline, useFormConfig } from '@/shared/formConfig';

type Step = DetailTab;

// Thứ tự tab đi theo luồng làm việc: ghi danh → bài học & lịch → tài liệu → thi → kết quả.
const STEPS: { key: Step; label: string }[] = [
	{ key: 'enrollments', label: 'Học viên' },
	{ key: 'sessions', label: 'Bài học & lịch học' },
	{ key: 'documents', label: 'Tài liệu' },
	{ key: 'exams', label: 'Thi & kiểm tra' },
	{ key: 'results', label: 'Kết quả & chứng chỉ' },
];
// Khóa GPHN: mỗi học viên có lịch vòng riêng, kết quả theo vòng ⇒ không có lịch chung / thi / bảng điểm.
const PRACTICE_STEPS = new Set<Step>(['enrollments', 'documents']);
const isPracticeCourse = (c: Course | null) => !!c && (c.is_rolling || c.training_type_id === TRAINING_TYPE.GPHN);

const range = (from: string | null, to: string | null) =>
	from || to ? `${formatDateOr(from, '?')} → ${formatDateOr(to, '?')}` : null;

/** Trang chi tiết khóa học.
 *  Khóa nhiều chương trình (ĐTLT / CTCV): tầng đầu là danh sách chương trình; chọn 1 chương trình (?program=)
 *  thì mỗi phần việc của chương trình đó là 1 tab. "Xem toàn khóa" = ?tab= không kèm program (mọi chương trình).
 *  Khóa 0–1 chương trình và khóa GPHN: vào thẳng các tab. */
export default function CourseDetail() {
	const { id = '' } = useParams();
	const navigate = useNavigate();
	const [params, setParams] = useSearchParams();
	const tabParam = params.get('tab');

	const [course, setCourse] = useState<Course | null>(null);
	const [notFound, setNotFound] = useState(false);
	// Trường tùy chỉnh (Cấu hình form 'course')
	const customCfg = useFormConfig('course', 'admin');
	const [editing, setEditing] = useState(false);
	const [saving, setSaving] = useState(false);
	const [sharing, setSharing] = useState(false);
	const [cloning, setCloning] = useState(false);
	const d = useCourseDetail(id);
	const { reload } = d;

	const loadCourse = useCallback(
		() =>
			getCourse(id)
				.then(setCourse)
				.catch(() => setNotFound(true)),
		[id],
	);
	useEffect(() => {
		void loadCourse();
	}, [loadCourse]);
	useRealtimeUpdate('course', loadCourse);

	const handleEdit = async (form: CourseFormData) => {
		setSaving(true);
		try {
			setCourse(await updateCourse(id, form));
			setEditing(false);
			showToast('success', 'Đã cập nhật khóa học');
			void reload();
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Cập nhật thất bại');
		} finally {
			setSaving(false);
		}
	};

	if (notFound) {
		return (
			<AdminLayout pageTitle='Không tìm thấy'>
				<button
					className={styles.backLink}
					onClick={() => navigate(-1)}
				>
					<ChevLSvg /> Quay lại
				</button>
				<div className={styles.emptyState}>
					<div className={styles.emptyTitle}>Khóa học không tồn tại hoặc bạn không có quyền xem</div>
				</div>
			</AdminLayout>
		);
	}

	const practice = isPracticeCourse(course);
	const links = d.programLinks;
	// Tầng chương trình chỉ có ở khóa nhiều chương trình (GPHN: hồ sơ theo vòng, không chia chương trình).
	const programMode = !practice && links.length > 1;
	const programParam = params.get('program');
	const selected = programMode ? (links.find((l) => l.program_id === programParam) ?? null) : null;
	// Chưa chọn chương trình và chưa chọn tab ⇒ hiện danh sách chương trình
	const showList = programMode && !selected && !tabParam && programParam !== '_none';
	const scope = selected?.program_id;

	const steps = practice ? STEPS.filter((s) => PRACTICE_STEPS.has(s.key)) : STEPS;
	const tab = steps.find((s) => s.key === tabParam)?.key ?? 'enrollments';

	const programsOf = (ids: string | null) => (ids ?? '').split(',');
	const statsOf = (programId: string | undefined): ProgramStats & { waiting: number } => {
		const ens = programId ? d.enrollments.filter((e) => e.program_id === programId) : d.enrollments;
		const enIds = new Set(ens.map((e) => e.id));
		const lessons = programId
			? d.courseLessons.filter((l) => programsOf(l.program_ids).includes(programId))
			: d.courseLessons;
		const lessonIds = new Set(lessons.map((l) => l.id));
		return {
			approved: ens.filter((e) => e.status === 'approved').length,
			pending: ens.filter((e) => e.status === 'pending').length,
			waiting: ens.filter((e) => e.status === 'waitlisted').length,
			lessons: lessons.length,
			sessions: programId
				? d.sessions.filter((x) => x.subject_id && lessonIds.has(x.subject_id)).length
				: d.sessions.length,
			issued: d.certificates.filter((c) => c.status === 'active' && enIds.has(c.enrollment_id)).length,
		};
	};

	const scoped = statsOf(scope);
	const { approved, pending, waiting, issued, lessons: lessonCount } = scoped;
	const linkedIds = new Set(links.map((l) => l.program_id));
	const unassigned = d.enrollments.filter((e) => !e.program_id || !linkedIds.has(e.program_id)).length;
	// Khóa ĐTLT / CTCV: mỗi chương trình là 1 lớp — đếm lớp đã mở.
	const classes = (selected ? [selected] : links).filter((l) => l.class_rule);
	const opened = classes.filter((l) => l.class_opened_at).length;
	// Số đếm trên tab + chú thích khi rê chuột; alert = việc đang chờ xử lý (đăng ký chờ duyệt).
	const tabInfo: Record<Step, { count?: string; title: string; alert?: number }> = {
		enrollments: {
			count: String(approved),
			alert: pending,
			title: [
				`${approved} đã duyệt`,
				pending ? `${pending} chờ duyệt` : null,
				classes.length > 1 ? `${opened}/${classes.length} lớp đã mở` : null,
				waiting ? `${waiting} chờ khóa sau` : null,
			]
				.filter(Boolean)
				.join(' · '),
		},
		sessions: {
			count: String(lessonCount),
			title: `${lessonCount} bài học · ${scoped.sessions} buổi · ${d.assignments.length} giảng viên`,
		},
		documents: {
			count: String(d.documents.length),
			title: `${d.documents.length} tài liệu${scope ? ' — dùng chung cho mọi chương trình của khóa' : ''}`,
		},
		exams: { title: 'Đề thi trực tuyến' },
		results: {
			count: `${issued}/${approved}`,
			title: `${issued}/${approved} chứng chỉ đã cấp`,
		},
	};
	const attendanceSession = d.sessions.find((s) => s.id === d.attendanceSessionId);
	const status = course ? DISPLAY_STATUS_CFG[course.display_status] : null;

	// Khóa thuộc loại nào thì tô sáng mục menu loại đó và "Danh sách" quay về đúng trang loại đó.
	const menuKey = practice ? 'gphn' : course?.training_type_id === TRAINING_TYPE.CTCV ? 'ctcv' : 'dtlt';
	const backTo = {
		gphn: '/admin/practice-batches',
		ctcv: '/admin/ctcv',
		dtlt: '/admin/dtlt',
	}[menuKey];
	// Đổi tab giữ chương trình đang chọn / đang lọc (?program=).
	const goStep = (key: Step) => {
		const program = params.get('program');
		setParams({ tab: key, ...(program ? { program } : {}) }, { replace: true });
	};
	// Vào / đổi chương trình: giữ tab đang mở (nếu có). Lưu lịch sử để nút Back của trình duyệt quay về danh sách.
	const openProgram = (programId: string) => setParams({ program: programId, ...(tabParam ? { tab: tabParam } : {}) });
	const openWholeCourse = (program?: string) =>
		setParams({ tab: program ? 'enrollments' : (tabParam ?? 'enrollments'), ...(program ? { program } : {}) });
	const backToPrograms = () => setParams({});
	const stepLabel = (s: { key: Step; label: string }) =>
		s.key === 'enrollments' && practice ? 'Học viên & hồ sơ thực hành' : s.label;
	const selectedClass = selected ? programClassStatus(selected) : null;
	const selectedDates = selected ? programDates(selected) : null;

	return (
		<AdminLayout
			pageTitle={course?.name ?? 'Chi tiết khóa học'}
			breadcrumbs={[{ label: 'Đào tạo' }]}
			activeKey={course ? menuKey : undefined}
			headerActions={
				<div className={styles.detailActions}>
					<Button
						variant='secondary'
						icon={<ChevLSvg />}
						onClick={() => navigate(backTo)}
					>
						Danh sách
					</Button>
					{course && (
						<Button
							icon={<EditSvg />}
							onClick={() => setEditing(true)}
						>
							Sửa thông tin
						</Button>
					)}
					{/* Thao tác ít dùng gom vào menu "…" cho thanh tiêu đề gọn */}
					{course && (
						<Dropdown
							trigger={['click']}
							placement='bottomRight'
							menu={{
								items: [
									...(course.is_public_registration
										? [
												{
													key: 'share',
													icon: <QrSvg width={14} />,
													label: 'Link & QR đăng ký',
												},
											]
										: []),
									{
										key: 'clone',
										icon: <CopySvg width={14} />,
										label: practice ? 'Nhân bản đợt' : 'Nhân bản khóa học',
									},
								],
								onClick: ({ key }) => (key === 'share' ? setSharing(true) : setCloning(true)),
							}}
						>
							<Button
								variant='secondary'
								aria-label='Thao tác khác'
								title='Thao tác khác'
								icon={<MoreVSvg />}
							/>
						</Dropdown>
					)}
				</div>
			}
		>
			{!course ? (
				<InlineLoading />
			) : (
				<>
					{/* Tóm tắt khóa: 1 hàng nhãn + chương trình — gọn để bước làm việc nằm ngay màn đầu */}
					<div className={styles.summaryCard}>
						<div className={styles.summaryChips}>
							{status && (
								<span
									className={styles.badge}
									style={{ background: status.bg, color: status.color }}
								>
									{status.label}
								</span>
							)}
							{course.training_type_name && <span className={styles.summaryChip}>{course.training_type_name}</span>}
							<span className={styles.summaryChip}>
								<CalendarSvg />
								{range(course.start_date, course.end_date) ?? 'Chưa đặt ngày học'}
							</span>
							{course.training_form_name && <span className={styles.summaryChip}>{course.training_form_name}</span>}
							<span className={styles.summaryChip}>
								{course.is_public_registration ? 'Đăng ký công khai' : 'Nội bộ'}
							</span>
							<span
								className={`${styles.summaryChip} ${course.enrollment_open ? styles.summaryOpen : styles.summaryClosed}`}
							>
								{course.enrollment_open ? 'Đang nhận đăng ký' : 'Đã đóng đăng ký'}
							</span>
						</div>
						{/* Nhiều chương trình: chọn ở danh sách chương trình bên dưới — ở đây chỉ hiện khi 0–1 chương trình */}
						{!d.loading && d.programLinks.length <= 1 && (
							<div className={styles.summaryPrograms}>
								<span className={styles.summaryLabel}>Chương trình</span>
								<ProgramTags
									names={course.program_names}
									max={12}
									empty='Chưa áp dụng chương trình'
								/>
							</div>
						)}
						{course.description && <p className={styles.infoDesc}>{course.description}</p>}
						<CustomValuesInline
							cfg={customCfg}
							data={course.custom}
							className={styles.infoDesc}
						/>
					</div>

					{d.loading ? (
						<div className={styles.stepPanel}>
							<InlineLoading />
						</div>
					) : showList ? (
						<div className={styles.stepPanel}>
							{d.error && <div className={styles.errorBanner}>{d.error}</div>}
							<CourseProgramList
								links={links}
								statsOf={statsOf}
								unassigned={unassigned}
								onOpen={openProgram}
								onOpenAll={() => openWholeCourse()}
								onOpenUnassigned={() => openWholeCourse('_none')}
							/>
						</div>
					) : (
						<div className={styles.stepPanel}>
							{/* Đang làm việc trong 1 chương trình (hoặc toàn khóa): quay lại danh sách / đổi nhanh chương trình */}
							{programMode && (
								<div className={styles.programBar}>
									<button
										type='button'
										className={styles.programBack}
										onClick={backToPrograms}
									>
										<ChevLSvg /> Tất cả chương trình
									</button>
									<div className={styles.programHead}>
										{selected ? (
											<>
												{selected.program_code && <span className={styles.programCode}>{selected.program_code}</span>}
												<span className={styles.programName}>{selected.program_name}</span>
												{selectedClass && (
													<span className={`${styles.programStatus} ${styles[`programTone_${selectedClass.tone}`]}`}>
														{selectedClass.label} · {selectedClass.detail}
													</span>
												)}
												{selectedDates && (
													<span className={styles.programMeta}>
														<CalendarSvg aria-hidden />
														{selectedDates}
													</span>
												)}
											</>
										) : (
											<span className={styles.programName}>Toàn khóa · {links.length} chương trình</span>
										)}
									</div>
									<Dropdown
										trigger={['click']}
										placement='bottomRight'
										menu={{
											selectable: true,
											selectedKeys: [scope ?? '_all'],
											items: [
												...links.map((l) => ({
													key: l.program_id,
													label: l.program_code ? `${l.program_code} — ${l.program_name}` : l.program_name,
												})),
												{ type: 'divider' as const },
												{ key: '_all', label: 'Toàn khóa (mọi chương trình)' },
											],
											onClick: ({ key }) => (key === '_all' ? openWholeCourse() : openProgram(key)),
										}}
									>
										<Button
											variant='secondary'
											size='sm'
											icon={<ChevDSvg />}
										>
											Đổi chương trình
										</Button>
									</Dropdown>
								</div>
							)}
							<nav
								className={styles.detailTabs}
								aria-label={selected ? 'Các phần của chương trình' : 'Các phần của khóa học'}
							>
								{steps.map((s) => {
									const info = tabInfo[s.key];
									return (
										<button
											key={s.key}
											type='button'
											className={`${styles.detailTab} ${tab === s.key ? styles.detailTabActive : ''}`}
											aria-current={tab === s.key ? 'page' : undefined}
											title={info.title}
											onClick={() => goStep(s.key)}
										>
											{stepLabel(s)}
											{info.count !== undefined && <span className={styles.detailTabCount}>{info.count}</span>}
											{!!info.alert && (
												<span
													className={styles.detailTabAlert}
													title={`${info.alert} đăng ký chờ duyệt`}
												>
													{info.alert} chờ duyệt
												</span>
											)}
										</button>
									);
								})}
							</nav>
							{d.error && <div className={styles.errorBanner}>{d.error}</div>}
							{/* key theo chương trình: đổi chương trình thì tab dựng lại (trang, bộ lọc nội bộ về mặc định) */}
							{tab === 'enrollments' ? (
								<EnrollmentsTab
									key={scope ?? '_all'}
									scopeProgramId={scope}
									enrollments={d.enrollments}
									trainees={d.trainees}
									course={course}
									programLinks={d.programLinks}
									busy={d.busy}
									onRegister={d.registerTrainee}
									onSaved={() => void d.reload()}
									onDecide={d.decideEnrollment}
									onDecideBulk={d.decideEnrollmentsBulk}
									onRemove={d.removeEnrollment}
								/>
							) : tab === 'sessions' ? (
								<SessionsTab
									key={scope ?? '_all'}
									d={d}
									scopeProgramId={scope}
								/>
							) : tab === 'documents' ? (
								<>
									{scope && (
										<div className={styles.programNote}>Tài liệu dùng chung cho mọi chương trình của khóa.</div>
									)}
									<CourseDocumentsTab
										documents={d.documents}
										busy={d.busy}
										onAdd={d.addDocument}
										onRemove={d.removeDocument}
										onOpen={d.incrementDocumentDownload}
									/>
								</>
							) : tab === 'exams' ? (
								<ExamsTab
									key={scope ?? '_all'}
									courseId={id}
									programId={scope}
								/>
							) : (
								<ResultsTab
									key={scope ?? '_all'}
									courseId={id}
									d={d}
									programId={scope}
								/>
							)}
						</div>
					)}
				</>
			)}

			{editing && course && (
				<CourseFormModal
					mode='edit'
					course={course}
					onClose={() => setEditing(false)}
					onSave={handleEdit}
					loading={saving}
				/>
			)}
			{cloning && course && (
				<CourseCloneModal
					course={course}
					onClose={() => setCloning(false)}
				/>
			)}
			{sharing && course && (
				<CourseRegisterLinkModal
					course={course}
					onClose={() => setSharing(false)}
				/>
			)}
			{attendanceSession && (
				<AttendanceModal
					session={attendanceSession}
					onClose={() => d.setAttendanceSessionId(null)}
				/>
			)}
		</AdminLayout>
	);
}
