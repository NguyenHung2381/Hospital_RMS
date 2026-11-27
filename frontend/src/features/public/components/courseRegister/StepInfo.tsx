import { useState } from 'react';
import { CheckCircleSvg, CheckSvg, ChevDSvg, EditSvg } from '@/assets/icons';
import { CustomFields } from '@/shared/formConfig/CustomFields';
import type { CustomValues } from '@/shared/formConfig/types';
import {
	INFO_KEYS,
	INVOICE_KEYS,
	nationalIdMessage,
	resolveField,
	type InfoKey,
	type StaffMatch,
} from '../../utils/courseRegisterFields';
import { SubGroup } from '../FormSection';
import { DateField, SelectField, TextField } from './RegisterFields';
import { COURSE_FIELD, useRegister } from './registerContext';
import styles from '../../pages/PublicPortal.module.css';
import s from '../../pages/CourseRegisterPublic.module.css';

interface Props {
	staff: StaffMatch | null;
	/** Điền sẵn từ CSDL theo tài khoản đang đăng nhập; gửi xong cập nhật lại hồ sơ học viên */
	fromAccount: boolean;
	idIssuePlaces: string[];
	custom: CustomValues;
	onCustom: (next: CustomValues) => void;
	invoiceOpen: boolean;
	onInvoiceOpen: (open: boolean) => void;
	/** Nội viện: mở lại 1 ô đã có trong hồ sơ để nhập giá trị mới */
	onReveal?: (key: InfoKey) => void;
}

