import { apiClient } from '../../../shared/api/axios';
import { seg } from '../../../shared/api/path';

export interface CmeRequirement {
	id: string;
	year: number;
	required_credits: number;
	department_id: string | null;
	department_name: string | null;
	note: string | null;
}

export interface CmeComplianceRow {
	id: string;
	full_name: string;
	department_id: string | null;
	department_name: string | null;
	required_credits: number;
	earned_credits: number;
}

export const getCmeRequirements = (year: number) =>
	apiClient.get<CmeRequirement[]>(`/seminars/cme-requirements?year=${year}`);

export const createCmeRequirement = (data: {
	year: number;
	required_credits: number;
	department_id?: string;
	note?: string;
}) => apiClient.post<{ id: string }>('/seminars/cme-requirements', data);

export const updateCmeRequirement = (id: string, data: { required_credits?: number; note?: string }) =>
	apiClient.put<null>(`/seminars/cme-requirements/${seg(id)}`, data);

export const deleteCmeRequirement = (id: string) =>
	apiClient.delete<null>(`/seminars/cme-requirements/${seg(id)}`);

export const getCmeCompliance = (year: number) =>
	apiClient.get<CmeComplianceRow[]>(`/seminars/cme-compliance?year=${year}`);

/** Phiếu CME của 1 nhân sự (Excel): 1 năm, hoặc 'all' = tất cả các năm (mỗi năm thêm 1 sheet). */
export const exportPersonalCmeExcel = (userId: string, year: number | 'all') =>
	apiClient.postBlob(`/seminars/cme-personal/${encodeURIComponent(userId)}/export-excel`, { year });

// ── Chu kỳ 5 năm liên tục (Thông tư 32/2023/TT-BYT Điều 3) ─────────────────────

/** met = đã đủ · on_track = còn thiếu, hạn > 12 tháng · at_risk = còn thiếu, hạn ≤ 12 tháng · overdue_window = còn thiếu, còn ≤ 60 ngày. */
export type CmeCycleStatus = 'met' | 'on_track' | 'at_risk' | 'overdue_window';

/** license = chu kỳ tính từ ngày cấp giấy phép · calendar = chưa có ngày cấp, tạm tính theo năm lịch. */
export type CmeCycleBasis = 'license' | 'calendar';

export interface CmeCycleRow {
	id: string;
	full_name: string;
	staff_number: number | null;
	department_id: string | null;
	department_name: string | null;
	license_no: string | null;
	/** YYYY-MM-DD */
	cycle_start: string;
	/** YYYY-MM-DD */
	cycle_end: string;
	basis: CmeCycleBasis;
	required: number;
	earned: number;
	/** Phần của `earned` đến từ ghi nhận không có ngày */
	earned_undated: number;
	missing: number;
	days_left: number;
	status: CmeCycleStatus;
}

export interface CmeCycleSummary {
	total: number;
	met: number;
	on_track: number;
	at_risk: number;
	overdue_window: number;
}

export interface CmeCycleMeta {
	today: string;
	cycle_years: number;
	required_hours: number;
	renewal_window_days: number;
	at_risk_months: number;
}

export interface CmeCycleComplianceResult {
	data: CmeCycleRow[];
	/** `total` = số dòng sau lọc trạng thái */
	pagination: { page: number; limit: number; total: number };
	/** Đếm trên tập đã lọc phạm vi/khoa/tìm kiếm nhưng chưa lọc trạng thái */
	summary: CmeCycleSummary;
	meta: CmeCycleMeta;
}

export interface CmeCycleQuery {
	scope?: 'licensed' | 'all';
	department_id?: string;
	status?: CmeCycleStatus[];
	search?: string;
	sort?: 'urgency' | 'name';
	page?: number;
	limit?: number;
}

export const getCmeCycleCompliance = (q: CmeCycleQuery = {}) => {
	const p = new URLSearchParams();
	if (q.scope) p.set('scope', q.scope);
	if (q.department_id) p.set('department_id', q.department_id);
	if (q.status?.length) p.set('status', q.status.join(','));
	if (q.search?.trim()) p.set('search', q.search.trim());
	if (q.sort) p.set('sort', q.sort);
	if (q.page) p.set('page', String(q.page));
	if (q.limit !== undefined) p.set('limit', String(q.limit));
	const qs = p.toString();
	return apiClient.get<CmeCycleComplianceResult>(`/seminars/cme-cycle-compliance${qs ? `?${qs}` : ''}`);
};
