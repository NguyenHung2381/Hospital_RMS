// Luật cấu hình form — thuần JS, không chạm DB (test ở test/forms). Bản TS cùng
// ngữ nghĩa ở frontend/src/shared/formConfig/fieldRules.ts: sửa một bên thì
// sửa cả bên kia.
//
// Override lưu ở form_configs.config:
//   { fields: { <key>: { hidden: [variant], required, label, placeholder, hint, rules } },
//     custom: [ { key, label, type, variants, required, placeholder, hint, options, rules } ] }
// rules: minLength, maxLength, pattern, patternMessage, format, min, max, integer,
//        minDate, maxDate ('today' = ngày hiện tại), options (giá trị được chọn), maxItems

const CUSTOM_TYPES = [
	'text',
	'textarea',
	'number',
	'date',
	'select',
	'multiselect',
	'checkbox',
	'email',
	'phone',
];
const FORMATS = {
	email: { re: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, msg: 'không hợp lệ (vd: ten@benhvien.vn)' },
	phone: { re: /^(\+?84|0)\d{8,10}$/, msg: 'không hợp lệ (vd: 0912345678)', strip: /[\s.-]/g },
	cccd: { re: /^\d{12}$/, msg: 'phải gồm đúng 12 chữ số' },
	digits: { re: /^\d+$/, msg: 'chỉ được nhập chữ số' },
	url: { re: /^https?:\/\/\S+$/i, msg: 'phải là đường dẫn bắt đầu bằng http:// hoặc https://' },
};
const TEXT_TYPES = new Set(['text', 'textarea', 'email', 'phone']);
// Giới hạn mặc định cho trường tùy chỉnh — giá trị nằm chung 1 ô JSON
const CUSTOM_MAX_LENGTH = { text: 500, email: 100, phone: 20, textarea: 4000 };
const MAX_CUSTOM_FIELDS = 30;
const MAX_OPTIONS = 100;
const RULES_BY_TYPE = {
	text: ['minLength', 'maxLength', 'pattern', 'patternMessage', 'format'],
	textarea: ['minLength', 'maxLength', 'pattern', 'patternMessage'],
	email: ['maxLength'],
	phone: ['maxLength'],
	number: ['min', 'max', 'integer'],
	date: ['minDate', 'maxDate'],
	select: ['options'],
	multiselect: ['options', 'maxItems'],
	checkbox: [],
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}/;
const fmtNum = (n) => Number(n).toLocaleString('vi-VN');
const today = () => {
	const d = new Date();
	const p = (n) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const resolveDate = (v) => (v === 'today' ? today() : v);
const fmtDate = (v) => (v === 'today' ? 'hôm nay' : v.split('-').reverse().join('/'));

const inVariant = (spec, variant) =>
	spec === true || (Array.isArray(spec) && spec.includes(variant));
const fieldVariants = (form, field) => field.in || form.variants.map((v) => v.key);

const isEmpty = (field, v) =>
	v === undefined ||
	v === null ||
	(typeof v === 'string' && v.trim() === '') ||
	(Array.isArray(v) && v.length === 0) ||
	(field.type === 'checkbox' && v !== true && v !== 'true');

// ─── Resolve: registry + override → cấu hình 1 variant cho form chạy ──────────

const resolveField = (form, field, ov, variant) => {
	const variants = fieldVariants(form, field);
	if (!variants.includes(variant)) return null;
	const lockVisible = inVariant(field.lock?.visible, variant);
	const lockRequired = inVariant(field.lock?.required, variant);
	const hidden = !lockVisible && (ov.hidden || []).includes(variant);
	const required =
		lockRequired ||
		(ov.required !== undefined ? !!ov.required : inVariant(field.required, variant));
	const rules = { ...(field.base || {}), ...(ov.rules || {}) };
	let options = field.options;
	if (options && Array.isArray(ov.rules?.options))
		options = options.filter((o) => ov.rules.options.includes(o.value));
	delete rules.options;
	return {
		key: field.key,
		label: ov.label || field.label,
		// Form giữ nhãn đang viết trong JSX trừ khi admin đặt nhãn mới
		labelSet: !!ov.label,
		type: field.type,
		visible: !hidden,
		required: !hidden && required,
		placeholder: ov.placeholder || null,
		hint: ov.hint || null,
		rules,
		options: options || null,
		dynamic: !!field.dynamic,
		when: field.when || null,
		editOnly: inVariant(field.editOnly, variant),
	};
};

const resolveCustom = (cf, variant) => {
	if (Array.isArray(cf.variants) && cf.variants.length && !cf.variants.includes(variant))
		return null;
	const rules = { ...(cf.rules || {}) };
	if (TEXT_TYPES.has(cf.type))
		rules.maxLength = Math.min(rules.maxLength ?? Infinity, CUSTOM_MAX_LENGTH[cf.type]);
	return {
		key: cf.key,
		label: cf.label,
		type: cf.type,
		visible: true,
		required: !!cf.required,
		placeholder: cf.placeholder || null,
		hint: cf.hint || null,
		rules,
		options: cf.options || null,
		custom: true,
	};
};

const resolve = (form, override, variant) => {
	const ov = override || {};
	const fields = {};
	for (const f of form.fields) {
		const r = resolveField(form, f, ov.fields?.[f.key] || {}, variant);
		if (r) fields[f.key] = r;
	}
	const custom = (ov.custom || []).map((cf) => resolveCustom(cf, variant)).filter(Boolean);
	// Nhãn của MỌI trường tùy chỉnh (kể cả chỉ nhập ở form khác) — để trang chi
	// tiết hiển thị đủ giá trị đã lưu
	const labels = (ov.custom || []).map((cf) => ({
		key: cf.key,
		label: cf.label,
		type: cf.type,
		options: cf.options || null,
	}));
	return { formKey: form.key, variant, fields, custom, labels };
};

// ─── Kiểm 1 giá trị theo trường đã resolve → câu lỗi | null ─────────────────

const checkValue = (field, raw) => {
	const label = field.label;
	if (isEmpty(field, raw)) {
		if (!field.required) return null;
		if (field.type === 'checkbox') return `Vui lòng xác nhận "${label}"`;
		return field.type === 'select' || field.type === 'multiselect' || field.type === 'date'
			? `Vui lòng chọn ${label}`
			: `Vui lòng nhập ${label}`;
	}
	const r = field.rules || {};
	if (TEXT_TYPES.has(field.type)) {
		if (typeof raw !== 'string') return `${label} không hợp lệ`;
		const v = raw.trim();
		if (r.minLength && v.length < r.minLength)
			return `${label} phải có ít nhất ${r.minLength} ký tự`;
		if (r.maxLength && v.length > r.maxLength) return `${label} tối đa ${r.maxLength} ký tự`;
		const fmt = FORMATS[field.type === 'email' || field.type === 'phone' ? field.type : r.format];
		if (fmt && !fmt.re.test(fmt.strip ? v.replace(fmt.strip, '') : v)) return `${label} ${fmt.msg}`;
		if (r.pattern) {
			let re;
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
		if (r.min !== undefined && r.min !== null && n < r.min)
			return `${label} không được nhỏ hơn ${fmtNum(r.min)}`;
		if (r.max !== undefined && r.max !== null && n > r.max)
			return `${label} không được lớn hơn ${fmtNum(r.max)}`;
		return null;
	}
	if (field.type === 'date') {
		if (typeof raw !== 'string' || !DATE_RE.test(raw) || Number.isNaN(Date.parse(raw.slice(0, 10))))
			return `${label} không phải ngày hợp lệ`;
		const v = raw.slice(0, 10);
		if (r.minDate && v < resolveDate(r.minDate))
			return `${label} không được trước ${fmtDate(r.minDate)}`;
		if (r.maxDate && v > resolveDate(r.maxDate))
			return `${label} không được sau ${fmtDate(r.maxDate)}`;
		return null;
	}
	if (field.type === 'select') {
		if (field.dynamic || !field.options) return null;
		return field.options.some((o) => o.value === String(raw)) ? null : `${label} không hợp lệ`;
	}
	if (field.type === 'multiselect') {
		if (!Array.isArray(raw)) return `${label} không hợp lệ`;
		if (raw.some((x) => !(field.options || []).some((o) => o.value === x)))
			return `${label} không hợp lệ`;
		if (r.maxItems && raw.length > r.maxItems) return `${label} chọn tối đa ${r.maxItems} mục`;
		return null;
	}
	if (field.type === 'checkbox')
		return typeof raw === 'boolean' || raw === 'true' || raw === 'false'
			? null
			: `${label} không hợp lệ`;
	return null;
};

// Chuẩn hóa giá trị tùy chỉnh trước khi lưu JSON
const normalizeValue = (field, raw) => {
	if (isEmpty(field, raw)) return field.type === 'checkbox' ? false : null;
	if (TEXT_TYPES.has(field.type)) return raw.trim();
	if (field.type === 'number') return Number(raw);
	if (field.type === 'date') return raw.slice(0, 10);
	if (field.type === 'checkbox') return raw === true || raw === 'true';
	if (field.type === 'select') return String(raw);
	return raw;
};

const whenHolds = (when, values) => {
	if (!when) return true;
	return Object.entries(when).every(([k, v]) => values[k] === v);
};
const whenUnknown = (when, values) =>
	!!when && Object.keys(when).some((k) => values[k] === undefined);

// Kiểm cả form: values = body. mode 'update' = sửa từng phần — trường không gửi
// lên thì giữ nguyên, không bắt buộc lại. includeEditOnly: form tạo mới nhưng có
// cả trường "chỉ khi sửa" (nhập đề tài đã hoàn thành). Trả { errors: {key: msg}, custom }.
/**
 * @param {any} resolved
 * @param {Record<string, any>} values
 * @param {{ mode?: string, customValues?: Record<string, any>, includeEditOnly?: boolean }} [options]
 */
const validateValues = (
	resolved,
	values,
	{ mode = 'create', customValues, includeEditOnly = false } = {},
) => {
	const errors = {};
	for (const f of Object.values(resolved.fields)) {
		if (!f.visible) continue;
		const v = values[f.key];
		if (mode === 'update' && v === undefined) continue;
		if (mode === 'create' && f.editOnly && !includeEditOnly) continue;
		if (f.when && (whenUnknown(f.when, values) ? v === undefined : !whenHolds(f.when, values)))
			continue;
		const err = checkValue(
			mode === 'update' && whenUnknown(f.when, values) ? { ...f, required: false } : f,
			v,
		);
		if (err) errors[f.key] = err;
	}
	let custom = null;
	if (customValues !== undefined || mode === 'create') {
		const src =
			customValues && typeof customValues === 'object' && !Array.isArray(customValues)
				? customValues
				: {};
		custom = {};
		for (const f of resolved.custom) {
			const err = checkValue(f, src[f.key]);
			if (err) errors[f.key] = err;
			else custom[f.key] = normalizeValue(f, src[f.key]);
		}
	}
	return { errors, custom };
};

// ─── Kiểm override khi admin lưu → câu lỗi | null ───────────────────────────

const isStr = (v, max) =>
	v === undefined || v === null || (typeof v === 'string' && v.length <= max);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isDateRule = (v) =>
	v === 'today' ||
	(typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)));

