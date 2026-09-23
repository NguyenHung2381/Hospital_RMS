import { apiClient } from '../../../shared/api/axios';
import type {
	FieldChoice,
	MergeCandidateDetail,
	MergeListResponse,
	MergeReason,
	MergeResult,
	MergeStats,
	MergeStatus,
	Side,
} from '../types/personMerge.type';

export interface MergeListParams {
	status: MergeStatus;
	reason?: MergeReason | '';
	search?: string;
	page?: number;
	limit?: number;
}

const qs = (params: Record<string, string | number | undefined>) =>
	new URLSearchParams(
		Object.entries(params)
			.filter(([, v]) => v !== undefined && v !== '')
			.map(([k, v]) => [k, String(v)] as [string, string]),
	).toString();

export const getMergeCandidates = (p: MergeListParams) =>
	apiClient.get<MergeListResponse>(`/persons/merge-candidates?${qs({ ...p })}`);

export const getMergeStats = () => apiClient.get<MergeStats>('/persons/merge-candidates/stats');

export const getMergeCandidate = (id: number) =>
	apiClient.get<MergeCandidateDetail>(`/persons/merge-candidates/${id}`);

export const mergeCandidate = (id: number, body: { keep: Side; fields: FieldChoice; note?: string }) =>
	apiClient.post<MergeResult>(`/persons/merge-candidates/${id}/merge`, body);

export const rejectCandidate = (id: number, note?: string) =>
	apiClient.post<{ id: number; status: MergeStatus }>(`/persons/merge-candidates/${id}/reject`, { note });

export const reopenCandidate = (id: number) =>
	apiClient.post<{ id: number; status: MergeStatus }>(`/persons/merge-candidates/${id}/reopen`, {});
