import { apiClient } from '../../../shared/api/axios';
import type {
	CmeCreditCategory,
	CmeImportCreatedStaff,
	CmeRecord,
	CmeRecordFormData,
	CmeRecordImportResult,
	CmeRecordImportRow,
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
export const deleteCmeRecords = (ids: string[]) =>
	apiClient.post<{ deleted: number }>('/cme-records/bulk-delete', { ids });

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
	/** Dùng cho dòng để trống cột Số lượng */
	quantity?: number;
	/** Tạo nhân viên mới cho Mã NV chưa có trong hệ thống (cần quyền users:create) */
	create_missing?: boolean;
	/** Khoa/Phòng cho nhân viên mới khi file không có cột Khoa/Phòng */
	new_department_id?: string;
	/** Khoa chọn riêng cho từng nhân viên mới ở bước xem trước: { [Mã NV]: department_id } */
	staff_departments?: Record<number, string>;
	/** Họ tên nhập ở bước xem trước cho nhân viên mới mà file / hệ thống chưa có: { [Mã NV]: họ tên } */
	staff_names?: Record<number, string>;
}

export const importCmeRecordsExcel = (file: File, dryRun: boolean, defaults: CmeRecordImportDefaults) => {
	const form = new FormData();
	form.append('dry_run', dryRun ? '1' : '0');
	for (const [k, v] of Object.entries(defaults)) {
		if (v) form.append(k, v === true ? '1' : typeof v === 'object' ? JSON.stringify(v) : String(v));
	}
	form.append('file', file);
	return apiClient.postForm<CmeRecordImportResult>('/cme-records/import-excel', form);
};

/** Nút "Thêm NV" trong hộp thoại nhập — cần thêm quyền users:create */
export const createCmeImportStaff = (data: { staff_number: number; full_name: string; department_id: string }) =>
	apiClient.post<CmeImportCreatedStaff>('/cme-records/staff', data);

/** Nhập 1 dòng đã bị bỏ qua (sau khi thêm nhân viên) — dùng nguyên dữ liệu đã đọc từ file */
export const createCmeRecordFromImportRow = (row: CmeRecordImportRow, userId: string) =>
	apiClient.post<CmeRecord>('/cme-records', {
		user_id: userId,
		category_id: row.category_id,
		title: row.title,
		activity_date: row.activity_date,
		end_date: row.end_date,
		year: row.year,
		role: row.role,
		quantity: row.quantity,
		credits: row.credits,
		note: row.notes,
	});

export const downloadCmeRecordImportTemplate = () => apiClient.postBlob('/cme-records/import-template', {});

export interface CmeRecordExportFilters {
	/** Khoảng năm của báo cáo — trống = không giới hạn đầu đó, trống cả hai = mọi năm */
	from_year?: number;
	to_year?: number;
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
