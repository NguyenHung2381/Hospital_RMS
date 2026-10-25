import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Dropdown } from 'antd';
import { CalendarSvg, ChevLSvg, CopySvg, EditSvg, MoreVSvg, QrSvg } from '@/assets/icons';
import { CourseCloneModal } from '../components/CourseCloneModal';
import tbl from '@/shared/components/Table/Table.module.css';
import AdminLayout from '../../../layouts/AdminLayout';
import { Button, InlineLoading } from '@/shared/components';
import { showToast } from '@/shared/utils/feedback';
import { formatDateOr } from '@/shared/utils';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { getCourse, updateCourse } from '../api/courseApi';
import { AttendanceModal } from '../components/AttendanceModal';
import { CourseDocumentsTab } from '../components/CourseDocumentsTab';
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

type Step = DetailTab;

// Thứ tự tab đi theo luồng làm việc: ghi danh → lịch → tài liệu → thi → kết quả.
const STEPS: { key: Step; label: string }[] = [
	{ key: 'enrollments', label: 'Học viên' },
	{ key: 'sessions', label: 'Lịch học & giảng viên' },
	{ key: 'documents', label: 'Tài liệu' },
	{ key: 'exams', label: 'Thi & kiểm tra' },
	{ key: 'results', label: 'Kết quả & chứng chỉ' },
];
// Khóa GPHN: mỗi học viên có lịch vòng riêng, kết quả theo vòng ⇒ không có lịch chung / thi / bảng điểm.
const PRACTICE_STEPS = new Set<Step>(['enrollments', 'documents']);
const isPracticeCourse = (c: Course | null) => !!c && (c.is_rolling || c.training_type_id === TRAINING_TYPE.GPHN);

const range = (from: string | null, to: string | null) =>
	from || to ? `${formatDateOr(from, '?')} → ${formatDateOr(to, '?')}` : null;

