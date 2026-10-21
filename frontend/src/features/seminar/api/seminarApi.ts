import { apiClient } from '../../../shared/api/axios';
import { getCheckInDeviceId } from '../../../shared/utils/storage';
import type {
	DepartmentStaff,
	ParticipationType,
	RequiredAbsentee,
	SeminarListImportResult,
	CmeRegister,
	CmeStats,
	ParticipantForm,
	ParticipantImportResult,
	Seminar,
	SeminarForm,
	SeminarListResponse,
	SeminarAgendaItem,
	SeminarParticipant,
	SeminarTestQuestion,
} from '../types/seminar.type';

export interface SeminarListParams {
	page?: number;
	limit?: number;
	search?: string;
	scope?: string;
	event_type?: string;
	year?: number | string;
	grants_cme?: '1';
	/** '1' = chỉ tập huấn bệnh viện, '0' = loại trừ (trang Hội thảo) */
	hospital_training?: '0' | '1';
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
	start_time: f.start_time || null,
	end_time: f.end_time || null,
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
	organizer_department_id: f.organizer_department_id || null,
	topic_id: f.topic_id || null,
	lesson_hours: numOrNull(f.lesson_hours),
	required_department_ids: f.required_department_ids,
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

export const checkInSeminar = (token: string) =>
	apiClient.post<{ seminar_id: string }>('/seminars/checkin', {
		token,
		device_id: getCheckInDeviceId(),
	});

export interface TicketCheckIn {
	id: string;
	title_prefix: string | null;
	full_name: string;
	organization: string | null;
	checked_in_at: string;
	already: boolean;
}

export const checkInTicket = (seminarId: string, code: string) =>
	apiClient.post<TicketCheckIn>(`/seminars/${seminarId}/checkin-ticket`, { code });

export const updateSeminarTest = (
	id: string,
	data: {
		test_questions?: SeminarTestQuestion[] | null;
		test_open?: boolean;
		test_date?: string | null;
		test_start_time?: string | null;
		test_end_date?: string | null;
		test_end_time?: string | null;
		test_duration_minutes?: number | null;
		test_pass_score?: number | null;
		test_shuffle_questions?: boolean;
		test_shuffle_options?: boolean;
	},
) => apiClient.put<Seminar>(`/seminars/${id}`, data);

export const updateSeminarAgenda = (id: string, agenda: SeminarAgendaItem[] | null) =>
	apiClient.put<Seminar>(`/seminars/${id}`, { agenda });

/** Xuất Excel 1 hội nghị — parts trống = cả người tham dự lẫn bài học */
export const exportSeminarDetailExcel = (id: string, parts?: ('participants' | 'agenda')[]) =>
	apiClient.postBlob(`/seminars/${id}/export-excel`, { parts });

export const uploadSeminarTestImage = (id: string, file: File) => {
	const form = new FormData();
	form.append('image', file);
	return apiClient.postForm<{ url: string }>(`/seminars/${id}/test-image`, form);
};

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

// ─── Tập huấn bệnh viện ──────────────────────────────────────────────────────
export const getDepartmentStaff = (seminarId: string, departmentId: string) =>
	apiClient.get<DepartmentStaff[]>(
		`/seminars/${seminarId}/department-staff?department_id=${encodeURIComponent(departmentId)}`,
	);

export const addSeminarUsers = (seminarId: string, userIds: string[]) =>
	apiClient.post<{ inserted: number; skipped: number }>(
		`/seminars/${seminarId}/participants/add-users`,
		{ user_ids: userIds },
	);

export const getRequiredAbsentees = (seminarId: string) =>
	apiClient.get<RequiredAbsentee[]>(`/seminars/${seminarId}/required-absentees`);

export const importParticipantsExcel = (
	seminarId: string,
	file: File,
	dryRun: boolean,
	issueCme: boolean,
	/** Số tín chỉ cho dòng để trống cột "Số tín chỉ", theo vai trò. */
	creditsByRole?: Partial<Record<ParticipationType, number>>,
) => {
	const form = new FormData();
	form.append('dry_run', dryRun ? '1' : '0');
	form.append('issue_cme', issueCme ? '1' : '0');
	if (creditsByRole) form.append('credits_by_role', JSON.stringify(creditsByRole));
	form.append('file', file);
	return apiClient.postForm<ParticipantImportResult>(
		`/seminars/${seminarId}/participants/import-excel`,
		form,
	);
};

export const downloadParticipantImportTemplate = () =>
	apiClient.postBlob('/seminars/participant-import-template', {});

// ─── CME ─────────────────────────────────────────────────────────────────────
export interface IssueCmeResult {
	issued: number;
	from: number | null;
	to: number | null;
	year: number;
	/** Người tự đăng ký chưa điểm danh / chưa làm bài test — không được cấp */
	skipped: number;
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
export interface CmeRegisterParams {
	page?: number;
	limit?: number;
	search?: string;
}

// Không truyền page/limit → lấy hết sổ của năm (dùng cho luồng "thu hồi tất cả").
export const getCmeRegister = (year: number, params?: CmeRegisterParams) => {
	const entries = Object.entries({ year, ...params })
		.filter(([, v]) => v !== undefined && v !== '')
		.map(([k, v]) => [k, String(v)] as [string, string]);
	return apiClient.get<CmeRegister>(`/seminars/cme/register?${new URLSearchParams(entries).toString()}`);
};

export const getCmeStats = (year: number) =>
	apiClient.get<CmeStats>(`/seminars/cme/stats?year=${year}`);

export const updateCmeRegisterSeq = (year: number, lastSeq: number) =>
	apiClient.put<{ year: number; last_seq: number }>(
		`/seminars/cme/register/${year}`,
		{ last_seq: lastSeq },
	);

// ─── Nhập / xuất Excel danh sách hội thảo ────────────────────────────────────
export interface SeminarExportFilters {
	search?: string;
	scope?: string;
	event_type?: string;
	year?: string;
	grants_cme?: '1';
	hospital_training?: '0' | '1';
}

export const exportSeminarsExcel = (filters: SeminarExportFilters) =>
	apiClient.postBlob('/seminars/export-excel', filters);

export const downloadSeminarImportTemplate = () =>
	apiClient.postBlob('/seminars/import-template', {});

export const importSeminarsExcel = (file: File, dryRun: boolean) => {
	const form = new FormData();
	form.append('dry_run', dryRun ? '1' : '0');
	form.append('file', file);
	return apiClient.postForm<SeminarListImportResult>('/seminars/import-excel', form);
};
