import { useState, type ReactNode } from 'react';
import { CheckCircleSvg, MailSvg } from '@/assets/icons';
import type { CustomValues } from '@/shared/formConfig/types';
import type { FormConfig } from '@/shared/formConfig/useFormConfig';
import { formatDateOr } from '../../../../shared/utils/formatDate';
import { genderLabel } from '../../../../shared/utils/gender';
import type {
	PublicCourse,
	PublicProgram,
	RegistrationFileKind,
	RegistrationFileKindDef,
} from '../../api/publicApi';
import type { useEmailOtp } from '../../hooks/useEmailOtp';
import {
	HOSPITAL,
	INVOICE_KEYS,
	resolveField,
	type InfoKey,
	type InvoiceKey,
	type RegForm,
	type StaffMatch,
} from '../../utils/courseRegisterFields';
import { formatFileSize } from '../../utils/registrationFiles';
import styles from '../../pages/PublicPortal.module.css';
import s from '../../pages/CourseRegisterPublic.module.css';

type Otp = ReturnType<typeof useEmailOtp>;

interface Props {
	cfg: FormConfig;
	course: PublicCourse | undefined;
	program: PublicProgram | undefined;
	form: RegForm;
	custom: CustomValues;
	staff: StaffMatch | null;
	traineeTypes: { id: string; name: string }[];
	attachments: Partial<Record<RegistrationFileKind, File>>;
	/** Các loại hồ sơ của đối tượng đã chọn (từ rules.attachments.kinds) */
	fileKinds: RegistrationFileKindDef[];
	/** Quay về bước n (0-based) để sửa */
	onEdit: (step: number) => void;
	otp: Otp;
	otpRequired: boolean;
	/** Ô captcha — dùng cho cả xin mã email lẫn gửi đăng ký */
	captchaField: ReactNode;
	captchaReady: boolean;
	onSendOtp: () => void;
	onDeclared: (v: boolean) => void;
	errors: Record<string, string | undefined>;
}

function Group({ title, step, onEdit, children }: { title: string; step: number; onEdit: (n: number) => void; children: ReactNode }) {
	return (
		<section className={s.reviewGroup}>
			<header className={s.reviewHead}>
				<h3 className={s.reviewTitle}>{title}</h3>
				<button
					type='button'
					className={s.linkBtn}
					onClick={() => onEdit(step)}
				>
					Sửa
				</button>
			</header>
			<dl className={s.reviewList}>{children}</dl>
		</section>
	);
}

const Row = ({ label, value, empty = 'Chưa nhập' }: { label: string; value: ReactNode; empty?: string }) => (
	<div>
		<dt>{label}</dt>
		<dd className={value ? '' : s.muted}>{value || empty}</dd>
	</div>
);

