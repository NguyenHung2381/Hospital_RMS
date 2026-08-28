import { apiClient } from '../../../shared/api/axios';
import type { ExternalReviewer, ExternalReviewerForm } from '../types/council.type';

export const getExternalReviewers = (params?: { search?: string; active_only?: boolean }) => {
	const entries = Object.entries(params ?? {})
		.filter(([, v]) => v !== undefined && v !== '')
		.map(([k, v]) => [k, String(v)] as [string, string]);
	const qs = entries.length ? '?' + new URLSearchParams(entries).toString() : '';
	return apiClient.get<ExternalReviewer[]>(`/external-reviewers${qs}`);
};

const toPayload = (form: ExternalReviewerForm) => ({
	full_name: form.full_name,
	organization: form.organization || null,
	specialty_group: form.specialty_group || null,
	phone: form.phone || null,
	email: form.email || null,
	note: form.note || null,
});

export const createExternalReviewer = (form: ExternalReviewerForm) =>
	apiClient.post<ExternalReviewer>('/external-reviewers', toPayload(form));

export const updateExternalReviewer = (id: string, form: ExternalReviewerForm) =>
	apiClient.put<ExternalReviewer>(`/external-reviewers/${id}`, toPayload(form));

/** Cập nhật một phần (dùng cho sửa hàng loạt) — server chỉ ghi trường được gửi. */
export type ExternalReviewerPatch = Partial<{
	organization: string | null;
	specialty_group: string | null;
	is_active: boolean;
}>;

export const patchExternalReviewer = (id: string, patch: ExternalReviewerPatch) =>
	apiClient.put<ExternalReviewer>(`/external-reviewers/${id}`, patch);

export const deleteExternalReviewer = (id: string) =>
	apiClient.delete<null>(`/external-reviewers/${id}`);
