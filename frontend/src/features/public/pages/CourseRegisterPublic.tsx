import { useCallback, useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
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
import { StepConfirm } from '../components/courseRegister/StepConfirm';
import { StepCourse } from '../components/courseRegister/StepCourse';
import { StepInfo } from '../components/courseRegister/StepInfo';
import { StepRules } from '../components/courseRegister/StepRules';
import { StepWho } from '../components/courseRegister/StepWho';
import { useCaptcha } from '../hooks/useCaptcha';
import { useEmailOtp } from '../hooks/useEmailOtp';
import {
	EMPTY_FORM,
	buildPayload,
	clearDraft,
	draftHasInput,
	loadDraft,
	saveDraft,
	signatureMatches,
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

// Toàn bộ form nằm trên 1 trang, chia 6 mục đánh số theo thứ tự dưới đây. "Thông tin" và
// "Hồ sơ" chỉ mở khi đã xong "Đối tượng" (nội viện cần xác nhận mã nhân viên để điền sẵn thông
// tin từ hồ sơ nhân sự). Nội quy đặt sát cuối: đọc và cam kết ngay trước khi gửi.
type SectionKey = 'course' | 'who' | 'info' | 'attach' | 'rules' | 'confirm';
const SECTIONS: { key: SectionKey; label: string; desc: string }[] = [
	{ key: 'course', label: 'Chọn khóa học', desc: 'Bấm vào khóa học đang mở đăng ký mà bạn muốn tham gia.' },
	{ key: 'who', label: 'Đối tượng đăng ký', desc: 'Cho chúng tôi biết bạn là nhân viên bệnh viện hay đến từ đơn vị khác.' },
	{ key: 'info', label: 'Thông tin học viên', desc: 'Dùng để lập hồ sơ học viên và cấp chứng chỉ — vui lòng nhập chính xác.' },
	{ key: 'attach', label: 'Hồ sơ đính kèm', desc: 'Đính kèm các giấy tờ (PDF, JPG hoặc PNG).' },
	{ key: 'rules', label: 'Nội quy lớp học', desc: 'Đọc kỹ nội quy rồi xác nhận cam kết thực hiện.' },
	{
		key: 'confirm',
		label: 'Xác nhận và ký',
		desc: 'Xác minh email (nếu được yêu cầu), tích các cam kết, gõ lại họ tên để ký rồi bấm "Gửi đăng ký".',
	},
];
const COUNT = SECTIONS.length;
const indexOf = (key: SectionKey) => SECTIONS.findIndex((x) => x.key === key);
const sectionOf = (key: SectionKey) => SECTIONS[indexOf(key)];
const secId = (i: number) => `sec-${i}`;

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

// Khóa lỗi → id phần tử: ô thường f-<khóa>, trường tùy chỉnh cf-<khóa>
const idFor = (key: string) => {
	if (key === 'staff') return 'f-staff_number';
	if (key === 'program') return 'f-course';
	return document.getElementById(`f-${key}`) ? `f-${key}` : `cf-${key}`;
};

function Section({ index, title, desc, done, children }: { index: number; title: string; desc: string; done: boolean; children: ReactNode }) {
	return (
		<section
			id={secId(index)}
			className={s.panel}
			aria-labelledby={`${secId(index)}-title`}
		>
			<header className={s.panelHead}>
				<span
					className={`${s.secNum} ${done ? s.secNumDone : ''}`}
					aria-hidden='true'
				>
					{done ? <CheckSmSvg /> : index + 1}
				</span>
				<div className={s.panelHeadText}>
					<h2
						id={`${secId(index)}-title`}
						tabIndex={-1}
						className={s.panelTitle}
					>
						{title}
						{done && <span className={s.srOnly}> (đã xong)</span>}
					</h2>
					<p className={s.panelDesc}>{desc}</p>
				</div>
			</header>
			{children}
		</section>
	);
}

export default function CourseRegisterPublic() {
	const [params, setParams] = useSearchParams();
	// Bản nháp: chỉ khôi phục khi link không trỏ tới khóa khác
	const [draft] = useState(() => {
		const d = loadDraft();
		const wanted = params.get(COURSE_PARAM);
		return d && draftHasInput(d) && (!wanted || wanted === d.courseId) ? d : null;
	});
	const [restored, setRestored] = useState(!!draft);

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
	const [submitting, setSubmitting] = useState(false);
	const [errorsState, setErrors] = useState<Errors>({});
	const [serverError, setServerError] = useState('');
	const [done, setDone] = useState<RegisterDone | null>(null);
	// Nhãn / bắt buộc / giới hạn / trường tùy chỉnh theo Cấu hình form
	const cfg = useFormConfig('course_registration', 'public');
	const [custom, setCustomState] = useState<CustomValues>(draft?.custom ?? {});
	const [focusTick, setFocusTick] = useState(0);

	// Đã tích ô xác nhận thì không hiện lỗi captcha cũ nữa
	const errors: Errors = captcha.payload && errorsState.captcha ? { ...errorsState, captcha: undefined } : errorsState;
	const course = courses.find((c) => c.id === courseId);
	const program = course?.programs.find((p) => p.id === programId);
	const courseReady = !!course && (!course.programs.length || !!program);
	const internal = form.source === 'internal';
	const staffOk = internal && staffMatches(staff, form);
	// Mục 4–5 mở khi đã chọn đối tượng (nội viện: đã xác nhận mã nhân viên)
	const whoReady = !!form.source && (!internal || staffOk);
	// Phòng Đào tạo bật/tắt ở trang Khóa học (hoặc Cấu hình hệ thống); chưa tải được thì coi như bật
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
					// Khóa trong bản nháp đã đóng: chọn lại khóa, giữ nguyên chữ đã nhập
					setCourseId('');
					setProgramId('');
				}
				if (drafted) {
					const pid = draft?.programId && drafted.programs.some((p) => p.id === draft.programId) ? draft.programId : autoProgram(drafted);
					choose(drafted, pid, t);
					return;
				}
				const initial = linked ?? (c.length === 1 && !wanted ? c[0] : null);
				if (initial) choose(initial, autoProgram(initial), t);
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
		const t = window.setTimeout(() => saveDraft({ courseId, programId, form, custom, staff }), 400);
		return () => window.clearTimeout(t);
	}, [done, courseId, programId, form, custom, staff]);

	// ─── Kiểm tra & báo lỗi ───────────────────────────────────────────────────

	// Sau khi báo lỗi: tới ô lỗi đầu tiên theo thứ tự trên trang
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

	const fail = (errs: Errors) => {
		setErrors(errs);
		setFocusTick((t) => t + 1);
	};

	/** Lỗi của 1 mục (rỗng = hợp lệ) */
	const sectionErrors = (key: SectionKey): Errors => {
		const e: Errors = {};
		if (key === 'course') {
			if (!courseId) e.course = 'Vui lòng chọn khóa học muốn đăng ký';
			else if (course?.programs.length && !programId) e.program = 'Vui lòng chọn 1 chương trình trong khóa';
		} else if (key === 'rules') {
			if (!rules) e.rules = 'Chưa tải được nội quy, vui lòng thử lại';
			else if (!form.rules_accepted) e.rules = 'Bạn cần xác nhận đã đọc và cam kết thực hiện nội quy';
		} else if (key === 'who') {
			if (!form.source) e.source = 'Vui lòng chọn nội viện hoặc ngoại viện';
			else if (form.source === 'internal' && !staffOk)
				e.staff = form.staff_number.trim() && form.full_name.trim()
					? 'Bấm "Kiểm tra" để xác nhận mã nhân viên và họ tên'
					: 'Vui lòng nhập mã nhân viên và họ tên';
		} else if (key === 'info') {
			Object.assign(e, validateInfo(cfg, form, custom));
		} else if (key === 'attach') {
			if (!rules) e.attachments = 'Chưa tải được danh sách hồ sơ, vui lòng thử lại';
			else
				for (const k of rules.attachments.kinds[form.source as RegistrationSource] ?? [])
					if (k.required && !attachments[k.key]) e[`file_${k.key}`] = `Vui lòng đính kèm ${k.label.toLowerCase()}`;
		} else if (key === 'confirm') {
			if (otpRequired && !otp.verifiedFor(form.email)) e.email_otp = 'Vui lòng xác minh email trước khi gửi đăng ký';
			if (!form.declared_true) e.declared_true = 'Bạn cần xác nhận cam kết thông tin đúng sự thật để gửi đăng ký';
			if (!form.data_consent) e.data_consent = 'Bạn cần đồng ý cho Bệnh viện xử lý dữ liệu cá nhân để xét duyệt đăng ký';
			const signAs = form.source === 'internal' && staffOk && staff ? staff.info.full_name : form.full_name;
			if (!form.signature_name.trim()) e.signature_name = 'Vui lòng gõ lại họ và tên để ký xác nhận';
			else if (!signatureMatches(form.signature_name, signAs))
				e.signature_name = 'Họ tên ký xác nhận phải trùng với họ tên đã khai';
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
		clearError('staff');
		try {
			const info = await checkRegistrationStaff(sn, name);
			setStaff({ staff_number: sn, full_name: info.full_name, info });
			// Dùng đúng họ tên trong hồ sơ nhân sự cho các mục sau
			setForm((f) => ({ ...f, full_name: info.full_name }));
		} catch (err) {
			setStaff(null);
			setStaffError(err instanceof Error ? err.message : 'Không kiểm tra được, vui lòng thử lại');
		} finally {
			setCheckingStaff(false);
		}
	};

	// Bấm mục ở cột tóm tắt: cuộn tới mục đó, đưa focus về tiêu đề (bàn phím / đọc màn hình)
	const scrollToSection = (i: number) => {
		document.getElementById(secId(i))?.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
		document.getElementById(`${secId(i)}-title`)?.focus({ preventScroll: true });
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
		// Kiểm mọi mục một lượt; "Thông tin" / "Hồ sơ" chưa mở thì lỗi của mục "Đối tượng" đã đủ chỉ chỗ cần làm
		const all: Errors = {};
		for (const { key } of SECTIONS) if (whoReady || (key !== 'info' && key !== 'attach')) Object.assign(all, sectionErrors(key));
		if (Object.keys(all).length) return fail(all);
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
				proposalAttached: !!attachments.proposal_approved,
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
		if (!submitting) void submit();
	};

	// Form dài: Enter trong ô nhập không được gửi cả trang (chỉ nút "Gửi đăng ký" mới gửi)
	const blockEnterSubmit = (e: React.KeyboardEvent<HTMLFormElement>) => {
		const t = e.target as HTMLElement;
		if (e.key === 'Enter' && t instanceof HTMLInputElement && !['submit', 'button', 'checkbox', 'radio'].includes(t.type)) e.preventDefault();
	};

	const restart = () => {
		clearDraft();
		setDone(null);
		setAttachments({});
		setErrors({});
		setServerError('');
		setStaffError('');
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
		pickCourse(null);
	};

	const changeSource = (source: RegistrationSource) => {
		setForm((f) => ({ ...f, source }));
		// Hồ sơ theo từng đối tượng — đổi đối tượng thì bỏ file đã chọn
		setAttachments({});
		clearError('source', 'staff');
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

	const doneBy: Record<SectionKey, boolean> = {
		course: courseReady,
		who: whoReady,
		info: whoReady && !Object.keys(sectionErrors('info')).length,
		attach: whoReady && !!rules && !Object.keys(sectionErrors('attach')).length,
		rules: form.rules_accepted,
		confirm: !Object.keys(sectionErrors('confirm')).length,
	};
	const sectionDone = SECTIONS.map((x) => doneBy[x.key]);
	const doneCount = sectionDone.filter(Boolean).length;
	const sec = (key: SectionKey) => ({
		index: indexOf(key),
		title: sectionOf(key).label,
		desc: sectionOf(key).desc,
		done: doneBy[key],
	});
	// Mục chưa xong đầu tiên — tô đậm ở cột tóm tắt
	const nextIndex = sectionDone.findIndex((d) => !d);
	const errorCount = Object.values(errors).filter(Boolean).length;
	const courseDesc = course
		? course.programs.length > 1
			? 'Khóa học có nhiều chương trình — chọn 1 chương trình bạn muốn theo học.'
			: 'Kiểm tra thông tin khóa học đã chọn.'
		: sectionOf('course').desc;
	const lockedNote = (
		<div className={s.note}>
			Hoàn tất mục {indexOf('who') + 1} «{sectionOf('who').label}» để điền tiếp phần này
			{form.source === 'internal' ? ' (bấm "Kiểm tra" để xác nhận mã nhân viên).' : '.'}
		</div>
	);

	return (
		<PublicLayout
			bare
			title='Đăng ký khóa học đào tạo'
			subtitle='Điền các mục trên cùng một trang rồi bấm "Gửi đăng ký". Thông tin bạn nhập được giữ lại nếu lỡ tải lại trang.'
		>
			<div className={s.layout}>
				<form
					onSubmit={handleSubmit}
					onKeyDown={blockEnterSubmit}
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

					<div className={s.stepTop}>
						<div className={s.stepCount}>
							Đã xong {doneCount} / {COUNT} mục
						</div>
						<div
							className={s.progress}
							role='progressbar'
							aria-label='Tiến độ đăng ký'
							aria-valuemin={0}
							aria-valuemax={COUNT}
							aria-valuenow={doneCount}
							aria-valuetext={`Đã xong ${doneCount} trên ${COUNT} mục`}
						>
							<div
								className={s.progressBar}
								style={{ width: `${(doneCount / COUNT) * 100}%` }}
							/>
						</div>
					</div>

					{restored && (
						<div
							className={s.restoreNotice}
							role='status'
						>
							<span>
								Đã khôi phục thông tin bạn nhập dở trước khi tải lại trang. File đính kèm không được giữ lại — vui lòng chọn lại ở
								mục "Hồ sơ đính kèm".
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

					<RegisterProvider value={{ cfg, form, errors, setField, traineeTypes }}>
						<div className={s.sections}>
							<Section
								{...sec('course')}
								title={course ? 'Khóa học & chương trình' : sectionOf('course').label}
								desc={courseDesc}
							>
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
							</Section>

							<Section {...sec('who')}>
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
							</Section>

							<Section {...sec('info')}>
								{whoReady ? (
									<StepInfo
										staff={staffOk ? staff : null}
										idIssuePlaces={rules?.id_issue_places ?? []}
										custom={custom}
										onCustom={setCustom}
										invoiceOpen={invoiceOpen}
										onInvoiceOpen={setInvoiceOpen}
									/>
								) : (
									lockedNote
								)}
							</Section>

							<Section {...sec('attach')}>
								{!whoReady ? (
									lockedNote
								) : !rules ? (
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
								) : (
									<>
										{internal && !courseReady && (
											<div className={s.note}>
												Chọn khóa học ở mục {indexOf('course') + 1} để tải tờ trình đã điền sẵn thông tin của bạn.
											</div>
										)}
										<StepAttach
											source={form.source as RegistrationSource}
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
												staffOk && staff && courseReady
													? {
															course_id: courseId,
															program_id: programId || undefined,
															staff_number: staff.staff_number,
															full_name: staff.info.full_name,
															dob: form.dob || undefined,
														}
													: undefined
											}
										/>
									</>
								)}
							</Section>

							<Section {...sec('rules')}>
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
							</Section>

							<Section
								{...sec('confirm')}
								desc={otpRequired ? sectionOf('confirm').desc : 'Tích các cam kết, gõ lại họ tên để ký rồi bấm "Gửi đăng ký".'}
							>
								<StepConfirm
									form={form}
									staff={staffOk ? staff : null}
									otp={otp}
									otpRequired={otpRequired}
									captchaField={captcha.field}
									captchaReady={!!captcha.payload}
									onSendOtp={() => void sendOtp()}
									consent={rules?.consent ?? null}
									onChange={(patch) => {
										setForm((f) => ({ ...f, ...patch }));
										clearError(...Object.keys(patch));
									}}
									errors={errors}
								/>
							</Section>
						</div>
					</RegisterProvider>

					<div className={s.actionBar}>
						{serverError && (
							<div
								className={s.serverError}
								role='alert'
							>
								<AlertSvg /> {serverError}
							</div>
						)}
						{!serverError && errorCount > 0 && (
							<div
								className={s.errorSummary}
								role='alert'
							>
								<AlertSvg /> Còn {errorCount} mục chưa đúng. Các ô có chữ đỏ cần được sửa.
							</div>
						)}
						<div className={s.actionRow}>
							<span className={s.submitNote}>
								Mục có dấu <span className={styles.required}>*</span> là bắt buộc.
							</span>
							<button
								type='submit'
								className={s.submitBtn}
								disabled={submitting}
							>
								<SendSvg />
								{submitting ? 'Đang gửi...' : 'Gửi đăng ký'}
							</button>
						</div>
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
						{SECTIONS.map((st, i) => {
							const ok = sectionDone[i];
							return (
								<li
									key={st.label}
									className={`${s.checkItem} ${ok ? s.checkDone : ''} ${i === nextIndex ? s.checkCurrent : ''}`}
								>
									<button
										type='button'
										className={s.checkBtn}
										onClick={() => scrollToSection(i)}
									>
										<span className={s.checkDot}>{ok && <CheckSmSvg />}</span>
										{st.label}
										{ok && <span className={s.srOnly}> (đã xong)</span>}
									</button>
								</li>
							);
						})}
					</ol>
				</aside>
			</div>
		</PublicLayout>
	);
}