// Bước 6: xem lại toàn bộ, xác minh email, cam kết, rồi gửi
export function StepReview({
	cfg,
	course,
	program,
	form,
	custom,
	staff,
	traineeTypes,
	attachments,
	fileKinds,
	onEdit,
	otp,
	otpRequired,
	captchaField,
	captchaReady,
	onSendOtp,
	onDeclared,
	errors,
}: Props) {
	const internal = form.source === 'internal';
	const email = form.email.trim();
	const verified = otp.verifiedFor(email);
	const [code, setCode] = useState('');

	const show = (key: InfoKey | InvoiceKey) => resolveField(cfg, key).visible;
	const label = (key: InfoKey | InvoiceKey) => resolveField(cfg, key).label;
	const value = (key: InfoKey): ReactNode => {
		const v = form[key].trim();
		if (!v) return '';
		if (key === 'gender') return genderLabel(v);
		if (key === 'trainee_type_id') return traineeTypes.find((t) => t.id === v)?.name ?? '';
		if (key === 'dob' || key === 'national_id_issued_date') return formatDateOr(v);
		return v;
	};
	const rows = (keys: InfoKey[]) =>
		keys
			.filter((k) => show(k) && !(internal && (k === 'qualification' || k === 'workplace' || k === 'full_name')))
			.map((k) => (
				<Row
					key={k}
					label={label(k)}
					value={value(k)}
				/>
			));
	const invoiceFilled = INVOICE_KEYS.filter((k) => form[k].trim());
	const customRows = cfg.custom
		.map((f) => ({ f, v: custom[f.key] }))
		.filter(({ v }) => v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0));

	const sendTo = internal && staff?.info.email_masked ? `email trong hồ sơ nhân sự của bạn (${staff.info.email_masked})` : email;

	const submitCode = async () => {
		if (code.trim().length !== 6) return otp.setError('Nhập đủ 6 chữ số trong thư');
		if (await otp.verify(code)) setCode('');
	};

	return (
		<>
			<p className={s.reviewLead}>
				Kiểm tra lại các thông tin dưới đây. Nếu chưa đúng, bấm "Sửa" ở từng mục — thông tin bạn đã nhập không bị mất.
			</p>

			<Group
				title='Khóa học'
				step={0}
				onEdit={onEdit}
			>
				<Row
					label='Khóa học'
					value={course?.name}
				/>
				{!!course?.programs.length && (
					<Row
						label='Chương trình'
						value={program?.name}
					/>
				)}
			</Group>

			<Group
				title='Đối tượng'
				step={2}
				onEdit={onEdit}
			>
				<Row
					label='Đăng ký với tư cách'
					value={internal ? 'Nội viện' : 'Ngoại viện'}
				/>
				{internal && staff && (
					<>
						<Row
							label='Mã nhân viên'
							value={staff.staff_number}
						/>
						<Row
							label='Khoa/Phòng/TT'
							value={staff.info.department_name}
						/>
						<Row
							label='Trình độ'
							value={staff.info.qualification}
						/>
						<Row
							label='Cơ quan công tác'
							value={HOSPITAL}
						/>
					</>
				)}
			</Group>

			<Group
				title='Thông tin cá nhân'
				step={3}
				onEdit={onEdit}
			>
				{internal && staff && (
					<Row
						label='Họ và tên'
						value={staff.info.full_name}
					/>
				)}
				{rows(['full_name', 'dob', 'gender', 'ethnicity', 'hometown', 'trainee_type_id'])}
			</Group>
			<Group
				title='Căn cước công dân'
				step={3}
				onEdit={onEdit}
			>
				{rows(['national_id', 'national_id_issued_date', 'national_id_issued_place'])}
			</Group>
			<Group
				title='Liên hệ'
				step={3}
				onEdit={onEdit}
			>
				{rows(['phone', 'email', 'permanent_address', 'address'])}
			</Group>
			<Group
				title='Học vấn, công tác'
				step={3}
				onEdit={onEdit}
			>
				{rows([
					'qualification',
					'graduated_school',
					'graduated_year',
					'graduated_major',
					'degree_number',
					'degree_registry_number',
					'workplace',
					'work_specialty',
					'work_seniority',
				])}
				{customRows.map(({ f, v }) => (
					<Row
						key={f.key}
						label={f.label}
						value={Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'Có' : 'Không') : String(v)}
					/>
				))}
			</Group>
			{!internal && invoiceFilled.length > 0 && (
				<Group
					title='Thông tin xuất hóa đơn'
					step={3}
					onEdit={onEdit}
				>
					{invoiceFilled.map((k) => (
						<Row
							key={k}
							label={label(k)}
							value={form[k]}
						/>
					))}
				</Group>
			)}
			<Group
				title='Hồ sơ đính kèm'
				step={4}
				onEdit={onEdit}
			>
				{fileKinds.map((k) => {
					const file = attachments[k.key];
					return (
						<Row
							key={k.key}
							label={k.label}
							value={file ? `${file.name} · ${formatFileSize(file.size)}` : ''}
							empty='Chưa đính kèm'
						/>
					);
				})}
			</Group>

			{otpRequired && (
				<section
					id='f-email_otp'
					className={s.verify}
					aria-labelledby='verify-title'
				>
					<h3
						id='verify-title'
						className={s.verifyTitle}
					>
						<MailSvg /> Xác minh email
					</h3>
					{verified ? (
						<div
							className={s.verified}
							role='status'
						>
							<CheckCircleSvg />
							<span>
								Đã xác minh {internal && staff?.info.email_masked ? 'email hồ sơ nhân sự ' : 'email '}
								<strong>{internal && staff?.info.email_masked ? staff.info.email_masked : email}</strong>.{' '}
								<button
									type='button'
									className={s.linkBtn}
									onClick={otp.reset}
								>
									Xác minh lại
								</button>
							</span>
						</div>
					) : (
						<>
							<p className={s.verifyText}>
								Để chắc chắn thư xác nhận đến đúng người, hệ thống gửi mã 6 chữ số tới <strong>{sendTo}</strong>.
								{otp.challenge && otp.challenge.email !== email.toLowerCase() && (
									<>
										{' '}
										Bạn vừa đổi email — cần xin mã mới.
									</>
								)}
							</p>
							{otp.challenge && otp.challenge.email === email.toLowerCase() && (
								<div className={s.otpRow}>
									<div className={styles.formGroup}>
										<label
											className={styles.label}
											htmlFor='f-otp-code'
										>
											Mã 6 chữ số
										</label>
										<input
											id='f-otp-code'
											className={`${styles.input} ${s.otpInput}`}
											value={code}
											onChange={(e) => {
												setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
												otp.setError('');
											}}
											onKeyDown={(e) => {
												if (e.key === 'Enter') {
													e.preventDefault();
													void submitCode();
												}
											}}
											inputMode='numeric'
											autoComplete='one-time-code'
											maxLength={6}
											placeholder='••••••'
										/>
										<span className={s.hint}>
											Đã gửi tới {otp.challenge.toMasked}, mã có hiệu lực {otp.challenge.ttlMin} phút. Không thấy thư thì
											xem trong mục thư rác.
										</span>
									</div>
									<button
										type='button'
										className={s.submitBtn}
										onClick={() => void submitCode()}
										disabled={otp.busy === 'verify' || code.length !== 6}
									>
										{otp.busy === 'verify' ? 'Đang kiểm tra...' : 'Xác nhận mã'}
									</button>
								</div>
							)}
							{otp.error && (
								<div
									className={s.fieldError}
									role='alert'
								>
									{otp.error}
								</div>
							)}
							<div className={s.captchaRow}>
								{captchaField}
								<button
									type='button'
									className={s.ghostBtn}
									onClick={onSendOtp}
									disabled={otp.busy === 'send' || !captchaReady || otp.cooldown > 0}
								>
									{otp.busy === 'send'
										? 'Đang gửi...'
										: otp.cooldown > 0
											? `Gửi lại sau ${otp.cooldown} giây`
											: otp.challenge
												? 'Gửi lại mã'
												: 'Gửi mã xác minh'}
								</button>
							</div>
						</>
					)}
					{errors.email_otp && !verified && (
						<div
							className={s.fieldError}
							role='alert'
						>
							{errors.email_otp}
						</div>
					)}
				</section>
			)}

			<label
				id='f-declared_true'
				className={s.agreeRow}
			>
				<input
					type='checkbox'
					className={s.agreeBox}
					checked={form.declared_true}
					onChange={(e) => onDeclared(e.target.checked)}
					aria-invalid={errors.declared_true ? true : undefined}
				/>
				<span>Tôi cam kết các thông tin trên là đúng sự thật và chịu trách nhiệm về thông tin đã khai.</span>
			</label>
			{errors.declared_true && (
				<div
					className={s.fieldError}
					role='alert'
				>
					{errors.declared_true}
				</div>
			)}

			{(!otpRequired || verified) && (
				<div
					id='f-captcha'
					className={s.captchaBlock}
				>
					{captchaField}
					{errors.captcha && (
						<span
							className={s.fieldError}
							role='alert'
						>
							{errors.captcha}
						</span>
					)}
				</div>
			)}
			<p className={s.hint}>
				Thông tin chỉ dùng để xét duyệt đăng ký và lập hồ sơ học viên của khóa học, không dùng vào việc khác.
			</p>
		</>
	);
}
