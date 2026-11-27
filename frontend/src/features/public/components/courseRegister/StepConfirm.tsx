import { useState, type ReactNode } from 'react';
import { CheckCircleSvg, EditSvg, MailSvg, ShieldSvg } from '@/assets/icons';
import type { RegistrationConsentText } from '../../api/publicApi';
import type { useEmailOtp } from '../../hooks/useEmailOtp';
import { signatureMatches, type RegForm, type StaffMatch } from '../../utils/courseRegisterFields';
import styles from '../../pages/PublicPortal.module.css';
import s from '../../pages/CourseRegisterPublic.module.css';

type Otp = ReturnType<typeof useEmailOtp>;

interface Props {
	form: RegForm;
	staff: StaffMatch | null;
	otp: Otp;
	/** Phòng Đào tạo bật "Gửi mã OTP xác nhận về email" (Cấu hình TRAINING_REGISTRATION_EMAIL_OTP) */
	otpRequired: boolean;
	/** Ô captcha — dùng cho cả xin mã email lẫn gửi đăng ký */
	captchaField: ReactNode;
	captchaReady: boolean;
	onSendOtp: () => void;
	/** Nguyên văn câu cam kết từ máy chủ (null = chưa tải được nội quy) */
	consent: RegistrationConsentText | null;
	onChange: (patch: Partial<Pick<RegForm, 'declared_true' | 'data_consent' | 'signature_name'>>) => void;
	errors: Record<string, string | undefined>;
}

const today = () => new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

