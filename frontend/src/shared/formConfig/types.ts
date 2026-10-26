// Kiểu dữ liệu cấu hình form — khớp backend modules/forms (formRegistry.js, fieldRules.js).

export type BuiltinFieldType = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'email' | 'phone';
export type CustomFieldType =
	'text' | 'textarea' | 'number' | 'date' | 'select' | 'multiselect' | 'checkbox' | 'email' | 'phone';
export type FieldType = BuiltinFieldType | CustomFieldType;

export type TextFormat = 'email' | 'phone' | 'cccd' | 'digits' | 'url';

export interface FieldRules {
	minLength?: number;
	maxLength?: number;
	pattern?: string;
	patternMessage?: string;
	format?: TextFormat;
	min?: number;
	max?: number;
	integer?: boolean;
	/** 'YYYY-MM-DD' hoặc 'today' */
	minDate?: string;
	maxDate?: string;
	maxItems?: number;
	/** Chỉ ở override trường có sẵn: giá trị select được giữ lại */
	options?: string[];
}

export interface FieldOption {
	value: string;
	label: string;
}

/** Trường đã ghép cấu hình cho 1 form cụ thể (GET /form-configs/:formKey?variant=) */
export interface ResolvedField {
	key: string;
	label: string;
	labelSet?: boolean;
	type: FieldType;
	visible: boolean;
	required: boolean;
	placeholder: string | null;
	hint: string | null;
	rules: Omit<FieldRules, 'options'>;
	options: FieldOption[] | null;
	dynamic?: boolean;
	when?: Record<string, string> | null;
	/** Chỉ có ở form sửa — lúc tạo mới không kiểm */
	editOnly?: boolean;
	custom?: boolean;
}

export interface ResolvedForm {
	formKey: string;
	variant: string;
	fields: Record<string, ResolvedField>;
	custom: ResolvedField[];
	/** Mọi trường tùy chỉnh (kể cả chỉ nhập ở form khác) — để hiển thị giá trị đã lưu */
	labels: Pick<ResolvedField, 'key' | 'label' | 'type' | 'options'>[];
}

export type CustomValues = Record<string, unknown>;

// ─── Trang quản trị ─────────────────────────────────────────────────────────

export type VariantSpec = boolean | string[];

export interface RegistryField {
	key: string;
	label: string;
	type: BuiltinFieldType;
	in?: string[];
	required?: VariantSpec;
	lock?: { visible?: VariantSpec; required?: VariantSpec };
	base?: FieldRules;
	options?: FieldOption[];
	when?: Record<string, string>;
	dynamic?: boolean;
	editOnly?: boolean;
}

export interface FieldOverride {
	hidden?: string[];
	required?: boolean;
	label?: string;
	placeholder?: string;
	hint?: string;
	rules?: FieldRules;
}

export interface CustomFieldDef {
	key: string;
	label: string;
	type: CustomFieldType;
	variants?: string[];
	required?: boolean;
	placeholder?: string;
	hint?: string;
	options?: FieldOption[];
	rules?: FieldRules;
}

export interface FormOverride {
	fields?: Record<string, FieldOverride>;
	custom?: CustomFieldDef[];
}

export interface FormDefinition {
	key: string;
	module: string;
	title: string;
	description?: string;
	variants: { key: string; label: string }[];
	fields: RegistryField[];
	override: FormOverride | null;
	updated_at: string | null;
	updated_by: string | null;
}
