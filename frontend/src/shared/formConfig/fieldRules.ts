// Bản TS của backend/src/modules/forms/fieldRules.js (resolve + checkValue) —
// sửa một bên thì sửa cả bên kia. Ở frontend chỉ để báo lỗi sớm và xem trước;
// server luôn kiểm lại.
import type {
	CustomValues,
	FieldOverride,
	FormDefinition,
	FormOverride,
	RegistryField,
	ResolvedField,
	ResolvedForm,
	TextFormat,
	VariantSpec,
} from './types';

export const FORMATS: Record<TextFormat, { re: RegExp; msg: string; label: string; strip?: RegExp }> = {
	email: { re: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, msg: 'không hợp lệ (vd: ten@benhvien.vn)', label: 'Email' },
	phone: {
		re: /^(\+?84|0)\d{8,10}$/,
		msg: 'không hợp lệ (vd: 0912345678)',
		label: 'Số điện thoại',
		strip: /[\s.-]/g,
	},
	cccd: { re: /^\d{12}$/, msg: 'phải gồm đúng 12 chữ số', label: 'CCCD (12 số)' },
	digits: { re: /^\d+$/, msg: 'chỉ được nhập chữ số', label: 'Chỉ chữ số' },
	url: {
		re: /^https?:\/\/\S+$/i,
		msg: 'phải là đường dẫn bắt đầu bằng http:// hoặc https://',
		label: 'Đường dẫn (URL)',
	},
};

const TEXT_TYPES = new Set(['text', 'textarea', 'email', 'phone']);
export const CUSTOM_MAX_LENGTH: Record<string, number> = { text: 500, email: 100, phone: 20, textarea: 4000 };
const DATE_RE = /^\d{4}-\d{2}-\d{2}/;
const fmtNum = (n: number) => n.toLocaleString('vi-VN');

