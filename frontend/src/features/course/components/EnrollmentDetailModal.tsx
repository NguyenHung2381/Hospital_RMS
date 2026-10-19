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
import styles from '../pages/Courses.module.css';

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

	const program = programLinks.find((p) => p.program_id === form.program_id);
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
				...form,
				program_id: form.program_id || null,
				progress_status: form.progress_status as ProgressStatus,
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

	const programChanged = form.program_id !== (enrollment.program_id ?? '');
	const done = lessons.filter((l) => l.status === 'done').length;
	const full = { gridColumn: '1 / -1' };

	return (
		<Modal
			open
			onClose={onClose}
			icon={<UserCheckSvg />}
			title={`Hồ sơ ghi danh — ${enrollment.trainee_name}`}
			subtitle={course?.name}
			className={styles.modal}
			bodyClassName={styles.modalBody}
			footer={
				<ModalActions
					onCancel={onClose}
					onConfirm={save}
					loading={saving}
					confirmLabel='Lưu hồ sơ'
				/>
			}
		>
			{error && <div className={styles.errorBanner}>{error}</div>}
			<div className={styles.formGrid2}>
				<FormField
					label='Chương trình học'
					style={full}
					hint={
						programLinks.length === 0
							? 'Khóa học chưa gắn chương trình nào (sửa khóa học để chọn chương trình áp dụng).'
							: program?.program_duration
								? `Thời lượng chương trình: ${program.program_duration}`
								: undefined
					}
				>
					<select
						className={styles.formInput}
						value={form.program_id}
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
						value={form.progress_status}
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
				{form.progress_status !== 'in_progress' ? (
					<FormField label={form.progress_status === 'completed' ? 'Ngày hoàn thành' : 'Ngày nghỉ học'}>
						<DatePicker
							value={form.progress_date}
							onChange={setDate('progress_date')}
						/>
					</FormField>
				) : (
					<div />
				)}
				{form.progress_status === 'dropped' && (
					<FormField
						label='Lý do nghỉ học'
						style={full}
					>
						<input
							className={styles.formInput}
							value={form.progress_reason}
							onChange={set('progress_reason')}
						/>
					</FormField>
				)}

				{isPractice && (
					<>
						<div
							className={styles.hint}
							style={{ ...full, fontWeight: 600, marginTop: 'var(--space-2)' }}
						>
							Hồ sơ thực hành (giấy phép hành nghề)
						</div>
						<FormField
							label='Mã thực hành'
							hint='VD: 226.BS — dùng làm số hợp đồng / quyết định'
						>
							<input
								className={styles.formInput}
								value={form.practice_code}
								onChange={set('practice_code')}
								placeholder='226.BS'
							/>
						</FormField>
						<FormField label='Đơn vị cử đi'>
							<input
								className={styles.formInput}
								value={form.sending_unit}
								onChange={set('sending_unit')}
								placeholder='VD: BV YHCT Nghệ An'
							/>
						</FormField>
						<FormField label='Lĩnh vực chuyên môn'>
							<input
								className={styles.formInput}
								value={form.professional_field}
								onChange={set('professional_field')}
								placeholder='VD: Bác sĩ y khoa'
							/>
						</FormField>
						<FormField label='Hình thức hành nghề'>
							<input
								className={styles.formInput}
								value={form.practice_form}
								onChange={set('practice_form')}
								placeholder='VD: Khám bệnh, chữa bệnh y khoa'
							/>
						</FormField>
						<FormField label='Bắt đầu thực hành'>
							<DatePicker
								value={form.start_date}
								onChange={setDate('start_date')}
								max={form.end_date || undefined}
							/>
						</FormField>
						<FormField label='Kết thúc thực hành'>
							<DatePicker
								value={form.end_date}
								onChange={setDate('end_date')}
								min={form.start_date || undefined}
							/>
						</FormField>
						<FormField label='Tổng thời gian thực hành'>
							<input
								className={styles.formInput}
								value={form.total_duration}
								onChange={set('total_duration')}
								placeholder={program?.program_duration ?? 'VD: 12 tháng'}
							/>
						</FormField>
						<FormField label='Địa điểm thực hành'>
							<input
								className={styles.formInput}
								value={form.practice_location}
								onChange={set('practice_location')}
								placeholder='VD: Tại các khoa: Cấp cứu, Nội tim mạch 2…'
							/>
						</FormField>
						<div
							className={styles.hint}
							style={full}
						>
							Lịch các vòng khoa và người hướng dẫn từng vòng sẽ nhập ở bước tiếp theo (vòng thực hành).
						</div>
					</>
				)}

				<FormField
					label='Ghi chú'
					style={full}
				>
					<input
						className={styles.formInput}
						value={form.note}
						onChange={set('note')}
					/>
				</FormField>

				{programChanged ? (
					<div
						className={styles.hint}
						style={full}
					>
						Đã đổi chương trình — bấm "Lưu hồ sơ" để gắn bài học của chương trình mới.
					</div>
				) : (lessons.length > 0 || (!isPractice && enrollment.program_id)) && (
					<div style={full}>
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'space-between',
								marginBottom: 'var(--space-2)',
							}}
						>
							<span className={styles.hint}>
								Bài học theo chương trình: {done}/{lessons.length} đã học
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
			</div>
		</Modal>
	);
}
