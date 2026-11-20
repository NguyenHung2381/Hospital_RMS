import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertSvg, CheckSmSvg, SendSvg } from '@/assets/icons';
import type { CustomValues } from '@/shared/formConfig/types';
import { useFormConfig } from '@/shared/formConfig/useFormConfig';
import PublicLayout from '../../../layouts/PublicLayout';
import { formatDateOr } from '../../../shared/utils/formatDate';
import {
	checkRegistrationStaff,
	getCourseRegistrationRules,
	getOpenCourses,
	getTraineeTypes,
	registerCourse,
	type CourseRegistrationRules,
	type PublicCourse,
	type RegistrationFileKind,
	type RegistrationSource,
	type TraineeTypeOption,
} from '../api/publicApi';
import { RegisterProvider } from '../components/courseRegister/registerContext';
import { RegisterSuccess, type RegisterDone } from '../components/courseRegister/RegisterSuccess';
import { StepAttach } from '../components/courseRegister/StepAttach';
import { StepCourse } from '../components/courseRegister/StepCourse';
import { StepInfo } from '../components/courseRegister/StepInfo';
import { StepReview } from '../components/courseRegister/StepReview';
import { StepRules } from '../components/courseRegister/StepRules';
import { StepWho } from '../components/courseRegister/StepWho';
import { useCaptcha } from '../hooks/useCaptcha';
import { useEmailOtp } from '../hooks/useEmailOtp';
import {
	EMPTY_FORM,
	buildDraftPayload,
	buildPayload,
	clearDraft,
	draftHasInput,
	loadDraft,
	saveDraft,
	staffMatches,
	validateInfo,
	type RegForm,
	type StaffMatch,
} from '../utils/courseRegisterFields';
import styles from './PublicPortal.module.css';
import s from './CourseRegisterPublic.module.css';

// Link chia sẻ thẳng tới 1 khóa: /dang-ky-khoa-hoc?khoa=<id>
const COURSE_PARAM = 'khoa';
// Cổng nhân viên dẫn sang với ?doi-tuong=noi-vien
const SOURCE_PARAM = 'doi-tuong';

type Errors = Record<string, string | undefined>;

const STEP_COUNT = 6;
const LAST = STEP_COUNT - 1;
const STEPS = [
	{ label: 'Chọn khóa học', desc: 'Bấm vào khóa học đang mở đăng ký mà bạn muốn tham gia.' },
	{ label: 'Nội quy lớp học', desc: 'Đọc kỹ nội quy rồi xác nhận cam kết thực hiện.' },
	{ label: 'Đối tượng đăng ký', desc: 'Cho chúng tôi biết bạn là nhân viên bệnh viện hay đến từ đơn vị khác.' },
	{ label: 'Thông tin học viên', desc: 'Dùng để lập hồ sơ học viên, in đơn và cấp chứng chỉ — vui lòng nhập chính xác.' },
	{ label: 'Hồ sơ đính kèm', desc: 'Đính kèm đủ các giấy tờ bắt buộc (PDF, JPG hoặc PNG).' },
	{ label: 'Xem lại và gửi', desc: 'Kiểm tra lần cuối, xác minh email và gửi đăng ký.' },
] as const;

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

// Khóa lỗi → id phần tử: ô thường f-<khóa>, trường tùy chỉnh cf-<khóa>
const idFor = (key: string) => {
	if (key === 'staff') return 'f-staff_number';
	if (key === 'program') return 'f-course';
	return document.getElementById(`f-${key}`) ? `f-${key}` : `cf-${key}`;
};

