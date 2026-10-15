import { apiClient } from '@/shared/api/axios';
import {
	LICENSE_FIELDS,
	type LicenseImportResult,
	type StaffLicense,
	type StaffLicenseFormData,
	type StaffLicenseListResponse,
} from '../types/staffLicense.type';

export interface StaffLicenseListParams {
	page: number;
	limit: number;
	search?: string;
	department_id?: string;
	has_license?: string;
}

export const getStaffLicenses = (params: StaffLicenseListParams) => {
	const entries = Object.entries(params)
		.filter(([, v]) => v !== undefined && v !== '')
		.map(([k, v]) => [k, String(v)] as [string, string]);
	return apiClient.get<StaffLicenseListResponse>(`/staff-licenses?${new URLSearchParams(entries).toString()}`);
};

// Ô để trống → null (xoá giá trị cũ)
const toPayload = (form: StaffLicenseFormData) =>
	Object.fromEntries(LICENSE_FIELDS.map((f) => [f, form[f].trim() || null]));

export const createStaffLicense = (form: StaffLicenseFormData) =>
	apiClient.post<StaffLicense>('/staff-licenses', { user_id: form.user_id, ...toPayload(form) });

export const updateStaffLicense = (id: string, form: StaffLicenseFormData) =>
	apiClient.put<StaffLicense>(`/staff-licenses/${id}`, toPayload(form));

export const deleteStaffLicense = (id: string) => apiClient.delete<null>(`/staff-licenses/${id}`);

export const importStaffLicensesExcel = (file: File, dryRun: boolean) => {
	const form = new FormData();
	form.append('dry_run', dryRun ? '1' : '0');
	form.append('file', file);
	return apiClient.postForm<LicenseImportResult>('/staff-licenses/import-excel', form);
};
