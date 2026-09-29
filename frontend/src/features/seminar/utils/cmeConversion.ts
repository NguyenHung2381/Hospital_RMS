import type { BadgeTone } from '../../../shared/components/Badge/badgeTone';
import type { CmeConversionMethod, CmeCreditCategoryItem } from '../types/cmeCatalog.type';

export const CONVERSION_METHOD: Record<
	CmeConversionMethod,
	{ label: string; tone: BadgeTone; hint: string }
> = {
	per_session: {
		label: 'Theo tiết',
		tone: 'blue',
		hint: 'Số giờ CME = số tiết/buổi thực tế × số giờ quy đổi',
	},
	fixed: {
		label: 'Cố định',
		tone: 'green',
		hint: 'Mỗi lần tham gia được cộng đúng số giờ quy đổi',
	},
	per_year: {
		label: 'Theo năm',
		tone: 'purple',
		hint: 'Cộng số giờ quy đổi cho mỗi năm tham gia',
	},
};

export const UNIT_SUGGESTIONS = [
	'tiết',
	'buổi',
	'báo cáo',
	'bài',
	'nhiệm vụ',
	'tài liệu',
	'văn bản',
	'hội đồng',
	'ca bệnh',
	'luận văn',
	'năm',
	'lần',
];

const fmt = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 2 });

// "2 giờ/buổi"; giá trị 0 hoặc trống = nhập số tín chỉ trực tiếp (mục "Khác").
export function formatConversion(c: Pick<CmeCreditCategoryItem, 'conversion_value' | 'unit_label'>) {
	const v = c.conversion_value == null ? null : Number(c.conversion_value);
	if (!v) return 'Nhập trực tiếp';
	return `${fmt(v)} giờ/${c.unit_label || 'lần'}`;
}
