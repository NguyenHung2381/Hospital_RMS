import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CheckSvg, ChevLSvg, LayersSvg, XSvg } from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { Button, confirmDialog, InlineLoading } from '@/shared/components';
import crud from '@/shared/components/Table/CrudPage.module.css';
import { usePermission } from '@/shared/hooks/usePermission';
import { showToast } from '@/shared/utils/feedback';
import { formatDateVN } from '@/shared/utils/formatDate';
import { decideEnrollment, getCourse, getEnrollment, getProgramLinks } from '../api/courseApi';
import { PracticeDocumentsBar } from '../components/PracticeDocumentsBar';
import { PracticeRecordInfo } from '../components/PracticeRecordInfo';
import { RegistrationReviewTab } from '../components/RegistrationReviewTab';
import { RotationsPanel } from '../components/RotationsPanel';
import {
	ENROLLMENT_STATUS_CFG,
	PROGRESS_LABEL,
	type Course,
	type CourseProgramLink,
	type Enrollment,
	type EnrollmentUpdate,
} from '../types/course.type';
import styles from './Courses.module.css';
import local from './PracticeRecords.module.css';

type Tab = 'info' | 'registration' | 'rotations' | 'documents';
const TABS: { key: Tab; label: string }[] = [
	{ key: 'info', label: 'Thông tin hồ sơ' },
	// Chỉ hiện khi lượt ghi danh tạo từ form /dang-ky-khoa-hoc (có bản khai + hồ sơ đính kèm)
	{ key: 'registration', label: 'Đơn đăng ký' },
	{ key: 'rotations', label: 'Vòng thực hành' },
	{ key: 'documents', label: 'In giấy tờ' },
];

/** Trang 1 hồ sơ thực hành GPHN (thay modal): thông tin hồ sơ tự lưu · đơn đăng ký (nếu có) ·
 *  vòng thực hành · in giấy tờ. */