/** Trang chi tiết khóa học — mỗi phần việc 1 tab, kèm số đếm để biết phần nào còn trống. */
export default function CourseDetail() {
	const { id = '' } = useParams();
	const navigate = useNavigate();
	const [params, setParams] = useSearchParams();
	const tabParam = params.get('tab');

	const [course, setCourse] = useState<Course | null>(null);
	const [notFound, setNotFound] = useState(false);
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

	const steps = isPracticeCourse(course) ? STEPS.filter((s) => PRACTICE_STEPS.has(s.key)) : STEPS;
	const tab = steps.find((s) => s.key === tabParam)?.key ?? 'enrollments';
	const approved = d.enrollments.filter((e) => e.status === 'approved').length;
	const waiting = d.enrollments.filter((e) => e.status === 'waitlisted').length;
	const pending = d.enrollments.filter((e) => e.status === 'pending').length;
	const issued = d.certificates.filter((c) => c.status === 'active').length;
	// Khóa ĐTLT / CTCV: mỗi chương trình là 1 lớp — đếm lớp đã mở.
	const classes = d.programLinks.filter((l) => l.class_rule);
	const opened = classes.filter((l) => l.class_opened_at).length;
	// Số đếm trên tab + chú thích khi rê chuột; alert = việc đang chờ xử lý (đăng ký chờ duyệt).
	const tabInfo: Record<Step, { count?: string; title: string; alert?: number }> = {
		enrollments: {
			count: String(approved),
			alert: pending,
			title: [
				`${approved} đã duyệt`,
				pending ? `${pending} chờ duyệt` : null,
				classes.length ? `${opened}/${classes.length} lớp đã mở` : null,
				waiting ? `${waiting} chờ khóa sau` : null,
			]
				.filter(Boolean)
				.join(' · '),
		},
		sessions: { count: String(d.sessions.length), title: `${d.sessions.length} buổi · ${d.assignments.length} giảng viên` },
		documents: { count: String(d.documents.length), title: `${d.documents.length} tài liệu` },
		exams: { title: 'Đề thi trực tuyến' },
		results: { count: `${issued}/${approved}`, title: `${issued}/${approved} chứng chỉ đã cấp` },
	};
	const attendanceSession = d.sessions.find((s) => s.id === d.attendanceSessionId);
	const status = course ? DISPLAY_STATUS_CFG[course.display_status] : null;

	const practice = isPracticeCourse(course);
	// Khóa thuộc loại nào thì tô sáng mục menu loại đó và "Danh sách" quay về đúng trang loại đó.
	const menuKey = practice ? 'gphn' : course?.training_type_id === TRAINING_TYPE.CTCV ? 'ctcv' : 'dtlt';
	const backTo = { gphn: '/admin/practice-batches', ctcv: '/admin/ctcv', dtlt: '/admin/dtlt' }[menuKey];
	const goStep = (key: Step) => setParams({ tab: key }, { replace: true });
	const stepLabel = (s: { key: Step; label: string }) =>
		s.key === 'enrollments' && practice ? 'Học viên & hồ sơ thực hành' : s.label;
	// Chọn 1 chương trình ở phần tóm tắt ⇒ mở danh sách học viên lọc sẵn theo chương trình đó.
	const goProgram = (programId: string) =>
		setParams({ tab: 'enrollments', ...(programId ? { program: programId } : {}) }, { replace: true });

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
										? [{ key: 'share', icon: <QrSvg width={14} />, label: 'Link & QR đăng ký' }]
										: []),
									{ key: 'clone', icon: <CopySvg width={14} />, label: practice ? 'Nhân bản đợt' : 'Nhân bản khóa học' },
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
							<span className={styles.summaryChip}>{course.is_public_registration ? 'Đăng ký công khai' : 'Nội bộ'}</span>
							<span className={`${styles.summaryChip} ${course.enrollment_open ? styles.summaryOpen : styles.summaryClosed}`}>
								{course.enrollment_open ? 'Đang nhận đăng ký' : 'Đã đóng đăng ký'}
							</span>
						</div>
						<div className={styles.summaryPrograms}>
							<span className={styles.summaryLabel}>Chương trình</span>
							{d.programLinks.length > 1 ? (
								// Nhiều chương trình: thu vào 1 select thay vì hàng thẻ dài nhiều dòng
								<select
									className={`${tbl.filterSelect} ${styles.summarySelect}`}
									aria-label='Xem học viên theo chương trình'
									value=''
									onChange={(e) => goProgram(e.target.value)}
								>
									<option
										value=''
										disabled
										hidden
									>
										{d.programLinks.length} chương trình — chọn để xem học viên
									</option>
									<option value=''>Tất cả chương trình</option>
									{d.programLinks.map((p) => (
										<option
											key={p.program_id}
											value={p.program_id}
										>
											{p.program_code ? `${p.program_code} — ${p.program_name}` : p.program_name}
										</option>
									))}
								</select>
							) : (
								<ProgramTags
									names={course.program_names}
									max={12}
									empty='Chưa áp dụng chương trình'
								/>
							)}
						</div>
						{course.description && <p className={styles.infoDesc}>{course.description}</p>}
					</div>

					<div className={styles.stepPanel}>
						<nav
							className={styles.detailTabs}
							aria-label='Các phần của khóa học'
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
						{d.loading ? (
							<InlineLoading />
						) : tab === 'enrollments' ? (
							<EnrollmentsTab
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
							<SessionsTab d={d} />
						) : tab === 'documents' ? (
							<CourseDocumentsTab
								documents={d.documents}
								busy={d.busy}
								onAdd={d.addDocument}
								onRemove={d.removeDocument}
								onOpen={d.incrementDocumentDownload}
							/>
						) : tab === 'exams' ? (
							<ExamsTab courseId={id} />
						) : (
							<ResultsTab
								courseId={id}
								d={d}
							/>
						)}
					</div>
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
