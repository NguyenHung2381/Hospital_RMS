import { useEffect, useState } from 'react';
import { AlertSvg, CheckSvg } from '@/assets/icons';
import PublicLayout from '../../../layouts/PublicLayout';
import { formatDateOr } from '../../../shared/utils/formatDate';
import { GENDER_OPTIONS } from '../../../shared/utils/gender';
import {
	getOpenCourses,
	getTraineeTypes,
	registerCourse,
	type PublicCourse,
	type TraineeDocType,
	type TraineeTypeOption,
} from '../api/publicApi';
import { AttachmentPicker, type Attachment } from '../components/AttachmentPicker';
import { FormSection, SubGroup } from '../components/FormSection';
import { useCaptcha } from '../hooks/useCaptcha';
import styles from './PublicPortal.module.css';

const DOC_TYPE_OPTIONS: { value: TraineeDocType; label: string }[] = [
	{ value: 'national_id', label: 'CCCD/CMND' },
	{ value: 'degree', label: 'Bằng cấp/Chứng chỉ' },
	{ value: 'other', label: 'Khác' },
];

const EMPTY_FORM = {
	full_name: '',
	dob: '',
	gender: '',
	national_id: '',
	phone: '',
	email: '',
	address: '',
	trainee_type_id: '',
	website: '', // honeypot
};

