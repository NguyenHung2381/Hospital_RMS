import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertSvg } from '@/assets/icons';
import PublicLayout from '../../../layouts/PublicLayout';
import { GENDER_OPTIONS } from '../../../shared/utils/gender';
import { getPublicSeminar, registerSeminar, type PublicSeminar } from '../api/publicApi';
import { FormSection, SubGroup } from '../components/FormSection';
import { useCaptcha } from '../hooks/useCaptcha';
import { seminarWhen } from '../utils/seminarWhen';
import styles from './PublicPortal.module.css';

const HOSPITAL = 'Bệnh viện Hữu Nghị Đa Khoa Nghệ An';

const EMPTY_FORM = {
	title_prefix: '',
	full_name: '',
	dob: '',
	gender: '',
	phone: '',
	email: '',
	source: '' as '' | 'internal' | 'external',
	organization: '',
	department_raw: '',
	qualification_raw: '',
	website: '', // honeypot
};

// Trang mở ra khi quét QR đăng ký hội nghị (QR do ban tổ chức tải ở trang chi
// tiết hội nghị, gắn vào văn bản). Đăng ký xong chuyển sang trang vé — trang vé
// tự lưu ảnh QR cá nhân về máy.
export default function SeminarRegisterPublic() {
	const { token = '' } = useParams();
	const navigate = useNavigate();
	const captcha = useCaptcha();
	const [seminar, setSeminar] = useState<PublicSeminar | null>(null);
	const [loadError, setLoadError] = useState('');
	const [form, setForm] = useState(EMPTY_FORM);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState('');

	useEffect(() => {
		getPublicSeminar(token)
			.then(setSeminar)
			.catch((e) => setLoadError(e instanceof Error ? e.message : 'Không tải được thông tin hội nghị'));
	}, [token]);

	useEffect(() => {
		if (error) window.scrollTo({ top: 0, behavior: 'smooth' });
	}, [error]);

	const set = (field: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
		setForm((f) => ({ ...f, [field]: e.target.value }));

	const setSource = (source: 'internal' | 'external') =>
		setForm((f) => ({
			...f,
			source,
			organization: source === 'internal' && !f.organization ? HOSPITAL : f.organization,
		}));

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError('');
		if (!form.full_name.trim()) return setError('Vui lòng nhập họ tên');
		if (!form.phone.trim()) return setError('Vui lòng nhập số điện thoại');
		if (!form.source) return setError('Vui lòng chọn nội viện / ngoại viện');
		if (!form.organization.trim()) return setError('Vui lòng nhập đơn vị công tác');
		if (!captcha.payload) return setError('Vui lòng hoàn tất bước xác nhận');

		setSubmitting(true);
		try {
			const { ticket_code } = await registerSeminar(token, {
				...form,
				source: form.source,
				...captcha.payload,
			});
			if (ticket_code) navigate(`/hoi-nghi/ve/${ticket_code}`, { state: { justRegistered: true } });
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Đăng ký thất bại, vui lòng thử lại');
		} finally {
			captcha.reload(); // mã xác nhận chỉ dùng 1 lần
			setSubmitting(false);
		}
	};

	if (loadError || !seminar) {
		return (
			<PublicLayout title='Đăng ký tham dự hội nghị'>
				{loadError ? (
					<div className={`${styles.alertBox} ${styles.alertError}`}>
						<AlertSvg /> {loadError}
					</div>
				) : (
					<div className={styles.emptyNotice}>Đang tải thông tin hội nghị...</div>
				)}
			</PublicLayout>
		);
	}

	return (
		<PublicLayout
			title='Đăng ký tham dự hội nghị'
			subtitle={seminar.title}
		>
			<div className={styles.section}>
				<div className={styles.sectionBody}>
					<div className={styles.courseName}>{seminar.title}</div>
					<div className={styles.courseMeta}>
						Thời gian: {seminarWhen(seminar)}
						{seminar.location ? ` · Địa điểm: ${seminar.location}` : ''}
					</div>
					{seminar.grants_cme && (
						<div className={styles.courseMeta}>
							Có cấp chứng nhận CME{seminar.cme_default_credits ? ` (${seminar.cme_default_credits} tín chỉ)` : ''} —
							yêu cầu điểm danh bằng mã QR cá nhân và làm bài test cuối buổi.
						</div>
					)}
				</div>
			</div>

			{!seminar.registration_open ? (
				<div className={`${styles.alertBox} ${styles.alertError}`}>
					<AlertSvg /> Hội nghị đã kết thúc, không nhận đăng ký.
				</div>
			) : (
				<>
					{error && (
						<div className={`${styles.alertBox} ${styles.alertError}`}>
							<AlertSvg /> {error}
						</div>
					)}
					<form
						onSubmit={handleSubmit}
						noValidate
					>
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
							title='Thông tin người tham dự'
							description='Thông tin dùng để điểm danh và lập danh sách cấp chứng nhận CME — vui lòng nhập chính xác.'
						>
							<SubGroup title='Thông tin cá nhân'>
								<div className={styles.formGrid}>
									<div className={styles.formGroup}>
										<label className={styles.label}>Học hàm / học vị</label>
										<input
											className={styles.input}
											value={form.title_prefix}
											onChange={set('title_prefix')}
											placeholder='VD: BS., ThS., TS.'
											maxLength={10}
										/>
									</div>
									<div className={styles.formGroup}>
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
										<label className={styles.label}>Ngày sinh</label>
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
										<label className={styles.label}>
											Số điện thoại <span className={styles.required}>*</span>
										</label>
										<input
											className={styles.input}
											type='tel'
											value={form.phone}
											onChange={set('phone')}
											placeholder='VD: 0912345678'
											autoComplete='tel'
											required
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
								</div>
							</SubGroup>

							<SubGroup title='Công tác'>
								<div className={styles.formGrid}>
									<div className={styles.formGroup}>
										<label className={styles.label}>
											Nội viện / Ngoại viện <span className={styles.required}>*</span>
										</label>
										<select
											className={styles.select}
											value={form.source}
											onChange={(e) => setSource(e.target.value as 'internal' | 'external')}
										>
											<option value=''>-- Chọn --</option>
											<option value='internal'>Nhân viên {HOSPITAL}</option>
											<option value='external'>Đơn vị khác</option>
										</select>
									</div>
									<div className={styles.formGroup}>
										<label className={styles.label}>
											Đơn vị công tác <span className={styles.required}>*</span>
										</label>
										<input
											className={styles.input}
											value={form.organization}
											onChange={set('organization')}
											placeholder='Bệnh viện / cơ sở y tế'
										/>
									</div>
									<div className={styles.formGroup}>
										<label className={styles.label}>Khoa / phòng</label>
										<input
											className={styles.input}
											value={form.department_raw}
											onChange={set('department_raw')}
										/>
									</div>
									<div className={styles.formGroup}>
										<label className={styles.label}>Trình độ chuyên môn</label>
										<input
											className={styles.input}
											value={form.qualification_raw}
											onChange={set('qualification_raw')}
											placeholder='VD: Bác sĩ, Điều dưỡng, Dược sĩ...'
											maxLength={100}
										/>
									</div>
								</div>
							</SubGroup>
						</FormSection>

						<div className={styles.formFooter}>
							{captcha.field}
							<button
								type='submit'
								className={styles.submitBtn}
								disabled={submitting}
							>
								{submitting ? 'Đang gửi...' : 'Đăng ký tham dự'}
							</button>
						</div>
					</form>
				</>
			)}
		</PublicLayout>
	);
}
