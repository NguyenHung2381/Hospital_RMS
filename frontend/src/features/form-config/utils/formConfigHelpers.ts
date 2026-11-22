import { fieldVariants, FORMATS, inVariant } from '../../../shared/formConfig/fieldRules';
import type {
	FieldOption,
	FieldOverride,
	FieldRules,
	FieldType,
	FormDefinition,
	RegistryField,
} from '../../../shared/formConfig/types';

export const TYPE_LABEL: Record<string, string> = {
	text: 'Chữ',
	textarea: 'Đoạn văn',
	number: 'Số',
	date: 'Ngày',
	select: 'Chọn 1',
	multiselect: 'Chọn nhiều',
	checkbox: 'Ô đánh dấu',
	email: 'Email',
	phone: 'Số điện thoại',
};

export const MODULE_LABEL: Record<string, string> = {
	RESEARCH: 'Nghiên cứu khoa học',
	TRAINING: 'Đào tạo',
	SEMINAR: 'Hội nghị & CME',
	SURVEY: 'Khảo sát',
	ATTENDANCE: 'Điểm danh',
	SYSTEM: 'Hệ thống',
};

/** Tên ngắn của form con (bỏ phần giải thích trong ngoặc) — dùng làm tiêu đề cột. */
export const shortVariant = (label: string) => label.replace(/\s*\(.*\)\s*$/, '') || label;

/** Có thay đổi gì so với mặc định không — để đánh dấu dòng. */
export const isOverridden = (ov?: FieldOverride) =>
	!!ov &&
	(!!ov.hidden?.length ||
		ov.required !== undefined ||
		!!ov.label ||
		!!ov.placeholder ||
		!!ov.hint ||
		!!ov.rules ||
		!!ov.choices?.length);

/** Bỏ khóa undefined để override gọn (không lưu "rules": {} rỗng). */
export const cleanRules = (r: FieldRules): FieldRules | undefined => {
	const out = Object.fromEntries(Object.entries(r).filter(([, v]) => v !== undefined && v !== '')) as FieldRules;
	return Object.keys(out).length ? out : undefined;
};

/** Bỏ khóa rỗng để không lưu override vô nghĩa. */
export const cleanOverride = (ov: FieldOverride): FieldOverride | undefined => {
	const out: FieldOverride = {};
	if (ov.hidden?.length) out.hidden = ov.hidden;
	if (ov.required !== undefined) out.required = ov.required;
	if (ov.label?.trim()) out.label = ov.label;
	if (ov.placeholder?.trim()) out.placeholder = ov.placeholder;
	if (ov.hint?.trim()) out.hint = ov.hint;
	const rules = ov.rules && cleanRules(ov.rules);
	if (rules) out.rules = rules;
	if (ov.choices?.length) out.choices = ov.choices;
	return Object.keys(out).length ? out : undefined;
};

/** Có ràng buộc nào cấu hình được cho loại này không (ẩn nút "Ràng buộc" nếu không). */
export const hasRules = (type: FieldType, options?: FieldOption[] | null, dynamic?: boolean) =>
	type !== 'checkbox' && !(type === 'select' && (dynamic || !options));

// Giá trị điều kiện `when` → chữ hiển thị (loại đăng ký đề tài, loại khóa học)
const WHEN_VALUE: Record<string, string> = {
	de_tai: 'đề tài',
	bai_bao: 'bài báo',
	'TRNTP-DTLT': 'khóa ĐTLT',
	dropped: 'nghỉ học',
};
export const whenLabel = (when: Record<string, string>) =>
	`Chỉ với ${Object.values(when)
		.map((v) => WHEN_VALUE[v] ?? v)
		.join(', ')}`;

const fmtDate = (v: string) => (v === 'today' ? 'hôm nay' : v.split('-').reverse().join('/'));

