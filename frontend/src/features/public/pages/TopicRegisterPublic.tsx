import { useCallback, useEffect, useState } from 'react';
import { AlertSvg, CheckSvg } from '@/assets/icons';
import PublicLayout from '../../../layouts/PublicLayout';
import {
	getCaptcha,
	getOpenTopicRounds,
	getPublicCategories,
	getPublicDepartments,
	getPublicLevels,
	registerTopic,
	type Captcha,
	type PublicTopicRound,
	type SimpleOption,
} from '../api/publicApi';
import styles from './PublicPortal.module.css';

const EMPTY_FORM = {
	full_name: '',
	phone: '',
	email: '',
	position: '',
	title: '',
	description: '',
	round_id: '',
	department_id: '',
	category_id: '',
	level_id: '',
	captcha_answer: '',
	website: '', // honeypot
};

export default function TopicRegisterPublic() {
	const [rounds, setRounds] = useState<PublicTopicRound[]>([]);
	const [categories, setCategories] = useState<SimpleOption[]>([]);
	const [departments, setDepartments] = useState<SimpleOption[]>([]);
	const [levels, setLevels] = useState<SimpleOption[]>([]);
	const [captcha, setCaptcha] = useState<Captcha | null>(null);
	const [form, setForm] = useState(EMPTY_FORM);
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState('');
	const [success, setSuccess] = useState('');

	const loadCaptcha = useCallback(() => {
		getCaptcha()
			.then(setCaptcha)
			.catch(() => setCaptcha(null));
	}, []);

	useEffect(() => {
		Promise.all([getOpenTopicRounds(), getPublicCategories(), getPublicDepartments()])
			.then(([r, c, d]) => {
				setRounds(r);
				setCategories(c);
				setDepartments(d);
			})
			.catch((err) => setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu'))
			.finally(() => setLoading(false));
		loadCaptcha();
	}, [loadCaptcha]);

	// Cấp độ phụ thuộc đợt đã chọn (mỗi loại đợt cho phép cấp độ khác nhau) —
	// chọn đợt xong thì tải lại danh sách cấp độ và reset lựa chọn cũ.
	const pickRound = (roundId: string) => {
		setForm((f) => ({ ...f, round_id: roundId, level_id: '' }));
		setLevels([]);
		getPublicLevels(roundId)
			.then(setLevels)
			.catch(() => setLevels([]));
	};

	const set = (field: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
		setForm((f) => ({ ...f, [field]: e.target.value }));

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError('');
		setSuccess('');
		if (!form.full_name.trim()) return setError('Vui lòng nhập họ tên người đăng ký');
		if (!form.title.trim()) return setError('Vui lòng nhập tiêu đề đề tài');
		if (!form.round_id) return setError('Vui lòng chọn đợt đăng ký đề tài');
		if (!form.department_id) return setError('Vui lòng chọn khoa/phòng');
		if (!form.level_id) return setError('Vui lòng chọn cấp độ đề tài');
		if (!captcha || !form.captcha_answer) return setError('Vui lòng nhập mã xác nhận');

		setSubmitting(true);
		try {
			await registerTopic({ ...form, captcha_token: captcha.token });
			setSuccess('Đăng ký đề tài thành công! Khoa/phòng và hội đồng sẽ xem xét và duyệt hồ sơ của bạn.');
			setForm(EMPTY_FORM);
			loadCaptcha();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Đăng ký thất bại, vui lòng thử lại');
			loadCaptcha();
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<PublicLayout
			title='Đăng ký đề tài nghiên cứu khoa học'
			subtitle='Điền thông tin bên dưới để đăng ký đề tài. Hồ sơ sẽ được khoa/phòng và hội đồng xét duyệt trước khi chính thức triển khai.'
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

				<div className={styles.sectionTitle}>Chọn đợt đăng ký</div>
				{loading ? (
					<div className={styles.emptyNotice}>Đang tải danh sách đợt...</div>
				) : rounds.length === 0 ? (
					<div className={styles.emptyNotice}>Hiện chưa có đợt nào đang mở đăng ký đề tài.</div>
				) : (
					<div className={styles.courseList}>
						{rounds.map((r) => (
							<div
								key={r.id}
								className={`${styles.courseCard} ${form.round_id === r.id ? styles.courseCardActive : ''}`}
								onClick={() => pickRound(r.id)}
							>
								<div className={styles.courseName}>
									{r.name} {r.year ? `— Năm ${r.year}` : ''}
								</div>
								<div className={styles.courseMeta}>
									{r.round_type_name ?? 'Chưa xác định loại đợt'}
									{r.registration_end ? ` · Hạn đăng ký ${r.registration_end}` : ''}
								</div>
							</div>
						))}
					</div>
				)}

				<div className={styles.sectionTitle}>Thông tin đề tài</div>
				<div className={styles.formGrid}>
					<div className={`${styles.formGroup} ${styles.full}`}>
						<label className={styles.label}>
							Tiêu đề đề tài <span className={styles.required}>*</span>
						</label>
						<input
							className={styles.input}
							value={form.title}
							onChange={set('title')}
							placeholder='Nhập tiêu đề đề tài nghiên cứu...'
							required
						/>
					</div>
					<div className={`${styles.formGroup} ${styles.full}`}>
						<label className={styles.label}>Mô tả / Tóm tắt</label>
						<textarea
							className={styles.textarea}
							rows={3}
							value={form.description}
							onChange={set('description')}
							placeholder='Mô tả ngắn về mục tiêu, phương pháp nghiên cứu...'
						/>
					</div>
					<div className={styles.formGroup}>
						<label className={styles.label}>Danh mục</label>
						<select
							className={styles.select}
							value={form.category_id}
							onChange={set('category_id')}
						>
							<option value=''>-- Chọn danh mục --</option>
							{categories.map((c) => (
								<option
									key={c.id}
									value={c.id}
								>
									{c.name}
								</option>
							))}
						</select>
					</div>
					<div className={styles.formGroup}>
						<label className={styles.label}>
							Cấp độ đề tài <span className={styles.required}>*</span>
						</label>
						<select
							className={styles.select}
							value={form.level_id}
							onChange={set('level_id')}
							disabled={!form.round_id}
							required
						>
							<option value=''>{form.round_id ? '-- Chọn cấp độ --' : '-- Chọn đợt trước --'}</option>
							{levels.map((l) => (
								<option
									key={l.id}
									value={l.id}
								>
									{l.name}
								</option>
							))}
						</select>
					</div>
					<div className={styles.formGroup}>
						<label className={styles.label}>
							Khoa/phòng <span className={styles.required}>*</span>
						</label>
						<select
							className={styles.select}
							value={form.department_id}
							onChange={set('department_id')}
							required
						>
							<option value=''>-- Chọn khoa/phòng --</option>
							{departments.map((d) => (
								<option
									key={d.id}
									value={d.id}
								>
									{d.name}
								</option>
							))}
						</select>
					</div>
				</div>

				<div className={styles.sectionTitle}>Thông tin người đăng ký</div>
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
						<label className={styles.label}>Chức vụ</label>
						<input
							className={styles.input}
							value={form.position}
							onChange={set('position')}
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
				</div>

				<div className={styles.sectionTitle}>Xác nhận</div>
				<div className={styles.formGroup}>
					<label className={styles.label}>Nhập kết quả phép tính bên dưới</label>
					<div className={styles.captchaRow}>
						<span className={styles.captchaQuestion}>{captcha?.question ?? '...'}</span>
						<button
							type='button'
							className={styles.captchaRefresh}
							onClick={loadCaptcha}
						>
							Đổi câu hỏi
						</button>
					</div>
					<input
						className={styles.input}
						value={form.captcha_answer}
						onChange={set('captcha_answer')}
						placeholder='Nhập đáp án'
						style={{ marginTop: 8, maxWidth: 200 }}
					/>
				</div>

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
