import { apiClient } from '../../../shared/api/axios';
import type { Topic, TopicMember } from '../../topics/types/topic.type';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'supplement';
export type TopicApprovalStatus =
	| 'draft'
	| 'submitted'
	| 'approved'
	| 'rejected'
	| 'supplement';

export interface TopicApprovalItem extends Topic {
	round_name?: string;
	category_name?: string;
	level_name?: string;
	department_name?: string;
	created_by_name?: string;
}

export interface TopicApprovalDetail extends TopicApprovalItem {
	members: TopicMember[];
}

export interface Approval {
	id: string;
	topic_id: string;
	status: ApprovalStatus;
	comment: string | null;
	created_at: string;
	created_by: string;
	approver_name?: string;
}

export interface ApprovalPayload {
	status: Extract<ApprovalStatus, 'approved' | 'rejected' | 'supplement'>;
	comment?: string | null;
}

export interface TopicApprovalStats {
	total: number;
	submitted: number;
	approved: number;
	rejected: number;
	supplement: number;
}

interface TopicListResponse {
	data: TopicApprovalItem[];
	pagination: { page: number; limit: number; total: number };
	// Tổng quan theo trạng thái, bỏ qua bộ lọc UI (server tính)
	global_stats: TopicApprovalStats;
}

export const getApprovals = (topicId: string) =>
	apiClient.get<Approval[]>(`/topics/${topicId}/approvals`);

export const getApprovalTopics = (params?: {
	page?: number;
	limit?: number;
	search?: string;
	status?: TopicApprovalStatus;
}) => {
	const entries = Object.entries(params ?? {})
		.filter(([, value]) => value !== undefined && value !== '')
		.map(([key, value]) => [key, String(value)] as [string, string]);
	const qs = entries.length
		? `?${new URLSearchParams(entries).toString()}`
		: '';
	return apiClient.get<TopicListResponse>(`/topics${qs}`);
};

export const getApprovalTopicDetail = (topicId: string) =>
	apiClient.get<TopicApprovalDetail>(`/topics/${topicId}`);

export const updateTopicApproval = (
	topicId: string,
	payload: ApprovalPayload,
) => apiClient.post<Approval>(`/topics/${topicId}/approve`, payload);

export const approveTopic = (topicId: string, comment?: string) =>
	updateTopicApproval(topicId, { status: 'approved', comment });

export const rejectTopic = (topicId: string, comment?: string) =>
	updateTopicApproval(topicId, { status: 'rejected', comment });

export const requestSupplementTopic = (topicId: string, comment: string) =>
	updateTopicApproval(topicId, { status: 'supplement', comment });
