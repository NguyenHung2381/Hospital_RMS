import { checkValue } from '@/shared/formConfig/fieldRules';
import type { CustomValues, FieldRules, FieldType, ResolvedField } from '@/shared/formConfig/types';
import type { FormConfig } from '@/shared/formConfig/useFormConfig';
import { GENDER_OPTIONS } from '@/shared/utils/gender';
import { checkNationalId, NATIONAL_ID_ISSUE_MESSAGE } from '@/shared/utils/nationalId';
import type {
	DraftApplicationPayload,
	RegisterPayload,
	RegistrationSource,
	RegistrationStaff,
} from '../api/publicApi';

export const HOSPITAL = 'Bệnh viện Hữu nghị Đa khoa Nghệ An';

// ─── Trường của bản khai (khóa trùng form 'course_registration' ở backend) ─────────────────

export const INFO_KEYS = [
	'full_name',
	'dob',
	'gender',
	'ethnicity',
	'hometown',
	'national_id',
	'national_id_issued_date',
	'national_id_issued_place',
	'permanent_address',
	'address',
	'phone',
	'email',
	'qualification',
	'graduated_school',
	'graduated_year',
	'graduated_major',
	'degree_number',
	'degree_registry_number',
	'workplace',
	'work_specialty',
	'work_seniority',
	'trainee_type_id',
] as const;
export const INVOICE_KEYS = [
	'invoice_org_name',
	'invoice_org_address',
	'invoice_tax_code',
	'invoice_budget_code',
	'invoice_email',
] as const;

export type InfoKey = (typeof INFO_KEYS)[number];
export type InvoiceKey = (typeof INVOICE_KEYS)[number];
export type FormKey = InfoKey | InvoiceKey | 'staff_number';

export interface RegForm extends Record<FormKey, string> {
	source: '' | RegistrationSource;
	rules_accepted: boolean;
	declared_true: boolean;
	website: string; // honeypot
}

const textKeys: FormKey[] = [...INFO_KEYS, ...INVOICE_KEYS, 'staff_number'];
export const EMPTY_FORM: RegForm = {
	...(Object.fromEntries(textKeys.map((k) => [k, ''])) as Record<FormKey, string>),
	source: '',
	rules_accepted: false,
	declared_true: false,
	website: '',
};

interface FieldDef {
	label: string;
	/** Mặc định bắt buộc khi máy chủ chưa có khóa này trong cấu hình form */
	required: boolean;
	type: FieldType;
	rules?: FieldRules;
	/** Chỉ ngoại viện nhập — nội viện lấy từ hồ sơ nhân sự */
	externalOnly?: boolean;
	dynamic?: boolean;
}

// Nhãn + mặc định bắt buộc + giới hạn theo hợp đồng. Dùng khi cấu hình form chưa tải
// xong hoặc chưa có khóa (registry máy chủ có thể chậm hơn giao diện).
export const FIELD_DEFS: Record<InfoKey | InvoiceKey, FieldDef> = {
	full_name: { label: 'Họ và tên', required: true, type: 'text', rules: { maxLength: 150 } },
	dob: { label: 'Ngày sinh', required: true, type: 'date' },
	gender: { label: 'Giới tính', required: true, type: 'select' },
	ethnicity: { label: 'Dân tộc', required: false, type: 'text', rules: { maxLength: 50 } },
	hometown: { label: 'Quê quán', required: false, type: 'text', rules: { maxLength: 255 } },
	national_id: { label: 'Số CCCD', required: true, type: 'text', rules: { maxLength: 20 } },
	national_id_issued_date: { label: 'Ngày cấp', required: true, type: 'date' },
	national_id_issued_place: { label: 'Nơi cấp', required: true, type: 'text', rules: { maxLength: 200 } },
	permanent_address: { label: 'Địa chỉ thường trú', required: true, type: 'text', rules: { maxLength: 255 } },
	address: { label: 'Địa chỉ liên hệ', required: false, type: 'text', rules: { maxLength: 255 } },
	phone: { label: 'Số điện thoại', required: true, type: 'phone', rules: { maxLength: 20 } },
	email: { label: 'Email', required: true, type: 'email', rules: { maxLength: 100 } },
	qualification: { label: 'Trình độ', required: true, type: 'text', rules: { maxLength: 150 }, externalOnly: true },
	graduated_school: { label: 'Trường tốt nghiệp', required: true, type: 'text', rules: { maxLength: 200 } },
	graduated_year: {
		label: 'Năm tốt nghiệp',
		required: true,
		type: 'number',
		rules: { integer: true, min: 1900, max: 2100 },
	},
	graduated_major: { label: 'Chuyên ngành tốt nghiệp', required: false, type: 'text', rules: { maxLength: 200 } },
	degree_number: { label: 'Số hiệu văn bằng', required: true, type: 'text', rules: { maxLength: 50 } },
	degree_registry_number: { label: 'Số vào sổ cấp bằng', required: true, type: 'text', rules: { maxLength: 50 } },
	workplace: { label: 'Đơn vị công tác', required: false, type: 'text', rules: { maxLength: 200 }, externalOnly: true },
	work_specialty: { label: 'Chuyên ngành đang công tác', required: false, type: 'text', rules: { maxLength: 200 } },
	work_seniority: { label: 'Thâm niên công tác', required: false, type: 'text', rules: { maxLength: 100 } },
	trainee_type_id: { label: 'Đối tượng học viên', required: false, type: 'select', dynamic: true },
	invoice_org_name: { label: 'Tên đơn vị', required: false, type: 'text', rules: { maxLength: 255 } },
	invoice_org_address: { label: 'Địa chỉ đơn vị', required: false, type: 'text', rules: { maxLength: 255 } },
	invoice_tax_code: { label: 'Mã số thuế đơn vị', required: false, type: 'text', rules: { maxLength: 20 } },
	invoice_budget_code: {
		label: 'Mã đơn vị quan hệ ngân sách',
		required: false,
		type: 'text',
		rules: { maxLength: 20 },
	},
	invoice_email: { label: 'Email nhận hóa đơn', required: false, type: 'email', rules: { maxLength: 100 } },
};