/** Ràng buộc → câu dễ đọc ("Tối đa 200 ký tự", "Không sau hôm nay"…). */
export function describeRules(r: FieldRules | undefined, allOptions?: FieldOption[] | null): string[] {
	if (!r) return [];
	const out: string[] = [];
	if (r.minLength && r.maxLength) out.push(`${r.minLength}–${r.maxLength} ký tự`);
	else if (r.minLength) out.push(`Ít nhất ${r.minLength} ký tự`);
	else if (r.maxLength) out.push(`Tối đa ${r.maxLength} ký tự`);
	if (r.format) out.push(`Định dạng ${FORMATS[r.format]?.label ?? r.format}`);
	if (r.pattern) out.push('Có mẫu kiểm tra');
	if (r.min !== undefined && r.max !== undefined) out.push(`Từ ${r.min} đến ${r.max}`);
	else if (r.min !== undefined) out.push(`Không nhỏ hơn ${r.min}`);
	else if (r.max !== undefined) out.push(`Không lớn hơn ${r.max}`);
	if (r.integer) out.push('Số nguyên');
	if (r.minDate) out.push(`Không trước ${fmtDate(r.minDate)}`);
	if (r.maxDate) out.push(`Không sau ${fmtDate(r.maxDate)}`);
	if (r.maxItems) out.push(`Chọn tối đa ${r.maxItems}`);
	if (r.options && allOptions) out.push(`Chỉ cho chọn ${r.options.length}/${allOptions.length} lựa chọn`);
	return out;
}

/** Số mục "chi tiết" đã chỉnh (nhãn, gợi ý, ghi chú, ràng buộc) — hiện trên nút Chi tiết. */
export const detailCount = (ov?: FieldOverride) =>
	!ov
		? 0
		: [ov.label, ov.placeholder, ov.hint].filter((x) => x?.trim()).length +
			(ov.rules ? 1 : 0) +
			(ov.choices?.length ? 1 : 0);

/** Ô chữ đổi được thành danh sách chọn không (khớp checkChoices ở backend). */
export const canUseChoices = (f: RegistryField) => f.type === 'text' && !f.dynamic && !f.noChoices;

/** Tách các dòng → danh sách lựa chọn: bỏ khoảng trắng thừa, dòng trống, dòng trùng. */
export const parseChoices = (raw: string) => [
	...new Set(
		raw
			.split(/\r?\n/)
			.map((l) => l.trim())
			.filter(Boolean),
	),
];

/**
 * Trạng thái hiển thị / bắt buộc của 1 trường có sẵn theo override — dùng chung cho
 * dòng bảng và ngăn kéo chi tiết.
 */
export function fieldState(form: FormDefinition, field: RegistryField, ov: FieldOverride = {}) {
	const variants = form.variants.filter((v) => fieldVariants(form, field).includes(v.key));
	const lockRequiredAll = field.lock?.required === true;
	const lockRequiredSome = Array.isArray(field.lock?.required) ? field.lock.required : [];
	const defaultRequired = variants.every((v) => inVariant(field.required, v.key));
	// Mặc định bắt buộc ở form này nhưng không ở form kia (vd Khoa/phòng)
	const mixedDefault = !lockRequiredAll && !defaultRequired && variants.some((v) => inVariant(field.required, v.key));
	const required = ov.required ?? defaultRequired;
	const hidden = ov.hidden ?? [];
	const allHidden = variants.every((v) => hidden.includes(v.key) && !inVariant(field.lock?.visible, v.key));
	return {
		variants,
		lockRequiredAll,
		lockRequiredSome,
		defaultRequired,
		mixedDefault,
		required,
		hidden,
		allHidden,
		lockedVisible: (key: string) => inVariant(field.lock?.visible, key),
		shown: (key: string) => inVariant(field.lock?.visible, key) || !hidden.includes(key),
		/** Tên form mà trường mặc định bắt buộc (khi mixedDefault) */
		defaultRequiredIn: variants.filter((v) => inVariant(field.required, v.key)).map((v) => shortVariant(v.label)),
		/** Bắt buộc thực tế ở 1 form (đã tính khóa hệ thống) */
		requiredIn: (key: string) =>
			inVariant(field.lock?.required, key) ||
			(ov.required !== undefined ? ov.required : inVariant(field.required, key)),
	};
}
export type FieldState = ReturnType<typeof fieldState>;
