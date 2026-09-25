import { useEffect, useState } from 'react';
import { AlertSvg, CheckSvg } from '@/assets/icons';
import PublicLayout from '../../../layouts/PublicLayout';
import { formatDateOr } from '../../../shared/utils/formatDate';
import {
	getOpenCourses,
	getTraineeTypes,
	registerCourse,
	type PublicCourse,
	type TraineeTypeOption,
} from '../api/publicApi';
import { useCaptcha } from '../hooks/useCaptcha';
import styles from './PublicPortal.module.css';

const GENDER_OPTIONS = [
	{ value: '', label: '-- Chọn --' },
	{ value: 'Nam', label: 'Nam' },
	{ value: 'Nữ', label: 'Nữ' },
	{ value: 'Khác', label: 'Khác' },
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
	const captcha = useCaptcha();
	const [form, setForm] = useState(EMPTY_FORM);
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState('');
	const [success, setSuccess] = useState('');

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
			await registerCourse({
				...form,
				course_id: courseId,
				...captcha.payload,
			});
			setSuccess('Đăng ký thành công! Nhà trường sẽ liên hệ hoặc bạn có thể tra cứu kết quả bằng CCCD sau khi được duyệt.');
			setForm(EMPTY_FORM);
			setCourseId('');
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

				<div className={styles.sectionTitle}>Chọn khóa học</div>
				{loading ? (
					<div className={styles.emptyNotice}>Đang tải danh sách khóa học...</div>
				) : courses.length === 0 ? (
					<div className={styles.emptyNotice}>Hiện chưa có khóa học nào đang mở đăng ký.</div>
				) : (
					<div className={styles.courseList}>
						{courses.map((c) => (
							<div
								key={c.id}
								className={`${styles.courseCard} ${courseId === c.id ? styles.courseCardActive : ''}`}
								onClick={() => setCourseId(c.id)}
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

				<div className={styles.sectionTitle}>Thông tin học viên</div>
				<div className={styles.formGrid}>
					<div className={styles.formGroup}>
						<label className={styles.label}>
							Họ và tên <span className={styles.required}>*</span>
						</label>
						<input
							className={styles.input}
							value={form.full_name}
							onChange={set('full_name')}
							required
						/>
					</div>
					<div className={styles.formGroup}>
						<label className={styles.label}>Ngày sinh {form.national_id.trim() && <span style={{ color: '#dc2626' }}>*</span>}</label>
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
						/>
					</div>
					<div className={styles.formGroup}>
						<label className={styles.label}>Số điện thoại</label>
						<input
							className={styles.input}
							value={form.phone}
							onChange={set('phone')}
						/>
					</div>
					<div className={styles.formGroup}>
						<label className={styles.label}>Email</label>
						<input
							type='email'
							className={styles.input}
							value={form.email}
							onChange={set('email')}
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
					<div className={`${styles.formGroup} ${styles.full}`}>
						<label className={styles.label}>Địa chỉ</label>
						<textarea
							className={styles.textarea}
							value={form.address}
							onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
						/>
					</div>
				</div>

				<div className={styles.sectionTitle}>Xác nhận</div>
				{captcha.field}

				<button
					type='submit'
					className={styles.submitBtn}
					disabled={submitting}
				>
					{submitting ? 'Đang gửi...' : 'Gửi đăng ký'}
				</button>
			</form>
		</PublicLayout>
	);
}
