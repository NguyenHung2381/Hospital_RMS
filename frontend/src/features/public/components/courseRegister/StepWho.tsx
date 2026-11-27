import { CheckCircleSvg } from '@/assets/icons';
import type { RegistrationSource } from '../../api/publicApi';
import { HOSPITAL, type RegForm, type StaffMatch } from '../../utils/courseRegisterFields';
import styles from '../../pages/PublicPortal.module.css';
import s from '../../pages/CourseRegisterPublic.module.css';

const SOURCES: { value: RegistrationSource; title: string; text: string }[] = [
	{
		value: 'internal',
		title: 'Nội viện',
		text: `Cán bộ, nhân viên ${HOSPITAL}. Chỉ cần mã nhân viên và họ tên để hệ thống nhận ra bạn.`,
	},
	{
		value: 'external',
		title: 'Ngoại viện',
		text: 'Học viên của đơn vị khác. Bạn sẽ khai đầy đủ thông tin và đính kèm giấy tờ.',
	},
];

interface Props {
	form: RegForm;
	onSource: (v: RegistrationSource) => void;
	onField: (key: 'staff_number' | 'full_name', value: string) => void;
	staff: StaffMatch | null;
	/** staff đã khớp với mã NV + họ tên đang gõ */
	staffOk: boolean;
	/** Nhận ra qua tài khoản đang đăng nhập (không cần bấm "Kiểm tra") */
	fromAccount: boolean;
	checking: boolean;
	onCheck: () => void;
	staffError: string;
	errors: Record<string, string | undefined>;
}

// Mục "Đối tượng đăng ký": nội viện hay ngoại viện; nội viện tra mã nhân viên + họ tên
export function StepWho({ form, onSource, onField, staff, staffOk, fromAccount, checking, onCheck, staffError, errors }: Props) {
	// Enter trong ô mã NV / họ tên = bấm "Kiểm tra", không gửi cả trang đăng ký
	const checkOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key !== 'Enter') return;
		e.preventDefault();
		if (!staffOk && !checking) onCheck();
	};
	return (
		<>
			<fieldset
				className={s.fieldset}
				id='f-source'
			>
				<legend className={s.srOnly}>Bạn đăng ký với tư cách nào?</legend>
				<div className={s.choiceGrid}>
					{SOURCES.map((o) => (
						<label
							key={o.value}
							className={`${s.choice} ${form.source === o.value ? s.choiceOn : ''}`}
						>
							<input
								type='radio'
								name='source'
								className={s.choiceRadio}
								checked={form.source === o.value}
								onChange={() => onSource(o.value)}
							/>
							<span className={s.choiceBody}>
								<span className={s.choiceTitle}>{o.title}</span>
								<span className={s.choiceText}>{o.text}</span>
							</span>
						</label>
					))}
				</div>
				{errors.source && (
					<div
						className={s.fieldError}
						role='alert'
					>
						{errors.source}
					</div>
				)}
			</fieldset>

			{form.source === 'internal' && (
				<div className={s.staffBlock}>
					<h3 className={s.subHeading}>Xác nhận nhân viên bệnh viện</h3>
					{fromAccount && (
						<p className={s.hint}>Đã nhận ra bạn qua tài khoản đang đăng nhập — mã nhân viên và họ tên lấy từ hồ sơ nhân sự.</p>
					)}
					<div className={styles.formGrid}>
						<div className={styles.formGroup}>
							<label
								className={styles.label}
								htmlFor='f-staff_number'
							>
								Mã nhân viên <span className={styles.required}>*</span>
							</label>
							<input
								id='f-staff_number'
								className={`${styles.input} ${errors.staff && !form.staff_number.trim() ? s.inputError : ''}`}
								value={form.staff_number}
								onChange={(e) => onField('staff_number', e.target.value.replace(/\D/g, '').slice(0, 9))}
								onKeyDown={checkOnEnter}
								inputMode='numeric'
								autoComplete='off'
								placeholder='VD: 1234'
							/>
							<span className={s.hint}>Mã trên thẻ nhân viên, chỉ gồm chữ số.</span>
						</div>
						<div className={styles.formGroup}>
							<label
								className={styles.label}
								htmlFor='f-staff_name'
							>
								Họ và tên <span className={styles.required}>*</span>
							</label>
							<input
								id='f-staff_name'
								className={`${styles.input} ${errors.staff && !form.full_name.trim() ? s.inputError : ''}`}
								value={form.full_name}
								onChange={(e) => onField('full_name', e.target.value)}
								onKeyDown={checkOnEnter}
								autoComplete='name'
								maxLength={150}
								placeholder='VD: Nguyễn Văn An'
							/>
							<span className={s.hint}>Gõ đúng họ tên trong hồ sơ nhân sự.</span>
						</div>
					</div>
					<div className={s.staffActions}>
						<button
							type='button'
							className={s.ghostBtn}
							onClick={onCheck}
							disabled={checking || staffOk}
						>
							{checking ? 'Đang kiểm tra...' : staffOk ? 'Đã xác nhận' : 'Kiểm tra'}
						</button>
					</div>

					{staffOk && staff && (
						<div
							className={s.staffOk}
							role='status'
						>
							<CheckCircleSvg />
							<dl className={s.staffInfo}>
								<div>
									<dt>Họ và tên</dt>
									<dd>{staff.info.full_name}</dd>
								</div>
								<div>
									<dt>Khoa/Phòng/TT</dt>
									<dd>{staff.info.department_name}</dd>
								</div>
								<div>
									<dt>Trình độ</dt>
									<dd>{staff.info.qualification || 'Chưa có trong hồ sơ'}</dd>
								</div>
								<div>
									<dt>Cơ quan công tác</dt>
									<dd>{HOSPITAL}</dd>
								</div>
							</dl>
						</div>
					)}
					{!staffOk && (staffError || errors.staff) && (
						<div
							className={s.serverError}
							role='alert'
						>
							<span>
								{staffError || errors.staff}
								{staffError && ' Hãy kiểm tra lại mã nhân viên và họ tên. Nếu vẫn không được, vui lòng liên hệ Phòng Đào tạo.'}
							</span>
						</div>
					)}
				</div>
			)}
		</>
	);
}
