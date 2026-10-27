import type { FieldOption, FieldOverride, FieldRules, FieldType } from '../../../shared/formConfig/types';

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

/** Có thay đổi gì so với mặc định không — để đánh dấu dòng. */
export const isOverridden = (ov?: FieldOverride) =>
	!!ov &&
	(!!ov.hidden?.length || ov.required !== undefined || !!ov.label || !!ov.placeholder || !!ov.hint || !!ov.rules);

/** Bỏ khóa undefined để override gọn (không lưu "rules": {} rỗng). */
export const cleanRules = (r: FieldRules): FieldRules | undefined => {
	const out = Object.fromEntries(Object.entries(r).filter(([, v]) => v !== undefined && v !== '')) as FieldRules;
	return Object.keys(out).length ? out : undefined;
};

/** Có ràng buộc nào cấu hình được cho loại này không (ẩn nút "Ràng buộc" nếu không). */
export const hasRules = (type: FieldType, options?: FieldOption[] | null, dynamic?: boolean) =>
	type !== 'checkbox' && !(type === 'select' && (dynamic || !options));

// Giá trị điều kiện `when` → chữ hiển thị (loại đăng ký đề tài, loại khóa học)
const WHEN_VALUE: Record<string, string> = { de_tai: 'đề tài', bai_bao: 'bài báo', 'TRNTP-DTLT': 'khóa ĐTLT', dropped: 'nghỉ học' };
export const whenLabel = (when: Record<string, string>) =>
	`Chỉ với ${Object.values(when)
		.map((v) => WHEN_VALUE[v] ?? v)
		.join(', ')}`;
