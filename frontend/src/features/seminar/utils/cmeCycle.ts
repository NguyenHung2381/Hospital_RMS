import type { BadgeTone } from '@/shared/components';
import type { CmeCycleBasis, CmeCycleStatus } from '../api/cmeRequirementApi';

/** Nhãn + tông màu theo trạng thái chu kỳ. Hồng magenta không dùng ở đây (dành cho "chờ bạn xử lý"). */
export const CME_CYCLE_STATUS: Record<CmeCycleStatus, { label: string; tone: BadgeTone }> = {
	met: { label: 'Đã đủ', tone: 'green' },
	on_track: { label: 'Đang theo dõi', tone: 'gray' },
	at_risk: { label: 'Cần chú ý', tone: 'amber' },
	overdue_window: { label: 'Sắp hết hạn', tone: 'red' },
};

export const CME_CYCLE_BASIS_NOTE: Record<CmeCycleBasis, string | null> = {
	license: null,
	calendar: 'Chưa có ngày cấp giấy phép — tạm tính theo năm lịch',
};

/** Số giờ tín chỉ: bỏ phần thập phân thừa (90 → "90", 90.5 → "90,5"). */
export function formatHours(n: number): string {
	return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(n);
}

/** Thời gian còn lại đến hết chu kỳ: "x ngày" khi ≤ 90 ngày, còn lại "x tháng" / "x năm y tháng".
 *  basis = 'calendar': ngày cuối chu kỳ chỉ là 31/12 của cửa sổ năm lịch, không phải hạn gia hạn thật. */
export function formatDaysLeft(days: number, basis: CmeCycleBasis = 'license'): string {
	if (basis === 'calendar') return 'Chưa rõ hạn';
	if (days < 0) return `Quá hạn ${-days} ngày`;
	if (days <= 90) return `${days} ngày`;
	const months = Math.floor(days / 30.4375);
	if (months < 12) return `${months} tháng`;
	const y = Math.floor(months / 12);
	const m = months % 12;
	return m === 0 ? `${y} năm` : `${y} năm ${m} tháng`;
}