// Mục cuối của trang: xác minh email (nếu bật OTP), 2 cam kết (thông tin đúng sự thật, đồng ý xử lý
// dữ liệu cá nhân), ký xác nhận bằng cách gõ lại họ tên, captcha. Câu cam kết lấy nguyên văn từ máy
// chủ — đúng câu sẽ lưu vào bản ghi xác nhận điện tử.
export function StepConfirm({
	form,
	staff,
	otp,
	otpRequired,
	captchaField,
	captchaReady,
	onSendOtp,
	consent,
	onChange,
	errors,
}: Props) {
	const internal = form.source === 'internal';
	const email = form.email.trim();
	const verified = otp.verifiedFor(email);
	const [code, setCode] = useState('');
	// Nội viện có email trong hồ sơ nhân sự: mã gửi tới email đó (đã che), không phải email trên form
	const profileEmail = internal ? staff?.info.email_masked : undefined;
	const sendTo = profileEmail ? `email trong hồ sơ nhân sự của bạn (${profileEmail})` : email;

	// Nội viện: họ tên lấy theo hồ sơ nhân sự (đã điền vào form sau khi kiểm tra mã NV)
	const fullName = (internal && staff ? staff.info.full_name : form.full_name).trim();
	const signed = signatureMatches(form.signature_name, fullName);

	const submitCode = async () => {
		if (code.trim().length !== 6) return otp.setError('Nhập đủ 6 chữ số trong thư');
		if (await otp.verify(code)) setCode('');
	};

	return (
		<>
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
								Đã xác minh {profileEmail ? 'email hồ sơ nhân sự ' : 'email '}
								<strong>{profileEmail ?? email}</strong>.{' '}
								<button
									type='button'
									className={s.linkBtn}
									onClick={otp.reset}
								>
									Xác minh lại
								</button>
							</span>
						</div>
					) : !email && !profileEmail ? (
						<p className={s.verifyText}>Nhập email ở mục "Thông tin học viên" để nhận mã xác minh 6 chữ số.</p>
					) : (
						<>
							<p className={s.verifyText}>
								Để chắc chắn thư xác nhận đến đúng người, hệ thống gửi mã 6 chữ số tới <strong>{sendTo}</strong>.
								{otp.challenge && otp.challenge.email !== email.toLowerCase() && <> Bạn vừa đổi email — cần xin mã mới.</>}
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

			<Agree
				id='f-declared_true'
				checked={form.declared_true}
				onChange={(v) => onChange({ declared_true: v })}
				text={consent?.commitments.declared ?? 'Tôi cam đoan các thông tin đã khai là đúng sự thật.'}
				error={errors.declared_true}
			/>
			<Agree
				id='f-data_consent'
				checked={form.data_consent}
				onChange={(v) => onChange({ data_consent: v })}
				text={consent?.commitments.data ?? 'Tôi đồng ý để Bệnh viện xử lý dữ liệu cá nhân đã khai để xét duyệt đăng ký.'}
				error={errors.data_consent}
			/>

			<section
				className={s.signBlock}
				aria-labelledby='sign-title'
			>
				<h3
					id='sign-title'
					className={s.signTitle}
				>
					<EditSvg aria-hidden='true' /> Ký xác nhận
				</h3>
				<div className={s.signGrid}>
					<div className={styles.formGroup}>
						<label
							className={styles.label}
							htmlFor='f-signature_name'
						>
							Gõ lại họ và tên của bạn <span className={styles.required}>*</span>
						</label>
						<input
							id='f-signature_name'
							aria-required='true'
							className={`${styles.input} ${s.signInput}`}
							value={form.signature_name}
							onChange={(e) => onChange({ signature_name: e.target.value })}
							placeholder={fullName || 'Họ và tên'}
							autoComplete='off'
							spellCheck={false}
							maxLength={150}
							aria-required='true'
							aria-invalid={errors.signature_name ? true : undefined}
							aria-describedby='sign-note'
						/>
						{signed ? (
							<span className={s.signOk}>
								<CheckCircleSvg aria-hidden='true' /> Khớp họ tên đã khai
							</span>
						) : (
							<span className={s.hint}>
								Phải trùng họ tên đã khai{fullName ? `: ${fullName}` : ''} (không phân biệt hoa thường).
							</span>
						)}
						{errors.signature_name && (
							<span
								className={s.fieldError}
								role='alert'
							>
								{errors.signature_name}
							</span>
						)}
					</div>
					<div className={styles.formGroup}>
						<span className={styles.label}>Ngày ký</span>
						<input
							className={styles.input}
							value={today()}
							readOnly
							tabIndex={-1}
							aria-label='Ngày ký'
						/>
						<span className={s.hint}>Ghi theo giờ máy chủ khi bấm "Gửi đăng ký".</span>
					</div>
				</div>
				<p
					id='sign-note'
					className={s.signNote}
				>
					{consent?.signature_note ??
						'Tích chọn các cam kết và gõ lại đúng họ tên là cách bạn ký xác nhận bản đăng ký điện tử này.'}
					{otpRequired && ' Mã xác nhận của bản ký được gửi kèm thư xác nhận đăng ký để bạn lưu giữ.'}
				</p>
			</section>

			{/* Captcha chỉ hiện 1 chỗ: trong khung xác minh email khi còn cần xin mã, ngược lại ở đây */}
			{(!otpRequired || verified || (!email && !profileEmail)) && (
				<section
					id='f-captcha'
					className={`${s.finalBlock} ${errors.captcha ? s.finalBlockError : ''}`}
					aria-labelledby='final-title'
				>
					<div className={s.finalText}>
						<h3
							id='final-title'
							className={s.signTitle}
						>
							<ShieldSvg aria-hidden='true' /> Bước cuối
						</h3>
						<p className={s.finalHint}>
							Tích ô xác minh &quot;Tôi không phải người máy&quot;, rồi bấm <strong>Gửi đăng ký</strong>.
						</p>
						{errors.captcha && (
							<span
								className={s.fieldError}
								role='alert'
							>
								{errors.captcha}
							</span>
						)}
					</div>
					<div className={s.finalCaptcha}>{captchaField}</div>
				</section>
			)}
		</>
	);
}

interface AgreeProps {
	id: string;
	checked: boolean;
	onChange: (v: boolean) => void;
	text: string;
	error?: string;
}

function Agree({ id, checked, onChange, text, error }: AgreeProps) {
	return (
		<>
			<label
				id={id}
				className={s.agreeRow}
			>
				<input
					type='checkbox'
					className={s.agreeBox}
					checked={checked}
					onChange={(e) => onChange(e.target.checked)}
					aria-invalid={error ? true : undefined}
				/>
				<span>{text}</span>
			</label>
			{error && (
				<div
					className={s.fieldError}
					role='alert'
				>
					{error}
				</div>
			)}
		</>
	);
}
