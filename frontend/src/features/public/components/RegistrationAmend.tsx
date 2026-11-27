import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { AlertSvg, EditSvg } from '@/assets/icons';
import type { CustomValues } from '@/shared/formConfig/types';
import { useFormConfig } from '@/shared/formConfig/useFormConfig';
import { formatDateOr } from '../../../shared/utils/formatDate';
import {
	amendRegistration,
	getCourseRegistrationRules,
	getRegistrationDetails,
	getTraineeTypes,
	type AmendPayload,
	type AmendResult,
	type CourseRegistrationRules,
	type RegistrationEditable,
	type RegistrationProof,
	type TraineeTypeOption,
} from '../api/publicApi';
import { useCaptcha } from '../hooks/useCaptcha';
import { useEmailOtp } from '../hooks/useEmailOtp';
import {
	EMPTY_FORM,
	buildPayload,
	changedKeys,
	formFromSnapshot,
	resolveField,
	signatureMatches,
	validateInfo,
	type RegForm,
	type StaffMatch,
} from '../utils/courseRegisterFields';
import { RegisterProvider } from './courseRegister/registerContext';
import { StepConfirm } from './courseRegister/StepConfirm';
import { StepInfo } from './courseRegister/StepInfo';
import styles from '../pages/PublicPortal.module.css';
import s from '../pages/CourseRegisterPublic.module.css';
import r from './RegistrationLookup.module.css';

type Errors = Record<string, string | undefined>;

const IDENTITY_KEYS = new Set(['full_name', 'dob', 'gender', 'national_id']);
const REASON_MIN = 5;
const REASON_MAX = 500;

const sameCustom = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

interface Props {
	code: string;
	/** Yếu tố đã dùng tra cứu (CCCD / download_token) */
	proof: RegistrationProof;
	onSaved: (res: AmendResult, nextProof: RegistrationProof) => void;
	onCancel: () => void;
}