// Regex do admin nhập chạy ở server với dữ liệu người dùng — chặn mẫu dễ gây
// backtracking (lượng từ lồng nhau) và giới hạn độ dài.
const checkPattern = (p) => {
	if (typeof p !== 'string' || !p || p.length > 200) return 'Mẫu kiểm tra tối đa 200 ký tự';
	if (/\((?:[^()\\]|\\.)*[+*}](?:[^()\\]|\\.)*\)\s*[+*{]/.test(p) || /\\[1-9]/.test(p))
		return 'Mẫu kiểm tra có lượng từ lồng nhau hoặc tham chiếu ngược — hãy viết đơn giản hơn';
	try {
		new RegExp(p, 'u');
	} catch {
		return 'Mẫu kiểm tra (regex) không hợp lệ';
	}
	return null;
};

const checkRules = (label, type, rules, base = {}, allOptions = null) => {
	if (rules === undefined || rules === null) return null;
	if (typeof rules !== 'object' || Array.isArray(rules)) return `${label}: ràng buộc không hợp lệ`;
	const allowed = RULES_BY_TYPE[type] || [];
	for (const k of Object.keys(rules)) {
		if (!allowed.includes(k)) return `${label}: không áp dụng được "${k}" cho loại trường này`;
	}
	const { minLength, maxLength, min, max, minDate, maxDate, maxItems } = rules;
	for (const [k, v] of Object.entries({ minLength, maxLength, maxItems })) {
		if (v !== undefined && (!Number.isInteger(v) || v < 0))
			return `${label}: ${k} phải là số nguyên ≥ 0`;
	}
	if (maxLength !== undefined && base.maxLength && maxLength > base.maxLength)
		return `${label}: độ dài tối đa không được vượt ${base.maxLength}`;
	if (minLength !== undefined && base.minLength && minLength < base.minLength)
		return `${label}: độ dài tối thiểu không được dưới ${base.minLength}`;
	if (minLength !== undefined && maxLength !== undefined && minLength > maxLength)
		return `${label}: độ dài tối thiểu lớn hơn tối đa`;
	if (min !== undefined && !isNum(min)) return `${label}: giá trị nhỏ nhất phải là số`;
	if (max !== undefined && !isNum(max)) return `${label}: giá trị lớn nhất phải là số`;
	if (min !== undefined && base.min !== undefined && min < base.min)
		return `${label}: giá trị nhỏ nhất không được dưới ${base.min}`;
	if (max !== undefined && base.max !== undefined && max > base.max)
		return `${label}: giá trị lớn nhất không được vượt ${base.max}`;
	if (min !== undefined && max !== undefined && min > max)
		return `${label}: giá trị nhỏ nhất lớn hơn lớn nhất`;
	if (rules.integer !== undefined && typeof rules.integer !== 'boolean')
		return `${label}: integer phải là true/false`;
	if (base.integer && rules.integer === false) return `${label}: luôn phải là số nguyên`;
	if (minDate !== undefined && !isDateRule(minDate)) return `${label}: ngày bắt đầu không hợp lệ`;
	if (maxDate !== undefined && !isDateRule(maxDate)) return `${label}: ngày kết thúc không hợp lệ`;
	if (minDate && maxDate && resolveDate(minDate) > resolveDate(maxDate))
		return `${label}: khoảng ngày không hợp lệ`;
	if (rules.format !== undefined && rules.format !== null && !FORMATS[rules.format])
		return `${label}: định dạng không hỗ trợ`;
	if (rules.pattern !== undefined && rules.pattern !== null && rules.pattern !== '') {
		const e = checkPattern(rules.pattern);
		if (e) return `${label}: ${e}`;
	}
	if (!isStr(rules.patternMessage, 200)) return `${label}: thông báo lỗi tối đa 200 ký tự`;
	if (rules.options !== undefined && allOptions) {
		if (!Array.isArray(rules.options) || !rules.options.length)
			return `${label}: phải giữ ít nhất 1 lựa chọn`;
		if (rules.options.some((o) => !allOptions.some((a) => a.value === o)))
			return `${label}: lựa chọn không có trong danh sách`;
	}
	return null;
};

