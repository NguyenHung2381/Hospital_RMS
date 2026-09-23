import { apiClient } from '../../../shared/api/axios';
import type {
	Council,
	CouncilForm,
	CouncilMember,
	CouncilSession,
	CouncilStatus,
	CouncilTopic,
	EligibleUser,
	SeatRole,
} from '../types/council.type';

export interface CouncilListParams {
	page?: number;
	limit?: number;
	round_id?: string;
	status?: CouncilStatus;
}

export interface CouncilStats {
	total: number;
	draft: number;
	finalized: number;
	topicSum: number;
}

interface CouncilListResponse {
	data: Council[];
	pagination: { page: number; limit: number; total: number };
	stats: CouncilStats;
}

export interface CreateCouncilPayload {
	round_id: string;
	name: string;
	specialty_group?: string | null;
	location?: string | null;
	defense_date?: string | null; // yyyy-mm-dd
}

export interface UpdateCouncilPayload extends Partial<CreateCouncilPayload> {
	status?: CouncilStatus;
}

export function formToPayload(form: CouncilForm): CreateCouncilPayload {
	return {
		round_id: form.round_id,
		name: form.name,
		specialty_group: form.specialty_group || null,
		location: form.location || null,
		defense_date: form.defense_date || null,
	};
}

export const getCouncils = (params?: CouncilListParams) => {
	const entries = Object.entries(params ?? {})
		.filter(([, v]) => v !== undefined && v !== '')
		.map(([k, v]) => [k, String(v)] as [string, string]);
	const qs = entries.length
		? '?' + new URLSearchParams(entries).toString()
		: '';
	return apiClient.get<CouncilListResponse>(`/councils${qs}`);
};

export const getCouncilById = (id: string) =>
	apiClient.get<Council>(`/councils/${id}`);

export const createCouncil = (payload: CreateCouncilPayload) =>
	apiClient.post<Council>('/councils', payload);

export const updateCouncil = (id: string, payload: UpdateCouncilPayload) =>
	apiClient.put<Council>(`/councils/${id}`, payload);

export const deleteCouncil = (id: string) =>
	apiClient.delete<null>(`/councils/${id}`);

// ─── Members ──────────────────────────────────────────────────────────────
export const getCouncilMembers = (councilId: string) =>
	apiClient.get<CouncilMember[]>(`/councils/${councilId}/members`);

export const addCouncilMember = (
	councilId: string,
	payload: { user_id?: string | null; external_reviewer_id?: string | null; role: SeatRole },
) => apiClient.post<CouncilMember>(`/councils/${councilId}/members`, payload);

export const updateCouncilMember = (
	councilId: string,
	memberId: string,
	payload: { user_id?: string | null; external_reviewer_id?: string | null; role?: SeatRole },
) =>
	apiClient.put<CouncilMember>(
		`/councils/${councilId}/members/${memberId}`,
		payload,
	);

export const removeCouncilMember = (councilId: string, memberId: string) =>
	apiClient.delete<null>(`/councils/${councilId}/members/${memberId}`);

export const getEligibleUsers = (
	councilId: string,
	search?: string,
	type: 'internal' | 'external' = 'internal',
) => {
	const qs = new URLSearchParams({ type });
	if (search) qs.set('search', search);
	return apiClient.get<EligibleUser[]>(
		`/councils/${councilId}/eligible-users?${qs.toString()}`,
	);
};

// ─── Topic assignment ───────────────────────────────────────────────────────
export const getUnassignedTopics = (roundId: string) =>
	apiClient.get<CouncilTopic[]>(
		`/councils/unassigned-topics?round_id=${encodeURIComponent(roundId)}`,
	);

export const getCouncilTopics = (councilId: string) =>
	apiClient.get<CouncilTopic[]>(`/councils/${councilId}/topics`);

export const assignCouncilTopics = (councilId: string, topicIds: string[]) =>
	apiClient.post<{ assigned: number }>(`/councils/${councilId}/topics`, {
		topic_ids: topicIds,
	});

export const unassignCouncilTopic = (councilId: string, topicId: string) =>
	apiClient.delete<null>(`/councils/${councilId}/topics/${topicId}`);

export const setCouncilTopicSession = (
	councilId: string,
	topicId: string,
	session: CouncilSession | null,
) =>
	apiClient.patch<null>(`/councils/${councilId}/topics/${topicId}`, {
		session,
	});

// ─── Ghế thay thế theo đề tài ────────────────────────────────────────────────
export const setCouncilSeatSubstitute = (
	councilId: string,
	topicId: string,
	role: SeatRole,
	userId: string,
) =>
	apiClient.put<null>(`/councils/${councilId}/topics/${topicId}/substitute`, {
		role,
		user_id: userId,
	});

export const removeCouncilSeatSubstitute = (
	councilId: string,
	topicId: string,
	role: SeatRole,
) =>
	apiClient.delete<null>(
		`/councils/${councilId}/topics/${topicId}/substitute/${role}`,
	);

// ─── Cổng đánh giá tiến độ của thành viên hội đồng ──────────────────────────
export type ProgressRating = 'on_track' | 'behind' | 'at_risk';

export const PROGRESS_RATING_LABELS: Record<ProgressRating, string> = {
	on_track: 'Đúng tiến độ',
	behind: 'Chậm tiến độ',
	at_risk: 'Nguy cơ không hoàn thành',
};

export interface ProgressReview {
	topic_id: string;
	user_id: string;
	role: SeatRole;
	progress_percent: number | null;
	rating: ProgressRating | null;
	comment: string | null;
	full_name: string | null;
}

