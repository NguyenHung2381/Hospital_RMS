import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertSvg, BookOpenSvg, CheckCircleSvg, CheckSmSvg, ChevRSvg, SendSvg } from '@/assets/icons';
import { SearchInput } from '@/shared/components';
import { removeDiacritics } from '@/shared/utils/helper';
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
import { CourseProgramPicker } from '../components/CourseProgramPicker';
import { FormSection, SubGroup } from '../components/FormSection';
import { useCaptcha } from '../hooks/useCaptcha';
import { PUBLIC_FIELD } from '../utils/fieldClasses';
import { allowedOptions } from '@/shared/formConfig/allowedOptions';
import { CfgField } from '@/shared/formConfig/CfgField';
import { CustomFields } from '@/shared/formConfig/CustomFields';
import type { CustomValues } from '@/shared/formConfig/types';
import { useFormConfig } from '@/shared/formConfig/useFormConfig';
import styles from './PublicPortal.module.css';
import s from './CourseRegisterPublic.module.css';

// Trang này có class ghi chú / lỗi riêng
const COURSE_FIELD = { ...PUBLIC_FIELD, hint: s.hint, error: s.fieldError, inputError: s.inputError };

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

// Khóa lỗi: course/program/captcha + trường có sẵn + trường tùy chỉnh (Cấu hình form)
type FieldKey = string;
// Thứ tự trên trang — lỗi đầu tiên theo thứ tự này được cuộn tới
const FIELD_ORDER: FieldKey[] = [
	'course',
	'program',
	'full_name',
	'national_id',
	'dob',
	'gender',
	'trainee_type_id',
	'phone',
	'email',
	'address',
];
// Trường tùy chỉnh có id cf-<key> (CustomFields)
const fieldId = (k: FieldKey) =>
	k === 'program' ? 'f-course' : document.getElementById(`f-${k}`) ? `f-${k}` : `cf-${k}`;

// Nhiều khóa thì mới cần ô tìm
const SEARCH_FROM = 6;
// Link chia sẻ thẳng tới 1 khóa: /dang-ky-khoa-hoc?khoa=<id>
const COURSE_PARAM = 'khoa';

const searchKey = (v: string) => removeDiacritics(v).toLowerCase();

// Số ngày còn lại tới hạn đăng ký (null = không giới hạn)
function daysLeft(date: string | null) {
	if (!date) return null;
	const end = new Date(date);
	if (Number.isNaN(end.getTime())) return null;
	end.setHours(0, 0, 0, 0);
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	return Math.round((end.getTime() - today.getTime()) / 86_400_000);
}

function DeadlineTag({ date }: { date: string | null }) {
	const left = daysLeft(date);
	if (left == null || left < 0) return null;
	const soon = left <= 7;
	return (
		<span className={`${s.tag} ${soon ? s.tagWarn : ''}`}>
			{left === 0 ? 'Hết hạn hôm nay' : soon ? `Còn ${left} ngày` : `Hạn ĐK ${formatDateOr(date)}`}
		</span>
	);
}

interface Done {
	name: string;
	course: string;
	program: string | null;
	start: string | null;
	hasLookup: boolean;
}

