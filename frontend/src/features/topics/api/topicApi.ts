import { apiClient } from '../../../shared/api/axios';
import type { ArticleType, Topic, TopicAuthor, TopicFile, TopicMember } from '../types/topic.type';

export interface SimpleItem {
	id: string;
	name: string;
	year?: number;
	status?: string;
	/** Chỉ có ở danh sách đợt (/research-rounds): cửa sổ đăng ký đề tài đang mở? */
	registration_open?: boolean;
	/** Mốc mở/đóng đăng ký đề tài (dd/mm/yyyy) — chỉ có ở /research-rounds. */
	registration_start?: string | null;
	registration_end?: string | null;
}

// Các trường lọc nhận 1 giá trị hoặc danh sách "a,b,c" (multi-select trên UI)
export interface TopicListParams {
	page?: number;
	limit?: number;
	search?: string;
	round_id?: string;
	department_id?: string;
	status?: string;
	category_id?: string;
	level_id?: string;
	participant_id?: string;
	year?: number | string;
	article_type?: ArticleType | string;
}

export interface TopicGlobalStats {
	total: number;
	submitted: number;
	approved: number;
	rejected: number;
	supplement: number;
}

interface TopicListResponse {
	data: Topic[];
	pagination: { page: number; limit: number; total: number };
	/** Tổng quan theo trạng thái, bỏ qua bộ lọc UI (server tính) */
	global_stats: TopicGlobalStats;
}

interface SimpleListResponse {
	data: SimpleItem[];
	pagination: { page: number; limit: number; total: number };
}

export interface CreateTopicPayload {
	title: string;
	description?: string;
	round_id: string;
	category_id?: string;
	level_id?: string;
	department_id?: string;
	status?: string;
	article_type?: ArticleType;
	journal_name?: string;
	doi?: string;
	publish_date?: string;
	budget_estimated?: number;
}

export interface UpdateTopicPayload {
	title?: string;
	description?: string;
	round_id?: string;
	category_id?: string;
	level_id?: string;
	department_id?: string;
	status?: string;
	article_type?: ArticleType;
	journal_name?: string;
	doi?: string;
	publish_date?: string;
	budget_estimated?: number;
	budget_actual?: number;
	approval_decision_no?: string;
	approval_decision_date?: string;
	recognition_decision_no?: string;
	recognition_decision_date?: string;
	is_featured?: boolean;
}

export type TopicMemberApiRole = 'leader' | 'secretary' | 'member';

export interface TopicMemberPayload {
	ho_ten: string;
	email?: string;
	so_dien_thoai?: string | null;
	chuc_vu?: string | null;
	staff_number?: string | null;
	department_id?: string | null;
	role?: TopicMemberApiRole;
}

export const getTopics = (params?: TopicListParams) => {
	const entries = Object.entries(params ?? {})
		.filter(([, v]) => v !== undefined && v !== '')
		.map(([k, v]) => [k, String(v)] as [string, string]);
	const qs = entries.length
		? '?' + new URLSearchParams(entries).toString()
		: '';
	return apiClient.get<TopicListResponse>(`/topics${qs}`);
};

export const getTopic = (id: string) => apiClient.get<Topic>(`/topics/${id}`);

export const createTopic = (payload: CreateTopicPayload) =>
	apiClient.post<Topic>('/topics', payload);

export const updateTopic = (id: string, data: UpdateTopicPayload) =>
	apiClient.put<Topic>(`/topics/${id}`, data);

export const deleteTopic = (id: string) =>
	apiClient.delete<null>(`/topics/${id}`);

export const getTopicMembers = (topicId: string) =>
	apiClient.get<TopicMember[]>(`/topics/${topicId}/members`);

export interface TopicAuthorPayload {
	author_name: string;
	affiliation?: string | null;
	is_corresponding?: boolean;
}

export const getTopicAuthors = (topicId: string) =>
	apiClient.get<TopicAuthor[]>(`/topics/${topicId}/authors`);

export const setTopicAuthors = (topicId: string, authors: TopicAuthorPayload[]) =>
	apiClient.put<TopicAuthor[]>(`/topics/${topicId}/authors`, { authors });

export const addTopicMember = (topicId: string, payload: TopicMemberPayload) =>
	apiClient.post<{ id: string }>(`/topics/${topicId}/members`, payload);

