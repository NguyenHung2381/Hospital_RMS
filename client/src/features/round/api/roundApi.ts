import { apiClient } from '../../../shared/api/axios';
import type {
	DeadlineType,
	ResearchRound,
	RoundDeadline,
	RoundForm,
	RoundStatus,
} from '../types/round.type';

export interface RoundListParams {
	page?: number;
	limit?: number;
	year?: number;
	status?: RoundStatus;
	public_token?: string;
}

interface RoundListResponse {
	data: ResearchRound[];
	pagination: { page: number; limit: number; total: number };
}

export interface CreateRoundPayload {
	name: string;
	year: number;
	dot_so: number;
	start_date: string; // yyyy-mm-dd
	end_date: string; // yyyy-mm-dd
	registration_start_date?: string; // yyyy-mm-dd
	registration_end_date?: string; // yyyy-mm-dd
	status?: RoundStatus;
}

export interface UpdateRoundPayload {
	name?: string;
	year?: number;
	dot_so?: number;
	start_date?: string; // yyyy-mm-dd
	end_date?: string; // yyyy-mm-dd
	registration_start_date?: string; // yyyy-mm-dd or null to clear
	registration_end_date?: string; // yyyy-mm-dd or null to clear
	status?: RoundStatus;
}

export interface DeadlinePayload {
	name: string;
	start_date?: string | null; // yyyy-mm-dd
	deadline_date: string; // yyyy-mm-dd
	deadline_type?: DeadlineType | null;
}

// dd/mm/yyyy → yyyy-mm-dd
function toApiDate(s: string): string {
	if (!s) return '';
	const [d, m, y] = s.split('/');
	return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

export function formToPayload(form: RoundForm): CreateRoundPayload {
	return {
		name: form.name,
		year: form.year,
		dot_so: form.dot_so,
		start_date: toApiDate(form.start_date),
		end_date: toApiDate(form.end_date),
		registration_start_date: form.registration_start_date
			? toApiDate(form.registration_start_date)
			: undefined,
		registration_end_date: form.registration_end_date
			? toApiDate(form.registration_end_date)
			: undefined,
		status: form.status,
	};
}

export const getRounds = (params?: RoundListParams) => {
	const entries = Object.entries(params ?? {})
		.filter(([, v]) => v !== undefined && v !== '')
		.map(([k, v]) => [k, String(v)] as [string, string]);
	const qs = entries.length
		? '?' + new URLSearchParams(entries).toString()
		: '';
	return apiClient.get<RoundListResponse>(`/research-rounds${qs}`);
};

export const createRound = (payload: CreateRoundPayload) =>
	apiClient.post<ResearchRound>('/research-rounds', payload);

export const updateRound = (id: string, payload: UpdateRoundPayload) =>
	apiClient.put<ResearchRound>(`/research-rounds/${id}`, payload);

export const deleteRound = (id: string) =>
	apiClient.delete<null>(`/research-rounds/${id}`);

export const getRoundById = (id: string) =>
	apiClient.get<ResearchRound>(`/research-rounds/${id}`);

export const getRoundByPublicToken = (token: string) =>
	apiClient
		.get<RoundListResponse>(
			`/research-rounds?public_token=${encodeURIComponent(token)}&limit=1`,
		)
		.then((res) => res.data.find((r) => r.public_token === token) ?? null);

// ─── Supplement Window API ────────────────────────────────────────────────────
export interface SupplementWindowPayload {
	supplement_start: string; // yyyy-mm-dd
	supplement_end: string; // yyyy-mm-dd
}

export const openSupplementWindow = (
	id: string,
	payload: SupplementWindowPayload,
) =>
	apiClient.post<{ topics_opened: number }>(
		`/research-rounds/${id}/supplement/open`,
		payload,
	);

export const closeSupplementWindow = (id: string) =>
	apiClient.post<{ topics_closed: number }>(
		`/research-rounds/${id}/supplement/close`,
		{},
	);

// ─── Deadline API ──────────────────────────────────────────────────────────────
export const getDeadlines = (roundId: string) =>
	apiClient.get<RoundDeadline[]>(`/research-rounds/${roundId}/deadlines`);

export const upsertDeadline = (
	roundId: string,
	phase: number,
	payload: DeadlinePayload,
) =>
	apiClient.post<RoundDeadline>(
		`/research-rounds/${roundId}/deadlines/${phase}`,
		payload,
	);

export const deleteDeadline = (roundId: string, phase: number) =>
	apiClient.delete<null>(`/research-rounds/${roundId}/deadlines/${phase}`);