const checkTexts = (label, o) => {
	if (!isStr(o.label, 200)) return `${label}: nhãn tối đa 200 ký tự`;
	if (!isStr(o.placeholder, 200)) return `${label}: gợi ý nhập tối đa 200 ký tự`;
	if (!isStr(o.hint, 500)) return `${label}: ghi chú tối đa 500 ký tự`;
	return null;
};

const validateOverride = (form, override) => {
	if (!override || typeof override !== 'object' || Array.isArray(override))
		return 'Cấu hình không hợp lệ';
	const variantKeys = form.variants.map((v) => v.key);
	const fields = override.fields || {};
	if (typeof fields !== 'object' || Array.isArray(fields)) return 'Cấu hình trường không hợp lệ';
	for (const [key, ov] of Object.entries(fields)) {
		const f = form.fields.find((x) => x.key === key);
		if (!f) return `Trường "${key}" không có trong form`;
		if (!ov || typeof ov !== 'object') return `${f.label}: cấu hình không hợp lệ`;
		const variants = fieldVariants(form, f);
		if (ov.hidden !== undefined) {
			if (!Array.isArray(ov.hidden) || ov.hidden.some((v) => !variants.includes(v)))
				return `${f.label}: danh sách form ẩn không hợp lệ`;
			if (ov.hidden.some((v) => inVariant(f.lock?.visible, v)))
				return `${f.label}: trường bắt buộc phải hiển thị`;
		}
		if (ov.required !== undefined && typeof ov.required !== 'boolean')
			return `${f.label}: bắt buộc phải là true/false`;
		if (ov.required === false && f.lock?.required === true)
			return `${f.label}: trường này luôn bắt buộc`;
		const e =
			checkTexts(f.label, ov) || checkRules(f.label, f.type, ov.rules, f.base, f.options || null);
		if (e) return e;
		if (ov.rules?.options !== undefined && !f.options)
			return `${f.label}: danh sách lấy từ danh mục, không giới hạn được`;
	}
	const custom = override.custom || [];
	if (!Array.isArray(custom)) return 'Danh sách trường tùy chỉnh không hợp lệ';
	if (custom.length > MAX_CUSTOM_FIELDS) return `Tối đa ${MAX_CUSTOM_FIELDS} trường tùy chỉnh`;
	const seen = new Set();
	for (const cf of custom) {
		if (!cf || typeof cf !== 'object') return 'Trường tùy chỉnh không hợp lệ';
		if (typeof cf.key !== 'string' || !/^cf_[a-z0-9_]{1,40}$/.test(cf.key))
			return 'Mã trường tùy chỉnh không hợp lệ';
		if (seen.has(cf.key)) return `Mã trường "${cf.key}" bị trùng`;
		seen.add(cf.key);
		const label = typeof cf.label === 'string' ? cf.label.trim() : '';
		if (!label) return 'Trường tùy chỉnh phải có nhãn';
		if (!CUSTOM_TYPES.includes(cf.type)) return `${label}: loại trường không hỗ trợ`;
		if (cf.required !== undefined && typeof cf.required !== 'boolean')
			return `${label}: bắt buộc phải là true/false`;
		if (
			cf.variants !== undefined &&
			(!Array.isArray(cf.variants) || cf.variants.some((v) => !variantKeys.includes(v)))
		)
			return `${label}: danh sách form áp dụng không hợp lệ`;
		const e =
			checkTexts(label, cf) ||
			checkRules(label, cf.type, cf.rules, { maxLength: CUSTOM_MAX_LENGTH[cf.type] });
		if (e) return e;
		if (cf.type === 'select' || cf.type === 'multiselect') {
			const opts = cf.options;
			if (!Array.isArray(opts) || !opts.length) return `${label}: cần ít nhất 1 lựa chọn`;
			if (opts.length > MAX_OPTIONS) return `${label}: tối đa ${MAX_OPTIONS} lựa chọn`;
			const vals = new Set();
			for (const o of opts) {
				if (!o || typeof o.value !== 'string' || !o.value.trim() || o.value.length > 100)
					return `${label}: giá trị lựa chọn không hợp lệ`;
				if (typeof o.label !== 'string' || !o.label.trim() || o.label.length > 200)
					return `${label}: tên lựa chọn không hợp lệ`;
				if (vals.has(o.value)) return `${label}: lựa chọn "${o.value}" bị trùng`;
				vals.add(o.value);
			}
		} else if (cf.options !== undefined && cf.options !== null) {
			return `${label}: loại trường này không có danh sách lựa chọn`;
		}
	}
	return null;
};

module.exports = {
	CUSTOM_TYPES,
	FORMATS,
	resolve,
	checkValue,
	normalizeValue,
	validateValues,
	validateOverride,
	checkPattern,
};