export default function CourseRegisterPublic() {
	const [params, setParams] = useSearchParams();
	const [courses, setCourses] = useState<PublicCourse[]>([]);
	const [traineeTypes, setTraineeTypes] = useState<TraineeTypeOption[]>([]);
	const [courseId, setCourseId] = useState('');
	const [programId, setProgramId] = useState('');
	const [courseQuery, setCourseQuery] = useState('');
	const [attachments, setAttachments] = useState<Attachment<TraineeDocType>[]>([]);
	const captcha = useCaptcha();
	const [form, setForm] = useState(EMPTY_FORM);
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState('');
	// Link ?khoa=… trỏ tới khóa không còn mở đăng ký (hết hạn, chuyển nội bộ, đã hủy)
	const [linkMissing, setLinkMissing] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
	const [serverError, setServerError] = useState('');
	const [done, setDone] = useState<Done | null>(null);
	// Nhãn / bắt buộc / giới hạn / trường tùy chỉnh theo Cấu hình form
	const cfg = useFormConfig('course_registration', 'public');
	const [custom, setCustomState] = useState<CustomValues>({});
	const setCustom = (next: CustomValues) => {
		Object.keys(next).forEach((k) => next[k] !== custom[k] && clearError(k));
		setCustomState(next);
	};

	const course = courses.find((c) => c.id === courseId);
	const program = course?.programs.find((p) => p.id === programId);

	const clearError = (k: FieldKey) => setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));

	// Chọn khóa (+ chương trình). Chương trình đã ghi đối tượng ⇒ điền sẵn
	// "Đối tượng học viên" nếu người dùng chưa chọn.
	const choose = (c: PublicCourse | null, pid: string, types = traineeTypes) => {
		setCourseId(c?.id ?? '');
		setProgramId(pid);
		const typeName = c?.programs.find((p) => p.id === pid)?.trainee_type_name;
		const match = typeName && types.find((t) => t.name === typeName);
		if (match) setForm((f) => (f.trainee_type_id ? f : { ...f, trainee_type_id: match.id }));
	};
	// Khóa chỉ có 1 chương trình thì tự chọn luôn
	// Lớp ĐTLT / CTCV đã đủ sĩ số thì không tự chọn — người ngoài viện không đăng ký được (12b)
	const autoProgram = (c: PublicCourse | null) => {
		const only = c?.programs.length === 1 ? c.programs[0] : null;
		return only && !(only.class_rule && only.class_max != null && only.class_approved >= only.class_max) ? only.id : '';
	};

	const pickCourse = (c: PublicCourse | null) => {
		choose(c, autoProgram(c));
		setLinkMissing(false);
		clearError('course');
		clearError('program');
		setParams(
			(p) => {
				const n = new URLSearchParams(p);
				if (c) n.set(COURSE_PARAM, c.id);
				else n.delete(COURSE_PARAM);
				return n;
			},
			{ replace: true },
		);
	};

	useEffect(() => {
		Promise.all([getOpenCourses(), getTraineeTypes()])
			.then(([c, t]) => {
				setCourses(c);
				setTraineeTypes(t);
				// Mở từ link có ?khoa=… hoặc chỉ có đúng 1 khóa đang mở ⇒ chọn sẵn
				const wanted = params.get(COURSE_PARAM);
				const linked = wanted ? c.find((x) => x.id === wanted) : undefined;
				if (wanted && !linked) setLinkMissing(true);
				const initial = linked ?? (c.length === 1 && !wanted ? c[0] : null);
				if (initial) choose(initial, autoProgram(initial), t);
			})
			.catch((err) => setLoadError(err instanceof Error ? err.message : 'Không thể tải dữ liệu'))
			.finally(() => setLoading(false));
		// eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ đọc link lúc mở trang
	}, []);

	// Đã tích ô xác nhận thì không hiện lỗi captcha cũ nữa
	const captchaError = captcha.payload ? undefined : errors.captcha;

	const set = (field: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
		setForm((f) => ({ ...f, [field]: e.target.value }));
		clearError(field);
		if (field === 'national_id') clearError('dob');
	};

	const visibleCourses = useMemo(() => {
		const q = searchKey(courseQuery.trim());
		if (!q) return courses;
		return courses.filter((c) =>
			searchKey(`${c.name} ${c.program_name ?? ''} ${c.programs.map((p) => p.name).join(' ')}`).includes(q),
		);
	}, [courses, courseQuery]);

	const validate = () => {
		const e: Partial<Record<FieldKey, string>> = {};
		if (!courseId) e.course = 'Vui lòng chọn khóa học muốn đăng ký';
		else if (course?.programs.length && !programId) e.program = 'Vui lòng chọn 1 chương trình trong khóa';
		// Bắt buộc / độ dài / định dạng theo Cấu hình form (honeypot không có trong registry nên bỏ qua)
		Object.assign(e, cfg.validate(form, custom, { mode: 'create' }));
		if (!form.full_name.trim()) e.full_name = 'Vui lòng nhập họ và tên';
		// Server đối chiếu ngày sinh khi CCCD đã có hồ sơ — bắt nhập cùng lúc
		if (form.national_id.trim() && !form.dob) e.dob = 'Nhập ngày sinh kèm số CCCD/CMND';
		if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim())) e.email = 'Email không hợp lệ';
		if (!captcha.payload) e.captcha = 'Vui lòng tích ô xác nhận trước khi gửi';
		Object.keys(e).forEach((k) => !e[k] && delete e[k]);
		return e;
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setServerError('');
		const errs = validate();
		setErrors(errs);
		const first =
			FIELD_ORDER.find((k) => errs[k]) ??
			cfg.custom.find((c) => errs[c.key])?.key ??
			(errs.captcha ? 'captcha' : undefined);
		if (first) {
			const el = document.getElementById(fieldId(first));
			el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
			if (el instanceof HTMLInputElement) el.focus({ preventScroll: true });
			return;
		}
		if (!captcha.payload || !course) return;

		setSubmitting(true);
		try {
			await registerCourse(
				{
					...form,
					course_id: courseId,
					program_id: programId || undefined,
					doc_types: attachments.map((a) => a.type ?? 'other'),
					custom,
					...captcha.payload,
				},
				attachments.map((a) => a.file),
			);
			setDone({
				name: form.full_name.trim(),
				course: course.name,
				program: program?.name ?? null,
				start: course.start_date,
				hasLookup: !!form.national_id.trim() && !!form.dob,
			});
			setForm(EMPTY_FORM);
			setCustomState({});
			setAttachments([]);
			window.scrollTo({ top: 0, behavior: 'smooth' });
		} catch (err) {
			setServerError(err instanceof Error ? err.message : 'Đăng ký thất bại, vui lòng thử lại');
		} finally {
			// Mã xác nhận chỉ dùng 1 lần (đúng hay sai) — luôn lấy mã mới
			captcha.reload();
			setSubmitting(false);
		}
	};

	const restart = () => {
		setDone(null);
		setErrors({});
		setServerError('');
		pickCourse(null);
		window.scrollTo({ top: 0 });
	};

	if (done) {
		return (
			<PublicLayout
				bare
				title='Đăng ký khóa học đào tạo'
			>
				<div className={s.done}>
					<div className={s.doneIcon}>
						<CheckCircleSvg />
					</div>
					<h2 className={s.doneTitle}>Đã gửi đăng ký thành công</h2>
					<p className={s.doneText}>
						Phòng Đào tạo sẽ xét duyệt và liên hệ với bạn qua số điện thoại hoặc email đã cung cấp.
					</p>
					<dl className={s.doneCard}>
						<div>
							<dt>Học viên</dt>
							<dd>{done.name}</dd>
						</div>
						<div>
							<dt>Khóa học</dt>
							<dd>{done.course}</dd>
						</div>
						{done.program && (
							<div>
								<dt>Chương trình</dt>
								<dd>{done.program}</dd>
							</div>
						)}
						{done.start && (
							<div>
								<dt>Khai giảng</dt>
								<dd>{formatDateOr(done.start)}</dd>
							</div>
						)}
					</dl>
					<p className={s.doneText}>
						{done.hasLookup
							? 'Bạn có thể theo dõi kết quả duyệt bằng họ tên, số CCCD/CMND và ngày sinh vừa nhập.'
							: 'Bạn chưa nhập CCCD/CMND nên không tra cứu trực tuyến được — vui lòng chờ Phòng Đào tạo liên hệ.'}
					</p>
					<div className={s.doneActions}>
						<button
							type='button'
							className={s.ghostBtn}
							onClick={restart}
						>
							Đăng ký khóa khác
						</button>
						{done.hasLookup && (
							<Link
								to='/tra-cuu-ket-qua'
								className={s.submitBtn}
							>
								Tra cứu kết quả
							</Link>
						)}
					</div>
				</div>
			</PublicLayout>
		);
	}

	const steps = [
		{ label: 'Chọn khóa học', ok: !!course },
		...(course?.programs.length ? [{ label: 'Chọn chương trình', ok: !!program }] : []),
		{ label: 'Nhập họ và tên', ok: !!form.full_name.trim() },
		{ label: 'Hồ sơ đính kèm (tùy chọn)', ok: attachments.length > 0 },
		{ label: 'Xác nhận không phải người máy', ok: !!captcha.payload },
	];

	return (
		<PublicLayout
			bare
			title='Đăng ký khóa học đào tạo'
			subtitle='Chọn khóa học, điền thông tin và gửi đăng ký. Phòng Đào tạo sẽ duyệt và liên hệ lại với bạn.'
		>
			<div className={s.layout}>
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

					<div id='f-course'>
						<FormSection
							step={1}
							title={course ? 'Chọn chương trình' : 'Chọn khóa học'}
							description={
								course
									? course.programs.length > 1
										? 'Khóa học có nhiều chương trình — chọn 1 chương trình bạn muốn theo học.'
										: 'Kiểm tra thông tin khóa học trước khi điền hồ sơ.'
									: 'Bấm vào khóa học đang mở đăng ký mà bạn muốn tham gia.'
							}
						>
							{linkMissing && !course && !loading && (
								<div
									className={s.linkNotice}
									role='status'
								>
									<AlertSvg />
									<span>
										Khóa học trong link bạn mở đã hết hạn hoặc không còn nhận đăng ký.
										{courses.length > 0 && ' Bạn có thể chọn một khóa khác đang mở bên dưới.'}
									</span>
								</div>
							)}
							{course ? (
								<CourseProgramPicker
									course={course}
									value={programId}
									onChange={(id) => {
										choose(course, id);
										clearError('program');
									}}
									onBack={() => pickCourse(null)}
									backLabel={courses.length > 1 ? 'Chọn khóa khác' : 'Xem danh sách khóa'}
									external
								/>
							) : loading ? (
								<div className={styles.emptyNotice}>Đang tải danh sách khóa học...</div>
							) : loadError ? (
								<div className={styles.emptyNotice}>{loadError}</div>
							) : courses.length === 0 ? (
								<div className={styles.emptyNotice}>Hiện chưa có khóa học nào đang mở đăng ký.</div>
							) : (
								<>
									{courses.length >= SEARCH_FROM && (
										<div className={s.courseToolbar}>
											<SearchInput
												value={courseQuery}
												onChange={setCourseQuery}
												placeholder='Tìm khóa học, chương trình...'
											/>
										</div>
									)}
									<div
										className={s.courseGrid}
										aria-label='Danh sách khóa học'
									>
										{visibleCourses.map((c) => (
											<button
												type='button'
												key={c.id}
												className={s.courseItem}
												onClick={() => pickCourse(c)}
											>
												<span className={s.courseIcon}>
													<BookOpenSvg />
												</span>
												<span className={s.courseBody}>
													<span className={s.courseTitle}>{c.name}</span>
													<span className={s.courseSub}>
														{c.programs.length > 1
															? `${c.programs.length} chương trình để chọn`
															: (c.programs[0]?.name ?? c.program_name ?? 'Chương trình chưa xác định')}
													</span>
													<span className={s.courseTags}>
														{c.start_date && <span className={s.tag}>Khai giảng {formatDateOr(c.start_date)}</span>}
														<DeadlineTag date={c.enrollment_end_date} />
													</span>
												</span>
												<span className={s.courseArrow}>
													<ChevRSvg />
												</span>
											</button>
										))}
									</div>
									{visibleCourses.length === 0 && (
										<div className={styles.emptyNotice}>Không có khóa học khớp "{courseQuery}".</div>
									)}
								</>
							)}
							{(errors.course || errors.program) && (
								<div className={`${s.fieldError} ${s.blockError}`}>{errors.course ?? errors.program}</div>
							)}
						</FormSection>
					</div>

					<FormSection
						step={2}
						title='Thông tin học viên'
						description='Dùng để lập hồ sơ học viên và cấp chứng chỉ — vui lòng nhập chính xác.'
					>
						<SubGroup title='Thông tin cá nhân'>
							<div className={styles.formGrid}>
								<CfgField
									cfg={cfg}
									name='full_name'
									htmlFor='f-full_name'
									label='Họ và tên'
									required
									error={errors.full_name}
									className={styles.full}
									classes={COURSE_FIELD}
								>
									<input
										id='f-full_name'
										className={styles.input}
										value={form.full_name}
										onChange={set('full_name')}
										placeholder='VD: Nguyễn Văn An'
										autoComplete='name'
										required
									/>
								</CfgField>
								<CfgField
									cfg={cfg}
									name='national_id'
									htmlFor='f-national_id'
									label='Số CCCD/CMND'
									hint='Cần để tra cứu kết quả và nhận chứng chỉ.'
									error={errors.national_id}
									classes={COURSE_FIELD}
								>
									<input
										id='f-national_id'
										className={styles.input}
										value={form.national_id}
										onChange={set('national_id')}
										placeholder='12 số trên thẻ CCCD'
										inputMode='numeric'
									/>
								</CfgField>
								<CfgField
									cfg={cfg}
									name='dob'
									htmlFor='f-dob'
									label='Ngày sinh'
									forceRequired={!!form.national_id.trim()}
									error={errors.dob}
									classes={COURSE_FIELD}
								>
									<input
										id='f-dob'
										type='date'
										className={styles.input}
										value={form.dob}
										onChange={set('dob')}
									/>
								</CfgField>
								<CfgField
									cfg={cfg}
									name='gender'
									htmlFor='f-gender'
									label='Giới tính'
									error={errors.gender}
									classes={COURSE_FIELD}
								>
									<select
										id='f-gender'
										className={styles.select}
										value={form.gender}
										onChange={set('gender')}
									>
										<option value=''>-- Chọn --</option>
										{allowedOptions(cfg, 'gender', GENDER_OPTIONS).map((o) => (
											<option
												key={o.value}
												value={o.value}
											>
												{o.label}
											</option>
										))}
									</select>
								</CfgField>
								<CfgField
									cfg={cfg}
									name='trainee_type_id'
									htmlFor='f-trainee_type_id'
									label='Đối tượng học viên'
									error={errors.trainee_type_id}
									classes={COURSE_FIELD}
								>
									<select
										id='f-trainee_type_id'
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
								</CfgField>
							</div>
						</SubGroup>

						<SubGroup title='Thông tin liên hệ'>
							<div className={styles.formGrid}>
								<CfgField
									cfg={cfg}
									name='phone'
									htmlFor='f-phone'
									label='Số điện thoại'
									error={errors.phone}
									classes={COURSE_FIELD}
								>
									<input
										id='f-phone'
										className={styles.input}
										type='tel'
										value={form.phone}
										onChange={set('phone')}
										placeholder='VD: 0912345678'
										autoComplete='tel'
									/>
								</CfgField>
								<CfgField
									cfg={cfg}
									name='email'
									htmlFor='f-email'
									label='Email'
									error={errors.email}
									classes={COURSE_FIELD}
								>
									<input
										id='f-email'
										type='email'
										className={styles.input}
										value={form.email}
										onChange={set('email')}
										placeholder='email@example.com'
										autoComplete='email'
									/>
								</CfgField>
								<CfgField
									cfg={cfg}
									name='address'
									htmlFor='f-address'
									label='Địa chỉ'
									error={errors.address}
									className={styles.full}
									classes={COURSE_FIELD}
								>
									<input
										id='f-address'
										className={styles.input}
										value={form.address}
										onChange={set('address')}
										placeholder='Số nhà, đường, xã/phường, tỉnh/thành phố'
										autoComplete='street-address'
									/>
								</CfgField>
							</div>
						</SubGroup>

						{cfg.custom.length > 0 && (
							<SubGroup title='Thông tin bổ sung'>
								<div className={styles.formGrid}>
									<CustomFields
										cfg={cfg}
										value={custom}
										onChange={setCustom}
										errors={errors}
										title={null}
										inputClassName={styles.input}
										classes={COURSE_FIELD}
									/>
								</div>
							</SubGroup>
						)}
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

					<div className={s.submitBar}>
						{serverError && (
							<div
								className={s.serverError}
								role='alert'
							>
								<AlertSvg /> {serverError}
							</div>
						)}
						<div className={s.submitRow}>
							<div id='f-captcha'>
								{captcha.field}
								{captchaError && <span className={s.fieldError}>{captchaError}</span>}
							</div>
							<button
								type='submit'
								className={s.submitBtn}
								disabled={submitting}
							>
								<SendSvg />
								{submitting ? 'Đang gửi...' : 'Gửi đăng ký'}
							</button>
						</div>
						<span className={s.submitNote}>
							Mục có dấu <span className={styles.required}>*</span> là bắt buộc. Thông tin chỉ dùng cho việc xét duyệt
							và quản lý đào tạo.
						</span>
					</div>
				</form>

				<aside
					className={s.summary}
					aria-label='Tóm tắt đăng ký'
				>
					<h2 className={s.summaryTitle}>Tóm tắt đăng ký</h2>
					<dl className={s.summaryList}>
						<div>
							<dt>Khóa học</dt>
							<dd className={course ? '' : s.muted}>{course?.name ?? 'Chưa chọn'}</dd>
						</div>
						{!!course?.programs.length && (
							<div>
								<dt>Chương trình</dt>
								<dd className={program ? '' : s.muted}>{program?.name ?? 'Chưa chọn'}</dd>
							</div>
						)}
						{course?.start_date && (
							<div>
								<dt>Khai giảng</dt>
								<dd>{formatDateOr(course.start_date)}</dd>
							</div>
						)}
						{course?.enrollment_end_date && (
							<div>
								<dt>Hạn đăng ký</dt>
								<dd>{formatDateOr(course.enrollment_end_date)}</dd>
							</div>
						)}
						{!!program?.tuition_fee && (
							<div>
								<dt>Học phí</dt>
								<dd>{Number(program.tuition_fee).toLocaleString('vi-VN')} đ</dd>
							</div>
						)}
						<div>
							<dt>Học viên</dt>
							<dd className={form.full_name.trim() ? '' : s.muted}>{form.full_name.trim() || 'Chưa nhập'}</dd>
						</div>
					</dl>
					<ul className={s.checklist}>
						{steps.map((st) => (
							<li
								key={st.label}
								className={`${s.checkItem} ${st.ok ? s.checkDone : ''}`}
							>
								<span className={s.checkDot}>{st.ok && <CheckSmSvg />}</span>
								{st.label}
							</li>
						))}
					</ul>
				</aside>
			</div>
		</PublicLayout>
	);
}