export interface EvaluationFile {
	id: string;
	topic_id: string;
	file_name: string;
	file_url: string;
	file_size: number | null;
	created_by: string;
	uploaded_by_name: string | null;
	created_at: string;
}

export type Conclusion = 'pass' | 'fail' | 'revise';

export const CONCLUSION_LABELS: Record<Conclusion, string> = {
	pass: 'Đạt',
	fail: 'Không đạt',
	revise: 'Yêu cầu chỉnh sửa',
};

export interface TopicResult {
	topic_id: string;
	conclusion: Conclusion | null;
	general_comment: string | null;
	decided_by: string | null;
	decided_by_name: string | null;
	updated_at: string | null;
}

export interface ProgressTopic {
	id: string;
	my_role: SeatRole;
	title: string;
	session: CouncilSession | null;
	status: string;
	department_name: string | null;
	category_name: string | null;
	council_id: string;
	council_name: string;
	location: string | null;
	defense_date: string | null;
	round_name: string | null;
	round_year: number | null;
	reviews: ProgressReview[];
	evaluation_files: EvaluationFile[];
	minutes_files: EvaluationFile[];
	topic_files: EvaluationFile[];
	result: TopicResult | null;
}

export const getMyProgress = () =>
	apiClient.get<ProgressTopic[]>('/councils/my-progress');

/** Số đề tài user có ghế hội đồng — 0 nghĩa là không phải thành viên hội đồng nào. */
export const getMyProgressCount = () =>
	apiClient.get<{ count: number }>('/councils/my-progress/count');

export const saveProgressReview = (
	topicId: string,
	payload: {
		progress_percent: number | null;
		rating: ProgressRating | null;
		comment: string;
	},
) => apiClient.put<null>(`/councils/progress/${topicId}/review`, payload);

export const saveTopicResult = (
	topicId: string,
	payload: { conclusion: Conclusion | null; general_comment: string },
) => apiClient.put<null>(`/councils/progress/${topicId}/result`, payload);

export const uploadEvaluationFiles = (topicId: string, files: File[]) => {
	const form = new FormData();
	files.forEach((f) => form.append('files', f));
	return apiClient.postForm<{ batch_id: string; files_uploaded: number }>(
		`/councils/progress/${topicId}/files`,
		form,
	);
};

export const deleteEvaluationFile = (topicId: string, fileId: string) =>
	apiClient.delete<null>(`/councils/progress/${topicId}/files/${fileId}`);

export const uploadMinutesFiles = (topicId: string, files: File[]) => {
	const form = new FormData();
	files.forEach((f) => form.append('files', f));
	return apiClient.postForm<{ batch_id: string; files_uploaded: number }>(
		`/councils/progress/${topicId}/minutes`,
		form,
	);
};

export const deleteMinutesFile = (topicId: string, fileId: string) =>
	apiClient.delete<null>(`/councils/progress/${topicId}/minutes/${fileId}`);

export const uploadCommentImage = (topicId: string, file: File) => {
	const form = new FormData();
	form.append('image', file);
	return apiClient.postForm<{ url: string }>(
		`/councils/progress/${topicId}/comment-image`,
		form,
	);
};

// ─── Tự động phân công hội đồng ─────────────────────────────────────────────
export interface AutoAssignPayload {
	round_id: string;
	specialty_group: string | string[];
	min_size?: number;
	max_size?: number;
	// Giới hạn pool người ngoài viện được auto-fill vào ghế còn thiếu — bỏ
	// trống thì dùng cả danh bạ (mọi người ngoài viện cùng hệ chuyên môn).
	external_reviewer_ids?: string[];
}

export interface AutoAssignResult {
	councils_created: number;
	topics_assigned: number;
	warnings: string[];
}

export const autoAssignCouncils = (payload: AutoAssignPayload) =>
	apiClient.post<AutoAssignResult>('/councils/auto-assign', payload);

// ─── Nhập hội đồng từ file Excel lịch bảo vệ ────────────────────────────────
export interface ImportMatchedPerson {
	type: 'user' | 'external';
	id: string;
	full_name: string;
	department_name?: string | null;
	specialty_group?: string | null;
}

export interface ImportSeatPreview {
	role: SeatRole;
	raw_name: string;
	raw_dept: string;
	matched?: ImportMatchedPerson | null;
	error?: string;
}

export interface ImportTopicPreview {
	row: number;
	raw_title: string;
	session: CouncilSession | null;
	matched?: { id: string; title: string } | null;
	warning?: string;
	skip_assign?: boolean;
	// Ghế của dòng này lệch bộ gốc → ghế thay thế theo đề tài
	substitutes: ImportSeatPreview[];
}

export interface ImportCouncilPreview {
	name: string;
	location: string | null;
	specialty_group: string | null;
	duplicate: boolean;
	seats: ImportSeatPreview[];
	topics: ImportTopicPreview[];
}

export interface ImportExcelResult {
	dry_run: boolean;
	councils?: ImportCouncilPreview[];
	topics_total?: number;
	topics_matched?: number;
	councils_created?: number;
	topics_assigned?: number;
	warnings: string[];
}

export const importCouncilsExcel = (
	roundId: string,
	file: File,
	dryRun: boolean,
) => {
	const form = new FormData();
	form.append('round_id', roundId);
	form.append('dry_run', dryRun ? '1' : '0');
	form.append('file', file);
	return apiClient.postForm<ImportExcelResult>('/councils/import-excel', form);
};

// ─── Xuất Excel lịch bảo vệ (theo mẫu chuẩn bệnh viện) ──────────────────────
export const exportCouncilSchedule = (payload: {
	round_id: string;
	fileName?: string;
	title?: string;
	subtitle?: string;
}) => apiClient.postBlob('/councils/export-excel', payload);