// Người đăng ký tự sửa bản khai khi lượt ghi danh còn chờ duyệt: dùng lại các ô của form đăng ký,
// thêm lý do sửa, xác minh email (nếu bật OTP), 2 cam kết + gõ lại họ tên để ký. Máy chủ lưu bản
// mới + lịch sử trước → sau; hồ sơ học viên không tự đổi.
export function RegistrationAmend({ code, proof, onSaved, onCancel }: Props) {
	const [details, setDetails] = useState<RegistrationEditable | null>(null);
	const [rules, setRules] = useState<CourseRegistrationRules | null>(null);
	const [traineeTypes, setTraineeTypes] = useState<TraineeTypeOption[]>([]);
	const [loadError, setLoadError] = useState('');
	const [original, setOriginal] = useState<RegForm>(EMPTY_FORM);
	const [form, setForm] = useState<RegForm>(EMPTY_FORM);
	const [custom, setCustomState] = useState<CustomValues>({});
	const [reason, setReason] = useState('');
	const [invoiceOpen, setInvoiceOpen] = useState(false);
	const [errorsState, setErrors] = useState<Errors>({});
	const [serverError, setServerError] = useState('');
	const [saving, setSaving] = useState(false);
	const [focusTick, setFocusTick] = useState(0);
	const cfg = useFormConfig('course_registration', 'public');
	const captcha = useCaptcha();
	const otp = useEmailOtp();

	useEffect(() => {
		let alive = true;
		Promise.all([getRegistrationDetails(code, proof), getCourseRegistrationRules(), getTraineeTypes()])
			.then(([d, rl, types]) => {
				if (!alive) return;
				const f = formFromSnapshot(d.source, d.snapshot, d.invoice);
				setDetails(d);
				setRules(rl);
				setTraineeTypes(types);
				setOriginal(f);
				setForm(f);
				setCustomState(d.custom ?? {});
				setInvoiceOpen(Object.values(d.invoice ?? {}).some(Boolean));
			})
			.catch((err) => alive && setLoadError(err instanceof Error ? err.message : 'Không tải được bản đăng ký'));
		return () => {
			alive = false;
		};
	}, [code, proof]);

	const internal = details?.source === 'internal';
	// Nội viện: phần lấy từ hồ sơ nhân sự, dùng cho mục thông tin và nơi nhận OTP
	const staff: StaffMatch | null = useMemo(() => {
		const st = details?.staff;
		if (!st) return null;
		const sn = String(st.staff_number ?? '');
		const name = st.full_name ?? '';
		return {
			staff_number: sn,
			full_name: name,
			info: {
				full_name: name,
				department_id: st.department_id ?? '',
				department_name: st.department_name ?? '',
				qualification: st.qualification,
				email_masked: st.email_masked,
			},
		};
	}, [details]);
	const otpRequired = rules?.email_otp_required ?? true;
	// Đã tích ô xác nhận thì không hiện lỗi captcha cũ nữa
	const errors: Errors = captcha.payload && errorsState.captcha ? { ...errorsState, captcha: undefined } : errorsState;

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

	// Các mục đã đổi (nhãn theo Cấu hình form) — hiện cho người dùng xem lại trước khi ký
	const changed = useMemo(() => {
		if (!details) return [];
		const core = changedKeys(original, form).map((k) => ({ key: k as string, label: resolveField(cfg, k).label }));
		const base = details.custom ?? {};
		const customKeys = [...new Set([...Object.keys(base), ...Object.keys(custom)])].filter((k) => !sameCustom(base[k], custom[k]));
		return [...core, ...customKeys.map((k) => ({ key: k, label: cfg.custom.find((f) => f.key === k)?.label ?? k }))];
	}, [details, original, form, custom, cfg]);
	const identityChanged = changed.some((c) => IDENTITY_KEYS.has(c.key));

	useLayoutEffect(() => {
		if (!focusTick) return;
		const el = Object.keys(errors)
			.filter((k) => errors[k])
			.map((k) => document.getElementById(`f-${k}`) ?? document.getElementById(`cf-${k}`))
			.filter((x): x is HTMLElement => !!x)
			.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))[0];
		if (!el) return;
		el.scrollIntoView({ block: 'center' });
		(el.matches('input,select,textarea') ? el : el.querySelector<HTMLElement>('input,select,textarea'))?.focus({ preventScroll: true });
		// eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ chạy khi có lượt báo lỗi mới
	}, [focusTick]);

	if (loadError)
		return (
			<div
				className={`${styles.alertBox} ${styles.alertError}`}
				role='alert'
			>
				<AlertSvg /> {loadError}
			</div>
		);
	if (!details || !rules) return <p className={s.muted}>Đang tải bản đăng ký...</p>;
	if (!details.can_edit)
		return (
			<div className={r.amendClosed}>
				<p>{details.closed_reason}</p>
				<button
					type='button'
					className={s.ghostBtn}
					onClick={onCancel}
				>
					Đóng
				</button>
			</div>
		);

	const signAs = internal ? (staff?.full_name ?? '') : form.full_name;

	const validate = (): Errors => {
		const e: Errors = { ...validateInfo(cfg, form, custom) };
		const rs = reason.trim();
		if (rs.length < REASON_MIN) e.reason = 'Vui lòng ghi lý do sửa (ít nhất 5 ký tự)';
		if (otpRequired && !otp.verifiedFor(form.email)) e.email_otp = 'Vui lòng xác minh email trước khi gửi bản sửa';
		if (!form.declared_true) e.declared_true = 'Bạn cần cam kết thông tin sau khi sửa là đúng sự thật';
		if (!form.data_consent) e.data_consent = 'Bạn cần đồng ý cho Bệnh viện xử lý dữ liệu cá nhân';
		if (!form.signature_name.trim()) e.signature_name = 'Vui lòng gõ lại họ và tên để ký xác nhận';
		else if (!signatureMatches(form.signature_name, signAs)) e.signature_name = 'Họ tên ký xác nhận phải trùng với họ tên trên bản đăng ký';
		if (!captcha.payload) e.captcha = 'Vui lòng tích ô xác nhận trước khi gửi';
		return e;
	};

	const sendOtp = async () => {
		if (!captcha.payload) return;
		await otp.send({
			source: details.source,
			email: form.email.trim(),
			...(internal && staff ? { staff_number: staff.staff_number, full_name: staff.full_name } : {}),
			...captcha.payload,
		});
		captcha.reload();
	};

	const save = async () => {
		setServerError('');
		if (!changed.length) return setServerError('Bạn chưa thay đổi thông tin nào so với bản đã gửi.');
		const errs = validate();
		if (Object.values(errs).some(Boolean)) {
			setErrors(errs);
			setFocusTick((t) => t + 1);
			return;
		}
		const emailToken = otpRequired ? otp.takeToken(form.email) : null;
		if (otpRequired && !emailToken) {
			otp.reset();
			setErrors({ email_otp: 'Phiên xác minh email đã hết hạn, vui lòng xác minh lại' });
			return setFocusTick((t) => t + 1);
		}
		if (!captcha.payload) return;
		setSaving(true);
		try {
			const base: Record<string, unknown> = {
				...buildPayload(cfg, form, staff, { course_id: '', custom, email_token: emailToken ?? undefined, ...captcha.payload }),
			};
			for (const k of ['course_id', 'program_id', 'rules_accepted', 'website']) delete base[k];
			const access: AmendPayload['access'] =
				'download_token' in proof ? { download_token: proof.download_token } : { national_id: 'national_id' in proof ? proof.national_id : '' };
			const res = await amendRegistration(code, { ...(base as Omit<AmendPayload, 'access' | 'reason'>), access, reason: reason.trim() });
			// Vừa sửa CCCD ⇒ lần tra cứu / nộp hồ sơ sau dùng CCCD mới
			const nextProof: RegistrationProof =
				'national_id' in proof && res.fields.includes('national_id') ? { national_id: form.national_id.trim() } : proof;
			otp.reset();
			onSaved(res, nextProof);
		} catch (err) {
			setServerError(err instanceof Error ? err.message : 'Lưu bản sửa thất bại, vui lòng thử lại');
		} finally {
			captcha.reload();
			setSaving(false);
		}
	};

	return (
		<section
			className={r.amend}
			aria-labelledby='amend-title'
		>
			<header className={r.amendHead}>
				<h3
					id='amend-title'
					className={r.amendTitle}
				>
					<EditSvg aria-hidden='true' /> Sửa thông tin đã khai
				</h3>
				<p className={s.hint}>
					Sửa được khi đăng ký còn chờ duyệt (còn {details.amendments_left} lần). Bản gốc và từng lần sửa đều được lưu lại để
					Phòng Đào tạo đối chiếu. Muốn thay giấy tờ đính kèm, dùng mục "Hồ sơ đính kèm" ở trên.
				</p>
				{details.amendments.length > 0 && (
					<ul className={r.amendHistory}>
						{details.amendments.map((a) => (
							<li key={a.seq}>
								Lần {a.seq} · {formatDateOr(a.created_at)} — {a.reason}
							</li>
						))}
					</ul>
				)}
			</header>

			{internal && staff && (
				<dl className={r.facts}>
					<div>
						<dt>Họ và tên</dt>
						<dd>{staff.full_name}</dd>
					</div>
					<div>
						<dt>Mã nhân viên · Khoa/phòng</dt>
						<dd>
							{staff.staff_number}
							{staff.info.department_name ? ` · ${staff.info.department_name}` : ''}
						</dd>
					</div>
				</dl>
			)}

			<RegisterProvider value={{ cfg, form, errors, setField, traineeTypes }}>
				<StepInfo
					fromAccount={false}
					staff={staff}
					idIssuePlaces={rules.id_issue_places}
					custom={custom}
					onCustom={setCustom}
					invoiceOpen={invoiceOpen}
					onInvoiceOpen={setInvoiceOpen}
				/>
			</RegisterProvider>

			<div className={r.amendBlock}>
				<label
					className={styles.label}
					htmlFor='f-reason'
				>
					Lý do sửa <span className={styles.required}>*</span>
				</label>
				<textarea
					id='f-reason'
					className={styles.textarea}
					rows={2}
					maxLength={REASON_MAX}
					value={reason}
					onChange={(e) => {
						setReason(e.target.value);
						clearError('reason');
					}}
					placeholder='VD: Gõ nhầm số CCCD, đổi số điện thoại liên hệ...'
					aria-invalid={errors.reason ? true : undefined}
				/>
				{errors.reason && (
					<span
						className={s.fieldError}
						role='alert'
					>
						{errors.reason}
					</span>
				)}
			</div>

			<div
				className={`${r.changeBox} ${identityChanged ? r.changeBoxWarn : ''}`}
				aria-live='polite'
			>
				{changed.length ? (
					<>
						<strong>Mục sẽ sửa ({changed.length}):</strong> {changed.map((c) => c.label).join(', ')}.
						{identityChanged && (
							<p className={r.changeWarn}>
								Bạn đang sửa thông tin định danh (họ tên, ngày sinh, giới tính hoặc số CCCD). Phòng Đào tạo sẽ đối chiếu lại với
								giấy tờ trước khi duyệt.
							</p>
						)}
					</>
				) : (
					'Chưa có mục nào thay đổi — sửa các ô ở trên rồi ký xác nhận bên dưới.'
				)}
			</div>

			<StepConfirm
				form={{ ...form, full_name: signAs }}
				staff={staff}
				otp={otp}
				otpRequired={otpRequired}
				captchaField={captcha.field}
				captchaReady={!!captcha.payload}
				onSendOtp={() => void sendOtp()}
				consent={rules.consent}
				onChange={(patch) => {
					setForm((f) => ({ ...f, ...patch }));
					clearError(...Object.keys(patch));
				}}
				errors={errors}
			/>

			{serverError && (
				<div
					className={`${styles.alertBox} ${styles.alertError} ${r.amendError}`}
					role='alert'
				>
					<AlertSvg /> {serverError}
				</div>
			)}
			<div className={r.amendActions}>
				<button
					type='button'
					className={s.ghostBtn}
					onClick={onCancel}
					disabled={saving}
				>
					Hủy
				</button>
				<button
					type='button'
					className={s.submitBtn}
					onClick={() => void save()}
					disabled={saving}
				>
					{saving ? 'Đang lưu...' : 'Ký và lưu bản sửa'}
				</button>
			</div>
		</section>
	);
}