export const defOf = (key: InfoKey | InvoiceKey) => FIELD_DEFS[key];

/** Cấu hình thực tế của 1 trường: của máy chủ nếu có, không thì mặc định theo hợp đồng. */
export function resolveField(cfg: FormConfig, key: InfoKey | InvoiceKey): ResolvedField {
	const def = FIELD_DEFS[key];
	const f = cfg.field(key);
	if (f) return { ...f, label: f.labelSet ? f.label : def.label };
	return {
		key,
		label: def.label,
		type: def.type,
		visible: true,
		required: def.required,
		placeholder: null,
		hint: null,
		rules: def.rules ?? {},
		options: key === 'gender' ? GENDER_OPTIONS.map((o) => ({ value: o.value, label: o.label })) : null,
		dynamic: def.dynamic,
	};
}

// ─── Kiểm tra ─────────────────────────────────────────────────────────────────

export const todayIso = () => {
	const d = new Date();
	const p = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** Thông báo cho CCCD theo giới tính / ngày sinh đang khai ('' = hợp lệ hoặc chưa nhập) */
export function nationalIdMessage(form: Pick<RegForm, 'national_id' | 'dob' | 'gender'>): string {
	if (!form.national_id.trim()) return '';
	const res = checkNationalId(form.national_id, { dob: form.dob, gender: form.gender });
	return res.valid ? '' : NATIONAL_ID_ISSUE_MESSAGE[res.issues[0]];
}

export interface StaffMatch {
	/** Giá trị đã gõ khi tra — đổi 1 trong 2 thì kết quả tra không còn đúng */
	staff_number: string;
	full_name: string;
	info: RegistrationStaff;
}

export const staffMatches = (staff: StaffMatch | null, form: Pick<RegForm, 'staff_number' | 'full_name'>) =>
	!!staff && staff.staff_number === form.staff_number.trim() && staff.full_name === form.full_name.trim();

export const infoKeysFor = (source: RegForm['source']) =>
	INFO_KEYS.filter((k) => source === 'external' || !FIELD_DEFS[k].externalOnly);

/** Lỗi của bước "Thông tin học viên" theo Cấu hình form + luật nghiệp vụ (CCCD, ngày tháng). */
export function validateInfo(cfg: FormConfig, form: RegForm, custom: CustomValues): Record<string, string> {
	const errors: Record<string, string> = {};
	const internal = form.source === 'internal';
	const keys: (InfoKey | InvoiceKey)[] = [...infoKeysFor(form.source), ...(internal ? [] : INVOICE_KEYS)];
	for (const key of keys) {
		// Nội viện: họ tên đã khớp hồ sơ nhân sự ở bước trước
		if (internal && key === 'full_name') continue;
		const f = resolveField(cfg, key);
		if (!f.visible && key !== 'full_name') continue;
		// Họ tên luôn bắt buộc, dù admin tắt
		const field = key === 'full_name' ? { ...f, required: true } : f;
		const err = checkValue(field, form[key]);
		if (err) errors[key] = err;
	}

	const today = todayIso();
	if (!errors.dob && form.dob && (form.dob > today || form.dob < '1900-01-01'))
		errors.dob = 'Ngày sinh không hợp lệ';
	if (!errors.national_id_issued_date && form.national_id_issued_date) {
		if (form.national_id_issued_date > today) errors.national_id_issued_date = 'Ngày cấp không được sau hôm nay';
		else if (form.dob && form.national_id_issued_date < form.dob)
			errors.national_id_issued_date = 'Ngày cấp không được trước ngày sinh';
	}
	if (!errors.national_id) {
		const msg = nationalIdMessage(form);
		if (msg) errors.national_id = msg;
	}
	if (!errors.graduated_year && form.graduated_year.trim() && !/^\d{4}$/.test(form.graduated_year.trim()))
		errors.graduated_year = 'Năm tốt nghiệp gồm 4 chữ số, ví dụ 2015';

	for (const cf of cfg.custom) {
		const err = checkValue(cf, custom[cf.key]);
		if (err) errors[cf.key] = err;
	}
	return errors;
}

// ─── Gửi đăng ký ──────────────────────────────────────────────────────────────

/** Bản khai gửi lên máy chủ — bỏ ô trống, nội viện lấy khoa / trình độ từ hồ sơ nhân sự. */
export function buildPayload(
	cfg: FormConfig,
	form: RegForm,
	staff: StaffMatch | null,
	extra: Pick<RegisterPayload, 'course_id' | 'program_id' | 'custom' | 'email_token' | 'captcha_token' | 'captcha_answer'>,
): RegisterPayload {
	const source = form.source as RegistrationSource;
	const internal = source === 'internal';
	const out: Record<string, unknown> = {};
	const keys: (InfoKey | InvoiceKey)[] = [...infoKeysFor(source), ...(internal ? [] : INVOICE_KEYS)];
	for (const key of keys) {
		if (!resolveField(cfg, key).visible && key !== 'full_name') continue;
		const v = form[key].trim();
		if (v) out[key] = key === 'graduated_year' ? Number(v) : v;
	}
	if (internal && staff) {
		out.full_name = staff.info.full_name;
		out.staff_number = staff.staff_number;
		out.department_id = staff.info.department_id;
		if (staff.info.qualification) out.qualification = staff.info.qualification;
	}
	return {
		...out,
		source,
		rules_accepted: form.rules_accepted,
		declared_true: form.declared_true,
		website: form.website,
		...extra,
	} as RegisterPayload;
}

/** Dữ liệu để máy chủ điền sẵn Đơn đăng ký nháp (nội viện) — như buildPayload nhưng không captcha / cam kết /
 *  honeypot / hóa đơn / trường tùy chỉnh. Chỉ dùng khi staff đã khớp hồ sơ nhân sự. */
export function buildDraftPayload(
	cfg: FormConfig,
	form: RegForm,
	staff: StaffMatch,
	extra: Pick<DraftApplicationPayload, 'course_id' | 'program_id'>,
): DraftApplicationPayload {
	const out: Record<string, unknown> = {};
	for (const key of infoKeysFor('internal')) {
		if (!resolveField(cfg, key).visible && key !== 'full_name') continue;
		const v = form[key].trim();
		if (v) out[key] = key === 'graduated_year' ? Number(v) : v;
	}
	return {
		...out,
		full_name: staff.info.full_name,
		staff_number: staff.staff_number,
		source: 'internal',
		...extra,
	} as DraftApplicationPayload;
}

// ─── Bản nháp trong sessionStorage ────────────────────────────────────────────
// Chỉ chữ người dùng đã nhập — không file đính kèm (file không bao giờ được lưu), không token
// xác minh email, không mã captcha. Đóng tab là mất; gửi xong thì xóa.

const DRAFT_KEY = 'dtlt-register-draft-v1';

export interface RegisterDraft {
	courseId: string;
	programId: string;
	step: number;
	reached: number;
	form: RegForm;
	custom: CustomValues;
	staff: StaffMatch | null;
}

export function loadDraft(): RegisterDraft | null {
	try {
		const raw = sessionStorage.getItem(DRAFT_KEY);
		if (!raw) return null;
		const d = JSON.parse(raw) as RegisterDraft;
		if (!d || typeof d !== 'object' || !d.form) return null;
		return {
			...d,
			// Cam kết "thông tin đúng sự thật" luôn xác nhận lại ở bước cuối
			form: { ...EMPTY_FORM, ...d.form, declared_true: false, website: '' },
			custom: d.custom ?? {},
			staff: d.staff ?? null,
			step: Number.isInteger(d.step) ? d.step : 0,
			reached: Number.isInteger(d.reached) ? d.reached : 0,
		};
	} catch {
		return null;
	}
}

export function saveDraft(draft: RegisterDraft) {
	try {
		sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, form: { ...draft.form, website: '' } }));
	} catch {
		// Trình duyệt chặn lưu trữ: form vẫn dùng bình thường, chỉ không giữ được khi tải lại
	}
}

export function clearDraft() {
	try {
		sessionStorage.removeItem(DRAFT_KEY);
	} catch {
		// như trên
	}
}

/** Draft có đáng khôi phục không (đã nhập gì đó ngoài việc chọn khóa) */
export const draftHasInput = (d: RegisterDraft) =>
	d.step > 0 || Object.entries(d.form).some(([k, v]) => k !== 'website' && typeof v === 'string' && v.trim() !== '');
