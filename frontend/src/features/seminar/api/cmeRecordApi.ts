import { apiClient } from '../../../shared/api/axios';
import type {
	CmeCreditCategory,
	CmeRecord,
	CmeRecordFormData,
	CmeRecordImportResult,
	CmeRecordListResponse,
} from '../types/cmeRecord.type';

export const getCmeRecords = (params: { year?: number; user_id?: string; category_id?: string } = {}) => {
	const qs = new URLSearchParams({ limit: '0' });
	if (params.year) qs.set('year', String(params.year));
	if (params.user_id) qs.set('user_id', params.user_id);
	if (params.category_id) qs.set('category_id', params.category_id);
	return apiClient.get<CmeRecordListResponse>(`/cme-records?${qs.toString()}`);
};

const toPayload = (form: CmeRecordFormData) => ({
	user_id: form.user_id,
	category_id: form.category_id || null,
	title: form.title,
	activity_date: form.activity_date || null,
	end_date: form.end_date || null,
	year: Number(form.year) || null,
	role: form.role || null,
	quantity: form.quantity === '' ? null : Number(form.quantity),
	credits: Number(form.credits),
	note: form.note || null,
});

export const createCmeRecord = (form: CmeRecordFormData) =>
	apiClient.post<CmeRecord>('/cme-records', toPayload(form));

export const updateCmeRecord = (id: string, form: CmeRecordFormData) =>
	apiClient.put<CmeRecord>(`/cme-records/${id}`, toPayload(form));

export const approveCmeRecord = (id: string) => apiClient.post<CmeRecord>(`/cme-records/${id}/approve`, {});
export const rejectCmeRecord = (id: string, reason: string) =>
	apiClient.post<CmeRecord>(`/cme-records/${id}/reject`, { reason });

export const deleteCmeRecord = (id: string) => apiClient.delete<null>(`/cme-records/${id}`);

export const addCmeRecordEvidence = (id: string, file: File) => {
	const form = new FormData();
	form.append('file', file);
	return apiClient.postForm<CmeRecord>(`/cme-records/${id}/evidence`, form);
};

// Giá trị mặc định chọn ở hộp thoại — áp cho dòng để trống ô tương ứng trong file
export interface CmeRecordImportDefaults {
	year: number;
	group_id?: string;
	category_id?: string;
	title?: string;
}

export const importCmeRecordsExcel = (file: File, dryRun: boolean, defaults: CmeRecordImportDefaults) => {
	const form = new FormData();
	form.append('dry_run', dryRun ? '1' : '0');
	for (const [k, v] of Object.entries(defaults)) if (v) form.append(k, String(v));
	form.append('file', file);
	return apiClient.postForm<CmeRecordImportResult>('/cme-records/import-excel', form);
};

export const downloadCmeRecordImportTemplate = () => apiClient.postBlob('/cme-records/import-template', {});

export interface CmeRecordExportFilters {
	year?: number;
	search?: string;
	department?: string;
	category_id?: string;
	evidence?: 'yes' | 'no';
}

export const exportCmeRecordsExcel = (filters: CmeRecordExportFilters) =>
	apiClient.postBlob('/cme-records/export-excel', filters);

export const getCmeCreditGroups = () =>
	apiClient.get<{ data: { id: string; name: string }[] }>('/cme-credit-groups?limit=0');
export const getCmeCreditCategories = () =>
	apiClient.get<{ data: CmeCreditCategory[] }>('/cme-credit-categories?limit=0');