export default function CourseRegisterPublic() {
	const [params, setParams] = useSearchParams();
	// Bản nháp: chỉ khôi phục khi link không trỏ tới khóa khác
	const [draft] = useState(() => {
		const d = loadDraft();
		const wanted = params.get(COURSE_PARAM);
		return d && draftHasInput(d) && (!wanted || wanted === d.courseId) ? d : null;
	});
	const [restored, setRestored] = useState(!!draft);
	const restoredNeedsFiles = !!draft && draft.reached >= 4;

	const [courses, setCourses] = useState<PublicCourse[]>([]);
	const [traineeTypes, setTraineeTypes] = useState<TraineeTypeOption[]>([]);
	const [courseId, setCourseId] = useState(draft?.courseId ?? '');
	const [programId, setProgramId] = useState(draft?.programId ?? '');
	const [courseQuery, setCourseQuery] = useState('');
	const [attachments, setAttachments] = useState<Partial<Record<RegistrationFileKind, File>>>({});
	const captcha = useCaptcha();
	const otp = useEmailOtp();
	const [form, setForm] = useState<RegForm>(() => ({
		...(draft?.form ?? EMPTY_FORM),
		source: draft?.form.source || (params.get(SOURCE_PARAM) === 'noi-vien' ? 'internal' : ''),
	}));
	const [staff, setStaff] = useState<StaffMatch | null>(draft?.staff ?? null);
	const [checkingStaff, setCheckingStaff] = useState(false);
	const [staffError, setStaffError] = useState('');
	const [invoiceOpen, setInvoiceOpen] = useState(
		() => !!draft && ['invoice_org_name', 'invoice_org_address', 'invoice_tax_code', 'invoice_budget_code', 'invoice_email'].some((k) => draft.form[k as keyof RegForm]),
	);
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState('');
	// Link ?khoa=… trỏ tới khóa không còn mở đăng ký (hết hạn, chuyển nội bộ, đã hủy)
	const [linkMissing, setLinkMissing] = useState(false);
	const [rules, setRules] = useState<CourseRegistrationRules | null>(null);
	const [rulesError, setRulesError] = useState('');
	// File đính kèm không bao giờ được lưu: bản nháp đã tới bước ≥ 5 thì về bước "Hồ sơ đính kèm" để chọn lại
	const [step, setStep] = useState(Math.min(draft?.step ?? 0, 4));
	const [reached, setReached] = useState(draft?.reached ?? 0);
	const [submitting, setSubmitting] = useState(false);
	const [errorsState, setErrors] = useState<Errors>({});
	const [serverError, setServerError] = useState('');
	const [done, setDone] = useState<RegisterDone | null>(null);
	// Nhãn / bắt buộc / giới hạn / trường tùy chỉnh theo Cấu hình form
	const cfg = useFormConfig('course_registration', 'public');
	const [custom, setCustomState] = useState<CustomValues>(draft?.custom ?? {});

	const headingRef = useRef<HTMLHeadingElement>(null);
	const topRef = useRef<HTMLDivElement>(null);
	const firstRender = useRef(true);
	const [focusTick, setFocusTick] = useState(0);

	// Đã tích ô xác nhận thì không hiện lỗi captcha cũ nữa
	const errors: Errors = captcha.payload && errorsState.captcha ? { ...errorsState, captcha: undefined } : errorsState;
	const course = courses.find((c) => c.id === courseId);
	const program = course?.programs.find((p) => p.id === programId);
	const internal = form.source === 'internal';
	const staffOk = internal && staffMatches(staff, form);
	const otpRequired = rules?.email_otp_required ?? true;

	const clearError = (...keys: string[]) =>
		setErrors((e) => (keys.some((k) => e[k]) ? { ...e, ...Object.fromEntries(keys.map((k) => [k, undefined])) } : e));

	const setField = useCallback((key: keyof RegForm, value: string) => {
		setForm((f) => ({ ...f, [key]: value }) as RegForm);
		setErrors((e) => {
			const clear = [key as string, ...(['dob', 'gender', 'national_id'].includes(key) ? ['national_id'] : [])];
			return clear.some((k) => e[k]) ? { ...e, ...Object.fromEntries(clear.map((k) => [k, undefined])) } : e;
		});
	}, []);

	const setCustom = (next: CustomValues) => {
		Object.keys(next).forEach((k) => next[k] !== custom[k] && clearError(k));
		setCustomState(next);
	};

	// ─── Chọn khóa / chương trình ─────────────────────────────────────────────

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
		clearError('course', 'program');
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
				// Thứ tự ưu tiên: link ?khoa=… → khóa trong bản nháp → chỉ có đúng 1 khóa đang mở
				const wanted = params.get(COURSE_PARAM);
				const linked = wanted ? c.find((x) => x.id === wanted) : undefined;
				if (wanted && !linked) setLinkMissing(true);
				const drafted = !wanted && draft?.courseId ? c.find((x) => x.id === draft.courseId) : undefined;
				if (draft && !linked && !drafted) {
					// Khóa trong bản nháp đã đóng: chọn lại từ đầu, giữ nguyên chữ đã nhập
					setStep(0);
					setReached(0);
					setCourseId('');
					setProgramId('');
				}
				if (drafted) {
					const pid = draft?.programId && drafted.programs.some((p) => p.id === draft.programId) ? draft.programId : autoProgram(drafted);
					choose(drafted, pid, t);
					return;
				}
				const initial = linked ?? (c.length === 1 && !wanted ? c[0] : null);
				if (initial) {
					const pid = autoProgram(initial);
					choose(initial, pid, t);
					// Từ cổng nhân viên (đã chọn khóa + đối tượng) thì vào thẳng bước nội quy
					const resolved = !initial.programs.length || !!pid;
					if (!draft && linked && resolved && params.get(SOURCE_PARAM) === 'noi-vien') {
						setStep(1);
						setReached(1);
					}
				}
			})
			.catch((err) => setLoadError(err instanceof Error ? err.message : 'Không thể tải dữ liệu'))
			.finally(() => setLoading(false));
		// eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ đọc link / bản nháp lúc mở trang
	}, []);

	// Tăng để tải lại nội quy khi bấm "Thử lại"
	const [rulesTry, setRulesTry] = useState(0);
	useEffect(() => {
		let alive = true;
		getCourseRegistrationRules()
			.then((r) => alive && setRules(r))
			.catch((err) => alive && setRulesError(err instanceof Error ? err.message : 'Không tải được nội quy lớp học'));
		return () => {
			alive = false;
		};
	}, [rulesTry]);
	const loadRules = () => {
		setRulesError('');
		setRulesTry((n) => n + 1);
	};

	// ─── Bản nháp ─────────────────────────────────────────────────────────────

	useEffect(() => {
		if (done) return;
		const t = window.setTimeout(
			() => saveDraft({ courseId, programId, step, reached, form, custom, staff }),
			400,
		);
		return () => window.clearTimeout(t);
	}, [done, courseId, programId, step, reached, form, custom, staff]);

	// ─── Chuyển bước ──────────────────────────────────────────────────────────

	// Đổi bước: đưa focus về tiêu đề bước (bàn phím / đọc màn hình), cuộn lên đầu form
	useEffect(() => {
		if (firstRender.current) {
			firstRender.current = false;
			return;
		}
		headingRef.current?.focus({ preventScroll: true });
		topRef.current?.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
	}, [step]);

	// Sau khi báo lỗi: tới ô lỗi đầu tiên theo thứ tự trên trang (chạy sau effect đổi bước nên ưu tiên hơn)
	useLayoutEffect(() => {
		if (!focusTick) return;
		const els = Object.keys(errors)
			.filter((k) => errors[k])
			.map((k) => document.getElementById(idFor(k)))
			.filter((el): el is HTMLElement => !!el);
		els.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
		const el = els[0];
		if (!el) return;
		const target = el.matches('input,select,textarea,button') ? el : el.querySelector<HTMLElement>('input,select,textarea,button');
		el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
		target?.focus({ preventScroll: true });
		// eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ chạy khi có lượt báo lỗi mới
	}, [focusTick]);

	const fail = (errs: Errors, at?: number) => {
		if (at !== undefined) setStep(at);
		setErrors(errs);
		setFocusTick((t) => t + 1);
	};

	/** Lỗi của 1 bước (rỗng = hợp lệ) */
	const stepErrors = (i: number): Errors => {
		const e: Errors = {};
		if (i === 0) {
			if (!courseId) e.course = 'Vui lòng chọn khóa học muốn đăng ký';
			else if (course?.programs.length && !programId) e.program = 'Vui lòng chọn 1 chương trình trong khóa';
		} else if (i === 1) {
			if (!rules) e.rules = 'Chưa tải được nội quy, vui lòng thử lại';
			else if (!form.rules_accepted) e.rules = 'Bạn cần xác nhận đã đọc và cam kết thực hiện nội quy để tiếp tục';
		} else if (i === 2) {
			if (!form.source) e.source = 'Vui lòng chọn nội viện hoặc ngoại viện';
			else if (form.source === 'internal' && !staffOk)
				e.staff = form.staff_number.trim() && form.full_name.trim()
					? 'Bấm "Kiểm tra" để xác nhận mã nhân viên và họ tên trước khi tiếp tục'
					: 'Vui lòng nhập mã nhân viên và họ tên';
		} else if (i === 3) {
			Object.assign(e, validateInfo(cfg, form, custom));
		} else if (i === 4) {
			if (!rules) e.attachments = 'Chưa tải được danh sách hồ sơ, vui lòng thử lại';
			else
				for (const k of rules.attachments.kinds[form.source as RegistrationSource] ?? [])
					if (k.required && !attachments[k.key]) e[`file_${k.key}`] = `Vui lòng đính kèm ${k.label.toLowerCase()}`;
		} else if (i === LAST) {
			if (otpRequired && !otp.verifiedFor(form.email)) e.email_otp = 'Vui lòng xác minh email trước khi gửi đăng ký';
			if (!form.declared_true) e.declared_true = 'Bạn cần xác nhận cam kết thông tin đúng sự thật để gửi đăng ký';
			if (!captcha.payload) e.captcha = 'Vui lòng tích ô xác nhận trước khi gửi';
		}
		return e;
	};

	const checkStaff = async () => {
		const sn = form.staff_number.trim();
		const name = form.full_name.trim();
		if (!sn || !name) return fail({ staff: 'Vui lòng nhập mã nhân viên và họ tên' });
		setCheckingStaff(true);
		setStaffError('');
		setErrors({});
		try {
			const info = await checkRegistrationStaff(sn, name);
			setStaff({ staff_number: sn, full_name: info.full_name, info });
			// Dùng đúng họ tên trong hồ sơ nhân sự cho các bước sau
			setForm((f) => ({ ...f, full_name: info.full_name }));
		} catch (err) {
			setStaff(null);
			setStaffError(err instanceof Error ? err.message : 'Không kiểm tra được, vui lòng thử lại');
		} finally {
			setCheckingStaff(false);
		}
	};

	const goTo = (i: number) => {
		setServerError('');
		setErrors({});
		setStep(i);
		setReached((r) => Math.max(r, i));
	};

	const goNext = () => {
		setServerError('');
		// Nội viện chưa xác nhận: "Tiếp tục" / Enter trong ô nhập chính là bấm "Kiểm tra"
		if (step === 2 && internal && !staffOk && form.staff_number.trim() && form.full_name.trim()) {
			void checkStaff();
			return;
		}
		const errs = stepErrors(step);
		if (Object.keys(errs).length) return fail(errs);
		goTo(step + 1);
	};

	// ─── Email OTP ────────────────────────────────────────────────────────────

	const sendOtp = async () => {
		if (!captcha.payload) return;
		await otp.send({
			source: form.source as RegistrationSource,
			email: form.email.trim(),
			...(internal && staff ? { staff_number: staff.staff_number, full_name: staff.info.full_name } : {}),
			...captcha.payload,
		});
		// Mã xác nhận chỉ dùng 1 lần (đúng hay sai) — luôn lấy mã mới
		captcha.reload();
	};

	// ─── Gửi đăng ký ──────────────────────────────────────────────────────────

	const submit = async () => {
		setServerError('');
		// Kiểm lại mọi bước: bản nháp khôi phục hoặc cấu hình form có thể đã đổi
		for (let i = 0; i <= LAST; i++) {
			const errs = stepErrors(i);
			if (Object.keys(errs).length) return fail(errs, i);
		}
		const emailToken = otpRequired ? otp.takeToken(form.email) : null;
		if (otpRequired && !emailToken) {
			otp.reset();
			return fail({ email_otp: 'Phiên xác minh email đã hết hạn, vui lòng xác minh lại' });
		}
		if (!captcha.payload || !course) return;

		setSubmitting(true);
		try {
			const payload = buildPayload(cfg, form, staffOk ? staff : null, {
				course_id: courseId,
				program_id: programId || undefined,
				custom,
				email_token: emailToken ?? undefined,
				...captcha.payload,
			});
			// Máy chủ trả cùng 1 hình dạng cho mọi trường hợp (không lộ CCCD / mã nhân viên đã có hay chưa)
			const res = await registerCourse(payload, attachments);
			clearDraft();
			setDone({
				code: res.registration_code,
				downloadToken: res.download_token,
				source: form.source as RegistrationSource,
				name: payload.full_name,
				// Máy chủ chỉ gửi thư xác nhận tới email ĐÃ xác minh (tắt OTP ⇒ không gửi). Nội viện có
				// email trong hồ sơ nhân sự: thư đi tới email đó (đã che), không phải email nhập trên form.
				email: !otpRequired
					? ''
					: form.source === 'internal'
						? (otp.challenge?.toMasked ?? form.email.trim())
						: form.email.trim(),
				course: course.name,
				program: program?.name ?? null,
				start: course.start_date,
			});
			setForm(EMPTY_FORM);
			setCustomState({});
			setAttachments({});
			setStaff(null);
			otp.reset();
			window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
		} catch (err) {
			setServerError(err instanceof Error ? err.message : 'Đăng ký thất bại, vui lòng thử lại');
		} finally {
			captcha.reload();
			setSubmitting(false);
		}
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (submitting) return;
		if (step < LAST) goNext();
		else void submit();
	};

	const restart = () => {
		clearDraft();
		setDone(null);
		setAttachments({});
		setErrors({});
		setServerError('');
		setStaffError('');
		setStep(0);
		setReached(0);
		pickCourse(null);
		window.scrollTo({ top: 0 });
	};

	const discardDraft = () => {
		clearDraft();
		setRestored(false);
		setForm({ ...EMPTY_FORM, source: '' });
		setCustomState({});
		setStaff(null);
		setStaffError('');
		setErrors({});
		setInvoiceOpen(false);
		setAttachments({});
		otp.reset();
		setStep(0);
		setReached(0);
		pickCourse(null);
	};

	const changeSource = (source: RegistrationSource) => {
		setForm((f) => ({ ...f, source }));
		// Hồ sơ theo từng đối tượng — đổi đối tượng thì bỏ file đã chọn
		setAttachments({});
		setErrors({});
		setStaffError('');
	};

	if (done) {
		return (
			<PublicLayout
				bare
				title='Đăng ký khóa học đào tạo'
			>
				<RegisterSuccess
					done={done}
					onRestart={restart}
				/>
			</PublicLayout>
		);
	}

	// ─── Giao diện ────────────────────────────────────────────────────────────

	const stepDone = [
		reached > 0 && !!course && (!course.programs.length || !!program),
		reached > 1 && form.rules_accepted,
		reached > 2 && !!form.source && (!internal || staffOk),
		reached > 3,
		reached > 4 && !Object.keys(stepErrors(4)).length,
		false,
	];
	const errorCount = Object.values(errors).filter(Boolean).length;
	const stepTitle = step === 0 && course ? 'Chọn chương trình' : STEPS[step].label;
	const stepDesc =
		step === 0 && course
			? course.programs.length > 1
				? 'Khóa học có nhiều chương trình — chọn 1 chương trình bạn muốn theo học.'
				: 'Kiểm tra thông tin khóa học trước khi tiếp tục.'
			: STEPS[step].desc;

	return (
		<PublicLayout
			bare
			title='Đăng ký khóa học đào tạo'
			subtitle='Điền lần lượt từng bước. Thông tin bạn nhập được giữ lại nếu lỡ tải lại trang.'
		>
			<div className={s.layout}>
				<form
					onSubmit={handleSubmit}
					noValidate
					className={s.wizard}
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
							onChange={(e) => setField('website', e.target.value)}
						/>
					</div>

					<div
						ref={topRef}
						className={s.stepTop}
					>
						<div className={s.stepCount}>
							Bước {step + 1} / {STEP_COUNT}
						</div>
						<div
							className={s.progress}
							role='progressbar'
							aria-label='Tiến độ đăng ký'
							aria-valuemin={1}
							aria-valuemax={STEP_COUNT}
							aria-valuenow={step + 1}
							aria-valuetext={`Bước ${step + 1} trên ${STEP_COUNT}: ${stepTitle}`}
						>
							<div
								className={s.progressBar}
								style={{ width: `${((step + 1) / STEP_COUNT) * 100}%` }}
							/>
						</div>
					</div>

					{restored && (
						<div
							className={s.restoreNotice}
							role='status'
						>
							<span>
								Đã khôi phục thông tin bạn nhập dở trước khi tải lại trang.
								{restoredNeedsFiles && ' File đính kèm không được giữ lại — vui lòng chọn lại ở bước "Hồ sơ đính kèm".'}
							</span>
							<button
								type='button'
								className={s.linkBtn}
								onClick={discardDraft}
							>
								Xóa và nhập lại từ đầu
							</button>
						</div>
					)}

					<section
						className={s.panel}
						aria-labelledby='step-title'
					>
						<header className={s.panelHead}>
							<h2
								id='step-title'
								ref={headingRef}
								tabIndex={-1}
								className={s.panelTitle}
							>
								{stepTitle}
							</h2>
							<p className={s.panelDesc}>{stepDesc}</p>
						</header>

						{step > 0 && course && (
							<div className={s.courseBar}>
								<span>
									<span className={s.courseBarLabel}>Khóa học:</span> {course.name}
									{program ? ` · ${program.name}` : ''}
								</span>
								<button
									type='button'
									className={s.linkBtn}
									onClick={() => goTo(0)}
								>
									Đổi
								</button>
							</div>
						)}

						<RegisterProvider value={{ cfg, form, errors, setField, traineeTypes }}>
							<div
								key={step}
								className={s.stepPane}
							>
								{step === 0 && (
									<StepCourse
										courses={courses}
										loading={loading}
										loadError={loadError}
										linkMissing={linkMissing}
										course={course}
										programId={programId}
										query={courseQuery}
										onQuery={setCourseQuery}
										onPickCourse={pickCourse}
										onPickProgram={(id) => {
											if (course) choose(course, id);
											clearError('program');
										}}
										error={errors.course ?? errors.program}
									/>
								)}
								{step === 1 && (
									<StepRules
										rules={rules}
										loadError={rulesError}
										onRetry={loadRules}
										accepted={form.rules_accepted}
										onAccept={(v) => {
											setForm((f) => ({ ...f, rules_accepted: v }));
											clearError('rules');
										}}
										error={errors.rules}
									/>
								)}
								{step === 2 && (
									<StepWho
										form={form}
										onSource={changeSource}
										onField={(key, value) => {
											setField(key, value);
											setStaffError('');
											clearError('staff');
										}}
										staff={staff}
										staffOk={staffOk}
										checking={checkingStaff}
										onCheck={() => void checkStaff()}
										staffError={staffError}
										errors={errors}
									/>
								)}
								{step === 3 && (
									<StepInfo
										staff={staffOk ? staff : null}
										idIssuePlaces={rules?.id_issue_places ?? []}
										custom={custom}
										onCustom={setCustom}
										invoiceOpen={invoiceOpen}
										onInvoiceOpen={setInvoiceOpen}
									/>
								)}
								{step === 4 && form.source && !rules && (
									<div
										id='f-attachments'
										className={s.note}
										role={errors.attachments || rulesError ? 'alert' : 'status'}
									>
										{rulesError || errors.attachments || 'Đang tải danh sách hồ sơ...'}{' '}
										{rulesError && (
											<button
												type='button'
												className={s.linkBtn}
												onClick={loadRules}
											>
												Thử lại
											</button>
										)}
									</div>
								)}
								{step === 4 && form.source && rules && (
									<StepAttach
										source={form.source}
										rules={rules.attachments}
										files={attachments}
										onFile={(kind, file) => {
											setAttachments((a) => {
												const next = { ...a };
												if (file) next[kind] = file;
												else delete next[kind];
												return next;
											});
											clearError(`file_${kind}`);
										}}
										errors={errors}
										draft={
											internal && staffOk && staff
												? {
														application: buildDraftPayload(cfg, form, staff, {
															course_id: courseId,
															program_id: programId || undefined,
														}),
														proposal: {
															course_id: courseId,
															program_id: programId || undefined,
															staff_number: staff.staff_number,
															full_name: staff.info.full_name,
															dob: form.dob || undefined,
														},
													}
												: undefined
										}
									/>
								)}
								{step === LAST && (
									<StepReview
										cfg={cfg}
										course={course}
										program={program}
										form={form}
										custom={custom}
										staff={staffOk ? staff : null}
										traineeTypes={traineeTypes}
										attachments={attachments}
										fileKinds={rules?.attachments.kinds[form.source as RegistrationSource] ?? []}
										onEdit={goTo}
										otp={otp}
										otpRequired={otpRequired}
										captchaField={captcha.field}
										captchaReady={!!captcha.payload}
										onSendOtp={() => void sendOtp()}
										onDeclared={(v) => {
											setForm((f) => ({ ...f, declared_true: v }));
											clearError('declared_true');
										}}
										errors={errors}
									/>
								)}
							</div>
						</RegisterProvider>
					</section>

					<div className={s.actionBar}>
						{serverError && (
							<div
								className={s.serverError}
								role='alert'
							>
								<AlertSvg /> {serverError}
							</div>
						)}
						{!serverError && errorCount > 0 && step !== 0 && step !== 1 && step !== 2 && (
							<div
								className={s.errorSummary}
								role='alert'
							>
								<AlertSvg /> Còn {errorCount} mục chưa đúng. Các ô có chữ đỏ cần được sửa.
							</div>
						)}
						<div className={s.actionRow}>
							{step > 0 ? (
								<button
									type='button'
									className={s.ghostBtn}
									onClick={() => goTo(step - 1)}
									disabled={submitting}
								>
									Quay lại
								</button>
							) : (
								<span />
							)}
							{step < LAST ? (
								<button
									type='submit'
									className={s.submitBtn}
									disabled={checkingStaff}
								>
									{checkingStaff ? 'Đang kiểm tra...' : step === 2 && internal && !staffOk ? 'Kiểm tra' : 'Tiếp tục'}
								</button>
							) : (
								<button
									type='submit'
									className={s.submitBtn}
									disabled={submitting}
								>
									<SendSvg />
									{submitting ? 'Đang gửi...' : 'Gửi đăng ký'}
								</button>
							)}
						</div>
						<span className={s.submitNote}>
							Mục có dấu <span className={styles.required}>*</span> là bắt buộc.
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
					<ol className={s.checklist}>
						{STEPS.map((st, i) => {
							const ok = stepDone[i];
							const canGo = i !== step && i <= reached;
							const body = (
								<>
									<span className={s.checkDot}>{ok && <CheckSmSvg />}</span>
									{st.label}
								</>
							);
							return (
								<li
									key={st.label}
									className={`${s.checkItem} ${ok ? s.checkDone : ''} ${i === step ? s.checkCurrent : ''}`}
									aria-current={i === step ? 'step' : undefined}
								>
									{canGo ? (
										<button
											type='button'
											className={s.checkBtn}
											onClick={() => goTo(i)}
										>
											{body}
										</button>
									) : (
										body
									)}
								</li>
							);
						})}
					</ol>
				</aside>
			</div>
		</PublicLayout>
	);
}