export const updateTopicMember = (
	topicId: string,
	memberId: string,
	payload: TopicMemberPayload,
) =>
	apiClient.put<TopicMember>(`/topics/${topicId}/members/${memberId}`, payload);

export const deleteTopicMember = (topicId: string, memberId: string) =>
	apiClient.delete<null>(`/topics/${topicId}/members/${memberId}`);

export interface GrantedAccount {
	member_id: string | null;
	user_id: string;
	username: string;
	full_name: string;
	password_plain: string;
}

export interface GrantAccountsResult {
	credentials: GrantedAccount[];
	skipped: { member_id: string; ho_ten: string; reason: string }[];
}

export const grantTopicMemberAccounts = (
	topicId: string,
	memberIds?: string[],
) =>
	apiClient.post<GrantAccountsResult>(
		`/topics/${topicId}/members/grant-accounts`,
		memberIds ? { member_ids: memberIds } : {},
	);

interface FileListResponse {
	data: TopicFile[];
	pagination: { page: number; limit: number; total: number };
}

export const getTopicFiles = (topicId: string) =>
	apiClient.get<FileListResponse>(`/topics/${topicId}/files`);

export const deleteTopicFile = (fileId: string) =>
	apiClient.delete<null>(`/files/${fileId}`);

export const uploadTopicFiles = (
	topicId: string,
	files: File[],
	batchNote?: string,
) => {
	const form = new FormData();
	files.forEach((f) => form.append('files', f));
	if (batchNote) form.append('batch_note', batchNote);
	return apiClient.postForm<{ batch_id: string; files_uploaded: number }>(
		`/topics/${topicId}/files`,
		form,
	);
};

export const getCategories = () =>
	apiClient.get<SimpleListResponse>('/categories?limit=0');

export const getLevels = (params?: { round_id?: string; round_type_id?: string }) => {
	const qs = new URLSearchParams({ limit: '0' });
	if (params?.round_id) qs.set('round_id', params.round_id);
	if (params?.round_type_id) qs.set('round_type_id', params.round_type_id);
	return apiClient.get<SimpleListResponse>(`/levels?${qs.toString()}`);
};

export const getRounds = () =>
	apiClient.get<SimpleListResponse>('/research-rounds?limit=0');

export const getDepts = () =>
	apiClient.get<SimpleListResponse>('/departments?limit=0');

export interface UserSuggestion {
	id: string;
	full_name: string;
	username: string;
	staff_number: string | null;
	email: string;
	department_id: string;
}

interface UserSearchResponse {
	data: UserSuggestion[];
	pagination: { page: number; limit: number; total: number };
}

export interface ExportTopicMember {
	id: string;
	ho_ten: string;
	staff_number: string | null;
	role: string;
	chuc_vu: string | null;
	email: string | null;
	so_dien_thoai: string | null;
}

export interface ExportTopic {
	id: string;
	title: string;
	status: string;
	created_at: string;
	round_id: string | null;
	round_name: string | null;
	round_year: number | null;
	category_id: string | null;
	category_name: string | null;
	level_id: string | null;
	level_name: string | null;
	department_id: string | null;
	department_name: string | null;
	created_by: string | null;
	created_by_name: string | null;
	members: ExportTopicMember[];
}

export const getTopicsExportData = (ids: string[]) =>
	apiClient.post<ExportTopic[]>('/topics/export-data', { ids });

export interface ExportExcelPayload {
	ids: string[];
	fileName: string;
	customTitle: string;
	customSubtitle: string;
	refNumber: string;
	refDate: string;
}

export const exportTopicsExcel = (payload: ExportExcelPayload) =>
	apiClient.postBlob('/topics/export-excel', payload);

export type ReportSection =
	| 'overview'
	| 'topics'
	| 'members'
	| 'by_category'
	| 'by_department'
	| 'by_specialty_group';

export interface ExportReportPayload {
	ids: string[];
	fileName?: string;
	title?: string;
	subtitle?: string;
	refNumber?: string;
	refDate?: string;
	sections?: ReportSection[];
}

export const exportTopicsReport = (payload: ExportReportPayload) =>
	apiClient.postBlob('/topics/export-report', payload);

export const searchUsers = (q: string, departmentId?: string) => {
	const params = new URLSearchParams({ q, limit: '10' });
	if (departmentId) params.set('department_id', departmentId);
	return apiClient.get<UserSearchResponse>(
		`/users/search?${params.toString()}`,
	);
};
