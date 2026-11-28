import { apiClient } from '../../../shared/api/axios';
import { getBlob } from '../../course/api/registrationApi';
import type { PdfRect } from '../utils/pdfDoc';

export type SignRequestStatus = 'in_progress' | 'completed' | 'rejected' | 'cancelled';
export type SignerStatus = 'waiting' | 'pending' | 'signed' | 'rejected' | 'skipped';
export type SignRequestBox = 'todo' | 'sent' | 'involved' | 'all';

export interface SignRequestSummary {
	id: number;
	title: string;
	status: SignRequestStatus;
	current_step: number;
	total_steps: number;
	doc_count: number;
	signer_count: number;
	signed_count: number;
	due_date: string | null;
	created_at: string;
	completed_at: string | null;
	created_by: string;
	creator_name: string;
	my_status: SignerStatus | null;
	/** Mọi văn bản đã có khung đặt sẵn cho tôi — ký hàng loạt được */
	ready_for_batch: boolean;
}

export interface SignRequestSigner {
	id: number;
	user_id: string;
	full_name: string;
	department_name: string | null;
	status: SignerStatus;
	acted_at: string | null;
	note: string | null;
}

export interface SignRequestDetail {
	id: number;
	title: string;
	message: string | null;
	status: SignRequestStatus;
	current_step: number;
	total_steps: number;
	due_date: string | null;
	created_at: string;
	completed_at: string | null;
	created_by: string;
	creator_name: string;
	documents: { id: number; file_name: string; page_count: number | null; current_version: number }[];
	steps: { step_no: number; mode: 'all' | 'any'; signers: SignRequestSigner[] }[];
	fields: (PdfRect & { id: number; document_id: number; signer_id: number })[];
	events: { action: string; actor_id: string | null; actor_name: string | null; note: string | null; created_at: string }[];
	me: { signer_id: number; status: SignerStatus; step_no: number } | null;
	can_sign: boolean;
	can_reject: boolean;
	can_cancel: boolean;
	missing_field_document_ids: number[];
}

export interface CreateSignRequest {
	title: string;
	message?: string | null;
	due_date?: string | null;
	steps: { mode: 'all' | 'any'; signers: string[] }[];
	fields?: (PdfRect & { doc: number; user_id: string })[];
}

export interface UserOption {
	id: string;
	full_name: string;
	username?: string;
	staff_number?: string | null;
}

const qs = (p: Record<string, string | number | undefined | null>) => {
	const sp = new URLSearchParams();
	for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
	const s = sp.toString();
	return s ? `?${s}` : '';
};

export const signRequestApi = {
	list: (q: { box: SignRequestBox; status?: string; search?: string; page?: number; limit?: number }) =>
		apiClient.get<{ items: SignRequestSummary[]; total: number; page: number; limit: number }>(
			`/sign-requests${qs(q)}`,
		),
	todoCount: () => apiClient.get<{ count: number }>('/sign-requests/todo-count'),
	detail: (id: number) => apiClient.get<SignRequestDetail>(`/sign-requests/${id}`),
	file: (id: number, docId: number, version?: number) =>
		getBlob(`/sign-requests/${id}/documents/${docId}/file${version ? `?version=${version}` : ''}`),
	create: (files: File[], data: CreateSignRequest) => {
		const form = new FormData();
		files.forEach((f) => form.append('files', f));
		form.append('data', JSON.stringify(data));
		return apiClient.postForm<SignRequestDetail>('/sign-requests', form);
	},
	sign: (id: number, body: { placements?: (PdfRect & { document_id: number })[]; note?: string | null }) =>
		apiClient.post<SignRequestDetail>(`/sign-requests/${id}/sign`, body),
	batchSign: (ids: number[]) =>
		apiClient.post<{ results: { id: number; ok: boolean; message?: string }[]; signed: number; failed: number }>(
			'/sign-requests/batch-sign',
			{ ids },
		),
	reject: (id: number, reason: string) => apiClient.post<SignRequestDetail>(`/sign-requests/${id}/reject`, { reason }),
	cancel: (id: number, reason?: string) => apiClient.post<SignRequestDetail>(`/sign-requests/${id}/cancel`, { reason }),
	searchUsers: async (q: string) => {
		const r = await apiClient.get<{ data: UserOption[] }>(`/users/search${qs({ q, limit: 10 })}`);
		return r.data ?? [];
	},
};

export const REQUEST_STATUS: Record<SignRequestStatus, { label: string; tone: 'blue' | 'green' | 'red' | 'gray' }> = {
	in_progress: { label: 'Đang trình ký', tone: 'blue' },
	completed: { label: 'Đã ký xong', tone: 'green' },
	rejected: { label: 'Bị từ chối', tone: 'red' },
	cancelled: { label: 'Đã hủy', tone: 'gray' },
};
export const SIGNER_STATUS: Record<SignerStatus, { label: string; tone: 'gray' | 'pink' | 'green' | 'red' }> = {
	waiting: { label: 'Chưa tới lượt', tone: 'gray' },
	pending: { label: 'Đang chờ ký', tone: 'pink' },
	signed: { label: 'Đã ký', tone: 'green' },
	rejected: { label: 'Từ chối', tone: 'red' },
	skipped: { label: 'Không cần ký', tone: 'gray' },
};
