import { apiClient } from '@/shared/api/axios';
import { toIsoDate } from '@/shared/utils/formatDate';

/**
 * Cột cho <ExcelActions>: có `value` → được xuất; có `key` → được nhập. Dùng cùng
 * `header` cho cả hai để file xuất ra nhập lại được.
 */
export interface ExcelColumn<T> {
	header: string;
	value?: (row: T) => string | number | null | undefined;
	key?: string;
	required?: boolean;
}

export type ExcelRecord = Record<string, string>;

/** So khớp tiêu đề/nhãn: bỏ dấu, bỏ "*", gộp khoảng trắng, chữ thường. */
export const norm = (s: string) =>
	s
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/đ/gi, 'd')
		.replace(/\*/g, '')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();

export const buildExcel = (fileName: string, sheetName: string, headers: string[], rows: unknown[][]) =>
	apiClient.postBlob('/excel/build', { fileName, sheetName, headers, rows });

/**
 * Chữ trong ô Excel → giá trị: khớp nhãn hoặc chính giá trị (bỏ dấu, không phân biệt hoa thường).
 * Ô trống → undefined; có chữ mà không khớp → ném lỗi để dòng đó bị báo lỗi.
 * Dùng cho enum (`{ both: 'Bảo vệ & Đào tạo' }`) lẫn danh mục (`{ [id]: name }`).
 */
export function matchLabel<V extends string>(labels: Record<V, string>, text: string, field: string): V | undefined {
	const t = norm(text);
	if (!t) return undefined;
	const hit = (Object.keys(labels) as V[]).find((k) => norm(k) === t || norm(labels[k]) === t);
	if (!hit) throw new Error(`${field} "${text}" không có trong danh mục`);
	return hit;
}

/** { id: name } từ danh sách để dùng với matchLabel. */
export const nameMap = <T extends { id: string }>(list: T[], name: (x: T) => string) =>
	Object.fromEntries(list.map((x) => [x.id, name(x)])) as Record<string, string>;

/** "Có" / "x" / "1" / "Đang dùng"… → true; ô trống → `fallback`. */
export const isYes = (text: string, fallback = false) => {
	const t = norm(text);
	if (!t) return fallback;
	return ['co', 'x', '1', 'yes', 'true', 'dang dung', 'hoat dong', 'dang hoat dong', 'bat'].includes(t);
};

/** Số từ ô Excel ("1.5", "1,5") → chuỗi số; ô trống → ''. */
export const numText = (text: string) => text.replace(',', '.').replace(/\s/g, '');

/** Ngày dd/mm/yyyy (hoặc yyyy-mm-dd) → 'YYYY-MM-DD'; ô trống → ''; sai định dạng → ném lỗi. */
export const dateText = (text: string, field: string) => {
	if (!text.trim()) return '';
	const iso = toIsoDate(text);
	if (!iso) throw new Error(`${field} "${text}" không đúng dạng dd/mm/yyyy`);
	return iso;
};