export default function PracticeRecordDetail() {
	const { enrollmentId = '' } = useParams();
	const navigate = useNavigate();
	const [params, setParams] = useSearchParams();
	const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
	// Ghi danh hộ / nhập Excel không có bản khai ⇒ không có tab "Đơn đăng ký" (link ?tab=registration về tab đầu)
	const tabs = TABS.filter((t) => t.key !== 'registration' || !!enrollment?.registration);
	const tab: Tab = tabs.find((t) => t.key === params.get('tab'))?.key ?? 'info';
	const [course, setCourse] = useState<Course | null>(null);
	const [links, setLinks] = useState<CourseProgramLink[]>([]);
	const [notFound, setNotFound] = useState(false);
	const [busy, setBusy] = useState(false);
	const perm = usePermission();
	const canEdit = perm.has('courses:update');
	const canApprove = perm.has('courses:approve');

	const load = useCallback(
		() =>
			getEnrollment(enrollmentId)
				.then(async (e) => {
					setEnrollment(e);
					const [c, l] = await Promise.all([getCourse(e.course_id), getProgramLinks(e.course_id)]);
					setCourse(c);
					setLinks(l);
				})
				.catch(() => setNotFound(true)),
		[enrollmentId],
	);
	useEffect(() => {
		void load();
	}, [load]);
	useRealtimeUpdate(['course_enrollment', 'course'], load);

	const back = () => navigate('/admin/practice-records');
	const goTab = (key: Tab) => setParams(key === 'info' ? {} : { tab: key }, { replace: true });
	const onSaved = (patch?: EnrollmentUpdate) => {
		if (patch) setEnrollment((e) => (e ? { ...e, ...patch } : e));
		void load();
	};

	const decide = async (status: 'approved' | 'rejected') => {
		if (!enrollment) return;
		if (status === 'rejected' && !(await confirmDialog({
				title: 'Từ chối hồ sơ?',
				message: `Từ chối hồ sơ của ${enrollment.trainee_name}?`,
				confirmLabel: 'Từ chối',
				tone: 'danger',
			}))) return;
		setBusy(true);
		try {
			await decideEnrollment(enrollment.id, status);
			showToast('success', status === 'approved' ? 'Đã duyệt — bước tiếp: xếp lịch thực hành' : 'Đã từ chối hồ sơ');
			await load();
			if (status === 'approved') goTab('rotations');
		} catch (e) {
			showToast('error', (e as Error).message || 'Cập nhật thất bại');
		} finally {
			setBusy(false);
		}
	};

	if (notFound) {
		return (
			<AdminLayout pageTitle='Không tìm thấy'>
				<button type='button'
					className={styles.backLink}
					onClick={back}
				>
					<ChevLSvg /> Hồ sơ thực hành GPHN
				</button>
				<div className={styles.emptyState}>
					<div className={styles.emptyTitle}>Hồ sơ không tồn tại hoặc bạn không có quyền xem</div>
				</div>
			</AdminLayout>
		);
	}

	const status = enrollment ? ENROLLMENT_STATUS_CFG[enrollment.status] : null;
	const approved = enrollment?.status === 'approved';
	const who = enrollment ? enrollment.practice_code || enrollment.trainee_name : '';
	// Còn nộp bổ sung được (chờ duyệt / danh sách chờ) mà chưa đủ hồ sơ bắt buộc
	const filesMissing =
		!!enrollment?.registration &&
		!enrollment.registration.has_dossier &&
		(enrollment.status === 'pending' || enrollment.status === 'waitlisted');

	return (
		<AdminLayout
			pageTitle={enrollment ? `Hồ sơ thực hành — ${enrollment.trainee_name}` : 'Hồ sơ thực hành'}
			breadcrumbs={[{ label: 'Đào tạo' }]}
			headerActions={
				<div className={styles.detailActions}>
					<Button
						variant='secondary'
						icon={<ChevLSvg />}
						onClick={back}
					>
						Danh sách
					</Button>
					{course && (
						<Button
							variant='secondary'
							icon={<LayersSvg />}
							onClick={() => navigate(`/admin/courses/${course.id}`)}
							title='Mở đợt thực hành (khóa GPHN) của hồ sơ'
						>
							Mở đợt
						</Button>
					)}
				</div>
			}
		>
			{!enrollment ? (
				<InlineLoading />
			) : (
				<>
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
							{approved && (
								<span className={styles.summaryChip}>{PROGRESS_LABEL[enrollment.progress_status ?? 'in_progress']}</span>
							)}
							{enrollment.practice_code && <span className={styles.summaryChip}>Mã {enrollment.practice_code}</span>}
							<span className={styles.summaryChip}>
								{enrollment.program_code || enrollment.program_name || 'Chưa chọn chương trình'}
							</span>
							{course && <span className={styles.summaryChip}>{course.name}</span>}
							{(enrollment.start_date || enrollment.end_date) && (
								<span className={styles.summaryChip}>
									{formatDateVN(enrollment.start_date) || '…'} – {formatDateVN(enrollment.end_date) || '…'}
								</span>
							)}
							{approved && !enrollment.rotation_total && (
								<span className={`${styles.summaryChip} ${local.warn}`}>Chưa xếp lịch</span>
							)}
						</div>
						{enrollment.status === 'pending' && canApprove && (
							<div className={styles.summaryChips}>
								<span className={styles.hint}>Hồ sơ đang chờ duyệt — duyệt xong mới xếp lịch thực hành.</span>
								<Button
									size='sm'
									icon={<CheckSvg />}
									loading={busy}
									onClick={() => void decide('approved')}
								>
									Duyệt hồ sơ
								</Button>
								<Button
									size='sm'
									variant='secondary'
									icon={<XSvg />}
									disabled={busy}
									onClick={() => void decide('rejected')}
								>
									Từ chối
								</Button>
							</div>
						)}
					</div>

					<div
						className={crud.tabs}
						role='tablist'
					>
						{tabs.map((t) => (
							<button
								key={t.key}
								type='button'
								role='tab'
								aria-selected={tab === t.key}
								className={`${crud.tabBtn} ${tab === t.key ? crud.tabBtnActive : ''}`}
								onClick={() => goTab(t.key)}
							>
								{t.label}
								{t.key === 'rotations' && <span>({enrollment.rotation_total})</span>}
								{t.key === 'registration' && filesMissing && <span className={local.warn}>Thiếu hồ sơ</span>}
							</button>
						))}
					</div>

					{tab === 'info' && (
						<PracticeRecordInfo
							key={enrollment.id}
							enrollment={enrollment}
							programLinks={links}
							canEdit={canEdit}
							onSaved={onSaved}
						/>
					)}
					{tab === 'registration' && (
						<div className={local.panel}>
							<RegistrationReviewTab
								key={enrollment.id}
								enrollmentId={enrollment.id}
								traineeName={enrollment.trainee_name}
							/>
						</div>
					)}
					{tab === 'rotations' && (
						<div className={local.panel}>
							<RotationsPanel
								enrollmentId={enrollment.id}
								who={who}
								hasProgram={!!enrollment.program_id}
								approved={approved}
								enrollmentStart={enrollment.start_date ? enrollment.start_date.slice(0, 10) : null}
								onChanged={() => onSaved()}
							/>
						</div>
					)}
					{tab === 'documents' && (
						<div className={local.panel}>
							<PracticeDocumentsBar
								enrollmentId={enrollment.id}
								who={who}
								refreshKey={enrollment}
							/>
						</div>
					)}
				</>
			)}
		</AdminLayout>
	);
}
