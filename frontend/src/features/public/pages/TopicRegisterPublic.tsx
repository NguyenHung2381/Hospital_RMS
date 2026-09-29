import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertSvg, CheckSvg, TrashSvg } from '@/assets/icons';
import PublicLayout from '../../../layouts/PublicLayout';
import {
	getOpenTopicRounds,
	getPublicCategories,
	getPublicDepartments,
	getPublicLevels,
	getTopicRoundByToken,
	registerTopic,
	type PublicTopicRound,
	type SimpleOption,
} from '../api/publicApi';
import { AttachmentPicker, type Attachment } from '../components/AttachmentPicker';
import { FormSection } from '../components/FormSection';
import { TopicPersonFields } from '../components/TopicPersonFields';
import { EMPTY_PERSON, validatePerson, type PersonField, type TopicPerson } from '../utils/topicPerson';
import { useCaptcha } from '../hooks/useCaptcha';
import styles from './PublicPortal.module.css';

const EMPTY_FORM = {
	title: '',
	description: '',
	round_id: '',
	department_id: '',
	category_id: '',
	level_id: '',
	website: '', // honeypot
};

const MAX_MEMBERS = 20;
// people[0] = chủ nhiệm (người đăng ký), sau đó là thư ký / thành viên
const INITIAL_PEOPLE: TopicPerson[] = [{ ...EMPTY_PERSON, role: 'leader' }];

