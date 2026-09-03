import { apiClient } from '../../../shared/api/axios';
import type {
	CmeRegister,
	CmeStats,
	ParticipantForm,
	ParticipantImportResult,
	Seminar,
	SeminarForm,
	SeminarListResponse,
	SeminarParticipant,
} from '../types/seminar.type';

export interface SeminarListParams {
	page?: number;
	limit?: number;
	search?: string;
	scope?: string;
	event_type?: string;
	year?: number | string;
	grants_cme?: '1';
}

const qs = (params?: Record<string, unknown>) => {
	const entries = Object.entries(params ?? {})
		.filter(([, v]) => v !== undefined && v !== '' && v !== null)
		.map(([k, v]) => [k, String(v)] as [string, string]);
	return entries.length ? '?' + new URLSearchParams(entries).toString() : '';
};

const numOrNull = (v: string) => {
	if (v == null || String(v).trim() === '') return null;
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
};

const formToPayload = (f: SeminarForm) => ({
	title: f.title.trim(),
	event_type: f.event_type,
	scope: f.scope,
	location: f.location || null,
	start_date: f.start_date || null,
	end_date: f.end_date || null,
	date_text: f.date_text || null,
	event_year: f.event_year ? Number(f.event_year) : null,
	host_chair: f.host_chair || null,
	speakers: f.speakers || null,
	permit_doc_no: f.permit_doc_no || null,
	co_organizers: f.co_organizers || null,
	coordinator: f.coordinator || null,
	grants_cme: f.grants_cme,
	cme_default_credits: f.cme_default_credits ? Number(f.cme_default_credits) : null,
	manual_participant_count: numOrNull(f.manual_participant_count),
	manual_internal_count: numOrNull(f.manual_internal_count),
	manual_external_count: numOrNull(f.manual_external_count),
	manual_foreign_count: numOrNull(f.manual_foreign_count),
	manual_cme_count: numOrNull(f.manual_cme_count),
	notes: f.notes || null,
});

const participantPayload = (f: ParticipantForm) => ({
	user_id: f.user_id || null,
	title_prefix: f.title_prefix || null,
	full_name: f.full_name.trim(),
	dob: f.dob || null,
	dob_text: f.dob_text || null,
	gender: f.gender || null,
	organization: f.organization || null,
	department_raw: f.department_raw || null,
	staff_number: f.staff_number ? Number(f.staff_number) : null,
	qualification_raw: f.qualification_raw || null,
	source: f.source,
	is_foreign: f.is_foreign,
	participation_type: f.participation_type,
	cme_credits: f.cme_credits ? Number(f.cme_credits) : null,
	notes: f.notes || null,
});

// ─── Seminars ────────────────────────────────────────────────────────────────
export const getSeminars = (params?: SeminarListParams) =>
	apiClient.get<SeminarListResponse>(`/seminars${qs(params as Record<string, unknown>)}`);

export const getSeminar = (id: string) =>
	apiClient.get<Seminar>(`/seminars/${id}`);

export const createSeminar = (form: SeminarForm) =>
	apiClient.post<Seminar>('/seminars', formToPayload(form));

export const updateSeminar = (id: string, form: SeminarForm) =>
	apiClient.put<Seminar>(`/seminars/${id}`, formToPayload(form));

export const deleteSeminar = (id: string) =>
	apiClient.delete<null>(`/seminars/${id}`);

// ─── Participants ────────────────────────────────────────────────────────────
export const getParticipants = (seminarId: string) =>
	apiClient.get<SeminarParticipant[]>(`/seminars/${seminarId}/participants`);

export const addParticipant = (seminarId: string, form: ParticipantForm) =>
	apiClient.post<SeminarParticipant>(
		`/seminars/${seminarId}/participants`,
		participantPayload(form),
	);

export const updateParticipant = (
	seminarId: string,
	pid: string,
	form: Partial<ParticipantForm>,
) =>
	apiClient.put<SeminarParticipant>(
		`/seminars/${seminarId}/participants/${pid}`,
		participantPayload({ ...(form as ParticipantForm) }),
	);

export const deleteParticipant = (seminarId: string, pid: string) =>
	apiClient.delete<null>(`/seminars/${seminarId}/participants/${pid}`);

export const importParticipantsExcel = (
	seminarId: string,
	file: File,
	dryRun: boolean,
	issueCme: boolean,
) => {
	const form = new FormData();
	form.append('dry_run', dryRun ? '1' : '0');
	form.append('issue_cme', issueCme ? '1' : '0');
	form.append('file', file);
	return apiClient.postForm<ParticipantImportResult>(
		`/seminars/${seminarId}/participants/import-excel`,
		form,
	);
};

// ─── CME ─────────────────────────────────────────────────────────────────────
export interface IssueCmeResult {
	issued: number;
	from: number | null;
	to: number | null;
	year: number;
}

export const issueCme = (
	seminarId: string,
	participantIds: string[],
	year?: number,
) =>
	apiClient.post<IssueCmeResult>(
		`/seminars/${seminarId}/participants/issue-cme`,
		{ participant_ids: participantIds, year },
	);

export const revokeCme = (seminarId: string, pid: string) =>
	apiClient.post<null>(
		`/seminars/${seminarId}/participants/${pid}/revoke-cme`,
		{},
	);

export const bulkCmeStatus = (
	seminarId: string,
	participantIds: string[],
	status: 'issued' | 'signed',
) =>
	apiClient.post<{ updated: number }>(
		`/seminars/${seminarId}/participants/bulk-cme`,
		{ participant_ids: participantIds, status },
	);

// ─── Reports ────────────────────────────────────────────────────────────────
export const getCmeRegister = (year: number) =>
	apiClient.get<CmeRegister>(`/seminars/cme/register?year=${year}`);

export const getCmeStats = (year: number) =>
	apiClient.get<CmeStats>(`/seminars/cme/stats?year=${year}`);

export const updateCmeRegisterSeq = (year: number, lastSeq: number) =>
	apiClient.put<{ year: number; last_seq: number }>(
		`/seminars/cme/register/${year}`,
		{ last_seq: lastSeq },
	);
