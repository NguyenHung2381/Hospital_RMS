import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRSvg, CalendarSvg, ChevLSvg, CopySvg, EditSvg, QrSvg } from '@/assets/icons';
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

	const activeIdx = steps.findIndex((s) => s.key === tab);
	// Gợi ý bước kế tiếp: bước đầu tiên sau bước đang xem mà chưa xong (bỏ qua "Thi" — không bắt buộc)
	const nextStep = steps.slice(activeIdx + 1).find((s) => s.key !== 'exams' && !stepMeta[s.key].done);
	const doneCount = steps.filter((s) => stepMeta[s.key].done).length;
	const goStep = (key: Step) => setParams({ tab: key }, { replace: true });
	const stepLabel = (s: { key: Step; label: string }) =>
		s.key === 'enrollments' && course?.is_rolling ? 'Học viên & hồ sơ thực hành' : s.label;
	// Chọn 1 chương trình ở phần tóm tắt ⇒ mở danh sách học viên lọc sẵn theo chương trình đó.
	const goProgram = (programId: string) =>
		setParams({ tab: 'enrollments', ...(programId ? { program: programId } : {}) }, { replace: true });

	return (
		<AdminLayout
			pageTitle={course?.name ?? 'Chi tiết khóa học'}
			breadcrumbs={[{ label: 'Đào tạo' }]}
			headerActions={
				<div className={styles.detailActions}>
					<Button
						variant='secondary'
						icon={<ChevLSvg />}
						onClick={() => navigate('/admin/courses')}
					>
						Danh sách
					</Button>
					{course?.is_public_registration && (
						<Button
							variant='secondary'
							icon={<QrSvg />}
							onClick={() => setSharing(true)}
						>
							Link & QR đăng ký
						</Button>
					)}
					{course && (
						<Button
							variant='secondary'
							icon={<CopySvg />}
							onClick={() => setCloning(true)}
						>
							Nhân bản
						</Button>
					)}
					{course && (
						<Button
							variant='secondary'
							icon={<EditSvg />}
							onClick={() => setEditing(true)}
						>
							Sửa thông tin
						</Button>
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
						{/* Chọn bước bằng select: ✓ = bước đã có dữ liệu; kèm tiến độ và gợi ý bước kế tiếp */}
						<div className={styles.stepPanelHead}>
							<label className={styles.stepPick}>
								<span className={styles.stepPanelNo}>
									Bước {activeIdx + 1}/{steps.length} · đã xong {doneCount}/{steps.length}
								</span>
								<select
									className={styles.stepSelect}
									aria-label='Chọn bước của khóa học'
									value={tab}
									onChange={(e) => goStep(e.target.value as Step)}
								>
									{steps.map((s, i) => (
										<option
											key={s.key}
											value={s.key}
										>
											{stepMeta[s.key].done ? '✓' : `${i + 1}.`} {stepLabel(s)} — {stepMeta[s.key].meta}
										</option>
									))}
								</select>
							</label>
							{nextStep && stepMeta[tab].done && (
								<button
									type='button'
									className={styles.nextStep}
									onClick={() => goStep(nextStep.key)}
								>
									Tiếp theo: {nextStep.label} <ArrowRSvg />
								</button>
							)}
						</div>
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