export default function TopicRegisterPublic() {
	const [rounds, setRounds] = useState<PublicTopicRound[]>([]);
	const [categories, setCategories] = useState<SimpleOption[]>([]);
	const [departments, setDepartments] = useState<SimpleOption[]>([]);
	const [levels, setLevels] = useState<SimpleOption[]>([]);
	const captcha = useCaptcha();
	const [form, setForm] = useState(EMPTY_FORM);
	const [people, setPeople] = useState<TopicPerson[]>(INITIAL_PEOPLE);
	const [attachments, setAttachments] = useState<Attachment[]>([]);
	const [personErrors, setPersonErrors] = useState<Partial<Record<PersonField, string>>[]>([]);
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState('');
	const [success, setSuccess] = useState('');
	const [registeredId, setRegisteredId] = useState('');
	const [copied, setCopied] = useState(false);

	// Form dài, thông báo nằm trên đầu ⇒ cuộn lên để người dùng thấy kết quả gửi
	useEffect(() => {
		if (error || success) window.scrollTo({ top: 0, behavior: 'smooth' });
	}, [error, success]);

	// Link kèm ?token= (tab "Nâng cao" của đợt) ⇒ khoá form vào đúng đợt đó;
	// không có token ⇒ người đăng ký tự chọn trong các đợt đang mở.
	const [searchParams] = useSearchParams();
	const token = searchParams.get('token');
	const [lockedRoundId, setLockedRoundId] = useState('');

	// Cấp độ ăn theo đợt (cấu hình ở đợt / loại đợt): đợt chỉ có 1 cấp độ thì tự
	// gán, không hỏi; đợt cho nhiều cấp độ mới hiện ô chọn trong số đó.
	const pickRound = (roundId: string) => {
		if (lockedRoundId && roundId !== lockedRoundId) return;
		setForm((f) => ({ ...f, round_id: roundId, level_id: '' }));
		setLevels([]);
		getPublicLevels(roundId)
			.then((ls) => {
				setLevels(ls);
				if (ls.length === 1) setForm((f) => (f.round_id === roundId ? { ...f, level_id: ls[0].id } : f));
			})
			.catch(() => setLevels([]));
	};

	useEffect(() => {
		const roundsLoad = token
			? getTopicRoundByToken(token).then((r) => {
					if (!r.registration_open) {
						throw new Error(
							r.status !== 'active'
								? `Đợt "${r.name}" hiện không mở đăng ký đề tài.`
								: `Đợt "${r.name}" hiện không trong thời gian nhận đăng ký đề tài.`,
						);
					}
					setLockedRoundId(r.id);
					pickRound(r.id);
					return [r];
				})
			: getOpenTopicRounds();
		Promise.all([roundsLoad, getPublicCategories(), getPublicDepartments()])
			.then(([r, c, d]) => {
				setRounds(r);
				setCategories(c);
				setDepartments(d);
			})
			.catch((err) => setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu'))
			.finally(() => setLoading(false));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [token]);
	const mustPickLevel = !!form.round_id && levels.length > 1;

	const set =
		(field: keyof typeof EMPTY_FORM) =>
		(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
			setForm((f) => ({ ...f, [field]: e.target.value }));

	const setPerson = (idx: number) => (field: PersonField, value: string) => {
		setPeople((list) => list.map((p, i) => (i === idx ? { ...p, [field]: value } : p)));
		setPersonErrors((errs) => errs.map((e, i) => (i === idx ? { ...e, [field]: '' } : e)));
	};
	const hasSecretary = people.some((p) => p.role === 'secretary');
	const addPerson = () =>
		setPeople((list) => [...list, { ...EMPTY_PERSON, role: hasSecretary ? 'member' : 'secretary' }]);
	const removePerson = (idx: number) => {
		setPeople((list) => list.filter((_, i) => i !== idx));
		setPersonErrors((errs) => errs.filter((_, i) => i !== idx));
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError('');
		setSuccess('');
		const errs = people.map(validatePerson);
		// MNV trùng giữa các người trong cùng đề tài
		const seen = new Map<string, number>();
		people.forEach((p, i) => {
			const mnv = p.staff_number.trim();
			if (!mnv || errs[i].staff_number) return;
			if (seen.has(mnv)) errs[i].staff_number = `Trùng MNV với người thứ ${seen.get(mnv)! + 1}`;
			else seen.set(mnv, i);
		});
		setPersonErrors(errs);
		// Tô đỏ mọi trường người tham gia còn thiếu ngay, rồi báo lỗi theo thứ tự trên form
		if (!form.title.trim()) return setError('Vui lòng nhập tiêu đề đề tài');
		if (!form.round_id) return setError('Vui lòng chọn đợt đăng ký đề tài');
		if (!form.category_id) return setError('Vui lòng chọn danh mục đề tài');
		if (!form.department_id) return setError('Vui lòng chọn khoa/phòng');
		if (mustPickLevel && !form.level_id) return setError('Vui lòng chọn cấp độ đề tài');

		const badIdx = errs.findIndex((e) => Object.keys(e).length);
		if (badIdx >= 0) {
			return setError(
				badIdx === 0
					? 'Vui lòng nhập đủ thông tin chủ nhiệm đề tài'
					: `Vui lòng nhập đủ thông tin người thứ ${badIdx + 1} (hoặc xoá nếu không cần)`,
			);
		}
		if (people.filter((p) => p.role === 'secretary').length > 1) return setError('Mỗi đề tài chỉ có 1 thư ký');
		if (!captcha.payload) return setError('Vui lòng hoàn tất bước xác nhận');

		const clean = (p: TopicPerson) => ({
			full_name: p.full_name.trim(),
			staff_number: p.staff_number.trim(),
			phone: p.phone.trim(),
			position: p.position.trim(),
			email: p.email.trim(),
		});
		const [leader, ...rest] = people;
		setSubmitting(true);
		try {
			const result = await registerTopic(
				{
					...form,
					...clean(leader),
					member_department_id: leader.department_id || undefined,
					members: rest.map((p) => ({
						...clean(p),
						role: p.role === 'secretary' ? 'secretary' : 'member',
						department_id: p.department_id || undefined,
					})),
					...captcha.payload,
				},
				attachments.map((a) => a.file),
			);
			setSuccess('Đăng ký đề tài thành công! Khoa/phòng và hội đồng sẽ xem xét và duyệt hồ sơ của bạn.');
			setRegisteredId(result.topic_id ?? '');
			setCopied(false);
			// Link khoá theo đợt ⇒ giữ đợt để nộp tiếp đề tài khác cùng đợt
			setForm({ ...EMPTY_FORM, round_id: lockedRoundId });
			setPeople(INITIAL_PEOPLE);
			setPersonErrors([]);
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
					<CheckSvg />
					<div>
						<div>{success}</div>
						{registeredId && (
							<div style={{ marginTop: 8 }}>
								Mã hồ sơ của bạn: <strong>{registeredId}</strong>{' '}
								<button
									type='button'
									className={styles.captchaRefresh}
									onClick={() => {
										void navigator.clipboard.writeText(registeredId);
										setCopied(true);
									}}
								>
									{copied ? 'Đã sao chép' : 'Sao chép mã'}
								</button>
								<div style={{ marginTop: 4, fontSize: 'var(--font-size-sm)' }}>
									Lưu lại mã này để <Link to={`/tra-cuu-ho-so/${registeredId}`}>tra cứu trạng thái hồ sơ</Link> sau này.
								</div>
							</div>
						)}
					</div>
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
					title={lockedRoundId ? 'Đợt đăng ký' : 'Chọn đợt đăng ký'}
					description={lockedRoundId ? undefined : 'Chọn một trong các đợt đang mở nhận đăng ký đề tài.'}
				>
					{loading ? (
						<div className={styles.emptyNotice}>Đang tải danh sách đợt...</div>
					) : rounds.length === 0 ? (
						<div className={styles.emptyNotice}>Hiện chưa có đợt nào đang mở đăng ký đề tài.</div>
					) : (
						<div
							className={styles.courseList}
							role='radiogroup'
							aria-label='Chọn đợt đăng ký'
						>
							{rounds.map((r) => (
								<div
									key={r.id}
									className={`${styles.courseCard} ${form.round_id === r.id ? styles.courseCardActive : ''}`}
									role='radio'
									aria-checked={form.round_id === r.id}
									tabIndex={0}
									onClick={() => pickRound(r.id)}
									onKeyDown={(e) => {
										if (e.key === 'Enter' || e.key === ' ') {
											e.preventDefault();
											pickRound(r.id);
										}
									}}
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
				</FormSection>

				<FormSection
					step={2}
					title='Thông tin đề tài'
					description='Tên, nội dung tóm tắt và phân loại của đề tài.'
				>
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
								rows={4}
								value={form.description}
								onChange={set('description')}
								placeholder='Mô tả ngắn về mục tiêu, phương pháp nghiên cứu...'
							/>
						</div>
						<div className={styles.formGroup}>
							<label className={styles.label}>
								Danh mục <span className={styles.required}>*</span>
							</label>
							<select
								className={styles.select}
								value={form.category_id}
								onChange={set('category_id')}
								required
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
								Khoa/phòng chủ trì <span className={styles.required}>*</span>
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
						{mustPickLevel && (
							<div className={styles.formGroup}>
								<label className={styles.label}>
									Cấp độ đề tài <span className={styles.required}>*</span>
								</label>
								<select
									className={styles.select}
									value={form.level_id}
									onChange={set('level_id')}
									required
								>
									<option value=''>-- Chọn cấp độ --</option>
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
						)}
					</div>
				</FormSection>

				<FormSection
					step={3}
					title='Chủ nhiệm đề tài'
					description='Người đăng ký chính là chủ nhiệm đề tài.'
				>
					<TopicPersonFields
						person={people[0]}
						errors={personErrors[0]}
						departments={departments}
						onChange={setPerson(0)}
					/>
				</FormSection>

				<FormSection
					step={4}
					title='Thư ký & thành viên'
					optional
					description='Thêm những người cùng tham gia đề tài — mỗi đề tài có tối đa 1 thư ký.'
				>
					{people.length === 1 && <p className={styles.memberEmpty}>Chưa có thư ký/thành viên nào.</p>}
					{people.slice(1).map((p, i) => {
						const idx = i + 1;
						return (
							<div
								key={idx}
								className={styles.memberCard}
							>
								<div className={styles.memberHead}>
									<div className={styles.memberTitle}>
										<span>Người thứ {idx + 1}</span>
										<span className={styles.roleChip}>{p.role === 'secretary' ? 'Thư ký' : 'Thành viên'}</span>
										{p.full_name.trim() && <span className={styles.memberName}>· {p.full_name.trim()}</span>}
									</div>
									<button
										type='button'
										className={styles.memberRemove}
										onClick={() => removePerson(idx)}
									>
										<TrashSvg /> Xoá
									</button>
								</div>
								<div className={styles.memberBody}>
									<TopicPersonFields
										person={p}
										errors={personErrors[idx]}
										departments={departments}
										secretaryTaken={hasSecretary && p.role !== 'secretary'}
										onChange={setPerson(idx)}
									/>
								</div>
							</div>
						);
					})}
					{people.length - 1 < MAX_MEMBERS && (
						<button
							type='button'
							className={styles.addMemberBtn}
							onClick={addPerson}
						>
							+ Thêm {hasSecretary ? 'thành viên' : 'thư ký / thành viên'}
						</button>
					)}
				</FormSection>

				<FormSection
					step={5}
					title='Tài liệu đính kèm'
					optional
					description='Thuyết minh, đề cương, phiếu đăng ký... Hội đồng sẽ xem các tài liệu này khi xét duyệt.'
				>
					<AttachmentPicker
						value={attachments}
						onChange={setAttachments}
						hint='Thuyết minh, đề cương (PDF, Word...)'
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
