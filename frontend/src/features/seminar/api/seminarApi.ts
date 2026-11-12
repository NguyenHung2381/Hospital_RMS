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

/** Thêm cả khoa bắt buộc: mọi nhân sự các khoa bắt buộc chưa có trong danh sách */
export const addRequiredStaff = (seminarId: string) =>
	apiClient.post<{ inserted: number; skipped: number }>(`/seminars/${seminarId}/participants/add-required`, {});

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
	/** Người tự đăng ký chưa điểm danh / chưa làm bài kiểm tra — không được cấp */
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

// ─── Giấy chứng nhận CME (mẫu PDF của hội nghị → ZIP mỗi người 1 file) ────────
export interface CertificateTemplateInfo {
	file_name: string;
	uploaded_at: string;
	uploaded_by: string;
	size: number;
	/** Các ô trên giấy và hệ thống có tìm thấy chỗ điền trong mẫu không */
	fields: { key: string; label: string; found: boolean }[];
	/** Dãy "....." không nhận ra là ô nào — giữ nguyên trên giấy */
	unknown: string[];
}

export const getCertificateTemplate = (seminarId: string) =>
	apiClient.get<CertificateTemplateInfo | null>(`/seminars/${seminarId}/certificate-template`);

export const uploadCertificateTemplate = (seminarId: string, file: File) => {
	const form = new FormData();
	form.append('file', file);
	return apiClient.postForm<CertificateTemplateInfo>(`/seminars/${seminarId}/certificate-template`, form);
};

export const deleteCertificateTemplate = (seminarId: string) =>
	apiClient.delete<null>(`/seminars/${seminarId}/certificate-template`);

// Vị trí 1 ô trên mẫu — điểm PDF, gốc trên-trái trang
export interface CertificateSlot {
	x0: number;
	x1: number;
	/** Đường chân chữ (từ mép trên trang) */
	baseline: number;
	size: number;
	align: 'left' | 'center';
	hidden: boolean;
	color: string;
	bold: boolean;
	italic: boolean;
	suffix: string;
	serif: boolean;
}
export interface CertificateLayoutField {
	key: string;
	label: string;
	/** Chữ minh hoạ (dữ liệu mẫu) */
	sample: string;
	/** Hệ thống tự dò được ô này trên mẫu */
	auto: boolean;
	slot: CertificateSlot | null;
}
/** Dòng chữ in sẵn trên mẫu (tên hội nghị, ngày tháng...) — sửa được */
export interface CertificateText {
	id: string;
	/** Chữ gốc trên mẫu */
	original: string;
	text: string;
	x0: number;
	x1: number;
	baseline: number;
	size: number;
	align: 'left' | 'center';
	color: string;
	bold: boolean;
	italic: boolean;
	/** Đã sửa (dòng gốc đã bị xoá khỏi ảnh nền) */
	edited: boolean;
	/** Ký tự font của mẫu in được; null = in được mọi ký tự (có font đầy đủ) */
	charset: string | null;
}

/** Ký tự font của mẫu không có → in bằng font thay thế (khác kiểu chữ) */
export const missingChars = (text: string, charset: string | null) =>
	charset == null ? [] : [...new Set([...text.normalize('NFC')])].filter((c) => c.trim() && !charset.includes(c));
export interface CertificateLayout {
	page: { width: number; height: number };
	image_url: string;
	fields: CertificateLayoutField[];
	texts: CertificateText[];
}
export type CertificateSlotEdit = Pick<CertificateSlot, 'x0' | 'x1' | 'baseline' | 'size' | 'align' | 'hidden'>;
export type CertificateTextEdit = Pick<CertificateText, 'text' | 'x0' | 'x1' | 'baseline' | 'size' | 'align'>;

export const getCertificateLayout = (seminarId: string) =>
	apiClient.get<CertificateLayout>(`/seminars/${seminarId}/certificate-template/layout`);

/** texts: TOÀN BỘ các dòng đang sửa — dòng không gửi lên trở về chữ gốc */
export const saveCertificateLayout = (
	seminarId: string,
	slots: Record<string, CertificateSlotEdit>,
	texts: Record<string, CertificateTextEdit>,
) => apiClient.put<CertificateLayout>(`/seminars/${seminarId}/certificate-template/layout`, { slots, texts });

export const resetCertificateLayout = (seminarId: string) =>
	apiClient.post<CertificateLayout>(`/seminars/${seminarId}/certificate-template/layout/reset`, {});

// Thông tin hội nghị in sẵn trên giấy — sửa nhanh không cần mở màn chỉnh mẫu
export type CertificateInfoKey = 'content' | 'organizer' | 'time' | 'sign_date';
export interface CertificateInfoField {
	key: CertificateInfoKey;
	label: string;
	/** Tìm thấy dòng tương ứng trên mẫu */
	found: boolean;
	value: string;
	original: string;
	/** Phần giữ nguyên đứng trước (vd "4. Thời gian: ") */
	prefix: string;
	/** Ký tự font của mẫu in được; null = in được mọi ký tự (có font đầy đủ) */
	charset: string | null;
}

export const getCertificateInfo = (seminarId: string) =>
	apiClient.get<CertificateInfoField[]>(`/seminars/${seminarId}/certificate-template/info`);

export const saveCertificateInfo = (seminarId: string, values: Partial<Record<CertificateInfoKey, string>>) =>
	apiClient.put<CertificateInfoField[]>(`/seminars/${seminarId}/certificate-template/info`, { values });

export const previewCertificate = (seminarId: string) =>
	apiClient.postBlob(`/seminars/${seminarId}/certificate-template/preview`, {});

/** participantIds rỗng = mọi người đã có số CME */
export const exportCertificates = (seminarId: string, participantIds?: string[]) =>
	apiClient.postBlob(`/seminars/${seminarId}/certificates`, { participant_ids: participantIds });

export const exportCertificatesFromExcel = (seminarId: string, file: File) => {
	const form = new FormData();
	form.append('file', file);
	return apiClient.postBlob(`/seminars/${seminarId}/certificates/from-excel`, form);
};

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
