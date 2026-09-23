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
	activity_date: form.activity_date,
	credits: Number(form.credits),
	note: form.note || null,
});

export const createCmeRecord = (form: CmeRecordFormData) =>
	apiClient.post<CmeRecord>('/cme-records', toPayload(form));

export const updateCmeRecord = (id: string, form: CmeRecordFormData) =>
	apiClient.put<CmeRecord>(`/cme-records/${id}`, toPayload(form));

export const deleteCmeRecord = (id: string) => apiClient.delete<null>(`/cme-records/${id}`);

export const addCmeRecordEvidence = (id: string, file: File) => {
	const form = new FormData();
	form.append('file', file);
	return apiClient.postForm<CmeRecord>(`/cme-records/${id}/evidence`, form);
};

export const importCmeRecordsExcel = (file: File, dryRun: boolean) => {
	const form = new FormData();
	form.append('dry_run', dryRun ? '1' : '0');
	form.append('file', file);
	return apiClient.postForm<CmeRecordImportResult>('/cme-records/import-excel', form);
};

export const getCmeCreditCategories = () =>
	apiClient.get<{ data: CmeCreditCategory[] }>('/cme-credit-categories?limit=0');