const today = () => {
	const d = new Date();
	const p = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
export const resolveDate = (v: string) => (v === 'today' ? today() : v);
const fmtDate = (v: string) => (v === 'today' ? 'hôm nay' : v.split('-').reverse().join('/'));

export const inVariant = (spec: VariantSpec | undefined, variant: string) =>
	spec === true || (Array.isArray(spec) && spec.includes(variant));
export const fieldVariants = (form: Pick<FormDefinition, 'variants'>, field: RegistryField) =>
	field.in ?? form.variants.map((v) => v.key);

export const isEmptyValue = (field: Pick<ResolvedField, 'type'>, v: unknown) =>
	v === undefined ||
	v === null ||
	(typeof v === 'string' && v.trim() === '') ||
	(Array.isArray(v) && v.length === 0) ||
	(field.type === 'checkbox' && v !== true);

/** Kiểm 1 giá trị → câu lỗi | null (cùng câu chữ với server). */
export function checkValue(field: ResolvedField, raw: unknown): string | null {
	const label = field.label;
	if (isEmptyValue(field, raw)) {
		if (!field.required) return null;
		if (field.type === 'checkbox') return `Vui lòng xác nhận "${label}"`;
		return field.type === 'select' || field.type === 'multiselect' || field.type === 'date'
			? `Vui lòng chọn ${label}`
			: `Vui lòng nhập ${label}`;
	}
	const r = field.rules ?? {};
	if (TEXT_TYPES.has(field.type)) {
		if (typeof raw !== 'string') return `${label} không hợp lệ`;
		const v = raw.trim();
		if (r.minLength && v.length < r.minLength) return `${label} phải có ít nhất ${r.minLength} ký tự`;
		if (r.maxLength && v.length > r.maxLength) return `${label} tối đa ${r.maxLength} ký tự`;
		const fk = field.type === 'email' || field.type === 'phone' ? field.type : r.format;
		const fmt = fk ? FORMATS[fk] : undefined;
		if (fmt && !fmt.re.test(fmt.strip ? v.replace(fmt.strip, '') : v)) return `${label} ${fmt.msg}`;
		if (r.pattern) {
			let re: RegExp;
			try {
				re = new RegExp(`^(?:${r.pattern})$`, 'u');
			} catch {
				return null;
			}
			if (!re.test(v)) return r.patternMessage || `${label} không đúng định dạng`;
		}
		return null;
	}
	if (field.type === 'number') {
		const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
		if (!Number.isFinite(n)) return `${label} phải là số`;
		if (r.integer && !Number.isInteger(n)) return `${label} phải là số nguyên`;
		if (r.min !== undefined && r.min !== null && n < r.min) return `${label} không được nhỏ hơn ${fmtNum(r.min)}`;
		if (r.max !== undefined && r.max !== null && n > r.max) return `${label} không được lớn hơn ${fmtNum(r.max)}`;
		return null;
	}
	if (field.type === 'date') {
		if (typeof raw !== 'string' || !DATE_RE.test(raw) || Number.isNaN(Date.parse(raw.slice(0, 10))))
			return `${label} không phải ngày hợp lệ`;
		const v = raw.slice(0, 10);
		if (r.minDate && v < resolveDate(r.minDate)) return `${label} không được trước ${fmtDate(r.minDate)}`;
		if (r.maxDate && v > resolveDate(r.maxDate)) return `${label} không được sau ${fmtDate(r.maxDate)}`;
		return null;
	}
	if (field.type === 'select') {
		if (field.dynamic || !field.options) return null;
		return field.options.some((o) => o.value === String(raw)) ? null : `${label} không hợp lệ`;
	}
	if (field.type === 'multiselect') {
		if (!Array.isArray(raw)) return `${label} không hợp lệ`;
		if (raw.some((x) => !(field.options ?? []).some((o) => o.value === x))) return `${label} không hợp lệ`;
		if (r.maxItems && raw.length > r.maxItems) return `${label} chọn tối đa ${r.maxItems} mục`;
		return null;
	}
	return null;
}

const whenHolds = (when: Record<string, string> | null | undefined, values: Record<string, unknown>) =>
	!when || Object.entries(when).every(([k, v]) => (values[k] ?? '') === v);

/**
 * Kiểm cả form phía client. Chỉ kiểm khóa có trong `values` (ô form này có);
 * trường có `when` chỉ kiểm khi điều kiện đúng — form không có khóa điều kiện
 * thì coi như đúng.
 */
export function validateForm(
	resolved: ResolvedForm,
	values: Record<string, unknown>,
	custom?: CustomValues,
	{ mode = 'create' }: { mode?: 'create' | 'edit' } = {},
): Record<string, string> {
	const errors: Record<string, string> = {};
	for (const f of Object.values(resolved.fields)) {
		if (!f.visible || !(f.key in values)) continue;
		if (mode === 'create' && f.editOnly) continue;
		if (f.when && Object.keys(f.when).every((k) => k in values) && !whenHolds(f.when, values)) continue;
		const err = checkValue(f, values[f.key]);
		if (err) errors[f.key] = err;
	}
	if (custom) {
		for (const f of resolved.custom) {
			const err = checkValue(f, custom[f.key]);
			if (err) errors[f.key] = err;
		}
	}
	return errors;
}

// ─── Resolve (trang quản trị — xem trước khi chưa lưu) ──────────────────────

const resolveField = (
	form: Pick<FormDefinition, 'variants'>,
	field: RegistryField,
	ov: FieldOverride,
	variant: string,
): ResolvedField | null => {
	if (!fieldVariants(form, field).includes(variant)) return null;
	const lockVisible = inVariant(field.lock?.visible, variant);
	const lockRequired = inVariant(field.lock?.required, variant);
	const hidden = !lockVisible && (ov.hidden ?? []).includes(variant);
	const required = lockRequired || (ov.required !== undefined ? !!ov.required : inVariant(field.required, variant));
	const { options: keep, ...rules } = { ...(field.base ?? {}), ...(ov.rules ?? {}) };
	const options =
		field.options && Array.isArray(keep) ? field.options.filter((o) => keep.includes(o.value)) : field.options;
	return {
		key: field.key,
		label: ov.label || field.label,
		labelSet: !!ov.label,
		type: field.type,
		visible: !hidden,
		required: !hidden && required,
		placeholder: ov.placeholder || null,
		hint: ov.hint || null,
		rules,
		options: options ?? null,
		dynamic: !!field.dynamic,
		when: field.when ?? null,
		editOnly: inVariant(field.editOnly, variant),
	};
};

export function resolveForm(
	form: Pick<FormDefinition, 'key' | 'variants' | 'fields'>,
	override: FormOverride | null,
	variant: string,
): ResolvedForm {
	const ov = override ?? {};
	const fields: Record<string, ResolvedField> = {};
	for (const f of form.fields) {
		const r = resolveField(form, f, ov.fields?.[f.key] ?? {}, variant);
		if (r) fields[f.key] = r;
	}
	const custom = (ov.custom ?? [])
		.filter((cf) => !cf.variants?.length || cf.variants.includes(variant))
		.map((cf): ResolvedField => {
			const rules = { ...(cf.rules ?? {}) };
			delete rules.options;
			if (TEXT_TYPES.has(cf.type)) rules.maxLength = Math.min(rules.maxLength ?? Infinity, CUSTOM_MAX_LENGTH[cf.type]);
			return {
				key: cf.key,
				label: cf.label,
				type: cf.type,
				visible: true,
				required: !!cf.required,
				placeholder: cf.placeholder || null,
				hint: cf.hint || null,
				rules,
				options: cf.options ?? null,
				custom: true,
			};
		});
	const labels = (ov.custom ?? []).map((cf) => ({
		key: cf.key,
		label: cf.label,
		type: cf.type,
		options: cf.options ?? null,
	}));
	return { formKey: form.key, variant, fields, custom, labels };
}