// Mục "Thông tin học viên": thông tin học viên, nhóm theo giấy tờ / liên hệ / văn bằng / công tác
export function StepInfo({ staff, fromAccount, idIssuePlaces, custom, onCustom, invoiceOpen, onInvoiceOpen, onReveal }: Props) {
	const { cfg, form, errors, setField, isKnown } = useRegister();
	const internal = form.source === 'internal';
	// Ô đã có trong hồ sơ nhân viên (ẩn) — nhóm không còn ô nào phải nhập thì ẩn luôn cả nhóm
	const known = (k: InfoKey) => !!isKnown?.(k);
	const knownKeys = INFO_KEYS.filter(known);
	const showGroup = (keys: InfoKey[]) => keys.some((k) => !known(k) && cfg.visible(k));
	const ext = (k: InfoKey): InfoKey[] => (internal ? [] : [k]);
	// Báo CCCD ngay khi gõ đủ số (hoặc rời ô) — người gõ nhầm biết sớm, khỏi đợi bấm "Tiếp tục"
	const [idTouched, setIdTouched] = useState(false);
	const idLive = idTouched || form.national_id.trim().length >= 12 ? nationalIdMessage(form) : '';
	const idGood =
		!idLive &&
		!errors.national_id &&
		/^\d{12}$/.test(form.national_id.trim()) &&
		!!form.dob &&
		(form.gender === 'male' || form.gender === 'female');
	const hasInvoiceError = INVOICE_KEYS.some((k) => errors[k]);

	return (
		<>
			{internal && staff && (
				<p className={s.hint}>
					Họ tên, khoa/phòng, trình độ và cơ quan công tác đã lấy từ hồ sơ nhân sự ở mục trên — không cần nhập lại.
					{fromAccount &&
						' Các ô bên dưới đã điền sẵn từ hồ sơ của bạn trong hệ thống: kiểm tra, sửa chỗ đã thay đổi và bổ sung ô còn trống — gửi đăng ký xong, hồ sơ học viên của bạn sẽ được cập nhật theo.'}
				</p>
			)}

			{knownKeys.length > 0 && (
				<div className={s.knownBox}>
					<p className={s.knownTitle}>
						<CheckCircleSvg aria-hidden='true' />
						<span>
							Hồ sơ của bạn trong hệ thống đã có {knownKeys.length} thông tin dưới đây — hệ thống tự điền khi gửi, bạn chỉ cần nhập
							các ô còn thiếu. Thông tin nào đã thay đổi thì bấm vào để nhập lại.
						</span>
					</p>
					<div
						className={s.chips}
						role='group'
						aria-label='Thông tin đã có trong hồ sơ'
					>
						{knownKeys.map((k) => (
							<button
								type='button'
								key={k}
								className={s.chip}
								onClick={() => onReveal?.(k)}
								aria-label={`${resolveField(cfg, k).label}: đã có trong hồ sơ, bấm để nhập lại`}
							>
								<CheckSvg aria-hidden='true' />
								{resolveField(cfg, k).label}
								<EditSvg aria-hidden='true' />
							</button>
						))}
					</div>
				</div>
			)}

			{showGroup([...ext('full_name'), 'dob', 'gender', 'ethnicity', 'hometown', 'trainee_type_id']) && (
				<SubGroup title='Thông tin cá nhân'>
					<div className={styles.formGrid}>
						{!internal && (
							<TextField
								name='full_name'
								full
								autoComplete='name'
								placeholder='VD: Nguyễn Văn An'
							/>
						)}
						<DateField name='dob' />
						<SelectField name='gender' />
						<TextField
							name='ethnicity'
							placeholder='VD: Kinh'
						/>
						<TextField
							name='hometown'
							placeholder='Xã/phường, tỉnh/thành phố'
						/>
						<SelectField
							name='trainee_type_id'
							full
						/>
					</div>
				</SubGroup>
			)}

			{showGroup(['national_id', 'national_id_issued_date', 'national_id_issued_place']) && (
				<SubGroup title='Căn cước công dân'>
					<div className={styles.formGrid}>
						<TextField
							name='national_id'
							full
							inputMode='numeric'
							placeholder='12 số trên thẻ CCCD'
							liveError={idLive}
							hint={idGood ? 'Số CCCD khớp với giới tính và năm sinh bạn đã nhập.' : undefined}
							onBlur={() => setIdTouched(true)}
						/>
						<DateField name='national_id_issued_date' />
						{cfg.visible('national_id_issued_place') && !known('national_id_issued_place') && (
							<div className={styles.formGroup}>
								<TextField
									name='national_id_issued_place'
									placeholder='Chọn gợi ý bên dưới hoặc tự nhập'
								/>
								{idIssuePlaces.length > 0 && (
									<div
										className={s.chips}
										role='group'
										aria-label='Gợi ý nơi cấp'
									>
										<span
											className={s.chipsLabel}
											aria-hidden='true'
										>
											Gợi ý:
										</span>
										{idIssuePlaces.map((p) => {
											const on = form.national_id_issued_place === p;
											return (
												<button
													type='button'
													key={p}
													className={`${s.chip} ${on ? s.chipOn : ''}`}
													aria-pressed={on}
													onClick={() => setField('national_id_issued_place', p)}
												>
													{on && <CheckSvg aria-hidden='true' />}
													{p}
												</button>
											);
										})}
									</div>
								)}
							</div>
						)}
					</div>
				</SubGroup>
			)}

			{showGroup(['phone', 'email', 'permanent_address', 'address']) && (
				<SubGroup title='Liên hệ'>
					<div className={styles.formGrid}>
						<TextField
							name='phone'
							type='tel'
							inputMode='tel'
							autoComplete='tel'
							placeholder='VD: 0912345678'
						/>
						<TextField
							name='email'
							type='email'
							inputMode='email'
							autoComplete='email'
							placeholder='email@example.com'
							hint='Mã xác minh và xác nhận đăng ký sẽ gửi tới email này.'
						/>
						<TextField
							name='permanent_address'
							full
							autoComplete='street-address'
							placeholder='Số nhà, đường, xã/phường, tỉnh/thành phố'
						/>
						<TextField
							name='address'
							full
							hint='Chỉ điền nếu khác địa chỉ thường trú.'
						/>
					</div>
				</SubGroup>
			)}

			{showGroup([...ext('qualification'), 'graduated_school', 'graduated_year', 'graduated_major', 'degree_number', 'degree_registry_number']) && (
				<SubGroup title='Học vấn và văn bằng'>
					<div className={styles.formGrid}>
						{!internal && (
							<TextField
								name='qualification'
								placeholder='VD: Bác sĩ, Điều dưỡng đại học'
							/>
						)}
						<TextField
							name='graduated_school'
							full={internal}
						/>
						<TextField
							name='graduated_year'
							inputMode='numeric'
							placeholder='VD: 2015'
						/>
						<TextField name='graduated_major' />
						<TextField
							name='degree_number'
							hint='Số hiệu in trên văn bằng.'
						/>
						<TextField
							name='degree_registry_number'
							hint='Số vào sổ cấp bằng của cơ sở đào tạo.'
						/>
					</div>
				</SubGroup>
			)}

			{showGroup([...ext('workplace'), 'work_specialty', 'work_seniority']) && (
				<SubGroup title='Công tác'>
					<div className={styles.formGrid}>
						{!internal && (
							<TextField
								name='workplace'
								full
								autoComplete='organization'
								placeholder='Tên cơ quan, đơn vị đang công tác'
							/>
						)}
						<TextField name='work_specialty' />
						<TextField
							name='work_seniority'
							placeholder='VD: 8 năm'
						/>
					</div>
				</SubGroup>
			)}

			{cfg.custom.length > 0 && (
				<SubGroup title='Thông tin bổ sung'>
					<div className={styles.formGrid}>
						<CustomFields
							cfg={cfg}
							value={custom}
							onChange={onCustom}
							errors={errors}
							title={null}
							inputClassName={styles.input}
							classes={COURSE_FIELD}
						/>
					</div>
				</SubGroup>
			)}

			{!internal && (
				<div className={s.collapse}>
					<button
						type='button'
						className={s.collapseHead}
						aria-expanded={invoiceOpen || hasInvoiceError}
						aria-controls='invoice-block'
						onClick={() => onInvoiceOpen(!invoiceOpen)}
					>
						<span>
							<span className={s.collapseTitle}>Thông tin xuất hóa đơn</span>
							<span className={s.optionalTag}>Không bắt buộc</span>
							<span className={s.collapseHint}>Chỉ điền nếu đơn vị của bạn cần hóa đơn học phí.</span>
						</span>
						<ChevDSvg className={invoiceOpen || hasInvoiceError ? s.chevOpen : undefined} />
					</button>
					{(invoiceOpen || hasInvoiceError) && (
						<div
							id='invoice-block'
							className={s.collapseBody}
						>
							<div className={styles.formGrid}>
								<TextField
									name='invoice_org_name'
									full
									autoComplete='organization'
								/>
								<TextField
									name='invoice_org_address'
									full
								/>
								<TextField
									name='invoice_tax_code'
									inputMode='numeric'
								/>
								<TextField name='invoice_budget_code' />
								<TextField
									name='invoice_email'
									type='email'
									inputMode='email'
									full
									placeholder='email@donvi.vn'
								/>
							</div>
						</div>
					)}
				</div>
			)}
		</>
	);
}