export default function CourseRegisterPublic() {
	const [courses, setCourses] = useState<PublicCourse[]>([]);
	const [traineeTypes, setTraineeTypes] = useState<TraineeTypeOption[]>([]);
	const [courseId, setCourseId] = useState('');
	const [attachments, setAttachments] = useState<Attachment<TraineeDocType>[]>([]);
	const captcha = useCaptcha();
	const [form, setForm] = useState(EMPTY_FORM);
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState('');
	const [success, setSuccess] = useState('');

	// Form dài, thông báo nằm trên đầu ⇒ cuộn lên để người dùng thấy kết quả gửi
	useEffect(() => {
		if (error || success) window.scrollTo({ top: 0, behavior: 'smooth' });
	}, [error, success]);

	useEffect(() => {
		Promise.all([getOpenCourses(), getTraineeTypes()])
			.then(([c, t]) => {
				setCourses(c);
				setTraineeTypes(t);
			})
			.catch((err) => setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu'))
			.finally(() => setLoading(false));
	}, []);

	const set = (field: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
		setForm((f) => ({ ...f, [field]: e.target.value }));

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError('');
		setSuccess('');
		if (!form.full_name.trim()) return setError('Vui lòng nhập họ tên');
		if (!courseId) return setError('Vui lòng chọn khóa học muốn đăng ký');
		// Server đối chiếu ngày sinh khi CCCD đã có hồ sơ — bắt nhập cùng lúc
		if (form.national_id.trim() && !form.dob) return setError('Vui lòng nhập ngày sinh kèm số CCCD/CMND');
		if (!captcha.payload) return setError('Vui lòng hoàn tất bước xác nhận');

		setSubmitting(true);
		try {
			await registerCourse(
				{
					...form,
					course_id: courseId,
					doc_types: attachments.map((a) => a.type ?? 'other'),
					...captcha.payload,
				},
				attachments.map((a) => a.file),
			);
			setSuccess(
				'Đăng ký thành công! Nhà trường sẽ liên hệ hoặc bạn có thể tra cứu kết quả bằng CCCD sau khi được duyệt.',
			);
			setForm(EMPTY_FORM);
			setCourseId('');
			setAttachments([]);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Đăng ký thất bại, vui lòng thử lại');
		} finally {
			// Mã xác nhận chỉ dùng 1 lần (đúng hay sai) — luôn lấy mã mới
			captcha.reload();
			setSubmitting(false);
		}
	};

	return (
		<PublicLayout
			title='Đăng ký khóa học đào tạo'
			subtitle='Điền thông tin bên dưới để đăng ký tham gia khóa học. Đăng ký sẽ được duyệt trong thời gian sớm nhất.'
		>
			{error && (
				<div className={`${styles.alertBox} ${styles.alertError}`}>
					<AlertSvg /> {error}
				</div>
			)}
			{success && (
				<div className={`${styles.alertBox} ${styles.alertSuccess}`}>
					<CheckSvg /> {success}
				</div>
			)}

			<form
				onSubmit={handleSubmit}
				noValidate
			>
				{/* Honeypot: field ẩn, người dùng thật không thấy nên luôn để trống */}
				<div
					className={styles.hp}
					aria-hidden='true'
				>
					<label htmlFor='website'>Website</label>
					<input
						id='website'
						name='website'
						type='text'
						tabIndex={-1}
						autoComplete='off'
						value={form.website}
						onChange={set('website')}
					/>
				</div>

				<FormSection
					step={1}
					title='Chọn khóa học'
					description='Chọn khóa học đang mở đăng ký mà bạn muốn tham gia.'
				>
					{loading ? (
						<div className={styles.emptyNotice}>Đang tải danh sách khóa học...</div>
					) : courses.length === 0 ? (
						<div className={styles.emptyNotice}>Hiện chưa có khóa học nào đang mở đăng ký.</div>
					) : (
						<div
							className={styles.courseList}
							role='radiogroup'
							aria-label='Chọn khóa học'
						>
							{courses.map((c) => (
								<div
									key={c.id}
									className={`${styles.courseCard} ${courseId === c.id ? styles.courseCardActive : ''}`}
									role='radio'
									aria-checked={courseId === c.id}
									tabIndex={0}
									onClick={() => setCourseId(c.id)}
									onKeyDown={(e) => {
										if (e.key === 'Enter' || e.key === ' ') {
											e.preventDefault();
											setCourseId(c.id);
										}
									}}
								>
									<div className={styles.courseName}>{c.name}</div>
									<div className={styles.courseMeta}>
										{c.program_name ?? 'Chương trình chưa xác định'}
										{c.start_date ? ` · Khai giảng ${formatDateOr(c.start_date)}` : ''}
									</div>
								</div>
							))}
						</div>
					)}
				</FormSection>

				<FormSection
					step={2}
					title='Thông tin học viên'
					description='Thông tin dùng để lập hồ sơ học viên và cấp chứng chỉ — vui lòng nhập chính xác.'
				>
					<SubGroup title='Thông tin cá nhân'>
						<div className={styles.formGrid}>
							<div className={`${styles.formGroup} ${styles.full}`}>
								<label className={styles.label}>
									Họ và tên <span className={styles.required}>*</span>
								</label>
								<input
									className={styles.input}
									value={form.full_name}
									onChange={set('full_name')}
									placeholder='VD: Nguyễn Văn An'
									autoComplete='name'
									required
								/>
							</div>
							<div className={styles.formGroup}>
								<label className={styles.label}>
									Ngày sinh {form.national_id.trim() && <span className={styles.required}>*</span>}
								</label>
								<input
									type='date'
									className={styles.input}
									value={form.dob}
									onChange={set('dob')}
								/>
							</div>
							<div className={styles.formGroup}>
								<label className={styles.label}>Giới tính</label>
								<select
									className={styles.select}
									value={form.gender}
									onChange={set('gender')}
								>
									<option value=''>-- Chọn --</option>
									{GENDER_OPTIONS.map((o) => (
										<option
											key={o.value}
											value={o.value}
										>
											{o.label}
										</option>
									))}
								</select>
							</div>
							<div className={styles.formGroup}>
								<label className={styles.label}>Số CCCD/CMND</label>
								<input
									className={styles.input}
									value={form.national_id}
									onChange={set('national_id')}
									placeholder='Dùng để tra cứu kết quả sau này'
									inputMode='numeric'
								/>
							</div>
							<div className={styles.formGroup}>
								<label className={styles.label}>Đối tượng học viên</label>
								<select
									className={styles.select}
									value={form.trainee_type_id}
									onChange={set('trainee_type_id')}
								>
									<option value=''>-- Chọn --</option>
									{traineeTypes.map((t) => (
										<option
											key={t.id}
											value={t.id}
										>
											{t.name}
										</option>
									))}
								</select>
							</div>
						</div>
					</SubGroup>

					<SubGroup title='Thông tin liên hệ'>
						<div className={styles.formGrid}>
							<div className={styles.formGroup}>
								<label className={styles.label}>Số điện thoại</label>
								<input
									className={styles.input}
									type='tel'
									value={form.phone}
									onChange={set('phone')}
									placeholder='VD: 0912345678'
									autoComplete='tel'
								/>
							</div>
							<div className={styles.formGroup}>
								<label className={styles.label}>Email</label>
								<input
									type='email'
									className={styles.input}
									value={form.email}
									onChange={set('email')}
									placeholder='email@example.com'
									autoComplete='email'
								/>
							</div>
							<div className={`${styles.formGroup} ${styles.full}`}>
								<label className={styles.label}>Địa chỉ</label>
								<input
									className={styles.input}
									value={form.address}
									onChange={set('address')}
									placeholder='Số nhà, đường, xã/phường, tỉnh/thành phố'
									autoComplete='street-address'
								/>
							</div>
						</div>
					</SubGroup>
				</FormSection>

				<FormSection
					step={3}
					title='Hồ sơ đính kèm'
					optional
					description='Ảnh/bản scan CCCD, văn bằng, chứng chỉ liên quan... Chọn loại hồ sơ cho từng file.'
				>
					<AttachmentPicker
						value={attachments}
						onChange={setAttachments}
						typeOptions={DOC_TYPE_OPTIONS}
						defaultType='other'
						hint='CCCD, bằng cấp...'
					/>
				</FormSection>
				<div className={styles.formFooter}>
					{captcha.field}
					<button
						type='submit'
						className={styles.submitBtn}
						disabled={submitting}
					>
						{submitting ? 'Đang gửi...' : 'Gửi đăng ký'}
					</button>
				</div>
			</form>
		</PublicLayout>
	);
}
