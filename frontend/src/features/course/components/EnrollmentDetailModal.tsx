import { useCallback, useEffect, useState } from 'react';
import { FormField } from '@/shared/components/Input/FormField';
import { DatePicker, Modal, ModalActions } from '@/shared/components';
import { UserCheckSvg } from '@/assets/icons';
import { showToast } from '@/shared/utils/feedback';
import {
	getEnrollmentLessons,
	syncEnrollmentLessons,
	updateEnrollment,
	updateEnrollmentLesson,
} from '../api/courseApi';
import {
	LESSON_STATUS_LABEL,
	PROGRESS_LABEL,
	TRAINING_TYPE,
	type Course,
	type CourseProgramLink,
	type Enrollment,
	type EnrollmentLesson,
	type EnrollmentLessonStatus,
	type EnrollmentUpdate,
	type ProgressStatus,
} from '../types/course.type';
import { PracticeDocumentsBar } from './PracticeDocumentsBar';
import { RotationsPanel } from './RotationsPanel';
import { TraineeAttendanceTab } from '../../trainee/components/TraineeAttendanceTab';
import { TraineeResultsTab } from '../../trainee/components/TraineeResultsTab';
import styles from '../pages/Courses.module.css';
import crud from '@/shared/components/Table/CrudPage.module.css';

type Tab = 'info' | 'rotations' | 'documents' | 'lessons' | 'attendance' | 'results';

type Form = Required<{ [K in keyof EnrollmentUpdate]: string }>;

const day = (v: string | null) => (v ? v.slice(0, 10) : '');

const toForm = (e: Enrollment): Form => ({
	program_id: e.program_id ?? '',
	practice_code: e.practice_code ?? '',
	professional_field: e.professional_field ?? '',
	practice_form: e.practice_form ?? '',
	start_date: day(e.start_date),
	end_date: day(e.end_date),
	total_duration: e.total_duration ?? '',
	practice_location: e.practice_location ?? '',
	sending_unit: e.sending_unit ?? '',
	progress_status: e.progress_status ?? 'in_progress',
	progress_date: day(e.progress_date),
	progress_reason: e.progress_reason ?? '',
	note: e.note ?? '',
});

const programLabel = (p: CourseProgramLink) => (p.program_code ? `${p.program_code} — ${p.program_name}` : p.program_name);

