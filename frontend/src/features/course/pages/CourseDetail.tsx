import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CheckSmSvg, ChevLSvg, EditSvg } from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { InlineLoading } from '@/shared/components';
import { showToast } from '@/shared/utils/feedback';
import { formatDateOr } from '@/shared/utils';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { getCourse, updateCourse } from '../api/courseApi';
import { AttendanceModal } from '../components/AttendanceModal';
import { CourseDocumentsTab } from '../components/CourseDocumentsTab';
import { CourseFormModal } from '../components/CourseFormModal';
import { EnrollmentsTab } from '../components/EnrollmentsTab';
import { ExamsTab } from '../components/ExamsTab';
import { ResultsTab } from '../components/ResultsTab';
import { SessionsTab } from '../components/SessionsTab';
import { useCourseDetail, type DetailTab } from '../hooks/useCourseDetail';
import { DISPLAY_STATUS_CFG, type Course, type CourseFormData } from '../types/course.type';
import ProgramTags from '../components/ProgramTags';
import styles from './Courses.module.css';

type Step = DetailTab;

const STEPS: { key: Step; label: string }[] = [
	{ key: 'enrollments', label: 'Học viên' },
	{ key: 'sessions', label: 'Lịch học & Giảng viên' },
	{ key: 'documents', label: 'Tài liệu' },
	{ key: 'exams', label: 'Thi & Kiểm tra' },
	{ key: 'results', label: 'Kết quả & Chứng chỉ' },
];

const range = (from: string | null, to: string | null) =>
	from || to ? `${formatDateOr(from, '?')} → ${formatDateOr(to, '?')}` : null;

/** Trang chi tiết khóa học — các bước xếp theo luồng: ghi danh → xếp lịch → tài liệu → thi → kết quả. */
export default function CourseDetail() {
	const { id = '' } = useParams();
	const navigate = useNavigate();
	const [params, setParams] = useSearchParams();
	const tabParam = params.get('tab');

	const [course, setCourse] = useState<Course | null>(null);
	const [notFound, setNotFound] = useState(false);
	const [editing, setEditing] = useState(false);
	const [saving, setSaving] = useState(false);
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
					onClick={() => navigate('/admin/courses')}
				>
					<ChevLSvg /> Danh sách khóa học
				</button>
				<div className={styles.emptyState}>
					<div className={styles.emptyTitle}>Khóa học không tồn tại hoặc bạn không có quyền xem</div>
				</div>
			</AdminLayout>
		);
	}

	const steps = STEPS;
	const tab = steps.find((s) => s.key === tabParam)?.key ?? 'enrollments';
	const approved = d.enrollments.filter((e) => e.status === 'approved').length;
	const waiting = d.enrollments.filter((e) => e.status === 'waitlisted').length;
	const pending = d.enrollments.filter((e) => e.status === 'pending').length;
	const issued = d.certificates.filter((c) => c.status === 'active').length;
	// Khóa ĐTLT / CTCV: mỗi chương trình là 1 lớp — đếm lớp đã mở.
	const classes = d.programLinks.filter((l) => l.class_rule);
	const opened = classes.filter((l) => l.class_opened_at).length;
	const stepMeta: Record<Step, { meta: string; done: boolean }> = {
		enrollments: {
			meta: [
				`${approved} đã duyệt`,
				pending ? `${pending} chờ duyệt` : null,
				classes.length ? `${opened}/${classes.length} lớp đã mở` : null,
				waiting ? `${waiting} chờ khóa sau` : null,
			]
				.filter(Boolean)
				.join(' · '),
			done: classes.length ? opened > 0 : approved > 0,
		},
		sessions: {
			meta: `${d.sessions.length} buổi · ${d.assignments.length} giảng viên`,
			done: d.sessions.length > 0,
		},
		documents: { meta: `${d.documents.length} tài liệu`, done: d.documents.length > 0 },
		exams: { meta: 'Đề thi online', done: false },
		results: { meta: `${issued}/${approved} chứng chỉ`, done: approved > 0 && issued >= approved },
	};
	const attendanceSession = d.sessions.find((s) => s.id === d.attendanceSessionId);
	const status = course ? DISPLAY_STATUS_CFG[course.display_status] : null;

	return (
		<AdminLayout
			pageTitle={course?.name ?? 'Chi tiết khóa học'}
			breadcrumbs={[{ label: 'Đào tạo' }]}
			headerActions={
				course && (
					<button
						className={styles.btnGhost}
						onClick={() => setEditing(true)}
					>
						<EditSvg /> Sửa thông tin
					</button>
				)
			}
		>
			<button
				className={styles.backLink}
				onClick={() => navigate('/admin/courses')}
			>
				<ChevLSvg /> Danh sách khóa học
			</button>

			{!course ? (
				<InlineLoading />
			) : (
				<>
					<div className={styles.infoCard}>
						<div className={styles.infoGrid}>
							<Info label='Trạng thái'>
								{status && (
									<span
										className={styles.badge}
										style={{ background: status.bg, color: status.color }}
									>
										{status.label}
									</span>
								)}
							</Info>
							<Info label='Thời gian học'>
								{range(course.start_date, course.end_date) ?? 'Chưa đặt'}
							</Info>
							<Info label='Đăng ký'>
								{range(course.enrollment_start_date, course.enrollment_end_date) ?? 'Luôn mở'} ·{' '}
								<span style={{ color: course.enrollment_open ? '#085028' : '#791f1f' }}>
									{course.enrollment_open ? 'đang mở' : 'đã đóng'}
								</span>
							</Info>
							<Info label='Chế độ'>{course.is_public_registration ? 'Công khai' : 'Nội bộ'}</Info>
							<Info label='Hình thức'>{course.training_form_name ?? '—'}</Info>
							<Info label='Chương trình' wide>
								<ProgramTags names={course.program_names} max={12} empty='Chưa áp dụng chương trình' />
							</Info>
						</div>
						{course.description && <p className={styles.infoDesc}>{course.description}</p>}
					</div>

					<nav
						className={styles.steps}
						aria-label='Các bước của khóa học'
					>
						{steps.map((s, i) => (
							<button
								key={s.key}
								className={`${styles.step} ${tab === s.key ? styles.stepActive : ''}`}
								aria-current={tab === s.key ? 'step' : undefined}
								onClick={() => setParams({ tab: s.key }, { replace: true })}
							>
								<span className={`${styles.stepNum} ${stepMeta[s.key].done ? styles.stepDone : ''}`}>
									{stepMeta[s.key].done ? <CheckSmSvg /> : i + 1}
								</span>
								<span className={styles.stepText}>
									<span className={styles.stepLabel}>
										{s.key === 'enrollments' && course.is_rolling ? 'Học viên & hồ sơ thực hành' : s.label}
									</span>
									<span className={styles.stepMeta}>{stepMeta[s.key].meta}</span>
								</span>
							</button>
						))}
					</nav>

					<div className={styles.stepPanel}>
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
							<ResultsTab courseId={id} d={d} />
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
			{attendanceSession && (
				<AttendanceModal
					session={attendanceSession}
					onClose={() => d.setAttendanceSessionId(null)}
				/>
			)}
		</AdminLayout>
	);
}

function Info({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
	return (
		<div className={`${styles.infoItem} ${wide ? styles.infoItemWide : ''}`}>
			<span className={styles.infoLabel}>{label}</span>
			<span className={styles.infoValue}>{children}</span>
		</div>
	);
}
