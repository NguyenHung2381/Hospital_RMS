import { apiClient } from '../../../shared/api/axios';

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
	apiClient.put<null>(`/seminars/cme-requirements/${id}`, data);

export const deleteCmeRequirement = (id: string) =>
	apiClient.delete<null>(`/seminars/cme-requirements/${id}`);

export const getCmeCompliance = (year: number) =>
	apiClient.get<CmeComplianceRow[]>(`/seminars/cme-compliance?year=${year}`);

/** Phiếu theo dõi CME của 1 nhân sự (Excel): năm được chọn + tổng hợp 5 năm. */
export const exportPersonalCmeExcel = (userId: string, year: number) =>
	apiClient.postBlob(`/seminars/cme-personal/${encodeURIComponent(userId)}/export-excel`, { year });