// Hồ sơ 1 lượt ghi danh: chương trình đã chọn, tiến độ, hồ sơ thực hành GPHN
// (các cột đăng ký của sổ thực hành) và bài học tự gắn theo chương trình (ĐTLT).
export function EnrollmentDetailModal({
	enrollment,
	course,
	programLinks,
	onClose,
	onSaved,
}: {
	enrollment: Enrollment;
	course: Course | null;
	programLinks: CourseProgramLink[];
	onClose: () => void;
	onSaved: () => void;
}) {
	const [form, setForm] = useState<Form>(() => toForm(enrollment));
	const [lessons, setLessons] = useState<EnrollmentLesson[]>([]);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');
	const [tab, setTab] = useState<Tab>('info');

	// "Tự động xếp" vòng điền mã, ngày, lĩnh vực, địa điểm… lên hồ sơ ngay khi modal đang mở —
	// ô người dùng chưa sửa thì hiện & lưu theo giá trị mới nhất của hồ sơ (không ghi đè bằng giá trị cũ).
	const [initial] = useState<Form>(() => toForm(enrollment));
	const latest = toForm(enrollment);
	const view = Object.fromEntries(
		(Object.keys(form) as (keyof Form)[]).map((k) => [k, form[k] !== initial[k] ? form[k] : latest[k]]),
	) as Form;

	const program = programLinks.find((p) => p.program_id === view.program_id);
	const isPractice = !!course?.is_rolling || program?.training_type_id === TRAINING_TYPE.GPHN;

	const loadLessons = useCallback(
		() =>
			getEnrollmentLessons(enrollment.id)
				.then(setLessons)
				.catch(() => setLessons([])),
		[enrollment.id],
	);
	useEffect(() => {
		loadLessons();
	}, [loadLessons]);

	const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
		setForm((f) => ({ ...f, [k]: e.target.value }));
	const setDate = (k: keyof Form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

	const save = async () => {
		if (programChanged && enrollment.lesson_total > 0) {
			if (!window.confirm('Đổi chương trình sẽ thay danh sách bài học của học viên theo chương trình mới. Tiếp tục?'))
				return;
		}
		setSaving(true);
		setError('');
		try {
			await updateEnrollment(enrollment.id, {
				...view,
				program_id: view.program_id || null,
				progress_status: view.progress_status as ProgressStatus,
			} as EnrollmentUpdate);
			showToast('success', 'Đã lưu hồ sơ ghi danh');
			onSaved();
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Lưu thất bại');
		} finally {
			setSaving(false);
		}
	};

	const changeLesson = async (lessonId: string, status: EnrollmentLessonStatus) => {
		try {
			await updateEnrollmentLesson(enrollment.id, lessonId, status);
			await loadLessons();
			onSaved();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Cập nhật bài học thất bại');
		}
	};

	const resync = async () => {
		try {
			const { added } = await syncEnrollmentLessons(enrollment.id);
			await loadLessons();
			onSaved();
			showToast('success', added ? `Đã thêm ${added} bài học mới của chương trình` : 'Danh sách bài học đã khớp chương trình');
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Đồng bộ thất bại');
		}
	};

	const programChanged = view.program_id !== (enrollment.program_id ?? '');
	const done = lessons.filter((l) => l.status === 'done').length;
	const full = { gridColumn: '1 / -1' };
	const dirty = (Object.keys(form) as (keyof Form)[]).some((k) => form[k] !== initial[k]);
	const close = () => {
		if (dirty && !window.confirm('Có thay đổi chưa lưu ở tab "Thông tin hồ sơ". Đóng và bỏ thay đổi?')) return;
		onClose();
	};
	const showLessons = !programChanged && (lessons.length > 0 || (!isPractice && !!enrollment.program_id));
	const tabs: { key: Tab; label: string }[] = [
		{ key: 'info', label: dirty ? 'Thông tin hồ sơ •' : 'Thông tin hồ sơ' },
		...(isPractice
			? ([
					{ key: 'rotations', label: 'Vòng thực hành' },
					{ key: 'documents', label: 'In giấy tờ' },
				] as const)
			: []),
		...(showLessons ? [{ key: 'lessons' as const, label: `Bài học (${done}/${lessons.length})` }] : []),
		// Chỉ lượt đã duyệt mới có buổi học / bảng điểm
		...(enrollment.status === 'approved'
			? ([
					{ key: 'attendance', label: 'Điểm danh' },
					{ key: 'results', label: 'Kết quả' },
				] as const)
			: []),
	];
	const activeTab = tabs.some((t) => t.key === tab) ? tab : 'info';
	const sub = (text: string) => (
		<div
			className={styles.hint}
			style={{ ...full, fontWeight: 600, marginTop: 'var(--space-2)' }}
		>
			{text}
		</div>
	);

	return (
		<Modal
			open
			onClose={close}
			icon={<UserCheckSvg />}
			title={`Hồ sơ ghi danh — ${enrollment.trainee_name}`}
			subtitle={[course?.name, enrollment.practice_code && `Mã thực hành ${enrollment.practice_code}`]
				.filter(Boolean)
				.join(' · ')}
			// Kích thước cố định cho mọi tab (đổi tab không nhảy khung): GPHN có bảng vòng thực hành ⇒ xl
			size={isPractice ? 'xl' : 'lg'}
			className={styles.enrollmentModal}
			bodyClassName={styles.modalBody}
			footer={
				<ModalActions
					onCancel={close}
					onConfirm={save}
					loading={saving}
					disabled={!dirty}
					cancelLabel='Đóng'
					confirmLabel='Lưu hồ sơ'
				/>
			}
		>
			{error && <div className={styles.errorBanner}>{error}</div>}
			{tabs.length > 1 && (
				<div
					className={crud.tabs}
					role='tablist'
				>
					{tabs.map((t) => (
						<button
							key={t.key}
							type='button'
							role='tab'
							aria-selected={activeTab === t.key}
							className={`${crud.tabBtn} ${activeTab === t.key ? crud.tabBtnActive : ''}`}
							onClick={() => setTab(t.key)}
						>
							{t.label}
						</button>
					))}
				</div>
			)}

			{activeTab === 'info' && (
				<div className={styles.formGrid2}>
					<FormField
						label='Chương trình học'
						style={full}
					>
						<select
							className={styles.formInput}
							value={view.program_id}
							onChange={set('program_id')}
						>
							<option value=''>-- Chưa chọn chương trình --</option>
							{programLinks.map((p) => (
								<option
									key={p.program_id}
									value={p.program_id}
								>
									{programLabel(p)}
								</option>
							))}
						</select>
					</FormField>
					<FormField label='Tiến độ'>
						<select
							className={styles.formInput}
							value={view.progress_status}
							onChange={set('progress_status')}
						>
							{Object.entries(PROGRESS_LABEL).map(([v, label]) => (
								<option
									key={v}
									value={v}
								>
									{label}
								</option>
							))}
						</select>
					</FormField>
					{view.progress_status !== 'in_progress' ? (
						<FormField label={view.progress_status === 'completed' ? 'Ngày hoàn thành' : 'Ngày nghỉ học'}>
							<DatePicker
								value={view.progress_date}
								onChange={setDate('progress_date')}
							/>
						</FormField>
					) : (
						<div />
					)}
					{view.progress_status === 'dropped' && (
						<FormField
							label='Lý do nghỉ học'
							style={full}
						>
							<input
								className={styles.formInput}
								value={view.progress_reason}
								onChange={set('progress_reason')}
							/>
						</FormField>
					)}

					{isPractice && (
						<>
							{sub('Thời gian thực hành')}
							<FormField label='Bắt đầu thực hành'>
								<DatePicker
									value={view.start_date}
									onChange={setDate('start_date')}
									max={view.end_date || undefined}
								/>
							</FormField>
							<FormField label='Kết thúc thực hành'>
								<DatePicker
									value={view.end_date}
									onChange={setDate('end_date')}
									min={view.start_date || undefined}
								/>
							</FormField>
							<FormField label='Tổng thời gian thực hành'>
								<input
									className={styles.formInput}
									value={view.total_duration}
									onChange={set('total_duration')}
									placeholder={program?.program_duration ?? 'VD: 12 tháng'}
								/>
							</FormField>
							<FormField label='Địa điểm thực hành'>
								<input
									className={styles.formInput}
									value={view.practice_location}
									onChange={set('practice_location')}
									placeholder='VD: Tại các khoa: Cấp cứu, Nội tim mạch 2…'
								/>
							</FormField>

							{sub('Thông tin in trên giấy tờ (đơn đề nghị, hợp đồng)')}
							<FormField
								label='Mã thực hành'
							>
								<input
									className={styles.formInput}
									value={view.practice_code}
									onChange={set('practice_code')}
									placeholder='226.BS'
								/>
							</FormField>
							<FormField label='Đơn vị cử đi'>
								<input
									className={styles.formInput}
									value={view.sending_unit}
									onChange={set('sending_unit')}
									placeholder='VD: BV YHCT Nghệ An'
								/>
							</FormField>
							<FormField label='Lĩnh vực chuyên môn'>
								<input
									className={styles.formInput}
									value={view.professional_field}
									onChange={set('professional_field')}
									placeholder='VD: Bác sĩ y khoa'
								/>
							</FormField>
							<FormField label='Hình thức hành nghề'>
								<input
									className={styles.formInput}
									value={view.practice_form}
									onChange={set('practice_form')}
									placeholder='VD: Khám bệnh, chữa bệnh y khoa'
								/>
							</FormField>
						</>
					)}

					<FormField
						label='Ghi chú'
						style={full}
					>
						<input
							className={styles.formInput}
							value={view.note}
							onChange={set('note')}
						/>
					</FormField>
				</div>
			)}

			{activeTab === 'rotations' && (
				<>
					<div
						className={styles.hint}
						style={{ marginBottom: 'var(--space-3)' }}
					>
						Mỗi thay đổi ở tab này (khoa, ngày, người hướng dẫn, kết quả) được lưu ngay — không cần bấm "Lưu hồ sơ".
					</div>
					<RotationsPanel
						enrollmentId={enrollment.id}
						who={enrollment.practice_code || enrollment.trainee_name}
						hasProgram={!!enrollment.program_id && !programChanged}
						enrollmentStart={view.start_date || null}
						onChanged={onSaved}
					/>
				</>
			)}

			{activeTab === 'documents' && (
				<>
					{dirty && (
						<div className={styles.errorBanner}>
							Tab "Thông tin hồ sơ" còn thay đổi chưa lưu — giấy tờ in theo dữ liệu đã lưu, bấm "Lưu hồ sơ" trước khi in.
						</div>
					)}
					<PracticeDocumentsBar
						enrollmentId={enrollment.id}
						who={enrollment.practice_code || enrollment.trainee_name}
						refreshKey={enrollment}
					/>
				</>
			)}

			{activeTab === 'attendance' && (
				<TraineeAttendanceTab
					traineeId={enrollment.trainee_id}
					enrollmentId={enrollment.id}
				/>
			)}

			{activeTab === 'results' && (
				<TraineeResultsTab
					traineeId={enrollment.trainee_id}
					enrollmentId={enrollment.id}
				/>
			)}

			{activeTab === 'lessons' && (
				<div>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'space-between',
							marginBottom: 'var(--space-2)',
						}}
					>
						<span className={styles.hint}>
							{done}/{lessons.length} bài đã học · đổi trạng thái được lưu ngay
						</span>
						<button
							type='button'
							className={styles.btnGhost}
							onClick={resync}
							title='Thêm bài học mới của chương trình, bỏ bài không còn trong chương trình (giữ tiến độ bài còn lại)'
						>
							Đồng bộ lại theo chương trình
						</button>
					</div>
					{lessons.length === 0 ? (
						<div className={styles.subEmpty}>Chương trình chưa có bài học nào.</div>
					) : (
						<div className={styles.subList}>
							{lessons.map((l) => (
								<div
									key={l.lesson_id}
									className={styles.subRow}
								>
									<div className={styles.subRowMain}>
										<div className={styles.subRowName}>
											{l.code ? `${l.code} · ` : ''}
											{l.title}
										</div>
										<div className={styles.subRowMeta}>
											{l.total_hours} tiết · {l.credits} tín chỉ
											{l.completed_at ? ` · xong ${day(l.completed_at).split('-').reverse().join('/')}` : ''}
										</div>
									</div>
									<select
										className={styles.formInput}
										style={{ width: 130 }}
										value={l.status}
										onChange={(e) => changeLesson(l.lesson_id, e.target.value as EnrollmentLessonStatus)}
									>
										{Object.entries(LESSON_STATUS_LABEL).map(([v, label]) => (
											<option
												key={v}
												value={v}
											>
												{label}
											</option>
										))}
									</select>
								</div>
							))}
						</div>
					)}
				</div>
			)}
		</Modal>
	);
}
